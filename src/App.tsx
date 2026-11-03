import { useEffect, useMemo, useState } from 'react';
import { useStore } from 'zustand';
import {
  CachedMarketDataProvider,
  DeterministicDemoProvider,
  FinnhubProvider,
  IndexedDBStorageRepository,
  ResilientMarketDataProvider,
  YahooFinanceProvider,
  createAnnotationStore,
  createMarketStore,
  createPreferencesStore,
  createWatchlistStore,
  getCandleSeriesKey,
  type MarketDataProvider,
  type Timeframe,
} from './core';
import { ChartContainer } from './features/chart/ChartContainer';
import { ChartToolbar } from './features/chart/overlays/ChartToolbar';
import { OverlayCanvas } from './features/chart/overlays/OverlayCanvas';
// Minimalist Mode: TradeJournalDrawer is hidden for beginner-friendly long-term tracking
// import { TradeJournalDrawer } from './features/journal/TradeJournalDrawer';
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

  const [focusRevision, setFocusRevision] = useState(0);

  const {
    marketStore,
    watchlistStore,
    annotationStore,
    preferencesStore,
  } = useMemo(() => {
    const cachedProvider = createConfiguredProvider(initialMode, initialEnvKey);
    const repo = new IndexedDBStorageRepository();

    return {
      marketStore: createMarketStore(cachedProvider, 'AAPL', '1D', 365),
      watchlistStore: createWatchlistStore(repo),
      annotationStore: createAnnotationStore(repo),
      preferencesStore: createPreferencesStore(repo, {
        providerMode: initialMode,
        finnhubApiKey: initialEnvKey,
        pollIntervalSec: 0,
        activeIndicators: ['CANDLES', 'VOLUME', 'PRICE_15M'],
      }),
    };
  }, [initialMode, initialEnvKey]);

  const activeTicker = useStore(marketStore, (s) => s.activeTicker);
  const activeTimeframe = useStore(marketStore, (s) => s.activeTimeframe);
  const quotesByTicker = useStore(marketStore, (s) => s.quotesByTicker);
  const candlesByKey = useStore(marketStore, (s) => s.candlesByKey);
  const intradayCandlesByTicker = useStore(
    marketStore,
    (s) => s.intradayCandlesByTicker
  );
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

  const savedPreferences = useStore(preferencesStore, (s) => s.preferences);

  const activeWatchlist =
    watchlists.find((w) => w.id === activeWatchlistId) ?? watchlists[0];

  useEffect(() => {
    void (async () => {
      const [hydratedWatchlists, , hydratedPrefs] = await Promise.all([
        watchlistStore.getState().hydrate(),
        annotationStore.getState().hydrate(),
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
    preferencesStore,
    initialMode,
    initialEnvKey,
  ]);

  // Minimalist Keyboard-First Workflow Shortcuts
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

      // Minimalist Mode: Fibonacci ('f'), Trade Marker ('m'), and Journal ('j') shortcuts are disabled.

      const tfMap: Record<string, Timeframe> = {
        '1': '1D',
        '2': '1W',
        '3': '1M',
        '4': '3M',
        '5': '6M',
        '6': '1Y',
      };
      const mappedTf = tfMap[e.key];
      if (mappedTf) {
        e.preventDefault();
        setFocusRevision((rev) => rev + 1);
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
  const activeIntradayCandles = intradayCandlesByTicker[activeTicker] ?? [];
  const activeQuote = quotesByTicker[activeTicker];

  // Minimalist Mode: Only show Memo ('sticker') and Drawing ('trendline') annotations
  const minimalistAnnotations = useMemo(
    () =>
      annotations.filter(
        (a) => a.type === 'sticker' || a.type === 'trendline'
      ),
    [annotations]
  );
  const activeTickerAnnotations = minimalistAnnotations.filter(
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
        showJournal={false}
        showAlerts={false}
        showLivePollToggle={false}
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
        onSelectTimeframe={(tf) => {
          setFocusRevision((rev) => rev + 1);
          void marketStore.getState().setActiveTimeframe(tf);
          void preferencesStore
            .getState()
            .updatePreferences({ activeTimeframe: tf });
        }}
        onRefresh={() => {
          setFocusRevision((rev) => rev + 1);
          void marketStore.getState().refreshActiveCandles();
          if (activeWatchlist) {
            void marketStore.getState().refreshQuotes(activeWatchlist.tickers);
          }
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
            setFocusRevision((rev) => rev + 1);
            await marketStore.getState().setActiveTicker(ticker);
            void preferencesStore
              .getState()
              .updatePreferences({ activeTicker: ticker });
          }}
          onRemoveTicker={async (watchlistId, ticker) => {
            await watchlistStore.getState().removeTicker(watchlistId, ticker);
          }}
          onSelectTicker={(ticker) => {
            setFocusRevision((rev) => rev + 1);
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
          intradayCandles={activeIntradayCandles}
          isLoading={isLoadingCandles}
          defaultIndicators={savedPreferences.activeIndicators}
          focusRevision={focusRevision}
          renderOverlayLayer={(hostContext) => (
            <>
              <ChartToolbar
                activeTool={activeTool}
                annotationCount={activeTickerAnnotations.length}
                showAdvancedTools={false}
                onSelectTool={(tool) => {
                  annotationStore.getState().setActiveTool(tool);
                }}
              />
              <OverlayCanvas
                hostContext={hostContext}
                annotations={minimalistAnnotations}
                activeTool={activeTool}
                selectedAnnotationId={selectedAnnotationId}
                onSelectTool={(tool) => {
                  annotationStore.getState().setActiveTool(tool);
                }}
                onSelectAnnotation={(id) => {
                  annotationStore.getState().selectAnnotation(id);
                }}
                onAddAnnotation={async (input) => {
                  await annotationStore.getState().addAnnotation(input);
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
      </main>
    </div>
  );
}
