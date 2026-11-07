import { describe, expect, it } from 'vitest';
import { InMemoryStorageRepository } from '../repositories/InMemoryStorageRepository';
import { createWatchlistStore } from '../stores/watchlistStore';

describe('Watchlist Headless Store & StorageRepository Persistence (TC-04)', () => {
  it('seeds default watchlists on first hydrate and persists CRUD operations across store instances', async () => {
    const repo = new InMemoryStorageRepository();
    const store = createWatchlistStore(repo, () => 1729728000);

    const initial = await store.getState().hydrate();
    expect(initial.length).toBe(2);
    expect(store.getState().isHydrated).toBe(true);

    // Create a new custom watchlist
    const created = await store
      .getState()
      .createWatchlist('Semiconductor Breakouts', ['nvda', 'amd']);
    expect(created.name).toBe('Semiconductor Breakouts');
    expect(created.tickers).toEqual(['NVDA', 'AMD']);
    expect(store.getState().activeWatchlistId).toBe(created.id);

    // Add and remove tickers with automatic uppercase normalization
    await store.getState().addTicker(created.id, 'avgo');
    await store.getState().removeTicker(created.id, 'amd');

    // Rename watchlist
    await store.getState().renameWatchlist(created.id, 'AI & Semi Leaders');

    // Verify persistence in a fresh store backed by the same StorageRepository
    const secondStore = createWatchlistStore(repo, () => 1729729000);
    const rehydrated = await secondStore.getState().hydrate();
    const found = rehydrated.find((w) => w.id === created.id);

    expect(found).toBeDefined();
    expect(found?.name).toBe('AI & Semi Leaders');
    expect(found?.tickers).toEqual(['NVDA', 'AVGO']);

    // Delete watchlist
    await secondStore.getState().deleteWatchlist(created.id);
    const afterDelete = await repo.getWatchlists();
    expect(afterDelete.some((w) => w.id === created.id)).toBe(false);
  });

  it('falls back to firstId on hydrate() when activeWatchlistId does not exist in storage', async () => {
    const repo = new InMemoryStorageRepository();
    const store = createWatchlistStore(repo, () => 1729728000);

    // Initial hydrate seeds default watchlists (wl-core-leaders, wl-high-beta)
    await store.getState().hydrate();
    expect(store.getState().activeWatchlistId).toBe('wl-core-leaders');

    // Simulate an invalid/stale activeWatchlistId in memory (e.g. from previously loaded deleted ID)
    store.setState({ activeWatchlistId: 'wl-deleted-or-nonexistent' });
    expect(store.getState().activeWatchlistId).toBe('wl-deleted-or-nonexistent');

    // Hydrating again should validate that activeWatchlistId is in existing watchlists, falling back to firstId
    await store.getState().hydrate();
    expect(store.getState().activeWatchlistId).toBe('wl-core-leaders');

    // If activeWatchlistId is valid and exists, it should be preserved
    store.getState().selectWatchlist('wl-high-beta');
    expect(store.getState().activeWatchlistId).toBe('wl-high-beta');
    await store.getState().hydrate();
    expect(store.getState().activeWatchlistId).toBe('wl-high-beta');
  });

  it('updates in-memory state synchronously before repository.saveWatchlists completes', async () => {
    let resolveSave: (() => void) | null = null;
    let saveCallCount = 0;

    const delayedRepo: InMemoryStorageRepository = new InMemoryStorageRepository();
    const originalSave = delayedRepo.saveWatchlists.bind(delayedRepo);
    // Intercept saveWatchlists to delay completion
    delayedRepo.saveWatchlists = async (watchlists) => {
      saveCallCount++;
      await new Promise<void>((resolve) => {
        resolveSave = () => {
          void originalSave(watchlists).then(resolve);
        };
      });
    };

    const store = createWatchlistStore(delayedRepo, () => 1729728000);

    // Initial seed hydration: getWatchlists resolves, then set(...) occurs before saveWatchlists completes
    const initialPromise = store.getState().hydrate();
    await Promise.resolve();
    expect(store.getState().watchlists.length).toBe(2); // In-memory seeded before saveWatchlists completes
    expect(store.getState().activeWatchlistId).toBe('wl-core-leaders');
    expect(saveCallCount).toBe(1);
    resolveSave!();
    await initialPromise;

    // Test synchronous createWatchlist
    const createPromise = store.getState().createWatchlist('Momentum Tech', ['AAPL']);
    // Synchronous in-memory check BEFORE saveWatchlists finishes:
    expect(store.getState().watchlists.length).toBe(3);
    const createdItem = store.getState().watchlists.find((w) => w.name === 'Momentum Tech');
    expect(createdItem).toBeDefined();
    expect(store.getState().activeWatchlistId).toBe(createdItem!.id);
    resolveSave!();
    await createPromise;

    // Test synchronous addTicker
    const addPromise = store.getState().addTicker(createdItem!.id, 'NVDA');
    expect(
      store.getState().watchlists.find((w) => w.id === createdItem!.id)?.tickers
    ).toEqual(['AAPL', 'NVDA']);
    resolveSave!();
    await addPromise;

    // Test synchronous renameWatchlist
    const renamePromise = store.getState().renameWatchlist(createdItem!.id, 'Elite Momentum');
    expect(
      store.getState().watchlists.find((w) => w.id === createdItem!.id)?.name
    ).toBe('Elite Momentum');
    resolveSave!();
    await renamePromise;

    // Test synchronous removeTicker
    const removePromise = store.getState().removeTicker(createdItem!.id, 'AAPL');
    expect(
      store.getState().watchlists.find((w) => w.id === createdItem!.id)?.tickers
    ).toEqual(['NVDA']);
    resolveSave!();
    await removePromise;

    // Test synchronous deleteWatchlist
    const deletePromise = store.getState().deleteWatchlist(createdItem!.id);
    expect(store.getState().watchlists.length).toBe(2);
    expect(store.getState().watchlists.some((w) => w.id === createdItem!.id)).toBe(false);
    resolveSave!();
    await deletePromise;
  });
});
