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
});
