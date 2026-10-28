import { PriceAlertSchema, type PriceAlert } from '../schemas/alert';
import {
  ChartAnnotationSchema,
  type ChartAnnotation,
} from '../schemas/annotation';
import {
  UserPreferencesSchema,
  type UserPreferences,
} from '../schemas/preferences';
import { TradeEntrySchema, type TradeEntry } from '../schemas/trade';
import { WatchlistSchema, type Watchlist } from '../schemas/watchlist';
import { InMemoryStorageRepository } from './InMemoryStorageRepository';
import type { StorageRepository } from './StorageRepository';

const DB_NAME = 'marketview_db';
const DB_VERSION = 1;
const STORE_NAME = 'kv_store';
const WATCHLISTS_KEY = 'watchlists';
const ANNOTATIONS_KEY = 'annotations';
const TRADES_KEY = 'trades';
const ALERTS_KEY = 'alerts';
const PREFERENCES_KEY = 'preferences';

/**
 * Browser IndexedDB adapter implementing StorageRepository with automatic
 * in-memory fallback when IndexedDB is unavailable (e.g., headless Node tests).
 * Notice: Uses `globalThis.indexedDB` rather than `window` or `document`
 * to maintain strict Headless Core compatibility.
 */
export class IndexedDBStorageRepository implements StorageRepository {
  private readonly fallback = new InMemoryStorageRepository();
  private dbPromise: Promise<IDBDatabase | null> | null = null;

  public async getWatchlists(): Promise<Watchlist[]> {
    const raw = await this.readKey<unknown[]>(WATCHLISTS_KEY);
    if (!raw || !Array.isArray(raw)) {
      return this.fallback.getWatchlists();
    }
    return raw.map((item) => WatchlistSchema.parse(item));
  }

  public async saveWatchlists(watchlists: Watchlist[]): Promise<void> {
    const validated = watchlists.map((w) => WatchlistSchema.parse(w));
    await this.fallback.saveWatchlists(validated);
    await this.writeKey(WATCHLISTS_KEY, validated);
  }

  public async getAnnotations(ticker?: string): Promise<ChartAnnotation[]> {
    const raw = await this.readKey<unknown[]>(ANNOTATIONS_KEY);
    const list =
      raw && Array.isArray(raw)
        ? raw.map((item) => ChartAnnotationSchema.parse(item))
        : await this.fallback.getAnnotations();

    if (!ticker) {
      return list;
    }
    const normalized = ticker.trim().toUpperCase();
    return list.filter((a) => a.ticker === normalized);
  }

  public async saveAnnotations(annotations: ChartAnnotation[]): Promise<void> {
    const validated = annotations.map((a) => ChartAnnotationSchema.parse(a));
    await this.fallback.saveAnnotations(validated);
    await this.writeKey(ANNOTATIONS_KEY, validated);
  }

  public async getTrades(ticker?: string): Promise<TradeEntry[]> {
    const raw = await this.readKey<unknown[]>(TRADES_KEY);
    const list =
      raw && Array.isArray(raw)
        ? raw.map((item) => TradeEntrySchema.parse(item))
        : await this.fallback.getTrades();

    if (!ticker) {
      return list;
    }
    const normalized = ticker.trim().toUpperCase();
    return list.filter((t) => t.ticker === normalized);
  }

  public async saveTrades(trades: TradeEntry[]): Promise<void> {
    const validated = trades.map((t) => TradeEntrySchema.parse(t));
    await this.fallback.saveTrades(validated);
    await this.writeKey(TRADES_KEY, validated);
  }

  public async getAlerts(ticker?: string): Promise<PriceAlert[]> {
    const raw = await this.readKey<unknown[]>(ALERTS_KEY);
    const list =
      raw && Array.isArray(raw)
        ? raw.map((item) => PriceAlertSchema.parse(item))
        : await this.fallback.getAlerts();

    if (!ticker) {
      return list;
    }
    const normalized = ticker.trim().toUpperCase();
    return list.filter((a) => a.ticker === normalized);
  }

  public async saveAlerts(alerts: PriceAlert[]): Promise<void> {
    const validated = alerts.map((a) => PriceAlertSchema.parse(a));
    await this.fallback.saveAlerts(validated);
    await this.writeKey(ALERTS_KEY, validated);
  }

  public async getPreferences(): Promise<UserPreferences | null> {
    const raw = await this.readKey<unknown>(PREFERENCES_KEY);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return this.fallback.getPreferences();
    }
    return UserPreferencesSchema.parse(raw);
  }

  public async savePreferences(preferences: UserPreferences): Promise<void> {
    const validated = UserPreferencesSchema.parse(preferences);
    await this.fallback.savePreferences(validated);
    await this.writeKey(PREFERENCES_KEY, validated);
  }

  private getDatabase(): Promise<IDBDatabase | null> {
    if (typeof globalThis.indexedDB === 'undefined') {
      return Promise.resolve(null);
    }
    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise<IDBDatabase | null>((resolve) => {
      try {
        const request = globalThis.indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });

    return this.dbPromise;
  }

  private async readKey<T>(key: string): Promise<T | null> {
    const db = await this.getDatabase();
    if (!db) {
      return null;
    }

    return new Promise<T | null>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);
        req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  private async writeKey<T>(key: string, value: T): Promise<void> {
    const db = await this.getDatabase();
    if (!db) {
      return;
    }

    return new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
}
