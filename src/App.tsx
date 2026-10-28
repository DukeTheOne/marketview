import { useEffect, useMemo } from 'react';
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
  createPreferencesStore,
  createTradeJournalStore,
  createWatchlistStore,
  getCandleSeriesKey,
  parseWorkspaceBackup,
  serializeWorkspaceBackup,
  type MarketDataProvider,
  type Timeframe,
} from './core';
import { ChartContainer } from './features/chart/ChartContainer';
import { ChartToolbar } from './features/chart/overlays/ChartToolbar';
import { OverlayCanvas } from './features/chart/overlays/OverlayCanvas';
import { TradeJournalDrawer } from './features/journal/TradeJournalDrawer';
import { TopHeaderBar } from './ui/layout/TopHeaderBar';
import type {
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

  const {
    storageRepo,
    marketStore,
    watchlistStore,
    annotationStore,
    tradeJournalStore,
    alertStore,
    preferencesStore,
  } = useMemo(() => {
    const cachedProvider = createConfiguredProvider(initialMode, initialEnvKey);
    const repo = new IndexedDBStorageRepository();

    return {
      storageRepo: repo,
      marketStore: createMarketStore(cachedProvider, 'AAPL', '1D'),
      watchlistStore: createWatchlistStore(repo),
      annotationStore: createAnnotationStore(repo),
      tradeJournalStore: createTradeJournalStore(repo),
      alertStore: createAlertStore(repo),
      preferencesStore: createPreferencesStore(repo, {
        providerMode: initialMode,
        finnhubApiKey: initialEnvKey,
      }),
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
  const journalSummary = useMemo(
    () => tradeJournalStore.getState().getSummary(),
    [trades]
  );

  const alerts = useStore(alertStore, (s) => s.alerts);
  const lastTriggeredAlertIds = useStore(
    alertStore,
    (s) => s.lastTriggeredAlertIds
  );
  const savedPreferences = useStore(preferencesStore, (s) => s.preferences);

  const activeWatchlist =
    watchlists.find((w) => w.id === activeWatchlistId) ?? watchlists[0];

  useEffect(() => {
    void (async () => {
      const [hydratedWatchlists, , , , hydratedPrefs] = await Promise.all([
        watchlistStore.getState().hydrate(),
        annotationStore.getState().hydrate(),
        tradeJournalStore.getState().hydrate(),
        alertStore.getState().hydrate(),
        preferencesStore.getState().hydrate(),
      ]);

      if (
        hydratedPrefs.providerMode !== initialMode ||
        hydratedPrefs.finnhubApiKey !== initialEnvKey
      ) {
        const restoredProvider = createConfiguredProvider(
          hydratedPrefs.providerMode,
          hydratedPrefs.finnhubApiKey
        );
        await marketStore.getState().setProvider(restoredProvider);
      }

      if (
        hydratedWatchlists.some((w) => w.id === hydratedPrefs.activeWatchlistId)
      ) {
        watchlistStore
          .getState()
          .selectWatchlist(hydratedPrefs.activeWatchlistId);
      }

      await marketStore.getState().setActiveTicker(hydratedPrefs.activeTicker);
      await marketStore
        .getState()
        .setActiveTimeframe(hydratedPrefs.activeTimeframe);

      const selectedList =
        hydratedWatchlists.find(
          (w) => w.id === hydratedPrefs.activeWatchlistId
        ) ?? hydratedWatchlists[0];
      const initialTickers = selectedList?.tickers ?? [
        hydratedPrefs.activeTicker,
      ];
      await marketStore.getState().refreshQuotes(initialTickers);
    })();
  }, [
    marketStore,
    watchlistStore,
    annotationStore,
    tradeJournalStore,
    alertStore,
    preferencesStore,
    initialMode,
    initialEnvKey,
  ]);

  // Mooers' Law Keyboard-First Workflow Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();
      const isEditable =
        tagName === 'input' ||
        tagName === 'textarea' ||
        tagName === 'select' ||
        Boolean(target?.isContentEditable);

      if (e.key === 'Escape') {
        annotationStore.getState().setActiveTool(null);
        annotationStore.getState().selectAnnotation(null);
        if (tradeJournalStore.getState().isDrawerOpen) {
          tradeJournalStore.getState().toggleDrawer(false);
        }
        return;
      }

      if (isEditable || e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }

      if (e.key === '/') {
        e.preventDefault();
        if (savedPreferences.isSidebarCollapsed) {
          void preferencesStore
            .getState()
            .updatePreferences({ isSidebarCollapsed: false });
        }
        setTimeout(() => {
          const searchInput = document.querySelector<HTMLInputElement>(
            '[data-shortcut-search="true"]'
          );
          searchInput?.focus();
          searchInput?.select();
        }, 0);
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        const selectedId = annotationStore.getState().selectedAnnotationId;
        if (selectedId) {
          e.preventDefault();
          void annotationStore.getState().deleteAnnotation(selectedId);
        }
        return;
      }

      const keyLower = e.key.toLowerCase();
      if (keyLower === 'b') {
        e.preventDefault();
        void preferencesStore.getState().updatePreferences({
          isSidebarCollapsed: !savedPreferences.isSidebarCollapsed,
        });
        return;
      }

      if (keyLower === 'j') {
        e.preventDefault();
        tradeJournalStore.getState().toggleDrawer();
        return;
      }

      if (keyLower === 's') {
        e.preventDefault();
        const current = annotationStore.getState().activeTool;
        annotationStore
          .getState()
          .setActiveTool(current === 'sticker' ? null : 'sticker');
        return;
      }

      if (keyLower === 't') {
        e.preventDefault();
        const current = annotationStore.getState().activeTool;
        annotationStore
          .getState()
          .setActiveTool(current === 'trendline' ? null : 'trendline');
        return;
      }

      if (keyLower === 'f') {
        e.preventDefault();
        const current = annotationStore.getState().activeTool;
        annotationStore
          .getState()
          .setActiveTool(current === 'fibonacci' ? null : 'fibonacci');
        return;
      }

      if (keyLower === 'm') {
        e.preventDefault();
        const current = annotationStore.getState().activeTool;
        annotationStore
          .getState()
          .setActiveTool(current === 'trade_marker' ? null : 'trade_marker');
        return;
      }

      const tfMap: Record<string, Timeframe> = {
        '1': '15m',
        '2': '1h',
        '3': '1D',
        '4': '1W',
      };
      const mappedTf = tfMap[e.key];
      if (mappedTf) {
        e.preventDefault();
        void marketStore.getState().setActiveTimeframe(mappedTf);
        void preferencesStore
          .getState()
          .updatePreferences({ activeTimeframe: mappedTf });
      }
    };

    globalThis.addEventListener('keydown', handleKeyDown);
    return () => {
      globalThis.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    annotationStore,
    tradeJournalStore,
    marketStore,
    preferencesStore,
    savedPreferences.isSidebarCollapsed,
  ]);

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

  // Rate-Limit-Safe Live Auto-Polling Loop
  useEffect(() => {
    const pollIntervalSec = savedPreferences.pollIntervalSec;
    if (pollIntervalSec <= 0) {
      return;
    }

    let pollCounter = 0;
    const timer = globalThis.setInterval(() => {
      pollCounter += 1;
      // High frequency: stream active chart ticker and candles
      void marketStore.getState().refreshQuotes([activeTicker]);
      void marketStore.getState().refreshActiveCandles();

      // Moderate frequency (~30s): refresh background watchlist quotes safely within provider rate limits
      const bgWatchlistStep = Math.max(1, Math.round(30 / pollIntervalSec));
      if (
        pollCounter % bgWatchlistStep === 0 &&
        activeWatchlist &&
        activeWatchlist.tickers.length > 0
      ) {
        void marketStore.getState().refreshQuotes(activeWatchlist.tickers);
      }
    }, pollIntervalSec * 1000);

    return () => {
      globalThis.clearInterval(timer);
    };
  }, [savedPreferences.pollIntervalSec, activeWatchlist, activeTicker, marketStore]);

  const handleSelectProviderMode = (
    nextMode: ProviderMode,
    nextFinnhubKey?: string
  ) => {
    const resolvedKey =
      nextFinnhubKey !== undefined
        ? nextFinnhubKey.trim()
        : savedPreferences.finnhubApiKey;
    void preferencesStore.getState().updatePreferences({
      providerMode: nextMode,
      finnhubApiKey: resolvedKey,
    });
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
        providerMode={savedPreferences.providerMode}
        finnhubApiKey={savedPreferences.finnhubApiKey}
        pollIntervalSec={savedPreferences.pollIntervalSec}
        marketError={marketError}
        isLoading={isLoadingCandles}
        isJournalOpen={isDrawerOpen}
        tradeCount={trades.length}
        alerts={alerts}
        lastTriggeredAlertIds={lastTriggeredAlertIds}
        isSidebarCollapsed={savedPreferences.isSidebarCollapsed}
        onToggleSidebar={() => {
          void preferencesStore.getState().updatePreferences({
            isSidebarCollapsed: !savedPreferences.isSidebarCollapsed,
          });
        }}
        onSelectProviderMode={handleSelectProviderMode}
        onChangePollInterval={(sec) => {
          void preferencesStore
            .getState()
            .updatePreferences({ pollIntervalSec: sec });
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
          void preferencesStore
            .getState()
            .updatePreferences({ activeTimeframe: tf });
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
          isCollapsed={savedPreferences.isSidebarCollapsed}
          onSearchTickers={(q) => marketStore.getState().searchTickers(q)}
          onSelectWatchlist={(id) => {
            watchlistStore.getState().selectWatchlist(id);
            void preferencesStore
              .getState()
              .updatePreferences({ activeWatchlistId: id });
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
            void preferencesStore
              .getState()
              .updatePreferences({ activeTicker: ticker });
          }}
          onRemoveTicker={async (watchlistId, ticker) => {
            await watchlistStore.getState().removeTicker(watchlistId, ticker);
          }}
          onSelectTicker={(ticker) => {
            void marketStore.getState().setActiveTicker(ticker);
            void preferencesStore
              .getState()
              .updatePreferences({ activeTicker: ticker });
          }}
        />

        <ChartContainer
          ticker={activeTicker}
          timeframe={activeTimeframe}
          candles={activeCandles}
          isLoading={isLoadingCandles}
          defaultIndicators={savedPreferences.activeIndicators}
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
                alerts={alerts}
                referenceTimestamp={
                  activeCandles[activeCandles.length - 1]?.timestamp
                }
                onDismissAlert={(id) => {
                  alertStore.getState().dismissAlert(id);
                }}
                onDeleteAlert={(id) => {
                  alertStore.getState().removeAlert(id);
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
          onExportWorkspaceJson={() => {
            const json = serializeWorkspaceBackup({
              watchlists,
              annotations,
              trades,
              alerts,
            });
            if (typeof document !== 'undefined') {
              const blob = new Blob([json], {
                type: 'application/json;charset=utf-8;',
              });
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = 'marketview-workspace-backup.json';
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              URL.revokeObjectURL(url);
            }
          }}
          onImportWorkspaceJson={async (jsonString) => {
            const backup = parseWorkspaceBackup(jsonString);
            await Promise.all([
              storageRepo.saveWatchlists(backup.watchlists),
              storageRepo.saveAnnotations(backup.annotations),
              storageRepo.saveTrades(backup.trades),
              storageRepo.saveAlerts(backup.alerts),
            ]);
            await Promise.all([
              watchlistStore.getState().hydrate(),
              annotationStore.getState().hydrate(),
              tradeJournalStore.getState().hydrate(),
              alertStore.getState().hydrate(),
            ]);
          }}
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
