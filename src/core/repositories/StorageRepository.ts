import type { PriceAlert } from '../schemas/alert';
import type { ChartAnnotation } from '../schemas/annotation';
import type { UserPreferences } from '../schemas/preferences';
import type { TradeEntry } from '../schemas/trade';
import type { Watchlist } from '../schemas/watchlist';

/**
 * Headless persistence port for watchlists, chart annotations, trade journal entries, price alerts, and user preferences.
 * Domain stores interact exclusively with this interface—never directly with IndexedDB or localStorage.
 */
export interface StorageRepository {
  getWatchlists(): Promise<Watchlist[]>;
  saveWatchlists(watchlists: Watchlist[]): Promise<void>;
  getAnnotations(ticker?: string): Promise<ChartAnnotation[]>;
  saveAnnotations(annotations: ChartAnnotation[]): Promise<void>;
  getTrades(ticker?: string): Promise<TradeEntry[]>;
  saveTrades(trades: TradeEntry[]): Promise<void>;
  getAlerts(ticker?: string): Promise<PriceAlert[]>;
  saveAlerts(alerts: PriceAlert[]): Promise<void>;
  getPreferences?(): Promise<UserPreferences | null>;
  savePreferences?(preferences: UserPreferences): Promise<void>;
}

