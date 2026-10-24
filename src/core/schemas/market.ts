import { z } from 'zod';

/**
 * Normalized uppercase stock ticker symbol (e.g., "AAPL", "NVDA", "BRK.B").
 */
export const TickerSymbolSchema = z
  .string()
  .trim()
  .min(1, 'Ticker symbol cannot be empty')
  .max(12, 'Ticker symbol cannot exceed 12 characters')
  .transform((val) => val.toUpperCase());

export type TickerSymbol = z.infer<typeof TickerSymbolSchema>;

/**
 * Supported chart & candle aggregation timeframes.
 */
export const TimeframeSchema = z.enum(['15m', '1h', '1D', '1W']);
export type Timeframe = z.infer<typeof TimeframeSchema>;

/**
 * Normalized real-time or delayed quote snapshot for a single ticker.
 */
export const TickerQuoteSchema = z.object({
  ticker: TickerSymbolSchema,
  price: z.number().finite().nonnegative(),
  change: z.number().finite(),
  changePercent: z.number().finite(),
  high: z.number().finite().nonnegative(),
  low: z.number().finite().nonnegative(),
  open: z.number().finite().nonnegative(),
  previousClose: z.number().finite().nonnegative(),
  timestamp: z.number().int().positive(), // Unix seconds UTC
});
export type TickerQuote = z.infer<typeof TickerQuoteSchema>;

/**
 * Normalized OHLCV historical bar anchored to Unix seconds UTC.
 */
export const OHLCVCandleSchema = z.object({
  timestamp: z.number().int().positive(), // Unix seconds UTC
  open: z.number().finite().nonnegative(),
  high: z.number().finite().nonnegative(),
  low: z.number().finite().nonnegative(),
  close: z.number().finite().nonnegative(),
  volume: z.number().finite().nonnegative(),
});
export type OHLCVCandle = z.infer<typeof OHLCVCandleSchema>;

/**
 * Normalized symbol lookup item returned by MarketDataProvider.searchTickers().
 */
export const TickerSearchResultSchema = z.object({
  ticker: TickerSymbolSchema,
  name: z.string().min(1),
  exchange: z.string().default('US'),
});
export type TickerSearchResult = z.infer<typeof TickerSearchResultSchema>;
