# Vertical Slice Specification: Milestone 8 — 15-Minute Intraday Price Line Overlay

## 1. Slice Scope & Architectural Invariants Check

### Problem Statement & Goal
Currently, the chart in MarketView only renders daily (`1d`) OHLCV candlestick bars ("mean/summary bars", 1 bar per trading day) alongside daily moving-average lines (`SMA 20`). When zooming into short-to-medium horizons such as `1D` (~5 daily bars), `1W` (~7–10 daily bars), or `1M` (~21 daily bars), the user sees only one summary bar per day and cannot see the granular **15-minute intraday price trajectory** within each trading session.

This slice adds a high-resolution **15-minute actual price line (`PRICE_15M`)** layered directly over the daily candlestick bars:
- Preserves the full 2-year historical daily candlestick series (`CandlestickSeries`) and daily technical indicators (`SMA 20`, `EMA 50`, `BB 20`, `VWAP`, `RSI 14`, `VOLUME`) without distorting `lightweight-charts` candlestick bar widths or logical time-scale indices.
- Fetches and caches 15-minute intraday candles (`'15m'`) alongside the primary daily series in `marketStore`.
- Projects each day's 15-minute intraday price points (`IntradayPricePoint`) across that trading day's horizontal bar column (`[-0.42 * barSpacing, +0.42 * barSpacing]`) and the shared right-hand price Y-axis (`priceToCoordinate`), with a seamless fallback to daily OHLC path points for historical dates prior to the 15-minute window.
- Exposes a **`15m Price` (`PRICE_15M`)** toggle pill in `IndicatorToolbar` (enabled by default in `DEFAULT_ACTIVE_INDICATORS`).

### Architectural Invariants Verification
- [x] **Zero UI imports in `src/core/`**: All schema updates (`IndicatorIdSchema`), 15-minute provider adapters (`YahooFinanceProvider`, `DeterministicDemoProvider`, `FinnhubProvider`), sub-bar coordinate math (`buildIntradayPricePoints`), and Zustand state (`marketStore`) reside strictly in `src/core/` with zero React, DOM, or `lightweight-charts` imports.
- [x] **All external API responses parsed through `src/core/schemas/`**: All 15-minute intraday bars returned by `YahooFinanceProvider`, `FinnhubProvider`, and `DeterministicDemoProvider` are validated through `OHLCVCandleSchema` and cached via `CachedMarketDataProvider`.
- [x] **All chart annotations use logical `(timestamp, price)` coordinates**: The daily `CandlestickSeries` remains the master logical time scale (`timeToCoordinate` / `coordinateToTime`), ensuring existing `StickerPlugin`, `TrendlinePlugin`, and `TradeMarkerPlugin` anchors never drift or break.
- [x] **All persistence flows through `StorageRepository`**: No browser `localStorage` or direct `fetch()` calls are introduced in UI components.

---

## 2. Headless Core Contracts (`src/core/`)

### 2.1 Indicator Schema & Sub-Bar Intraday Price Line Builder (`src/core/indicators/technicalIndicators.ts`)

1. **Extend `IndicatorIdSchema`** to include `'PRICE_15M'`:
   ```ts
   export const IndicatorIdSchema = z.enum([
     'PRICE_15M',
     'SMA_20',
     'EMA_50',
     'BB_20',
     'VWAP',
     'RSI_14',
     'VOLUME',
   ]);
   export type IndicatorId = z.infer<typeof IndicatorIdSchema>;
   ```

2. **Extend `ChartIndicatorsSummary`** with `latestPrice: number | null`:
   ```ts
   export interface ChartIndicatorsSummary {
     sma20: number | null;
     ema50: number | null;
     vwap: number | null;
     rsi14: number | null;
     bb20: { upper: number; middle: number; lower: number } | null;
     latestVolume?: number | null;
     latestPrice?: number | null;
   }
   ```
   Populate `latestPrice: latestCandle && Number.isFinite(latestCandle.close) ? round2(latestCandle.close) : null` inside `computeChartIndicatorsSummary()`.

3. **Add `IntradayPricePoint` & `buildIntradayPricePoints()`** in `src/core/indicators/technicalIndicators.ts`:
   ```ts
   export const IntradayPricePointSchema = z.object({
     /** Unix timestamp (seconds UTC) of the parent daily candle on the chart timeScale */
     dailyTimestamp: z.number().int().positive(),
     /** Unix timestamp (seconds UTC) of the 15-minute bar (or synthesized daily sub-step) */
     timestamp: z.number().int().positive(),
     /** Normalized horizontal offset within the parent daily bar column in [-0.42, 0.42] */
     intraDayOffset: z.number().finite().min(-0.5).max(0.5),
     /** Actual price value at this 15-minute step */
     price: z.number().finite().nonnegative(),
   });
   export type IntradayPricePoint = z.infer<typeof IntradayPricePointSchema>;
   ```
   - **Algorithm for `buildIntradayPricePoints(dailyCandles: OHLCVCandle[], intradayCandles: OHLCVCandle[] = []): IntradayPricePoint[]`**:
     - Sort `dailyCandles` ascending by `timestamp` and filter out invalid entries. If empty, return `[]`.
     - Sort `intradayCandles` ascending by `timestamp` and group them into a `Map<number, OHLCVCandle[]>` keyed by UTC calendar day bucket `Math.floor(candle.timestamp / 86400)`.
     - For each daily candle `d` (with `dayBucket = Math.floor(d.timestamp / 86400)`):
       - **Case A (`dayIntraday` has `K >= 2` fifteen-minute bars)**:
         For `k = 0` to `K - 1`:
         - `intraDayOffset = ((k / (K - 1)) - 0.5) * 0.84` (maps `k = 0` to `-0.42` at the left edge of the daily bar, and `k = K - 1` to `+0.42` at the right edge of the daily bar).
         - Push `{ dailyTimestamp: d.timestamp, timestamp: dayIntraday[k].timestamp, intraDayOffset, price: round2(dayIntraday[k].close) }`.
       - **Case B (`dayIntraday` has `K === 1` bar)**:
         - Push `{ dailyTimestamp: d.timestamp, timestamp: dayIntraday[0].timestamp, intraDayOffset: 0, price: round2(dayIntraday[0].close) }`.
       - **Case C (No 15-minute bars for `dayBucket` — e.g. historical days older than the 15m window or before 15m data finishes loading)**:
         - Synthesize 4 ordered intra-day OHLC anchor points across `[-0.42, -0.14, +0.14, +0.42]` from the daily candle `d`:
           - If `d.close >= d.open` (bullish/flat day): prices `[d.open, d.low, d.high, d.close]`.
           - If `d.close < d.open` (bearish day): prices `[d.open, d.high, d.low, d.close]`.
         - Emit the 4 points anchored to `dailyTimestamp: d.timestamp`. This guarantees the price line is continuous across the entire 2-year chart history and never appears blank while 15m bars load.

### 2.2 Market Data Providers (`src/core/providers/`)

1. **`YahooFinanceProvider.ts`**:
   - Update `YAHOO_TIMEFRAME_MAP['15m']` from `{ interval: '15m', range: '5d' }` to `{ interval: '15m', range: '1mo' }` so a single `'15m'` request fetches a full month (~21–22 trading days × 26 bars ≈ 550 bars) of 15-minute intraday data covering `1D`, `1W`, and `1M` scopes.
   - Update `YAHOO_TIMEFRAME_MAP['1h']` from `{ interval: '1h', range: '1mo' }` to `{ interval: '1h', range: '3mo' }`.

2. **`DeterministicDemoProvider.ts`**:
   - Enhance `getCandles(ticker, timeframe, limit)` when `timeframe === '15m'`:
     - Ensure the 15-minute bars align coherently with the ticker's `'1D'` daily candles so the 15-minute overlay line matches the daily candlestick prices on the chart:
     - Generate or retrieve the recent daily candles for `ticker` (e.g., `Math.max(35, Math.ceil(limit / 16))` daily bars ending at `DEMO_END_TIMESTAMP`).
     - Sub-step each daily candle `d` into `16` deterministic 15-minute bars (`timestamp = d.timestamp - (15 - k) * 900` for `k = 0..15`, keeping all 16 timestamps within the same UTC calendar day bucket `Math.floor(d.timestamp / 86400)`):
       - `k = 0` starts at `d.open`.
       - Intermediate steps interpolate smoothly through `d.low` and `d.high` using the deterministic `mulberry32` PRNG clamped to `[d.low, d.high]`.
       - `k = 15` ends at `d.close`.
     - Slice to the last `limit` bars and validate each with `OHLCVCandleSchema.parse()`.

### 2.3 Headless Market Store (`src/core/stores/marketStore.ts`)

1. **Extend `MarketStoreState`**:
   ```ts
   export interface MarketStoreState {
     activeTicker: string;
     activeTimeframe: Timeframe;
     quotesByTicker: Record<string, TickerQuote>;
     candlesByKey: Record<string, OHLCVCandle[]>; // key: `${ticker}:${timeframe}`
     intradayCandlesByTicker: Record<string, OHLCVCandle[]>; // 15m intraday series per ticker
     isLoadingQuote: boolean;
     isLoadingCandles: boolean;
     error: string | null;
     ...
   }
   ```
2. **Update `refreshActiveCandles()` in `marketStore.ts`**:
   - Fetch the primary series `provider.getCandles(activeTicker, activeTimeframe, 500)` as before.
   - Concurrently (via `Promise.allSettled` or non-blocking try/catch so a `'15m'` failure never breaks primary candle loading), fetch `provider.getCandles(activeTicker, '15m', 600)` and store the result in `intradayCandlesByTicker[activeTicker]` and `candlesByKey[getCandleCacheKey(activeTicker, '15m')]`.

---

## 3. UI & Chart Plugin Layer (`src/features/` & `src/ui/`)

### 3.1 `IndicatorToolbar.tsx` (`src/features/chart/IndicatorToolbar.tsx`)
- Add a **`15m PRICE`** (`id: 'PRICE_15M'`) toggle entry at the front of `OVERLAY_TOGGLES` (right after `VOLUME`):
  ```ts
  {
    id: 'PRICE_15M',
    label: '15m PRICE',
    dotClass: 'bg-cyan-400',
    activeClass: 'border-cyan-500/50 bg-cyan-500/15 text-cyan-200',
    formatValue: (s) =>
      s.latestPrice !== undefined && s.latestPrice !== null
        ? s.latestPrice.toFixed(2)
        : null,
  },
  ```

### 3.2 `ChartContainer.tsx` (`src/features/chart/ChartContainer.tsx`)
1. **Props & Defaults**:
   - Add optional prop `intradayCandles?: OHLCVCandle[]` to `ChartContainerProps` (default `[]`).
   - Update `DEFAULT_ACTIVE_INDICATORS`:
     ```ts
     const DEFAULT_ACTIVE_INDICATORS: IndicatorId[] = ['VOLUME', 'PRICE_15M', 'SMA_20'];
     ```
2. **Sub-Bar 15-Minute SVG Polyline Overlay**:
   - Memoize `intradayPricePoints = useMemo(() => buildIntradayPricePoints(candles, intradayCandles), [candles, intradayCandles])`.
   - When `activeIndicators.includes('PRICE_15M')` and `intradayPricePoints.length > 1`, project the points into screen space using `chartApiRef.current.timeScale().timeToCoordinate()` and `candleSeriesRef.current.priceToCoordinate()`:
     - Precompute screen X-coordinates for the sorted `candles` array: `dailyXByTimestamp = new Map<number, number>()` and the local bar spacing `barSpacingByTimestamp = new Map<number, number>()` (distance to next daily bar X, or previous daily bar X for the last bar, clamped to `[2, 400]`, fallback `12`).
     - For each `pt` in `intradayPricePoints`:
       - Look up `baseX = dailyXByTimestamp.get(pt.dailyTimestamp)` and `spacing = barSpacingByTimestamp.get(pt.dailyTimestamp)`.
       - Compute `x = baseX + pt.intraDayOffset * spacing`.
       - Compute `y = candleSeries.priceToCoordinate(pt.price)`.
       - Filter to points within or near the visible viewport (`x >= -60 && x <= dimensions.width + 60`).
   - Render an SVG layer (`data-testid="intraday-price-line-layer"`, `className="pointer-events-none absolute inset-0 z-5 overflow-hidden"`) containing a crisp `<polyline>` (`data-testid="intraday-price-polyline"`, `fill="none"`, `stroke="#22d3ee"`, `strokeWidth="1.75"`, `strokeLinecap="round"`, `strokeLinejoin="round"`).

### 3.3 `App.tsx` (`src/App.tsx`)
- Subscribe to `intradayCandlesByTicker` from `marketStore`:
  ```ts
  const intradayCandlesByTicker = useStore(
    marketStore,
    (s) => s.intradayCandlesByTicker
  );
  const activeIntradayCandles = intradayCandlesByTicker[activeTicker] ?? [];
  ```
- Pass `intradayCandles={activeIntradayCandles}` into `<ChartContainer />`.

---

## 4. Ordered File Manifest

- [ ] `[MODIFY]` `src/core/indicators/technicalIndicators.ts` — Add `'PRICE_15M'` to `IndicatorIdSchema`, `latestPrice` to `ChartIndicatorsSummary`, and `IntradayPricePointSchema` + `buildIntradayPricePoints(dailyCandles, intradayCandles)`.
- [ ] `[MODIFY]` `src/core/providers/YahooFinanceProvider.ts` — Expand `'15m'` range in `YAHOO_TIMEFRAME_MAP` to `'1mo'` (and `'1h'` to `'3mo'`) for full 1-month 15-minute coverage.
- [ ] `[MODIFY]` `src/core/providers/DeterministicDemoProvider.ts` — Generate `'15m'` intraday bars by sub-stepping each daily candle of the ticker's `'1D'` series into 16 deterministic 15-minute bars within the same UTC day so intraday prices align with daily candles.
- [ ] `[MODIFY]` `src/core/stores/marketStore.ts` — Add `intradayCandlesByTicker` to state and fetch `'15m'` intraday candles alongside the primary candle series in `refreshActiveCandles()`.
- [ ] `[MODIFY]` `src/features/chart/IndicatorToolbar.tsx` — Add the `15m PRICE` (`PRICE_15M`) pill toggle to `OVERLAY_TOGGLES`.
- [ ] `[MODIFY]` `src/features/chart/ChartContainer.tsx` — Enable `'PRICE_15M'` by default in `DEFAULT_ACTIVE_INDICATORS`, accept `intradayCandles?: OHLCVCandle[]`, and render the projected sub-bar SVG 15-minute price line (`data-testid="intraday-price-line-layer"`).
- [ ] `[MODIFY]` `src/App.tsx` — Wire `activeIntradayCandles` from `marketStore` into `<ChartContainer intradayCandles={activeIntradayCandles} />`.
- [ ] `[NEW]` `src/core/indicators/__tests__/intradayPriceLine.test.ts` — Unit tests for `buildIntradayPricePoints()`, `DeterministicDemoProvider` `'15m'` sub-bar coherence with `'1D'`, and `marketStore` `intradayCandlesByTicker` population.
- [ ] `[MODIFY]` `src/features/chart/__tests__/ChartContainer.test.tsx` — Component tests verifying the `15m PRICE` (`indicator-toggle-PRICE_15M`) button and `intraday-price-line-layer` rendering/toggling.

---

## 5. Verification & Test Matrix

1. **Static Typecheck**:
   - Run `npm run typecheck` (`tsc --noEmit`) — must exit with code `0`.
2. **Unit & Component Tests**:
   - Run `npm run test` (`vitest run`) — all existing and new test suites must pass.
   - Verify in `src/core/indicators/__tests__/intradayPriceLine.test.ts`:
     - `buildIntradayPricePoints()` maps `K >= 2` fifteen-minute candles for a UTC day across `[-0.42, +0.42]` offsets anchored to that day's `dailyTimestamp`.
     - `buildIntradayPricePoints()` falls back to a 4-point intra-day OHLC path (`open -> low/high -> high/low -> close`) for historical days outside the 15-minute window.
     - `DeterministicDemoProvider.getCandles('AAPL', '15m', 160)` produces 15-minute bars whose daily open, high, low, and close match the corresponding `'1D'` candles for `'AAPL'`.
     - `marketStore.getState().refreshActiveCandles()` populates both `candlesByKey['AAPL:1D']` and `intradayCandlesByTicker['AAPL']`.
   - Verify in `src/features/chart/__tests__/ChartContainer.test.tsx`:
     - `PRICE_15M` is active by default and renders `data-testid="intraday-price-line-layer"` and `data-testid="intraday-price-polyline"`.
     - Clicking `data-testid="indicator-toggle-PRICE_15M"` toggles the 15-minute price line off and back on.
