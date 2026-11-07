import { describe, expect, it } from 'vitest';
import {
  computeWorkspaceContentHash,
  type WorkspaceBackup,
} from '../core/serialization/workspaceExport';
import type { IndicatorId } from '../core/indicators/technicalIndicators';
import {
  LivePollIntervalSchema,
  UserPreferencesSchema,
  type LivePollInterval,
} from '../core/schemas/preferences';
import { createAnnotationStore } from '../core/stores/annotationStore';
import { createWatchlistStore } from '../core/stores/watchlistStore';
import { InMemoryStorageRepository } from '../core/repositories/InMemoryStorageRepository';
import type { ChartAnnotation } from '../core/schemas/annotation';
import type { Watchlist } from '../core/schemas/watchlist';

// Helper class to intercept persistence operations with controllable async resolution
class DelayedStorageRepository extends InMemoryStorageRepository {
  public pendingResolvers: Array<() => Promise<void> | void> = [];
  public saveAnnotationCalls = 0;
  public saveWatchlistCalls = 0;

  public override async saveAnnotations(annotations: ChartAnnotation[]): Promise<void> {
    this.saveAnnotationCalls++;
    await new Promise<void>((resolve) => {
      this.pendingResolvers.push(async () => {
        await super.saveAnnotations(annotations);
        resolve();
      });
    });
  }

  public override async saveWatchlists(watchlists: Watchlist[]): Promise<void> {
    this.saveWatchlistCalls++;
    await new Promise<void>((resolve) => {
      this.pendingResolvers.push(async () => {
        await super.saveWatchlists(watchlists);
        resolve();
      });
    });
  }

  public async resolveNext(): Promise<void> {
    const resolver = this.pendingResolvers.shift();
    if (resolver) {
      await resolver();
    }
  }

  public async drainAll(): Promise<void> {
    while (this.pendingResolvers.length > 0) {
      const resolver = this.pendingResolvers.shift();
      if (resolver) {
        await resolver();
      }
    }
  }
}

// Helper to construct a baseline valid workspace backup
function createBaselineWorkspace(): WorkspaceBackup {
  return {
    version: 1,
    exportedAt: 1711900000,
    watchlists: [
      {
        id: 'wl-tech-1',
        name: 'Tech Giants',
        tickers: ['AAPL', 'MSFT', 'GOOGL'],
        createdAt: 1711000000,
        updatedAt: 1711000000,
      },
      {
        id: 'wl-semi-2',
        name: 'Semiconductors',
        tickers: ['NVDA', 'AMD', 'AVGO'],
        createdAt: 1711100000,
        updatedAt: 1711100000,
      },
    ],
    annotations: [
      {
        id: 'ann-1',
        ticker: 'AAPL',
        type: 'sticker',
        anchors: [{ timestamp: 1711800000, price: 182.5 }],
        payload: { markdown: 'Key breakout level' },
        createdAt: 1711800000,
        updatedAt: 1711800000,
      },
      {
        id: 'ann-2',
        ticker: 'NVDA',
        type: 'trendline',
        anchors: [
          { timestamp: 1711700000, price: 850.0 },
          { timestamp: 1711800000, price: 900.0 },
        ],
        payload: { color: '#3b82f6', width: 2 },
        createdAt: 1711700000,
        updatedAt: 1711800000,
      },
    ],
    trades: [
      {
        id: 'tr-1',
        ticker: 'AAPL',
        side: 'BUY',
        quantity: 100,
        entryPrice: 180.0,
        entryTimestamp: 1711700000,
        exitPrice: 185.0,
        exitTimestamp: 1711800000,
        stopLossPrice: 178.0,
        takeProfitPrice: 190.0,
        setupTags: ['Breakout'],
        notesMarkdown: 'Clean daily close',
        status: 'CLOSED',
        createdAt: 1711700000,
        updatedAt: 1711800000,
      },
    ],
    alerts: [
      {
        id: 'al-1',
        ticker: 'AAPL',
        targetPrice: 190.0,
        condition: 'CROSSING_UP',
        note: 'Breakout alert',
        createdAt: 1711800000,
        status: 'ACTIVE',
      },
    ],
    deletedIds: {
      'ann-old-1': 1711500000,
    },
    preferences: {
      activeTicker: 'AAPL',
      activeTimeframe: '1D',
      activeWatchlistId: 'wl-tech-1',
      providerMode: 'finnhub',
      finnhubApiKey: 'secret-finnhub-key',
      pollIntervalSec: 15,
      activeIndicators: ['CANDLES', 'VOLUME'],
      isSidebarCollapsed: false,
      firebaseApiKey: 'fb-api-key',
      firebaseProjectId: 'fb-proj-id',
      deletedIds: {},
      cloudSyncEmail: 'trader@marketview.test',
      cloudSyncUid: 'uid-999',
      lastCloudSyncTimestamp: 1711899999,
    },
  };
}

// Generate power set of array elements
function getPowerSet<T>(items: readonly T[]): T[][] {
  const result: T[][] = [[]];
  for (const item of items) {
    const len = result.length;
    for (let i = 0; i < len; i++) {
      result.push([...result[i]!, item]);
    }
  }
  return result;
}

describe('Challenger M1-2: Sync Isolation, Schema Validation & Store Concurrency Stress Tests', () => {
  describe('1. computeWorkspaceContentHash Invariance & Sensitivity Stress Harness', () => {
    const ALL_INDICATORS: IndicatorId[] = [
      'CANDLES',
      'PRICE_15M',
      'SMA_20',
      'EMA_50',
      'BB_20',
      'VWAP',
      'RSI_14',
      'VOLUME',
    ];

    const VALID_POLL_INTERVALS: LivePollInterval[] = [0, 5, 15, 30, 60, 300];

    it('remains 100% identical across all 256 indicator permutations (power set)', () => {
      const baseline = createBaselineWorkspace();
      const baselineHash = computeWorkspaceContentHash(baseline);
      expect(baselineHash).toMatch(/^[0-9a-f]{8}$/);

      const allPermutations = getPowerSet(ALL_INDICATORS);
      expect(allPermutations.length).toBe(256);

      let verifiedPermutationCount = 0;
      for (const permutation of allPermutations) {
        const mutated: WorkspaceBackup = {
          ...baseline,
          preferences: {
            ...baseline.preferences!,
            activeIndicators: permutation,
          },
        };

        const mutatedHash = computeWorkspaceContentHash(mutated);
        expect(mutatedHash).toBe(baselineHash);
        verifiedPermutationCount++;
      }

      expect(verifiedPermutationCount).toBe(256);
    });

    it('remains 100% identical across all poll interval options (0, 5, 15, 30, 60, 300)', () => {
      const baseline = createBaselineWorkspace();
      const baselineHash = computeWorkspaceContentHash(baseline);

      for (const interval of VALID_POLL_INTERVALS) {
        const mutated: WorkspaceBackup = {
          ...baseline,
          preferences: {
            ...baseline.preferences!,
            pollIntervalSec: interval,
          },
        };

        const mutatedHash = computeWorkspaceContentHash(mutated);
        expect(mutatedHash).toBe(baselineHash);
      }
    });

    it('remains 100% identical across full Cartesian product of (256 indicator subsets x 6 poll intervals = 1,536 combinations)', () => {
      const baseline = createBaselineWorkspace();
      const baselineHash = computeWorkspaceContentHash(baseline);
      const allPermutations = getPowerSet(ALL_INDICATORS);

      let totalMatrixEvaluations = 0;
      for (const indicators of allPermutations) {
        for (const pollIntervalSec of VALID_POLL_INTERVALS) {
          const mutated: WorkspaceBackup = {
            ...baseline,
            preferences: {
              ...baseline.preferences!,
              activeIndicators: indicators,
              pollIntervalSec,
            },
          };

          const hash = computeWorkspaceContentHash(mutated);
          expect(hash).toBe(baselineHash);
          totalMatrixEvaluations++;
        }
      }

      expect(totalMatrixEvaluations).toBe(256 * 6);
    });

    it('remains 100% identical when mutating other ephemeral viewport and local UI state', () => {
      const baseline = createBaselineWorkspace();
      const baselineHash = computeWorkspaceContentHash(baseline);

      const ephemeralMutations: Partial<NonNullable<WorkspaceBackup['preferences']>>[] = [
        { activeTicker: 'TSLA' },
        { activeTicker: 'NVDA' },
        { activeTimeframe: '15m' },
        { activeTimeframe: '1W' },
        { activeWatchlistId: 'wl-semi-2' },
        { isSidebarCollapsed: true },
        { cloudSyncEmail: 'different@user.org' },
        { cloudSyncUid: 'uid-different-456' },
        { lastCloudSyncTimestamp: 1711999999 },
        { lastCloudSyncTimestamp: null },
      ];

      for (const mutation of ephemeralMutations) {
        const mutated: WorkspaceBackup = {
          ...baseline,
          preferences: {
            ...baseline.preferences!,
            ...mutation,
          },
        };
        expect(computeWorkspaceContentHash(mutated)).toBe(baselineHash);
      }

      // Also verify top-level exportedAt timestamp does not affect hash
      const mutatedExportedAt: WorkspaceBackup = {
        ...baseline,
        exportedAt: 9999999999,
      };
      expect(computeWorkspaceContentHash(mutatedExportedAt)).toBe(baselineHash);
    });

    it('produces DIFFERENT content hash when any domain entity or persistent credential changes', () => {
      const baseline = createBaselineWorkspace();
      const baselineHash = computeWorkspaceContentHash(baseline);

      // 1. Mutate watchlists
      const watchlistMutated: WorkspaceBackup = {
        ...baseline,
        watchlists: [
          ...baseline.watchlists,
          {
            id: 'wl-3',
            name: 'Energy',
            tickers: ['XOM', 'CVX'],
            createdAt: 1711200000,
            updatedAt: 1711200000,
          },
        ],
      };
      expect(computeWorkspaceContentHash(watchlistMutated)).not.toBe(baselineHash);

      // 2. Mutate watchlist tickers order / content
      const watchlistTickersMutated: WorkspaceBackup = {
        ...baseline,
        watchlists: [
          {
            ...baseline.watchlists[0]!,
            tickers: ['AAPL', 'MSFT'], // removed GOOGL
          },
          baseline.watchlists[1]!,
        ],
      };
      expect(computeWorkspaceContentHash(watchlistTickersMutated)).not.toBe(baselineHash);

      // 3. Mutate annotations
      const annotationMutated: WorkspaceBackup = {
        ...baseline,
        annotations: [
          {
            ...baseline.annotations[0]!,
            payload: { markdown: 'Altered content' },
          },
          baseline.annotations[1]!,
        ],
      };
      expect(computeWorkspaceContentHash(annotationMutated)).not.toBe(baselineHash);

      // 4. Mutate annotation coordinates
      const annotationAnchorMutated: WorkspaceBackup = {
        ...baseline,
        annotations: [
          {
            ...baseline.annotations[0]!,
            anchors: [{ timestamp: 1711800000, price: 199.99 }],
          },
          baseline.annotations[1]!,
        ],
      };
      expect(computeWorkspaceContentHash(annotationAnchorMutated)).not.toBe(baselineHash);

      // 5. Mutate trades
      const tradesMutated: WorkspaceBackup = {
        ...baseline,
        trades: [],
      };
      expect(computeWorkspaceContentHash(tradesMutated)).not.toBe(baselineHash);

      // 6. Mutate alerts
      const alertsMutated: WorkspaceBackup = {
        ...baseline,
        alerts: [
          {
            ...baseline.alerts[0]!,
            targetPrice: 205.0,
          },
        ],
      };
      expect(computeWorkspaceContentHash(alertsMutated)).not.toBe(baselineHash);

      // 7. Mutate deletedIds tombstones
      const deletedIdsMutated: WorkspaceBackup = {
        ...baseline,
        deletedIds: {
          ...baseline.deletedIds,
          'ann-old-2': 1711600000,
        },
      };
      expect(computeWorkspaceContentHash(deletedIdsMutated)).not.toBe(baselineHash);

      // 8. Mutate persistent account credentials: finnhubApiKey
      const finnhubKeyMutated: WorkspaceBackup = {
        ...baseline,
        preferences: {
          ...baseline.preferences!,
          finnhubApiKey: 'new-finnhub-api-key',
        },
      };
      expect(computeWorkspaceContentHash(finnhubKeyMutated)).not.toBe(baselineHash);

      // 9. Mutate persistent account credentials: providerMode
      const providerModeMutated: WorkspaceBackup = {
        ...baseline,
        preferences: {
          ...baseline.preferences!,
          providerMode: 'demo',
        },
      };
      expect(computeWorkspaceContentHash(providerModeMutated)).not.toBe(baselineHash);

      // 10. Mutate persistent account credentials: firebaseApiKey
      const firebaseKeyMutated: WorkspaceBackup = {
        ...baseline,
        preferences: {
          ...baseline.preferences!,
          firebaseApiKey: 'new-firebase-api-key',
        },
      };
      expect(computeWorkspaceContentHash(firebaseKeyMutated)).not.toBe(baselineHash);

      // 11. Mutate persistent account credentials: firebaseProjectId
      const firebaseProjMutated: WorkspaceBackup = {
        ...baseline,
        preferences: {
          ...baseline.preferences!,
          firebaseProjectId: 'new-firebase-project',
        },
      };
      expect(computeWorkspaceContentHash(firebaseProjMutated)).not.toBe(baselineHash);
    });
  });

  describe('2. LivePollIntervalSchema Validation & Boundary Robustness', () => {
    it('accepts all valid poll intervals: 0, 5, 15, 30, 60, 300', () => {
      const validIntervals = [0, 5, 15, 30, 60, 300];
      for (const val of validIntervals) {
        const parsed = LivePollIntervalSchema.parse(val);
        expect(parsed).toBe(val);
      }
    });

    it('explicitly rejects invalid and unapproved intervals', () => {
      const invalidIntervals = [
        -1,
        -15,
        -60,
        -300,
        1,
        2,
        3,
        10,
        20,
        45,
        90,
        120,
        600,
        3600,
        15.5,
        60.001,
        '15',
        '60',
        '300',
        null,
        undefined,
        NaN,
        Infinity,
        {},
        [],
        true,
        false,
      ];

      for (const val of invalidIntervals) {
        const result = LivePollIntervalSchema.safeParse(val);
        expect(result.success).toBe(false);
      }
    });

    it('integrates seamlessly with UserPreferencesSchema defaults and custom values', () => {
      // Default pollIntervalSec is 15
      const defaultPrefs = UserPreferencesSchema.parse({});
      expect(defaultPrefs.pollIntervalSec).toBe(15);

      // Valid 60s (1m)
      const oneMinute = UserPreferencesSchema.parse({ pollIntervalSec: 60 });
      expect(oneMinute.pollIntervalSec).toBe(60);

      // Valid 300s (5m)
      const fiveMinutes = UserPreferencesSchema.parse({ pollIntervalSec: 300 });
      expect(fiveMinutes.pollIntervalSec).toBe(300);

      // Valid 0 (Off)
      const off = UserPreferencesSchema.parse({ pollIntervalSec: 0 });
      expect(off.pollIntervalSec).toBe(0);

      // Invalid interval in preferences fails Zod parsing
      expect(() =>
        UserPreferencesSchema.parse({ pollIntervalSec: 45 })
      ).toThrow();
    });
  });

  describe('3. Store Concurrency & Optimistic State Stress Harness', () => {
    describe('annotationStore', () => {
      it('updates Zustand in-memory state synchronously BEFORE delayed saveAnnotations resolves', async () => {
        const repo = new DelayedStorageRepository();
        const store = createAnnotationStore(repo, () => 1711800000);

        // 1. addAnnotation
        const addPromise = store.getState().addAnnotation({
          ticker: 'AAPL',
          type: 'sticker',
          anchors: [{ timestamp: 1711800000, price: 180.0 }],
          payload: { markdown: 'Initial Note' },
        });

        // Verify in-memory state changed IMMEDIATELY and synchronously before save completed:
        expect(store.getState().annotations.length).toBe(1);
        const added = store.getState().annotations[0]!;
        expect(added.ticker).toBe('AAPL');
        expect(store.getState().selectedAnnotationId).toBe(added.id);
        expect(repo.saveAnnotationCalls).toBe(1);

        // Complete the pending repository write
        await repo.resolveNext();
        const returnedAnnotation = await addPromise;
        expect(returnedAnnotation.id).toBe(added.id);
        const savedAnnotations = await repo.getAnnotations();
        expect(savedAnnotations.length).toBe(1);

        // 2. updateAnnotation
        const updatePromise = store.getState().updateAnnotation(added.id, {
          payload: { markdown: 'Optimistic Edit' },
          anchors: [{ timestamp: 1711800000, price: 185.0 }],
        });

        // Verify in-memory state updated synchronously:
        expect(store.getState().annotations[0]?.payload['markdown']).toBe('Optimistic Edit');
        expect(store.getState().annotations[0]?.anchors[0]?.price).toBe(185.0);
        expect(repo.saveAnnotationCalls).toBe(2);

        await repo.resolveNext();
        await updatePromise;
        const updatedSaved = await repo.getAnnotations();
        expect(updatedSaved[0]?.payload['markdown']).toBe('Optimistic Edit');

        // 3. deleteAnnotation
        const deletePromise = store.getState().deleteAnnotation(added.id);

        // Verify in-memory state updated synchronously:
        expect(store.getState().annotations.length).toBe(0);
        expect(store.getState().selectedAnnotationId).toBeNull();
        expect(repo.saveAnnotationCalls).toBe(3);

        await repo.resolveNext();
        await deletePromise;
        const afterDeleteSaved = await repo.getAnnotations();
        expect(afterDeleteSaved.length).toBe(0);
      });

      it('survives rapid consecutive mutations without clobbering in-memory state', async () => {
        const repo = new DelayedStorageRepository();
        const store = createAnnotationStore(repo, () => 1711800000);

        // Create initial annotation
        const p1 = store.getState().addAnnotation({
          ticker: 'NVDA',
          type: 'sticker',
          anchors: [{ timestamp: 1711800000, price: 800.0 }],
          payload: { count: 0 },
        });
        const annId = store.getState().annotations[0]!.id;

        // Perform 5 rapid consecutive updates synchronously without awaiting
        const updatePromises = [];
        for (let i = 1; i <= 5; i++) {
          updatePromises.push(
            store.getState().updateAnnotation(annId, {
              payload: { count: i },
            })
          );
          // In-memory state must reflect mutation 'i' immediately
          expect(store.getState().annotations[0]?.payload['count']).toBe(i);
        }

        // Now drain all pending background saves
        await repo.drainAll();

        await p1;
        await Promise.all(updatePromises);

        expect(store.getState().annotations[0]?.payload['count']).toBe(5);
        const persisted = await repo.getAnnotations();
        expect(persisted[0]?.payload['count']).toBe(5);
      });
    });

    describe('watchlistStore', () => {
      it('updates Zustand in-memory state synchronously BEFORE delayed saveWatchlists resolves', async () => {
        const repo = new DelayedStorageRepository();
        const store = createWatchlistStore(repo, () => 1711800000);

        // 1. Initial hydrate with empty repo seeds 2 default watchlists synchronously before save
        const hydratePromise = store.getState().hydrate();
        await Promise.resolve(); // yield to microtask
        expect(store.getState().watchlists.length).toBe(2);
        expect(store.getState().isHydrated).toBe(true);
        expect(store.getState().activeWatchlistId).toBe('wl-core-leaders');
        expect(repo.saveWatchlistCalls).toBe(1);

        await repo.resolveNext();
        await hydratePromise;
        const initialWatchlists = await repo.getWatchlists();
        expect(initialWatchlists.length).toBe(2);

        // 2. createWatchlist
        const createPromise = store.getState().createWatchlist('BioTech', ['MRNA', 'bntx']);
        // Verify in-memory state updated immediately:
        expect(store.getState().watchlists.length).toBe(3);
        const created = store.getState().watchlists.find((w) => w.name === 'BioTech');
        expect(created).toBeDefined();
        expect(created?.tickers).toEqual(['MRNA', 'BNTX']);
        expect(store.getState().activeWatchlistId).toBe(created!.id);
        expect(repo.saveWatchlistCalls).toBe(2);

        await repo.resolveNext();
        await createPromise;
        const afterCreateWatchlists = await repo.getWatchlists();
        expect(afterCreateWatchlists.length).toBe(3);

        // 3. addTicker
        const addPromise = store.getState().addTicker(created!.id, 'gild');
        expect(
          store.getState().watchlists.find((w) => w.id === created!.id)?.tickers
        ).toEqual(['MRNA', 'BNTX', 'GILD']);
        expect(repo.saveWatchlistCalls).toBe(3);

        await repo.resolveNext();
        await addPromise;

        // 4. renameWatchlist
        const renamePromise = store.getState().renameWatchlist(created!.id, 'mRNA Leaders');
        expect(
          store.getState().watchlists.find((w) => w.id === created!.id)?.name
        ).toBe('mRNA Leaders');
        expect(repo.saveWatchlistCalls).toBe(4);

        await repo.resolveNext();
        await renamePromise;

        // 5. removeTicker
        const removePromise = store.getState().removeTicker(created!.id, 'BNTX');
        expect(
          store.getState().watchlists.find((w) => w.id === created!.id)?.tickers
        ).toEqual(['MRNA', 'GILD']);
        expect(repo.saveWatchlistCalls).toBe(5);

        await repo.resolveNext();
        await removePromise;

        // 6. deleteWatchlist
        const deletePromise = store.getState().deleteWatchlist(created!.id);
        expect(store.getState().watchlists.length).toBe(2);
        expect(store.getState().watchlists.some((w) => w.id === created!.id)).toBe(false);
        expect(store.getState().activeWatchlistId).toBe('wl-core-leaders');
        expect(repo.saveWatchlistCalls).toBe(6);

        await repo.resolveNext();
        await deletePromise;
      });

      it('safely validates activeWatchlistId during hydrate() falling back to firstId when stale or nonexistent', async () => {
        const initialWatchlists: Watchlist[] = [
          {
            id: 'wl-primary',
            name: 'Primary Watchlist',
            tickers: ['AAPL'],
            createdAt: 1711800000,
            updatedAt: 1711800000,
          },
          {
            id: 'wl-secondary',
            name: 'Secondary Watchlist',
            tickers: ['MSFT'],
            createdAt: 1711800000,
            updatedAt: 1711800000,
          },
        ];
        const repo = new InMemoryStorageRepository(initialWatchlists);

        const store = createWatchlistStore(repo, () => 1711800000);

        // Case A: Fresh store with empty activeWatchlistId -> hydrate picks firstId
        await store.getState().hydrate();
        expect(store.getState().activeWatchlistId).toBe('wl-primary');

        // Case B: Set activeWatchlistId to a stale/deleted ID not present in storage
        store.setState({ activeWatchlistId: 'wl-ghost-deleted-from-cloud' });
        expect(store.getState().activeWatchlistId).toBe('wl-ghost-deleted-from-cloud');

        // Re-hydrating validates membership and falls back to firstId ('wl-primary')
        await store.getState().hydrate();
        expect(store.getState().activeWatchlistId).toBe('wl-primary');

        // Case C: Valid activeWatchlistId ('wl-secondary') is preserved on re-hydration
        store.getState().selectWatchlist('wl-secondary');
        expect(store.getState().activeWatchlistId).toBe('wl-secondary');

        await store.getState().hydrate();
        expect(store.getState().activeWatchlistId).toBe('wl-secondary');
      });

      it('handles concurrent interleaving of multiple mutations without dropped updates', async () => {
        const repo = new DelayedStorageRepository();
        const store = createWatchlistStore(repo, () => 1711800000);

        const hydratePromise = store.getState().hydrate();
        await Promise.resolve();
        // Resolve initial seed
        await repo.resolveNext();
        await hydratePromise;

        // Concurrently invoke multiple distinct actions without awaiting
        const p1 = store.getState().createWatchlist('Alpha', ['AAPL']);
        const alphaId = store.getState().activeWatchlistId;

        const p2 = store.getState().addTicker(alphaId, 'GOOGL');
        const p3 = store.getState().addTicker(alphaId, 'AMZN');
        const p4 = store.getState().renameWatchlist(alphaId, 'MegaCap Tech');

        // Check in-memory state immediately:
        const currentAlpha = store.getState().watchlists.find((w) => w.id === alphaId);
        expect(currentAlpha?.name).toBe('MegaCap Tech');
        expect(currentAlpha?.tickers).toEqual(['AAPL', 'GOOGL', 'AMZN']);

        // Drain all background save promises
        await repo.drainAll();

        await Promise.all([p1, p2, p3, p4]);

        const persistedWatchlists = await repo.getWatchlists();
        const persistedAlpha = persistedWatchlists.find((w) => w.id === alphaId);
        expect(persistedAlpha?.name).toBe('MegaCap Tech');
        expect(persistedAlpha?.tickers).toEqual(['AAPL', 'GOOGL', 'AMZN']);
      });
    });
  });
});
