import { describe, expect, it } from 'vitest';
import { IndexedDBStorageRepository } from '../repositories/IndexedDBStorageRepository';
import { InMemoryStorageRepository } from '../repositories/InMemoryStorageRepository';
import type { PriceAlert } from '../schemas/alert';
import type { TickerQuote } from '../schemas/market';
import { createAlertStore } from '../stores/alertStore';

const sampleAlertAAPL: PriceAlert = {
  id: 'alert-aapl-1',
  ticker: 'AAPL',
  targetPrice: 200,
  condition: 'CROSSING_UP',
  status: 'ACTIVE',
  note: 'Breakout above 200',
  createdAt: 1700000000,
};

const sampleAlertNVDA: PriceAlert = {
  id: 'alert-nvda-1',
  ticker: 'NVDA',
  targetPrice: 110,
  condition: 'CROSSING_DOWN',
  status: 'ACTIVE',
  note: 'Pullback entry',
  createdAt: 1700000100,
};

const sampleQuoteAAPL: TickerQuote = {
  ticker: 'AAPL',
  price: 205.5,
  change: 5.5,
  changePercent: 2.75,
  high: 206,
  low: 199,
  open: 200,
  previousClose: 200,
  timestamp: 1700000500,
};

describe('PriceAlert Persistence (StorageRepository & AlertStore)', () => {
  describe('InMemoryStorageRepository alerts', () => {
    it('initializes with optional 4th constructor parameter and filters by ticker', async () => {
      const repo = new InMemoryStorageRepository(
        [],
        [],
        [],
        [sampleAlertAAPL, sampleAlertNVDA]
      );

      const all = await repo.getAlerts();
      expect(all).toHaveLength(2);

      const aaplOnly = await repo.getAlerts('  aapl ');
      expect(aaplOnly).toHaveLength(1);
      expect(aaplOnly[0]?.id).toBe('alert-aapl-1');

      const msftOnly = await repo.getAlerts('MSFT');
      expect(msftOnly).toHaveLength(0);
    });

    it('saves alerts and validates schemas with Zod', async () => {
      const repo = new InMemoryStorageRepository();
      expect(await repo.getAlerts()).toEqual([]);

      await repo.saveAlerts([sampleAlertAAPL]);
      const saved = await repo.getAlerts();
      expect(saved).toEqual([sampleAlertAAPL]);

      await expect(
        repo.saveAlerts([
          {
            ...sampleAlertAAPL,
            targetPrice: -10,
          },
        ])
      ).rejects.toThrow();
    });
  });

  describe('IndexedDBStorageRepository alerts (headless fallback)', () => {
    it('saves and retrieves alerts filtered by ticker in headless mode', async () => {
      const repo = new IndexedDBStorageRepository();
      await repo.saveAlerts([sampleAlertAAPL, sampleAlertNVDA]);

      const all = await repo.getAlerts();
      expect(all).toHaveLength(2);

      const nvdaOnly = await repo.getAlerts('nvda');
      expect(nvdaOnly).toHaveLength(1);
      expect(nvdaOnly[0]?.ticker).toBe('NVDA');
    });

    it('rejects invalid alert payloads via Zod validation', async () => {
      const repo = new IndexedDBStorageRepository();
      await expect(
        repo.saveAlerts([
          {
            ...sampleAlertNVDA,
            ticker: '   ',
          },
        ])
      ).rejects.toThrow();
    });
  });

  describe('createAlertStore hydration & automatic persistence', () => {
    it('hydrates alerts from StorageRepository when created with createAlertStore(repo)', async () => {
      const repo = new InMemoryStorageRepository(
        [],
        [],
        [],
        [sampleAlertAAPL, sampleAlertNVDA]
      );
      const store = createAlertStore(repo);

      expect(store.getState().isHydrated).toBe(false);
      expect(store.getState().alerts).toHaveLength(0);

      const hydrated = await store.getState().hydrate();
      expect(hydrated).toHaveLength(2);
      expect(store.getState().isHydrated).toBe(true);
      expect(store.getState().alerts).toEqual([
        sampleAlertAAPL,
        sampleAlertNVDA,
      ]);
    });

    it('automatically persists changes on addAlert, evaluateQuote, dismissAlert, rearmAlert, and removeAlert', async () => {
      const repo = new InMemoryStorageRepository();
      const store = createAlertStore(repo);

      await store.getState().hydrate();
      expect(store.getState().isHydrated).toBe(true);

      // 1. addAlert persists to repository
      const created = store.getState().addAlert({
        ticker: 'AAPL',
        targetPrice: 200,
        condition: 'CROSSING_UP',
        note: 'Watch 200 level',
      });
      let persisted = await repo.getAlerts();
      expect(persisted).toHaveLength(1);
      expect(persisted[0]?.id).toBe(created.id);
      expect(persisted[0]?.status).toBe('ACTIVE');

      // 2. evaluateQuote persists triggered status and timestamp
      const triggered = store.getState().evaluateQuote(sampleQuoteAAPL);
      expect(triggered).toHaveLength(1);
      persisted = await repo.getAlerts();
      expect(persisted[0]?.status).toBe('TRIGGERED');
      expect(persisted[0]?.triggeredAt).toBe(sampleQuoteAAPL.timestamp);

      // 3. dismissAlert persists DISMISSED status
      store.getState().dismissAlert(created.id);
      persisted = await repo.getAlerts();
      expect(persisted[0]?.status).toBe('DISMISSED');

      // 4. rearmAlert persists ACTIVE status and clears triggeredAt
      store.getState().rearmAlert(created.id);
      persisted = await repo.getAlerts();
      expect(persisted[0]?.status).toBe('ACTIVE');
      expect(persisted[0]?.triggeredAt).toBeUndefined();

      // 5. removeAlert persists removal
      store.getState().removeAlert(created.id);
      persisted = await repo.getAlerts();
      expect(persisted).toHaveLength(0);
    });

    it('maintains backwards compatibility with createAlertStore([initialAlert]) and createAlertStore(initialAlerts, repo)', async () => {
      // Backwards-compatible array-only signature
      const standaloneStore = createAlertStore([sampleAlertAAPL]);
      expect(standaloneStore.getState().alerts).toEqual([sampleAlertAAPL]);
      const standaloneHydrated = await standaloneStore.getState().hydrate();
      expect(standaloneStore.getState().isHydrated).toBe(true);
      expect(standaloneHydrated).toEqual([sampleAlertAAPL]);

      // Two-argument signature: createAlertStore(initialAlerts, repo)
      const repo = new InMemoryStorageRepository();
      const dualStore = createAlertStore([sampleAlertNVDA], repo);
      expect(dualStore.getState().alerts).toEqual([sampleAlertNVDA]);

      dualStore.getState().addAlert({
        ticker: 'AAPL',
        targetPrice: 195,
        condition: 'CROSSING_UP',
      });

      const persisted = await repo.getAlerts();
      expect(persisted).toHaveLength(2);
      expect(persisted.map((a) => a.ticker)).toEqual(['AAPL', 'NVDA']);
    });
  });
});
