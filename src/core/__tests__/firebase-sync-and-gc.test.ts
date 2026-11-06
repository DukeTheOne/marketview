import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  garbageCollectWorkspace,
  mergeWorkspaceSnapshots,
  WORKSPACE_QUOTAS,
  type WorkspaceBackup,
} from '../serialization/workspaceExport';
import { FirebaseSyncClient, type CloudAuthSession } from '../sync/firebaseSync';
import type { ChartAnnotation } from '../schemas/annotation';
import type { Watchlist } from '../schemas/watchlist';
import type { TradeEntry } from '../schemas/trade';
import type { PriceAlert } from '../schemas/alert';

describe('Milestone 12: Anti-Bombing Quotas, Garbage Collection & Multi-Device Sync', () => {
  const baseTimestamp = 1711900000; // Reference unix seconds

  const mockAnnotation = (id: string, updatedAt = baseTimestamp): ChartAnnotation => ({
    id,
    ticker: 'AAPL',
    type: 'sticker',
    anchors: [{ timestamp: 1711800000, price: 180.5 }],
    payload: { emoji: '🚀', text: 'Target reached' },
    createdAt: updatedAt,
    updatedAt,
  });

  const mockWatchlist = (id: string, name = 'Tech', updatedAt = baseTimestamp): Watchlist => ({
    id,
    name,
    tickers: ['AAPL', 'MSFT', 'NVDA'],
    createdAt: updatedAt,
    updatedAt,
  });

  const mockTrade = (id: string, updatedAt = baseTimestamp): TradeEntry => ({
    id,
    ticker: 'AAPL',
    side: 'BUY',
    status: 'CLOSED',
    entryPrice: 175.0,
    exitPrice: 185.0,
    quantity: 10,
    entryTimestamp: 1711700000,
    exitTimestamp: 1711800000,
    setupTags: ['breakout'],
    notesMarkdown: 'Clean breakout',
    createdAt: updatedAt,
    updatedAt,
  });

  const mockAlert = (id: string, createdAt = baseTimestamp): PriceAlert => ({
    id,
    ticker: 'AAPL',
    targetPrice: 190.0,
    condition: 'CROSSING_UP',
    status: 'ACTIVE',
    note: 'Breakout above key level',
    createdAt,
  });

  describe('WORKSPACE_QUOTAS Definitions', () => {
    it('defines strict anti-bombing quotas matching the specification', () => {
      expect(WORKSPACE_QUOTAS.MAX_WATCHLISTS).toBe(20);
      expect(WORKSPACE_QUOTAS.MAX_TICKERS_PER_WATCHLIST).toBe(100);
      expect(WORKSPACE_QUOTAS.MAX_ANNOTATIONS).toBe(500);
      expect(WORKSPACE_QUOTAS.MAX_TRADES).toBe(500);
      expect(WORKSPACE_QUOTAS.MAX_ALERTS).toBe(100);
      expect(WORKSPACE_QUOTAS.MAX_TOMBSTONES).toBe(500);
      expect(WORKSPACE_QUOTAS.TOMBSTONE_TTL_SECONDS).toBe(30 * 24 * 60 * 60); // 30 days
      expect(WORKSPACE_QUOTAS.MAX_WORKSPACE_BYTES).toBe(150_000); // 150 KB
    });
  });

  describe('garbageCollectWorkspace()', () => {
    it('purges tombstones older than 30 days (TOMBSTONE_TTL_SECONDS)', () => {
      const nowSec = baseTimestamp;
      const freshTimestamp = nowSec - 5 * 24 * 60 * 60; // 5 days old
      const expiredTimestamp = nowSec - 31 * 24 * 60 * 60; // 31 days old

      const snapshot: WorkspaceBackup = {
        version: 1,
        exportedAt: nowSec,
        watchlists: [],
        annotations: [],
        trades: [],
        alerts: [],
        deletedIds: {
          'recent-deleted-ann': freshTimestamp,
          'ancient-deleted-ann': expiredTimestamp,
        },
      };

      const cleaned = garbageCollectWorkspace(snapshot, nowSec);
      expect(cleaned.deletedIds).toHaveProperty('recent-deleted-ann');
      expect(cleaned.deletedIds).not.toHaveProperty('ancient-deleted-ann');
    });

    it('permanently filters out entities matching active tombstones', () => {
      const nowSec = baseTimestamp;
      const snapshot: WorkspaceBackup = {
        version: 1,
        exportedAt: nowSec,
        watchlists: [mockWatchlist('wl-1'), mockWatchlist('wl-2')],
        annotations: [mockAnnotation('ann-1'), mockAnnotation('ann-2')],
        trades: [mockTrade('trade-1'), mockTrade('trade-2')],
        alerts: [mockAlert('alert-1'), mockAlert('alert-2')],
        deletedIds: {
          'wl-1': nowSec,
          'ann-2': nowSec,
          'trade-1': nowSec,
          'alert-2': nowSec,
        },
      };

      const cleaned = garbageCollectWorkspace(snapshot, nowSec);
      expect(cleaned.watchlists.map((w) => w.id)).toEqual(['wl-2']);
      expect(cleaned.annotations.map((a) => a.id)).toEqual(['ann-1']);
      expect(cleaned.trades.map((t) => t.id)).toEqual(['trade-2']);
      expect(cleaned.alerts.map((al) => al.id)).toEqual(['alert-1']);
    });

    it('caps tombstones to MAX_TOMBSTONES (500) keeping the most recent deletions', () => {
      const nowSec = baseTimestamp;
      const deletedIds: Record<string, number> = {};
      for (let i = 0; i < 600; i++) {
        deletedIds[`del-${i}`] = nowSec - (600 - i); // del-599 is newest
      }

      const snapshot: WorkspaceBackup = {
        version: 1,
        exportedAt: nowSec,
        watchlists: [],
        annotations: [],
        trades: [],
        alerts: [],
        deletedIds,
      };

      const cleaned = garbageCollectWorkspace(snapshot, nowSec);
      const keys = Object.keys(cleaned.deletedIds ?? {});
      expect(keys.length).toBe(WORKSPACE_QUOTAS.MAX_TOMBSTONES);
      expect(cleaned.deletedIds).toHaveProperty('del-599');
      expect(cleaned.deletedIds).not.toHaveProperty('del-0');
    });

    it('enforces maximum entity quotas by truncating overflown collections', () => {
      const nowSec = baseTimestamp;
      const overflownAnnotations: ChartAnnotation[] = [];
      for (let i = 0; i < 600; i++) {
        overflownAnnotations.push(mockAnnotation(`ann-${i}`));
      }

      const snapshot: WorkspaceBackup = {
        version: 1,
        exportedAt: nowSec,
        watchlists: [],
        annotations: overflownAnnotations,
        trades: [],
        alerts: [],
        deletedIds: {},
      };

      const cleaned = garbageCollectWorkspace(snapshot, nowSec);
      expect(cleaned.annotations.length).toBe(WORKSPACE_QUOTAS.MAX_ANNOTATIONS);
    });
  });

  describe('mergeWorkspaceSnapshots()', () => {
    it('unions tombstones and ensures deleted items on Device A are removed from Device B without resurrection', () => {
      const nowSec = baseTimestamp;
      // Device A deleted 'ann-to-delete'
      const deviceA: WorkspaceBackup = {
        version: 1,
        exportedAt: nowSec,
        watchlists: [mockWatchlist('wl-1')],
        annotations: [mockAnnotation('ann-keep')],
        trades: [],
        alerts: [],
        deletedIds: {
          'ann-to-delete': nowSec,
        },
      };

      // Device B still had 'ann-to-delete' before syncing
      const deviceB: WorkspaceBackup = {
        version: 1,
        exportedAt: nowSec - 100,
        watchlists: [mockWatchlist('wl-1')],
        annotations: [
          mockAnnotation('ann-keep'),
          mockAnnotation('ann-to-delete', nowSec - 500),
        ],
        trades: [],
        alerts: [],
        deletedIds: {},
      };

      const merged = mergeWorkspaceSnapshots(deviceB, deviceA, nowSec);

      // The tombstone from Device A must have purged 'ann-to-delete' from Device B
      expect(merged.annotations.map((a) => a.id)).toEqual(['ann-keep']);
      expect(merged.deletedIds).toHaveProperty('ann-to-delete');
    });

    it('merges entities by ID preserving the newer version', () => {
      const nowSec = baseTimestamp;
      const local: WorkspaceBackup = {
        version: 1,
        exportedAt: nowSec,
        watchlists: [
          {
            id: 'wl-1',
            name: 'Local Tech Name',
            tickers: ['AAPL'],
            createdAt: nowSec - 100,
            updatedAt: nowSec - 50,
          },
        ],
        annotations: [],
        trades: [],
        alerts: [],
        deletedIds: {},
      };

      const remote: WorkspaceBackup = {
        version: 1,
        exportedAt: nowSec,
        watchlists: [
          {
            id: 'wl-1',
            name: 'Remote Tech Name Newer',
            tickers: ['AAPL', 'GOOGL'],
            createdAt: nowSec - 100,
            updatedAt: nowSec - 10, // Newer!
          },
        ],
        annotations: [],
        trades: [],
        alerts: [],
        deletedIds: {},
      };

      const merged = mergeWorkspaceSnapshots(local, remote, nowSec);
      expect(merged.watchlists[0]?.name).toBe('Remote Tech Name Newer');
      expect(merged.watchlists[0]?.tickers).toEqual(['AAPL', 'GOOGL']);
    });

    it('preserves local API keys and credentials while syncing remote preferences', () => {
      const nowSec = baseTimestamp;
      const local: WorkspaceBackup = {
        version: 1,
        exportedAt: nowSec,
        watchlists: [],
        annotations: [],
        trades: [],
        alerts: [],
        deletedIds: {},
        preferences: {
          activeTicker: 'AAPL',
          activeTimeframe: '1D',
          activeWatchlistId: 'wl-default',
          providerMode: 'finnhub',
          finnhubApiKey: 'my-local-secret-finnhub-key',
          pollIntervalSec: 15,
          activeIndicators: ['CANDLES'],
          isSidebarCollapsed: false,
          firebaseApiKey: 'firebase-key-local',
          firebaseProjectId: 'project-local',
          deletedIds: {},
          cloudSyncEmail: '',
          cloudSyncUid: '',
          lastCloudSyncTimestamp: null,
        },
      };

      const remote: WorkspaceBackup = {
        version: 1,
        exportedAt: nowSec,
        watchlists: [],
        annotations: [],
        trades: [],
        alerts: [],
        deletedIds: {},
        preferences: {
          activeTicker: 'TSLA',
          activeTimeframe: '1h',
          activeWatchlistId: 'wl-default',
          providerMode: 'finnhub',
          finnhubApiKey: '', // Empty on remote
          pollIntervalSec: 5,
          activeIndicators: ['PRICE_15M'],
          isSidebarCollapsed: true,
          firebaseApiKey: '',
          firebaseProjectId: '',
          deletedIds: {},
          cloudSyncEmail: '',
          cloudSyncUid: '',
          lastCloudSyncTimestamp: null,
        },
      };

      const merged = mergeWorkspaceSnapshots(local, remote, nowSec);
      expect(merged.preferences?.activeTicker).toBe('TSLA');
      expect(merged.preferences?.isSidebarCollapsed).toBe(true);
      expect(merged.preferences?.finnhubApiKey).toBe('my-local-secret-finnhub-key');
      expect(merged.preferences?.firebaseApiKey).toBe('firebase-key-local');
    });
  });

  describe('FirebaseSyncClient', () => {
    const mockSession: CloudAuthSession = {
      uid: 'test-uid-123',
      email: 'trader@example.com',
      idToken: 'test-id-token',
      refreshToken: 'test-refresh-token',
      expiresAtMs: Date.now() + 3600000,
    };

    let client: FirebaseSyncClient;

    beforeEach(() => {
      client = new FirebaseSyncClient({
        apiKey: 'test-api-key',
        projectId: 'test-project-id',
      });
      vi.restoreAllMocks();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('rejects payloads exceeding 150 KB anti-bombing cap with an informative error', async () => {
      // Create a giant array of annotations to exceed 150 KB
      const giantAnnotations: ChartAnnotation[] = [];
      for (let i = 0; i < 2000; i++) {
        giantAnnotations.push({
          id: `ann-${i}`,
          ticker: 'AAPL',
          type: 'sticker',
          anchors: [{ timestamp: 1711800000, price: 180.5 }],
          payload: { text: 'A'.repeat(500) },
          createdAt: baseTimestamp,
          updatedAt: baseTimestamp,
        });
      }

      const overflownBackup: WorkspaceBackup = {
        version: 1,
        exportedAt: baseTimestamp,
        watchlists: [],
        annotations: giantAnnotations,
        trades: [],
        alerts: [],
        deletedIds: {},
      };

      await expect(client.pushWorkspace(mockSession, overflownBackup)).rejects.toThrow(
        /exceeds maximum quota of 150000 bytes/
      );
    });

    it('skips redundant pushes when content hash is identical and cooldown is active', async () => {
      const backup: WorkspaceBackup = {
        version: 1,
        exportedAt: baseTimestamp,
        watchlists: [mockWatchlist('wl-1')],
        annotations: [],
        trades: [],
        alerts: [],
        deletedIds: {},
      };

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            name: `projects/test-project-id/databases/(default)/documents/workspaces/${mockSession.uid}`,
            fields: {
              payloadJson: { stringValue: JSON.stringify(backup) },
              updatedAt: { integerValue: String(baseTimestamp) },
              byteLength: { integerValue: '100' },
              version: { integerValue: '1' },
            },
          }),
        } as unknown as Response;
      });

      // First push succeeds
      const result1 = await client.pushWorkspace(mockSession, backup);
      expect(result1.byteLength).toBeGreaterThan(0);
      expect(result1.skipped).toBe(false);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Immediate second push with identical backup triggers deduplication/cooldown
      const result2 = await client.pushWorkspace(mockSession, backup);
      expect(result2.byteLength).toBe(result1.byteLength);
      expect(result2.skipped).toBe(true);
      // Fetch should NOT be called a second time
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('pulls workspace cleanly and handles 404 (document does not exist yet)', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { message: 'Document not found' } }),
      } as unknown as Response);

      const doc = await client.pullWorkspace(mockSession);
      expect(doc).toBeNull();
    });

    it('deletes workspace cloud vault cleanly via DELETE endpoint', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      } as unknown as Response);

      await client.deleteWorkspaceVault(mockSession);
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining(`/workspaces/${mockSession.uid}`),
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('exchanges Google OAuth credentials via signInWithGoogleIdp and includes updateMask on pushWorkspace', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            localId: 'google-uid-999',
            email: 'google.user@gmail.com',
            idToken: 'firebase-jwt-from-google',
            refreshToken: 'firebase-refresh-from-google',
            expiresIn: '3600',
          }),
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => '{}',
        } as unknown as Response);

      const session = await client.signInWithGoogleIdp({
        idToken: 'google-oauth-id-token',
      });

      expect(session.uid).toBe('google-uid-999');
      expect(session.email).toBe('google.user@gmail.com');
      expect(session.idToken).toBe('firebase-jwt-from-google');
      expect(fetchSpy.mock.calls[0]?.[0]).toContain(
        'https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=test-api-key'
      );

      const backup: WorkspaceBackup = {
        version: 1,
        exportedAt: baseTimestamp,
        watchlists: [mockWatchlist('wl-google')],
        annotations: [],
        trades: [],
        alerts: [],
        deletedIds: {},
      };
      await client.pushWorkspace(session, backup);
      expect(fetchSpy.mock.calls[1]?.[0]).toContain(
        'updateMask.fieldPaths=payloadJson&updateMask.fieldPaths=updatedAt&updateMask.fieldPaths=byteLength&updateMask.fieldPaths=version'
      );
    });
  });
});
