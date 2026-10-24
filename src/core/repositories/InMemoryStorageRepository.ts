import {
  ChartAnnotationSchema,
  type ChartAnnotation,
} from '../schemas/annotation';
import { TradeEntrySchema, type TradeEntry } from '../schemas/trade';
import { WatchlistSchema, type Watchlist } from '../schemas/watchlist';
import type { StorageRepository } from './StorageRepository';

/**
 * Deterministic in-memory StorageRepository implementation for unit testing
 * and non-browser/SSR environments.
 */
export class InMemoryStorageRepository implements StorageRepository {
  private watchlists: Watchlist[];
  private annotations: ChartAnnotation[];
  private trades: TradeEntry[];

  constructor(
    initialWatchlists: Watchlist[] = [],
    initialAnnotations: ChartAnnotation[] = [],
    initialTrades: TradeEntry[] = []
  ) {
    this.watchlists = initialWatchlists.map((w) => WatchlistSchema.parse(w));
    this.annotations = initialAnnotations.map((a) =>
      ChartAnnotationSchema.parse(a)
    );
    this.trades = initialTrades.map((t) => TradeEntrySchema.parse(t));
  }

  public async getWatchlists(): Promise<Watchlist[]> {
    return this.watchlists.map((w) => WatchlistSchema.parse(w));
  }

  public async saveWatchlists(watchlists: Watchlist[]): Promise<void> {
    this.watchlists = watchlists.map((w) => WatchlistSchema.parse(w));
  }

  public async getAnnotations(ticker?: string): Promise<ChartAnnotation[]> {
    const validated = this.annotations.map((a) =>
      ChartAnnotationSchema.parse(a)
    );
    if (!ticker) {
      return validated;
    }
    const normalized = ticker.trim().toUpperCase();
    return validated.filter((a) => a.ticker === normalized);
  }

  public async saveAnnotations(annotations: ChartAnnotation[]): Promise<void> {
    this.annotations = annotations.map((a) => ChartAnnotationSchema.parse(a));
  }

  public async getTrades(ticker?: string): Promise<TradeEntry[]> {
    const validated = this.trades.map((t) => TradeEntrySchema.parse(t));
    if (!ticker) {
      return validated;
    }
    const normalized = ticker.trim().toUpperCase();
    return validated.filter((t) => t.ticker === normalized);
  }

  public async saveTrades(trades: TradeEntry[]): Promise<void> {
    this.trades = trades.map((t) => TradeEntrySchema.parse(t));
  }
}

