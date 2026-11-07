import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import {
  CachedMarketDataProvider,
  DEFAULT_FIREBASE_CONFIG,
  DeterministicDemoProvider,
  FinnhubProvider,
  FirebaseSyncClient,
  IndexedDBStorageRepository,
  ResilientMarketDataProvider,
  YahooFinanceProvider,
  createAnnotationStore,
  createMarketStore,
  createPreferencesStore,
  createWatchlistStore,
  garbageCollectWorkspace,
  getCandleSeriesKey,
  mergeWorkspaceSnapshots,
  parseWorkspaceBackup,
  serializeWorkspaceBackup,
  computeWorkspaceContentHash,
  AUTO_SYNC_DEBOUNCE_MS,
  AUTO_PULL_VISIBILITY_COOLDOWN_MS,
  type CloudSyncStatus,
  type CloudAuthSession,
  type FirebaseConfig,
  type MarketDataProvider,
  type Timeframe,
  type WorkspaceBackup,
} from './core';
import { ChartContainer } from './features/chart/ChartContainer';
import { ChartToolbar } from './features/chart/overlays/ChartToolbar';
import { OverlayCanvas } from './features/chart/overlays/OverlayCanvas';
import { TopHeaderBar } from './ui/layout/TopHeaderBar';
import type { ProviderMode } from './ui/providers/ProviderSettingsPopover';
import type { EntityCounts } from './ui/sync/CloudSyncPopover';
import { signInWithGooglePopup } from './ui/sync/googlePopupAuth';
import { WatchlistSidebar } from './ui/watchlist/WatchlistSidebar';

const STORAGE_AUTH_KEY = 'marketview:cloud_auth_session';

function loadStoredAuthSession(): CloudAuthSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_AUTH_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CloudAuthSession;
  } catch {
    return null;
  }
}

function saveStoredAuthSession(session: CloudAuthSession | null) {
  try {
    if (session) {
      localStorage.setItem(STORAGE_AUTH_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(STORAGE_AUTH_KEY);
    }
  } catch {
    // Ignore storage quota / access errors
  }
}

function isStaticHostingWithoutBackend(): boolean {
  if (typeof window === 'undefined') return false;
  const hostname = window.location.hostname.toLowerCase();
  return (
    hostname.endsWith('github.io') ||
    hostname.endsWith('pages.dev') ||
    hostname.endsWith('gitlab.io')
  );
}

function createConfiguredProvider(
  mode: ProviderMode,
  finnhubKey: string
): MarketDataProvider {
  const demoFallback = new DeterministicDemoProvider();
  const onStaticHost = isStaticHostingWithoutBackend();

  // On static hosting (e.g. GitHub Pages), avoid triggering 404 console errors for /api/yahoo/*
  const yahooFetcher = onStaticHost
    ? async () => {
        throw new Error(
          'GitHub Pages is a static host without a /api/yahoo backend proxy. Enter a free Finnhub API key in Settings.'
        );
      }
    : undefined;

  const yahooWithFallback = new ResilientMarketDataProvider(
    new YahooFinanceProvider(yahooFetcher),
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
  const [authSession, setAuthSession] = useState<CloudAuthSession | null>(() =>
    loadStoredAuthSession()
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [cloudSyncError, setCloudSyncError] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const isHydratedRef = useRef(false);
  const [isDirty, setIsDirty] = useState(false);
  const lastSyncedHashRef = useRef<string | null>(null);
  const lastSyncEpochMsRef = useRef<number>(Date.now());
  const autoSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    repo,
    marketStore,
    watchlistStore,
    annotationStore,
    preferencesStore,
  } = useMemo(() => {
    const cachedProvider = createConfiguredProvider(initialMode, initialEnvKey);
    const idbRepo = new IndexedDBStorageRepository();

    return {
      repo: idbRepo,
      marketStore: createMarketStore(cachedProvider, 'AAPL', '1D', 365),
      watchlistStore: createWatchlistStore(idbRepo),
      annotationStore: createAnnotationStore(idbRepo),
      preferencesStore: createPreferencesStore(idbRepo, {
        providerMode: initialMode,
        finnhubApiKey: initialEnvKey,
        pollIntervalSec: 0,
        activeIndicators: ['CANDLES', 'VOLUME'],
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

      setIsHydrated(true);
      isHydratedRef.current = true;
      if (authSession) {
        setTimeout(() => void handleSyncNow(), 100);
      }
    })();
  }, [
    marketStore,
    watchlistStore,
    annotationStore,
    preferencesStore,
    initialMode,
    initialEnvKey,
    authSession,
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
          void preferencesStore.getState().recordTombstone(selectedId);
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

    const changed =
      nextMode !== savedPreferences.providerMode ||
      resolvedKey !== savedPreferences.finnhubApiKey;

    if (!changed) return;

    void preferencesStore.getState().updatePreferences({
      providerMode: nextMode,
      finnhubApiKey: resolvedKey,
    });
    const nextProvider = createConfiguredProvider(nextMode, resolvedKey);
    void marketStore.getState().setProvider(nextProvider);
    setFocusRevision((rev) => rev + 1);

    const currentTickers = activeWatchlist?.tickers ?? [activeTicker];
    void marketStore.getState().refreshQuotes(currentTickers);

    if (authSession) {
      setTimeout(() => void handleSyncNow(), 300);
    }
  };

  const seriesKey = getCandleSeriesKey(activeTicker, activeTimeframe);
  const activeCandles = candlesByKey[seriesKey] ?? [];
  const activeIntradayCandles = intradayCandlesByTicker[activeTicker] ?? [];
  const activeQuote = quotesByTicker[activeTicker];

  const activeTickerAnnotations = useMemo(
    () => annotations.filter((a) => a.ticker === activeTicker),
    [annotations, activeTicker]
  );

  const annotationsCountByTicker = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const ann of annotations) {
      counts[ann.ticker] = (counts[ann.ticker] ?? 0) + 1;
    }
    return counts;
  }, [annotations]);

  // Cloud Sync Snapshot & Quota Stats
  const currentSnapshot: WorkspaceBackup = useMemo(
    () => ({
      version: 1,
      exportedAt: Math.floor(Date.now() / 1000),
      watchlists,
      annotations,
      trades: [],
      alerts: [],
      deletedIds: savedPreferences.deletedIds ?? {},
      preferences: savedPreferences,
    }),
    [watchlists, annotations, savedPreferences]
  );

  const currentContentHash = useMemo(
    () => computeWorkspaceContentHash(currentSnapshot),
    [currentSnapshot]
  );

  const workspaceBytes = useMemo(() => {
    try {
      const json = serializeWorkspaceBackup(currentSnapshot);
      return typeof TextEncoder !== 'undefined'
        ? new TextEncoder().encode(json).length
        : json.length;
    } catch {
      return 0;
    }
  }, [currentSnapshot]);

  const entityCounts: EntityCounts = useMemo(
    () => ({
      watchlists: watchlists.length,
      annotations: annotations.length,
      trades: 0,
      alerts: 0,
      tombstones: Object.keys(savedPreferences.deletedIds ?? {}).length,
    }),
    [watchlists.length, annotations.length, savedPreferences.deletedIds]
  );

  // Debounced auto-sync to cloud vault on domain edits
  useEffect(() => {
    if (!authSession || !isHydrated) return;

    if (
      lastSyncedHashRef.current !== null &&
      currentContentHash !== lastSyncedHashRef.current
    ) {
      setIsDirty(true);

      if (autoSyncTimerRef.current) {
        clearTimeout(autoSyncTimerRef.current);
      }

      autoSyncTimerRef.current = setTimeout(() => {
        void handleSyncNow();
      }, AUTO_SYNC_DEBOUNCE_MS);
    } else if (
      lastSyncedHashRef.current !== null &&
      currentContentHash === lastSyncedHashRef.current
    ) {
      setIsDirty(false);
      if (autoSyncTimerRef.current) {
        clearTimeout(autoSyncTimerRef.current);
        autoSyncTimerRef.current = null;
      }
    }

    return () => {
      if (autoSyncTimerRef.current) {
        clearTimeout(autoSyncTimerRef.current);
      }
    };
  }, [currentContentHash, authSession, isHydrated]);

  // Gmail-style beforeunload warning if closing tab with unsaved edits
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (authSession && (isDirty || isSyncing)) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [authSession, isDirty, isSyncing]);

  // Tab wake / visibility auto-pull
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (
        document.visibilityState === 'visible' &&
        authSession &&
        !isSyncing &&
        !isDirty &&
        Date.now() - lastSyncEpochMsRef.current > AUTO_PULL_VISIBILITY_COOLDOWN_MS
      ) {
        void handleSyncNow();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [authSession, isSyncing, isDirty]);

  // Milestone 12 & 13 Cloud Sync Handlers
  const handleSyncNow = async (
    sessionOverride?: CloudAuthSession,
    configOverride?: FirebaseConfig
  ) => {
    const activeSession = sessionOverride ?? authSession;
    if (!activeSession) {
      setCloudSyncError('Please sign in to sync with your cloud vault.');
      return;
    }

    const effectiveApiKey =
      configOverride?.apiKey ||
      savedPreferences.firebaseApiKey ||
      (import.meta.env.VITE_FIREBASE_API_KEY as string | undefined) ||
      DEFAULT_FIREBASE_CONFIG.apiKey;
    const effectiveProjectId =
      configOverride?.projectId ||
      savedPreferences.firebaseProjectId ||
      (import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined) ||
      DEFAULT_FIREBASE_CONFIG.projectId;

    if (!effectiveApiKey || !effectiveProjectId) {
      setCloudSyncError(
        'Missing Firebase credentials. Please configure them in Cloud Sync settings.'
      );
      return;
    }

    setIsSyncing(true);
    setCloudSyncError(null);

    try {
      const client = new FirebaseSyncClient({
        apiKey: effectiveApiKey,
        projectId: effectiveProjectId,
      });

      let currentSession = activeSession;
      if (currentSession.expiresAtMs < Date.now() + 60_000) {
        currentSession = await client.refreshSession(currentSession);
        setAuthSession(currentSession);
        saveStoredAuthSession(currentSession);
      }

      // 1. Pull remote workspace
      const remote = await client.pullWorkspace(currentSession);

      // 2. Current local snapshot
      const wasFreshDevice = !preferencesStore.getState().preferences.lastCloudSyncTimestamp;
      const local: WorkspaceBackup = {
        version: 1,
        exportedAt: Math.floor(Date.now() / 1000),
        watchlists: watchlistStore.getState().watchlists,
        annotations: annotationStore.getState().annotations,
        trades: [],
        alerts: [],
        deletedIds: preferencesStore.getState().preferences.deletedIds ?? {},
        preferences: preferencesStore.getState().preferences,
      };

      let finalToPush: WorkspaceBackup;
      let shouldPush = true;
      if (remote) {
        // 3. Multi-device merge with deletion tombstones & anti-bombing quotas
        finalToPush = mergeWorkspaceSnapshots(local, remote);

        // 4. Update local repositories and stores atomically
        await repo.saveWatchlists(finalToPush.watchlists);
        await watchlistStore.getState().hydrate();

        await repo.saveAnnotations(finalToPush.annotations);
        await annotationStore.getState().hydrate();

        if (finalToPush.preferences) {
          await preferencesStore.getState().updatePreferences({
            ...finalToPush.preferences,
            deletedIds: finalToPush.deletedIds,
          });

          const syncedPrefs = preferencesStore.getState().preferences;
          const currentMode = savedPreferences.providerMode;
          const currentKey = savedPreferences.finnhubApiKey;

          if (
            syncedPrefs.providerMode !== currentMode ||
            syncedPrefs.finnhubApiKey !== currentKey
          ) {
            const restoredProvider = createConfiguredProvider(
              syncedPrefs.providerMode,
              syncedPrefs.finnhubApiKey
            );
            await marketStore.getState().setProvider(restoredProvider);
            setFocusRevision((rev) => rev + 1);
          }

          // Only adopt remote active ticker/timeframe if this is a fresh device
          if (wasFreshDevice) {
            if (syncedPrefs.activeTicker && syncedPrefs.activeTicker !== activeTicker) {
              await marketStore.getState().setActiveTicker(syncedPrefs.activeTicker);
            }
            if (syncedPrefs.activeTimeframe && syncedPrefs.activeTimeframe !== activeTimeframe) {
              await marketStore.getState().setActiveTimeframe(syncedPrefs.activeTimeframe);
            }
            setFocusRevision((rev) => rev + 1);
          }
        }

        // Smart Read-Only Short-Circuit:
        // If the merged snapshot matches the remote snapshot content,
        // remote already contains this device's state. Skip Firestore write.
        const mergedHash = computeWorkspaceContentHash(finalToPush);
        const remoteHash = computeWorkspaceContentHash(remote);
        if (mergedHash === remoteHash) {
          shouldPush = false;
        }
      } else {
        finalToPush = garbageCollectWorkspace(local);
      }

      let syncedAt = Math.floor(Date.now() / 1000);
      if (shouldPush) {
        // 5. Push final merged payload to Firestore
        const res = await client.pushWorkspace(currentSession, finalToPush);
        syncedAt = res.syncedAt;
      }

      const cleanFinal = garbageCollectWorkspace(finalToPush);
      lastSyncedHashRef.current = computeWorkspaceContentHash(cleanFinal);
      lastSyncEpochMsRef.current = Date.now();
      setIsDirty(false);

      if (autoSyncTimerRef.current) {
        clearTimeout(autoSyncTimerRef.current);
        autoSyncTimerRef.current = null;
      }

      await preferencesStore.getState().updatePreferences({
        lastCloudSyncTimestamp: syncedAt,
      });
    } catch (err) {
      setCloudSyncError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSignInCloud = async (
    email: string,
    pass: string,
    config: FirebaseConfig
  ) => {
    const client = new FirebaseSyncClient(config);
    const session = await client.signInWithEmail(email, pass);
    setAuthSession(session);
    saveStoredAuthSession(session);
    await preferencesStore.getState().updatePreferences({
      firebaseApiKey: config.apiKey,
      firebaseProjectId: config.projectId,
      cloudSyncEmail: session.email,
      cloudSyncUid: session.uid,
    });
    await handleSyncNow(session, config);
  };

  const handleSignUpCloud = async (
    email: string,
    pass: string,
    config: FirebaseConfig
  ) => {
    const client = new FirebaseSyncClient(config);
    const session = await client.signUpWithEmail(email, pass);
    setAuthSession(session);
    saveStoredAuthSession(session);
    await preferencesStore.getState().updatePreferences({
      firebaseApiKey: config.apiKey,
      firebaseProjectId: config.projectId,
      cloudSyncEmail: session.email,
      cloudSyncUid: session.uid,
    });
    await handleSyncNow(session, config);
  };

  const handleSignInWithGoogle = async (config: FirebaseConfig) => {
    const session = await signInWithGooglePopup(config);
    setAuthSession(session);
    saveStoredAuthSession(session);
    await preferencesStore.getState().updatePreferences({
      firebaseApiKey: config.apiKey,
      firebaseProjectId: config.projectId,
      cloudSyncEmail: session.email,
      cloudSyncUid: session.uid,
    });
    await handleSyncNow(session, config);
  };

  const handleSignOutCloud = () => {
    setAuthSession(null);
    saveStoredAuthSession(null);
    lastSyncedHashRef.current = null;
    setIsDirty(false);
    if (autoSyncTimerRef.current) {
      clearTimeout(autoSyncTimerRef.current);
      autoSyncTimerRef.current = null;
    }
    void preferencesStore.getState().updatePreferences({
      cloudSyncEmail: '',
      cloudSyncUid: '',
    });
  };

  const handleDeleteCloudVault = async () => {
    if (!authSession) return;
    const effectiveApiKey =
      savedPreferences.firebaseApiKey ||
      (import.meta.env.VITE_FIREBASE_API_KEY as string | undefined) ||
      DEFAULT_FIREBASE_CONFIG.apiKey;
    const effectiveProjectId =
      savedPreferences.firebaseProjectId ||
      (import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined) ||
      DEFAULT_FIREBASE_CONFIG.projectId;

    const client = new FirebaseSyncClient({
      apiKey: effectiveApiKey,
      projectId: effectiveProjectId,
    });

    await client.deleteWorkspaceVault(authSession);
    lastSyncedHashRef.current = null;
    setIsDirty(false);
    if (autoSyncTimerRef.current) {
      clearTimeout(autoSyncTimerRef.current);
      autoSyncTimerRef.current = null;
    }
    await preferencesStore.getState().updatePreferences({
      lastCloudSyncTimestamp: null,
    });
  };

  const handleExportLocalJson = () => {
    try {
      const serialized = serializeWorkspaceBackup(currentSnapshot);
      const blob = new Blob([serialized], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `marketview-workspace-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setCloudSyncError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleImportLocalJson = async (file: File) => {
    const text = await file.text();
    const backup = parseWorkspaceBackup(text);
    const cleaned = garbageCollectWorkspace(backup);

    await repo.saveWatchlists(cleaned.watchlists);
    await watchlistStore.getState().hydrate();

    await repo.saveAnnotations(cleaned.annotations);
    await annotationStore.getState().hydrate();

    if (cleaned.preferences) {
      await preferencesStore.getState().updatePreferences({
        ...cleaned.preferences,
        deletedIds: {
          ...(savedPreferences.deletedIds ?? {}),
          ...(cleaned.deletedIds ?? {}),
        },
      });
    }
  };

  const syncStatus: CloudSyncStatus = useMemo(() => {
    if (!authSession) return 'offline';
    if (cloudSyncError) return 'error';
    if (isSyncing) return 'syncing';
    if (isDirty) return 'dirty';
    return 'synced';
  }, [authSession, cloudSyncError, isSyncing, isDirty]);

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
        showSync={true}
        cloudAuthSession={authSession}
        isSyncing={isSyncing}
        cloudSyncError={cloudSyncError}
        syncStatus={syncStatus}
        isDirty={isDirty}
        workspaceBytes={workspaceBytes}
        entityCounts={entityCounts}
        userPreferences={savedPreferences}
        onSignInCloud={handleSignInCloud}
        onSignUpCloud={handleSignUpCloud}
        onSignInWithGoogle={handleSignInWithGoogle}
        onSignOutCloud={handleSignOutCloud}
        onSyncNow={() => handleSyncNow()}
        onDeleteCloudVault={handleDeleteCloudVault}
        onExportLocalJson={handleExportLocalJson}
        onImportLocalJson={handleImportLocalJson}
        onUpdateFirebaseConfig={(config) => {
          void preferencesStore.getState().updatePreferences({
            firebaseApiKey: config.apiKey,
            firebaseProjectId: config.projectId,
          });
        }}
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
            await preferencesStore.getState().recordTombstone(id);
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
          annotationsCountByTicker={annotationsCountByTicker}
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
                showAdvancedTools={true}
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
                }}
                onAddAnnotation={async (input) => {
                  await annotationStore.getState().addAnnotation(input);
                }}
                onUpdateAnnotation={async (id, updates) => {
                  await annotationStore.getState().updateAnnotation(id, updates);
                }}
                onDeleteAnnotation={async (id) => {
                  await annotationStore.getState().deleteAnnotation(id);
                  await preferencesStore.getState().recordTombstone(id);
                }}
              />
            </>
          )}
        />
      </main>
    </div>
  );
}
