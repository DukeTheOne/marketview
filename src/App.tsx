import { useEffect, useMemo, useState } from 'react';
import { useStore } from 'zustand';
import {
  CachedMarketDataProvider,
  DeterministicDemoProvider,
  FinnhubProvider,
  IndexedDBStorageRepository,
  ResilientMarketDataProvider,
  YahooFinanceProvider,
  createAlertStore,
  createAnnotationStore,
  createMarketStore,
  createTradeJournalStore,
  createWatchlistStore,
  getCandleSeriesKey,
  type MarketDataProvider,
} from './core';
import { ChartContainer } from './features/chart/ChartContainer';
import { ChartToolbar } from './features/chart/overlays/ChartToolbar';
import { OverlayCanvas } from './features/chart/overlays/OverlayCanvas';
import { TradeJournalDrawer } from './features/journal/TradeJournalDrawer';
import { TopHeaderBar } from './ui/layout/TopHeaderBar';
import type {
  LivePollIntervalSec,
  ProviderMode,
} from './ui/providers/ProviderSettingsPopover';
import { WatchlistSidebar } from './ui/watchlist/WatchlistSidebar';

function createConfiguredProvider(
  mode: ProviderMode,
  finnhubKey: string
): MarketDataProvider {
  const demoFallback = new DeterministicDemoProvider();
  const yahooWithFallback = new ResilientMarketDataProvider(
    new YahooFinanceProvider(),
    demoFallback
  );

  let baseProvider: MarketDataProvider;
  if (mode === 'finnhub' && finnhubKey.trim().length > 0) {
    baseProvider = new ResilientMarketDataProvider(
      new FinnhubProvider(finnhubKey.trim()),
      yahooWithFallback
    );
  } else if (mode === 'yahoo') {
    baseProvider = yahooWithFallback;
  } else {
    baseProvider = demoFallback;
  }

  return new CachedMarketDataProvider(baseProvider, {
    quoteTtlMs: 12_000,
    candlesTtlMs: 60_000,
    maxRequestsPerMinute: 120,
  });
}

export function App() {
  const initialEnvKey =
    (import.meta.env.VITE_FINNHUB_API_KEY as string | undefined)?.trim() ?? '';
  const initialMode: ProviderMode =
    initialEnvKey.length > 0 ? 'finnhub' : 'yahoo';

  const [providerMode, setProviderMode] = useState<ProviderMode>(initialMode);
  const [finnhubApiKey, setFinnhubApiKey] = useState<string>(initialEnvKey);
  const [pollIntervalSec, setPollIntervalSec] =
    useState<LivePollIntervalSec>(15);

  const {
    marketStore,
    watchlistStore,
    annotationStore,
    tradeJournalStore,
    alertStore,
  } = useMemo(() => {
    const cachedProvider = createConfiguredProvider(initialMode, initialEnvKey);
    const storageRepo = new IndexedDBStorageRepository();

    return {
      marketStore: createMarketStore(cachedProvider, 'AAPL', '1D'),
      watchlistStore: createWatchlistStore(storageRepo),
      annotationStore: createAnnotationStore(storageRepo),
      tradeJournalStore: createTradeJournalStore(storageRepo),
      alertStore: createAlertStore(),
    };
  }, [initialMode, initialEnvKey]);

  const activeTicker = useStore(marketStore, (s) => s.activeTicker);
  const activeTimeframe = useStore(marketStore, (s) => s.activeTimeframe);
  const quotesByTicker = useStore(marketStore, (s) => s.quotesByTicker);
  const candlesByKey = useStore(marketStore, (s) => s.candlesByKey);
  const searchResults = useStore(marketStore, (s) => s.searchResults);
  const isLoadingCandles = useStore(marketStore, (s) => s.isLoadingCandles);
  const providerId = useStore(marketStore, (s) => s.providerId);
  const marketError = useStore(marketStore, (s) => s.error);

  const watchlists = useStore(watchlistStore, (s) => s.watchlists);
  const activeWatchlistId = useStore(watchlistStore, (s) => s.activeWatchlistId);

  const annotations = useStore(annotationStore, (s) => s.annotations);
  const activeTool = useStore(annotationStore, (s) => s.activeTool);
  const selectedAnnotationId = useStore(
    annotationStore,
    (s) => s.selectedAnnotationId
  );

  const trades = useStore(tradeJournalStore, (s) => s.trades);
  const isDrawerOpen = useStore(tradeJournalStore, (s) => s.isDrawerOpen);
  const filterStatus = useStore(tradeJournalStore, (s) => s.filterStatus);
  const journalSummary = tradeJournalStore.getState().getSummary();

  const alerts = useStore(alertStore, (s) => s.alerts);
  const lastTriggeredAlertIds = useStore(
    alertStore,
    (s) => s.lastTriggeredAlertIds
  );

  const activeWatchlist =
    watchlists.find((w) => w.id === activeWatchlistId) ?? watchlists[0];

  useEffect(() => {
    void (async () => {
      const [hydratedWatchlists] = await Promise.all([
        watchlistStore.getState().hydrate(),
        annotationStore.getState().hydrate(),
        tradeJournalStore.getState().hydrate(),
      ]);
      const firstList = hydratedWatchlists[0];
      const initialTickers = firstList?.tickers ?? ['AAPL'];
      await Promise.all([
        marketStore.getState().refreshActiveCandles(),
        marketStore.getState().refreshQuotes(initialTickers),
      ]);
    })();
  }, [marketStore, watchlistStore, annotationStore, tradeJournalStore]);

  useEffect(() => {
    const selectedList =
      watchlistStore.getState().watchlists.find((w) => w.id === activeWatchlistId) ??
      watchlistStore.getState().watchlists[0];
    if (selectedList && selectedList.tickers.length > 0) {
      void marketStore.getState().refreshQuotes(selectedList.tickers);
    }
  }, [activeWatchlistId, watchlistStore, marketStore]);

  // Real-time evaluation of price alerts against latest market quotes
  useEffect(() => {
    for (const quote of Object.values(quotesByTicker)) {
      alertStore.getState().evaluateQuote(quote);
    }
  }, [quotesByTicker, alertStore]);

  // Milestone 6: Live Auto-Polling Loop for real-time quotes & latest candle bar
  useEffect(() => {
    if (pollIntervalSec <= 0) {
      return;
    }

    const timer = globalThis.setInterval(() => {
      const tickersToPoll =
        activeWatchlist && activeWatchlist.tickers.length > 0
          ? activeWatchlist.tickers
          : [activeTicker];
      void marketStore.getState().refreshQuotes(tickersToPoll);
      void marketStore.getState().refreshActiveCandles();
    }, pollIntervalSec * 1000);

    return () => {
      globalThis.clearInterval(timer);
    };
  }, [pollIntervalSec, activeWatchlist, activeTicker, marketStore]);

  const handleSelectProviderMode = (
    nextMode: ProviderMode,
    nextFinnhubKey?: string
  ) => {
    const resolvedKey =
      nextFinnhubKey !== undefined ? nextFinnhubKey.trim() : finnhubApiKey;
    setProviderMode(nextMode);
    if (nextFinnhubKey !== undefined) {
      setFinnhubApiKey(resolvedKey);
    }
    const nextProvider = createConfiguredProvider(nextMode, resolvedKey);
    void marketStore.getState().setProvider(nextProvider);
  };

  const seriesKey = getCandleSeriesKey(activeTicker, activeTimeframe);
  const activeCandles = candlesByKey[seriesKey] ?? [];
  const activeQuote = quotesByTicker[activeTicker];
  const activeTickerAnnotations = annotations.filter(
    (a) => a.ticker === activeTicker
  );

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-slate-950 text-slate-100">
      <TopHeaderBar
        activeTicker={activeTicker}
        activeTimeframe={activeTimeframe}
        quote={activeQuote}
        providerId={providerId}
        providerMode={providerMode}
        finnhubApiKey={finnhubApiKey}
        pollIntervalSec={pollIntervalSec}
        marketError={marketError}
        isLoading={isLoadingCandles}
        isJournalOpen={isDrawerOpen}
        tradeCount={trades.length}
        alerts={alerts}
        lastTriggeredAlertIds={lastTriggeredAlertIds}
        onSelectProviderMode={handleSelectProviderMode}
        onChangePollInterval={(sec) => {
          setPollIntervalSec(sec);
        }}
        onCreateAlert={(input) => {
          alertStore.getState().addAlert(input);
        }}
        onDismissAlert={(id) => {
          alertStore.getState().dismissAlert(id);
        }}
        onRearmAlert={(id) => {
          alertStore.getState().rearmAlert(id);
        }}
        onDeleteAlert={(id) => {
          alertStore.getState().removeAlert(id);
        }}
        onClearTriggeredBanner={() => {
          alertStore.getState().clearTriggeredBanner();
        }}
        onSelectTimeframe={(tf) => {
          void marketStore.getState().setActiveTimeframe(tf);
        }}
        onRefresh={() => {
          void marketStore.getState().refreshActiveCandles();
          if (activeWatchlist) {
            void marketStore.getState().refreshQuotes(activeWatchlist.tickers);
          }
        }}
        onToggleJournal={() => {
          tradeJournalStore.getState().toggleDrawer();
        }}
      />

      <main className="relative flex flex-1 overflow-hidden">
        <WatchlistSidebar
          watchlists={watchlists}
          activeWatchlistId={activeWatchlistId}
          activeTicker={activeTicker}
          quotesByTicker={quotesByTicker}
          searchResults={searchResults}
          onSearchTickers={(q) => marketStore.getState().searchTickers(q)}
          onSelectWatchlist={(id) => {
            watchlistStore.getState().selectWatchlist(id);
          }}
          onCreateWatchlist={async (name) => {
            await watchlistStore.getState().createWatchlist(name, [activeTicker]);
          }}
          onRenameWatchlist={async (id, newName) => {
            await watchlistStore.getState().renameWatchlist(id, newName);
          }}
          onDeleteWatchlist={async (id) => {
            await watchlistStore.getState().deleteWatchlist(id);
          }}
          onAddTicker={async (watchlistId, ticker) => {
            await watchlistStore.getState().addTicker(watchlistId, ticker);
            await marketStore.getState().setActiveTicker(ticker);
          }}
          onRemoveTicker={async (watchlistId, ticker) => {
            await watchlistStore.getState().removeTicker(watchlistId, ticker);
          }}
          onSelectTicker={(ticker) => {
            void marketStore.getState().setActiveTicker(ticker);
          }}
        />

        <ChartContainer
          ticker={activeTicker}
          timeframe={activeTimeframe}
          candles={activeCandles}
          isLoading={isLoadingCandles}
          renderOverlayLayer={(hostContext) => (
            <>
              <ChartToolbar
                activeTool={activeTool}
                annotationCount={activeTickerAnnotations.length}
                onSelectTool={(tool) => {
                  annotationStore.getState().setActiveTool(tool);
                }}
              />
              <OverlayCanvas
                hostContext={hostContext}
                annotations={annotations}
                activeTool={activeTool}
                selectedAnnotationId={selectedAnnotationId}
                onSelectTool={(tool) => {
                  annotationStore.getState().setActiveTool(tool);
                }}
                onSelectAnnotation={(id) => {
                  annotationStore.getState().selectAnnotation(id);
                  const matchingTrade = trades.find(
                    (t) => t.linkedAnnotationId === id
                  );
                  if (matchingTrade) {
                    tradeJournalStore.getState().selectTrade(matchingTrade.id);
                    tradeJournalStore.getState().toggleDrawer(true);
                  }
                }}
                onAddAnnotation={async (input) => {
                  const ann = await annotationStore
                    .getState()
                    .addAnnotation(input);

                  // If user placed a trade_marker directly on the chart, log a corresponding trade!
                  if (input.type === 'trade_marker') {
                    const payload = input.payload as {
                      side?: 'BUY' | 'SELL' | 'SHORT' | 'COVER';
                      price?: number;
                      quantity?: number;
                      setupTag?: string;
                      notes?: string;
                    };
                    await tradeJournalStore.getState().logTrade({
                      ticker: input.ticker,
                      side: payload.side ?? 'BUY',
                      entryPrice: payload.price ?? input.anchors[0]?.price ?? 100,
                      quantity: payload.quantity ?? 100,
                      entryTimestamp: input.anchors[0]?.timestamp,
                      setupTags: payload.setupTag ? [payload.setupTag] : [],
                      notesMarkdown: payload.notes ?? '',
                      linkedAnnotationId: ann.id,
                    });
                  }
                }}
                onUpdateAnnotation={async (id, updates) => {
                  await annotationStore.getState().updateAnnotation(id, updates);
                }}
                onDeleteAnnotation={async (id) => {
                  await annotationStore.getState().deleteAnnotation(id);
                }}
              />
            </>
          )}
        />

        {/* Sliding Trade Journal Drawer */}
        <TradeJournalDrawer
          isOpen={isDrawerOpen}
          activeTicker={activeTicker}
          currentTickerPrice={activeQuote?.price ?? 100}
          trades={trades}
          summary={journalSummary}
          filterStatus={filterStatus}
          onClose={() => tradeJournalStore.getState().toggleDrawer(false)}
          onFilterChange={(f) => tradeJournalStore.getState().setFilterStatus(f)}
          onLogTrade={async (tradeInput) => {
            let linkedAnnotationId: string | undefined;

            if (tradeInput.createChartMarker && activeCandles.length > 0) {
              const latestCandle = activeCandles[activeCandles.length - 1];
              if (latestCandle) {
                const ann = await annotationStore.getState().addAnnotation({
                  ticker: tradeInput.ticker,
                  type: 'trade_marker',
                  anchors: [
                    {
                      timestamp: latestCandle.timestamp,
                      price: tradeInput.entryPrice,
                    },
                  ],
                  payload: {
                    side: tradeInput.side,
                    price: tradeInput.entryPrice,
                    quantity: tradeInput.quantity,
                    setupTag: tradeInput.setupTags?.[0] ?? 'Execution',
                    notes: tradeInput.notesMarkdown ?? '',
                  },
                });
                linkedAnnotationId = ann.id;
              }
            }

            await tradeJournalStore.getState().logTrade({
              ...tradeInput,
              linkedAnnotationId,
            });
          }}
          onClosePosition={async (id, exitPrice) => {
            await tradeJournalStore.getState().closeTrade(id, exitPrice);
          }}
          onDeleteTrade={async (id) => {
            const trade = trades.find((t) => t.id === id);
            if (trade?.linkedAnnotationId) {
              await annotationStore
                .getState()
                .deleteAnnotation(trade.linkedAnnotationId);
            }
            await tradeJournalStore.getState().deleteTrade(id);
          }}
          onSelectTicker={(t) => {
            void marketStore.getState().setActiveTicker(t);
          }}
        />
      </main>
    </div>
  );
}
