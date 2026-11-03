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
 * Includes Apple Stocks-style horizons ('1D', '1W', '1M', '3M', '6M', '1Y')
 * alongside intraday intervals ('15m', '1h') for backward compatibility.
 */
export const TimeframeSchema = z.enum([
  '15m',
  '1h',
  '1D',
  '1W',
  '1M',
  '3M',
  '6M',
  '1Y',
]);
export type Timeframe = z.infer<typeof TimeframeSchema>;

/**
 * Default Apple Stocks-style timeframe progression for the minimalist UI.
 */
export const PRIMARY_TIMEFRAMES: readonly Timeframe[] = [
  '1D',
  '1W',
  '1M',
  '3M',
  '6M',
  '1Y',
] as const;

/**
 * Maps each Timeframe to the number of calendar days to focus/zoom into
 * at the right edge of the full historical candle series.
 */
export const TIMEFRAME_FOCUS_DAYS: Record<Timeframe, number> = {
  '15m': 2,
  '1h': 7,
  '1D': 5,
  '1W': 10,
  '1M': 30,
  '3M': 90,
  '6M': 180,
  '1Y': 365,
};

/**
 * Computes the logical { from, to } Unix timestamp window (in seconds UTC)
 * to focus the chart viewport onto the recent timeframe horizon while keeping
 * the full historical candle array loaded on the chart for panning and zooming.
 */
export function computeTimeframeFocusWindow(
  sortedCandles: ReadonlyArray<{ timestamp: number }>,
  timeframe: Timeframe
): { from: number; to: number } | null {
  if (sortedCandles.length === 0) {
    return null;
  }
  const latest = sortedCandles[sortedCandles.length - 1];
  const earliest = sortedCandles[0];
  if (!latest || !earliest) {
    return null;
  }

  const focusDays = TIMEFRAME_FOCUS_DAYS[timeframe];
  const rawFrom = latest.timestamp - focusDays * 24 * 60 * 60;

  // Ensure at least up to 5 bars are inside the initial focus window so candles remain readable
  const minLookbackIndex = Math.max(0, sortedCandles.length - 5);
  const maxAllowedFrom =
    sortedCandles[minLookbackIndex]?.timestamp ?? earliest.timestamp;
  const clampedFrom = Math.max(
    earliest.timestamp,
    Math.min(rawFrom, maxAllowedFrom)
  );

  return {
    from: clampedFrom,
    to: latest.timestamp,
  };
}

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
