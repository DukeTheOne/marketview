import { z } from 'zod';
import { TickerSymbolSchema } from './market';

/**
 * User-customizable watchlist containing an ordered set of normalized ticker symbols.
 */
export const WatchlistSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, 'Watchlist name is required').max(60),
  tickers: z.array(TickerSymbolSchema),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
});

export type Watchlist = z.infer<typeof WatchlistSchema>;
