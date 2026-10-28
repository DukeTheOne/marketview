import { describe, expect, it } from 'vitest';
import { IndexedDBStorageRepository } from '../repositories/IndexedDBStorageRepository';
import { InMemoryStorageRepository } from '../repositories/InMemoryStorageRepository';
import {
  DEFAULT_USER_PREFERENCES,
  LivePollIntervalSchema,
  ProviderModeSchema,
  UserPreferencesSchema,
  type UserPreferences,
} from '../schemas/preferences';
import { createPreferencesStore } from '../stores/preferencesStore';

describe('UserPreferencesSchema & Repository/Store Persistence', () => {
  it('populates expected defaults when parsing an empty object', () => {
    const parsed = UserPreferencesSchema.parse({});
    expect(parsed).toEqual({
      activeTicker: 'AAPL',
      activeTimeframe: '1D',
      activeWatchlistId: 'wl-default',
      providerMode: 'yahoo',
      finnhubApiKey: '',
      pollIntervalSec: 15,
      activeIndicators: ['SMA_20', 'VOLUME'],
      isSidebarCollapsed: false,
    });
    expect(DEFAULT_USER_PREFERENCES).toEqual(parsed);
  });

  it('normalizes ticker symbol and validates allowed enum/literal values', () => {
    const parsed = UserPreferencesSchema.parse({
      activeTicker: '  msft ',
      activeTimeframe: '1W',
      activeWatchlistId: 'wl-tech',
      providerMode: 'finnhub',
      finnhubApiKey: 'test-key-123',
      pollIntervalSec: 5,
      activeIndicators: ['EMA_50', 'RSI_14'],
      isSidebarCollapsed: true,
    });

    expect(parsed.activeTicker).toBe('MSFT');
    expect(parsed.activeTimeframe).toBe('1W');
    expect(parsed.providerMode).toBe('finnhub');
    expect(parsed.pollIntervalSec).toBe(5);
    expect(parsed.activeIndicators).toEqual(['EMA_50', 'RSI_14']);
    expect(parsed.isSidebarCollapsed).toBe(true);
  });

  it('rejects invalid providerMode, pollIntervalSec, watchlist id, or indicator ids', () => {
    expect(() => ProviderModeSchema.parse('bloomberg')).toThrow();
    expect(() => LivePollIntervalSchema.parse(10)).toThrow();
    expect(() =>
      UserPreferencesSchema.parse({ activeWatchlistId: '' })
    ).toThrow();
    expect(() =>
      UserPreferencesSchema.parse({
        activeIndicators: ['INVALID_IND'],
      })
    ).toThrow();
  });

  it('round-trips preferences through InMemoryStorageRepository', async () => {
    const repo = new InMemoryStorageRepository();
    expect(await repo.getPreferences()).toBeNull();

    const customPrefs: UserPreferences = {
      ...DEFAULT_USER_PREFERENCES,
      activeTicker: 'NVDA',
      activeTimeframe: '1h',
      providerMode: 'demo',
      pollIntervalSec: 30,
      isSidebarCollapsed: true,
    };

    await repo.savePreferences(customPrefs);
    const loaded = await repo.getPreferences();
    expect(loaded).toEqual(customPrefs);

    const preseededRepo = new InMemoryStorageRepository(
      [],
      [],
      [],
      [],
      customPrefs
    );
    expect(await preseededRepo.getPreferences()).toEqual(customPrefs);
  });

  it('round-trips preferences through IndexedDBStorageRepository headless fallback', async () => {
    const repo = new IndexedDBStorageRepository();
    expect(await repo.getPreferences()).toBeNull();

    const customPrefs: UserPreferences = {
      ...DEFAULT_USER_PREFERENCES,
      activeTicker: 'TSLA',
      providerMode: 'finnhub',
      finnhubApiKey: 'secret-token',
      pollIntervalSec: 0,
    };

    await repo.savePreferences(customPrefs);
    const loaded = await repo.getPreferences();
    expect(loaded).toEqual(customPrefs);
  });

  it('hydrates from repository or falls back to initial preferences', async () => {
    const emptyRepo = new InMemoryStorageRepository();
    const storeWithFallback = createPreferencesStore(emptyRepo, {
      activeTicker: 'AMZN',
    });

    expect(storeWithFallback.getState().isHydrated).toBe(false);
    const hydratedFallback = await storeWithFallback.getState().hydrate();
    expect(storeWithFallback.getState().isHydrated).toBe(true);
    expect(hydratedFallback.activeTicker).toBe('AMZN');

    const seededPrefs: UserPreferences = {
      ...DEFAULT_USER_PREFERENCES,
      activeTicker: 'GOOGL',
      activeTimeframe: '15m',
      activeWatchlistId: 'wl-custom',
      providerMode: 'demo',
      pollIntervalSec: 5,
      activeIndicators: ['BB_20', 'VWAP'],
      isSidebarCollapsed: true,
    };
    const seededRepo = new InMemoryStorageRepository(
      [],
      [],
      [],
      [],
      seededPrefs
    );
    const store = createPreferencesStore(seededRepo);

    const hydrated = await store.getState().hydrate();
    expect(store.getState().isHydrated).toBe(true);
    expect(hydrated).toEqual(seededPrefs);
    expect(store.getState().preferences).toEqual(seededPrefs);
  });

  it('updates preferences, persists to repository, and resets to defaults', async () => {
    const repo = new InMemoryStorageRepository();
    const store = createPreferencesStore(repo);

    const updated = await store.getState().updatePreferences({
      activeTicker: 'meta',
      activeTimeframe: '1W',
      pollIntervalSec: 30,
      isSidebarCollapsed: true,
    });

    expect(updated.activeTicker).toBe('META');
    expect(updated.activeTimeframe).toBe('1W');
    expect(updated.pollIntervalSec).toBe(30);
    expect(updated.isSidebarCollapsed).toBe(true);
    expect(await repo.getPreferences()).toEqual(updated);

    await expect(
      store.getState().updatePreferences({
        activeWatchlistId: '',
      })
    ).rejects.toThrow();
    expect(store.getState().preferences.activeTicker).toBe('META');

    const reset = await store.getState().resetPreferences();
    expect(reset).toEqual(DEFAULT_USER_PREFERENCES);
    expect(store.getState().preferences).toEqual(DEFAULT_USER_PREFERENCES);
    expect(await repo.getPreferences()).toEqual(DEFAULT_USER_PREFERENCES);
  });
});
