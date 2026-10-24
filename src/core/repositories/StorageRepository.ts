import type { ChartAnnotation } from '../schemas/annotation';
import type { TradeEntry } from '../schemas/trade';
import type { Watchlist } from '../schemas/watchlist';

/**
 * Headless persistence port for watchlists, chart annotations, and future trade journal entries.
 * Domain stores interact exclusively with this interface—never directly with IndexedDB or localStorage.
 */
export interface StorageRepository {
  getWatchlists(): Promise<Watchlist[]>;
  saveWatchlists(watchlists: Watchlist[]): Promise<void>;
  getAnnotations(ticker?: string): Promise<ChartAnnotation[]>;
  saveAnnotations(annotations: ChartAnnotation[]): Promise<void>;
  getTrades(ticker?: string): Promise<TradeEntry[]>;
  saveTrades(trades: TradeEntry[]): Promise<void>;
}

