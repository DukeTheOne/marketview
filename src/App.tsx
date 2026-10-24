import { useEffect, useMemo } from 'react';
import { useStore } from 'zustand';
import {
  CachedMarketDataProvider,
  DeterministicDemoProvider,
  FinnhubProvider,
  IndexedDBStorageRepository,
  createAnnotationStore,
  createMarketStore,
  createTradeJournalStore,
  createWatchlistStore,
  getCandleSeriesKey,
} from './core';
import { ChartContainer } from './features/chart/ChartContainer';
import { ChartToolbar } from './features/chart/overlays/ChartToolbar';
import { OverlayCanvas } from './features/chart/overlays/OverlayCanvas';
import { TradeJournalDrawer } from './features/journal/TradeJournalDrawer';
import { TopHeaderBar } from './ui/layout/TopHeaderBar';
import { WatchlistSidebar } from './ui/watchlist/WatchlistSidebar';

export function App() {
  const { marketStore, watchlistStore, annotationStore, tradeJournalStore } =
    useMemo(() => {
      const finnhubApiKey = import.meta.env.VITE_FINNHUB_API_KEY as
        | string
        | undefined;
      const baseProvider =
        finnhubApiKey && finnhubApiKey.trim().length > 0
          ? new FinnhubProvider(finnhubApiKey.trim())
          : new DeterministicDemoProvider();

      const cachedProvider = new CachedMarketDataProvider(baseProvider, {
        quoteTtlMs: 15_000,
        candlesTtlMs: 60_000,
        maxRequestsPerMinute: 55,
      });

      const storageRepo = new IndexedDBStorageRepository();

      return {
        marketStore: createMarketStore(cachedProvider, 'AAPL', '1D'),
        watchlistStore: createWatchlistStore(storageRepo),
        annotationStore: createAnnotationStore(storageRepo),
        tradeJournalStore: createTradeJournalStore(storageRepo),
      };
    }, []);

  const activeTicker = useStore(marketStore, (s) => s.activeTicker);
  const activeTimeframe = useStore(marketStore, (s) => s.activeTimeframe);
  const quotesByTicker = useStore(marketStore, (s) => s.quotesByTicker);
  const candlesByKey = useStore(marketStore, (s) => s.candlesByKey);
  const isLoadingCandles = useStore(marketStore, (s) => s.isLoadingCandles);
  const providerId = useStore(marketStore, (s) => s.providerId);

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
    if (activeWatchlist && activeWatchlist.tickers.length > 0) {
      void marketStore.getState().refreshQuotes(activeWatchlist.tickers);
    }
  }, [activeWatchlist, marketStore]);

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
        isLoading={isLoadingCandles}
        isJournalOpen={isDrawerOpen}
        tradeCount={trades.length}
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
