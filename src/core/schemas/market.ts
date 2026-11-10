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
 * Default time scope focused when first launching the MarketView web application.
 */
export const DEFAULT_INITIAL_TIMEFRAME: Timeframe = '3M';

/**
 * Logical bar index window representing the user's actual viewing scope on the chart.
 */
export interface LogicalRangeWindow {
  from: number;
  to: number;
}

/**
 * Pure helper that carries over the user's current actual viewing logical range
 * ({ from, to }) when switching from a stock with `prevBarCount` bars to a stock
 * with `nextBarCount` bars, preserving both the exact zoom span (`to - from`)
 * and the right-edge offset relative to the latest bar.
 */
export function computeCarryOverLogicalRange(
  prevRange: LogicalRangeWindow,
  prevBarCount: number,
  nextBarCount: number
): LogicalRangeWindow | null {
  if (
    nextBarCount <= 0 ||
    !Number.isFinite(prevRange.from) ||
    !Number.isFinite(prevRange.to) ||
    prevRange.to < prevRange.from
  ) {
    return null;
  }

  const visibleSpan = Math.max(1, prevRange.to - prevRange.from);
  const nextLastIndex = nextBarCount - 1;

  if (prevBarCount > 0) {
    const prevLastIndex = prevBarCount - 1;
    const rightOffsetFromLast = prevRange.to - prevLastIndex;
    const rawTargetTo = nextLastIndex + rightOffsetFromLast;
    // Ensure the carried-over window still overlaps at least the earliest bars of the new series
    const minVisibleRightIndex = Math.min(4, nextLastIndex);
    const clampedTo = Math.max(minVisibleRightIndex, rawTargetTo);
    return {
      from: clampedTo - visibleSpan,
      to: clampedTo,
    };
  }

  return {
    from: Math.max(0, nextLastIndex - visibleSpan),
    to: nextLastIndex,
  };
}

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

/**
 * Workspace view mode:
 * - 'historical': Full-width multi-day candlestick/price chart (1W, 1M, 3M, 6M, 1Y)
 * - 'daily_1d': 50/50 split view with Latest Trading Day chart on the left and Daily Report space on the right
 */
export const WorkspaceViewModeSchema = z.enum(['historical', 'daily_1d']);
export type WorkspaceViewMode = z.infer<typeof WorkspaceViewModeSchema>;

/**
 * Normalized snapshot of the latest trading day's price session ("last night's price")
 * for the dedicated 1D Split View.
 *
 * TODO(opening-hours-live-update): Support real-time streaming updates during active market
 * opening hours. Currently represents a static snapshot of the latest trading day.
 */
export const LatestTradingDaySessionSchema = z.object({
  ticker: TickerSymbolSchema,
  /** Unix timestamp (seconds UTC) of the latest daily bar */
  sessionDateTimestamp: z.number().int().positive(),
  /** Opening price of the latest trading day */
  open: z.number().finite().nonnegative(),
  /** Closing (or latest) price of the latest trading day */
  close: z.number().finite().nonnegative(),
  /** Intraday high of the latest trading day */
  high: z.number().finite().nonnegative(),
  /** Intraday low of the latest trading day */
  low: z.number().finite().nonnegative(),
  /** Previous trading day's close price used as the daily change reference baseline */
  previousClose: z.number().finite().nonnegative(),
  /** Net dollar change vs previousClose (close - previousClose) */
  change: z.number().finite(),
  /** Percentage change vs previousClose (((close - previousClose) / previousClose) * 100) */
  changePercent: z.number().finite(),
  /** Net dollar change from session open to close (close - open) */
  openToCloseChange: z.number().finite(),
  /** Percentage change from session open to close (((close - open) / open) * 100) */
  openToCloseChangePercent: z.number().finite(),
  /** Total share volume traded on the latest trading day */
  volume: z.number().finite().nonnegative(),
  /** Chronological intraday OHLCV bars covering ONLY the latest trading day */
  bars: z.array(OHLCVCandleSchema).min(1),
});
export type LatestTradingDaySession = z.infer<typeof LatestTradingDaySessionSchema>;

/**
 * Pure helper that extracts a normalized `LatestTradingDaySession` covering ONLY
 * the latest trading day ("last night's price") from historical daily candles,
 * optional intraday candles, and an optional quote.
 *
 * - Filters `intradayCandles` to the UTC day bucket of the latest trading session.
 * - If fewer than 2 intraday bars exist for that day, deterministically synthesizes
 *   a 16-bar single-session curve anchored to the latest daily candle's OHLC
 *   so the 1D chart renders a complete, realistic single-day curve.
 * - TODO(opening-hours-live-update): Do not dynamically stream/append partial opening-hour
 *   ticks yet; treat the session as a static latest-trading-day snapshot.
 */
export function extractLatestTradingDaySession(
  rawTicker: string,
  dailyCandles: ReadonlyArray<OHLCVCandle>,
  intradayCandles: ReadonlyArray<OHLCVCandle> = [],
  quote?: TickerQuote
): LatestTradingDaySession | null {
  if (!dailyCandles || dailyCandles.length === 0) {
    return null;
  }

  const ticker = TickerSymbolSchema.parse(rawTicker);
  const sortedDaily = [...dailyCandles]
    .filter((c) => Number.isFinite(c.timestamp) && Number.isFinite(c.close))
    .sort((a, b) => a.timestamp - b.timestamp);

  if (sortedDaily.length === 0) {
    return null;
  }

  const latestDaily = sortedDaily[sortedDaily.length - 1]!;
  const priorDaily =
    sortedDaily.length >= 2 ? sortedDaily[sortedDaily.length - 2]! : null;

  const previousClose =
    quote && quote.previousClose > 0
      ? quote.previousClose
      : priorDaily && priorDaily.close > 0
        ? priorDaily.close
        : latestDaily.open;

  const dayBucket = Math.floor(latestDaily.timestamp / 86400);

  // Filter intraday candles matching the latest trading day's UTC day bucket
  const matchingIntraday = intradayCandles
    .filter(
      (c) =>
        Number.isFinite(c.timestamp) &&
        Number.isFinite(c.close) &&
        Math.floor(c.timestamp / 86400) === dayBucket
    )
    .sort((a, b) => a.timestamp - b.timestamp);

  let sessionOpen = latestDaily.open;
  let sessionClose = quote?.price ?? latestDaily.close;
  let sessionHigh = Math.max(latestDaily.high, sessionClose);
  let sessionLow = Math.min(latestDaily.low, sessionClose);
  let sessionVolume = latestDaily.volume;
  const bars: OHLCVCandle[] = [];

  if (matchingIntraday.length >= 2) {
    for (const b of matchingIntraday) {
      bars.push(b);
    }
    sessionOpen = matchingIntraday[0]!.open;
    sessionClose = matchingIntraday[matchingIntraday.length - 1]!.close;
    sessionHigh = Math.max(...matchingIntraday.map((b) => b.high));
    sessionLow = Math.min(...matchingIntraday.map((b) => b.low));
    const intraVolume = matchingIntraday.reduce(
      (acc, b) => acc + (b.volume || 0),
      0
    );
    if (intraVolume > 0) {
      sessionVolume = intraVolume;
    }
  } else {
    // Synthesize 16 intraday bars (15-min intervals) for the session
    const barCount = 16;
    const stepSec = 900;
    const sessionStartTs = latestDaily.timestamp - (barCount - 1) * stepSec;
    const isBullish = sessionClose >= sessionOpen;
    const lowIdx = isBullish ? 4 : 11;
    const highIdx = isBullish ? 11 : 4;

    const synthesizedPrices: number[] = new Array(barCount).fill(0);
    synthesizedPrices[0] = sessionOpen;
    synthesizedPrices[barCount - 1] = sessionClose;
    synthesizedPrices[lowIdx] = sessionLow;
    synthesizedPrices[highIdx] = sessionHigh;

    const keyIndices = [
      0,
      Math.min(lowIdx, highIdx),
      Math.max(lowIdx, highIdx),
      barCount - 1,
    ];

    for (let seg = 0; seg < 3; seg++) {
      const startIdx = keyIndices[seg]!;
      const endIdx = keyIndices[seg + 1]!;
      const span = endIdx - startIdx;
      for (let i = startIdx + 1; i < endIdx; i++) {
        const ratio = (i - startIdx) / span;
        const interp =
          synthesizedPrices[startIdx]! +
          ratio * (synthesizedPrices[endIdx]! - synthesizedPrices[startIdx]!);
        synthesizedPrices[i] = Math.round(interp * 100) / 100;
      }
    }

    const perBarVolume = Math.round(sessionVolume / barCount);
    for (let i = 0; i < barCount; i++) {
      const price = synthesizedPrices[i]!;
      const prevPrice = i > 0 ? synthesizedPrices[i - 1]! : sessionOpen;
      const open = i === 0 ? sessionOpen : prevPrice;
      const close = price;
      const high = Math.max(open, close, i === highIdx ? sessionHigh : open);
      const low = Math.min(open, close, i === lowIdx ? sessionLow : open);

      bars.push(
        OHLCVCandleSchema.parse({
          timestamp: sessionStartTs + i * stepSec,
          open,
          high,
          low,
          close,
          volume: perBarVolume,
        })
      );
    }
  }

  const change = Math.round((sessionClose - previousClose) * 100) / 100;
  const changePercent =
    previousClose > 0
      ? Math.round(((change / previousClose) * 100) * 100) / 100
      : 0;

  const openToCloseChange = Math.round((sessionClose - sessionOpen) * 100) / 100;
  const openToCloseChangePercent =
    sessionOpen > 0
      ? Math.round(((openToCloseChange / sessionOpen) * 100) * 100) / 100
      : 0;

  return LatestTradingDaySessionSchema.parse({
    ticker,
    sessionDateTimestamp: latestDaily.timestamp,
    open: Math.round(sessionOpen * 100) / 100,
    close: Math.round(sessionClose * 100) / 100,
    high: Math.round(sessionHigh * 100) / 100,
    low: Math.round(sessionLow * 100) / 100,
    previousClose: Math.round(previousClose * 100) / 100,
    change,
    changePercent,
    openToCloseChange,
    openToCloseChangePercent,
    volume: sessionVolume,
    bars,
  });
}
