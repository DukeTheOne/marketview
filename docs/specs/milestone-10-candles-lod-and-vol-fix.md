# Vertical Slice Specification: Milestone 10 — Auto-Adaptive Candlestick LOD (< 1M), Manual `CANDLES` Toggle & Volume Toggle Stability Fix

## 1. Slice Scope & Architectural Invariants Check

### Problem Statement & Goal
1. **Auto-Adaptive LOD for Daily Candlesticks ("Mean Bars" / `CANDLES`)**:
   - On very short horizons (`< 1 month`, such as `1D` and `1W`, or when zoomed in to `< 1 month`), wide daily OHLC candlestick bars ("mean bars") are visually distracting and redundant alongside the high-resolution 15-minute price line (`15m PRICE`).
   - This slice adds `'CANDLES'` (**Daily OHLC Candlesticks**) to `IndicatorIdSchema` and `IndicatorToolbar` (labeled **`CANDLES`**) with **Smart Auto-Sync LOD**:
     - **`< 1 month` (`1D`, `1W`, or zoomed in `< 25` calendar days / `<= 18` daily bars)**: `CANDLES` is **automatically hidden (`OFF`)** while `15m PRICE` is **shown (`ON`)**.
     - **`1 month to < 3 months` (`1M`, or zoomed between `25` and `< 75` calendar days)**: Both `CANDLES` (`ON`) and `15m PRICE` (`ON`) are shown.
     - **`>= 3 months` (`3M`, `6M`, `1Y`, or zoomed out `>= 75` calendar days)**: `CANDLES` is **automatically shown (`ON`)** while `15m PRICE` is **hidden (`OFF`)**.
   - Users can manually toggle `CANDLES` ON or OFF at any time via the **`CANDLES`** pill in `IndicatorToolbar`, and their manual choice persists until they switch timeframes or zoom across the 1-month LOD threshold.

2. **Root-Cause Fix for Chart Disappearing When Toggling `VOL` Repeatedly**:
   - **Root Cause**: In `ChartContainer.tsx`, `activeIndicators` was included in the dependency array of the primary data-loading `useEffect`. Every click on `VOL` (or any indicator pill) re-executed `candleSeries.setData(sorted)` and called `volumeSeries.setData([])` (empty array) without re-applying `setVisibleLogicalRange` (because `currentSeriesKey` did not change). In `lightweight-charts` v5, repeatedly calling `.setData(sorted)` + `.setData([])` across series while zoomed into a sub-range corrupts the internal `TimeScale` logical range and overlay `PriceScale` margins, causing the chart canvas to go blank after 2–3 toggles.
   - **Fix**:
     1. **Decouple Data Loading from Visibility Toggling**: Only call `.setData(...)` on `candleSeries`, `volumeSeries`, `sma20Series`, `ema50Series`, `vwapSeries`, `bbUpperSeries`, and `bbLowerSeries` when `sortedCandles` (or `ticker`/`timeframe`/`focusRevision`) changes—never when `activeIndicators` changes, and never pass `.setData([])` to hide an indicator.
     2. **Toggle Visibility Purely via `applyOptions`**: In a dedicated lightweight `useEffect([activeIndicators])`, toggle indicator series visibility via `.applyOptions({ visible })`.
     3. **Non-Destructive Candlestick Hiding**: When `CANDLES` is toggled off, keep `candleSeries` `visible: true` on the `'right'` price scale (so `timeScale.timeToCoordinate()`, `candleSeries.priceToCoordinate()`, and Y-axis auto-scaling never lose their master reference series even if all other indicators are off) and set `upColor`, `downColor`, `borderUpColor`, `borderDownColor`, `wickUpColor`, and `wickDownColor` to `'transparent'`.

### Architectural Invariants Verification
- [x] **Zero UI imports in `src/core/`**: `CANDLES_LOD_MIN_CALENDAR_DAYS`, `CANDLES_LOD_MIN_LOGICAL_BARS`, and `computeAutoCandlesLod()` are pure headless functions in `src/core/indicators/technicalIndicators.ts`.
- [x] **All external API responses parsed through `src/core/schemas/`**: Unchanged.
- [x] **All chart annotations use logical `(timestamp, price)` coordinates**: Keeping `candleSeries` mounted with transparent colors when `CANDLES` is hidden guarantees `CoordinateProjector` (`logicalToScreen` / `screenToLogical`) works identically at all zoom levels.
- [x] **All persistence flows through `StorageRepository`**: `IndicatorIdSchema` backward-compatibly accepts `'CANDLES'`.

---

## 2. Headless Core Contracts (`src/core/`)

### 2.1 `IndicatorIdSchema` & Candlestick Auto-LOD Evaluator (`src/core/indicators/technicalIndicators.ts`)

1. **Extend `IndicatorIdSchema` with `'CANDLES'`**:
   ```ts
   export const IndicatorIdSchema = z.enum([
     'CANDLES',
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

2. **Add `CANDLES` Auto-Adaptive LOD Constants & Pure Evaluator**:
   ```ts
   /**
    * Thresholds defining a ">= 1 month" viewport span where daily OHLC candlesticks
    * ("mean bars") should automatically be displayed.
    * Below 1 month (e.g. 1D = 5d, 1W = 10d, or zoomed in < 25 calendar days / <= 18 bars),
    * daily candlesticks are auto-hidden so the 15-minute price line is unobstructed.
    */
   export const CANDLES_LOD_MIN_CALENDAR_DAYS = 25;
   export const CANDLES_LOD_MIN_LOGICAL_BARS = 19;

   /**
    * Pure helper that evaluates whether the current chart viewport spans >= 1 month
    * and should auto-enable the daily OHLC candlestick bars ('CANDLES').
    *
    * - For timeframe presets when no live `visibleLogicalRange` is provided:
    *   '15m', '1h', '1D', '1W' -> false (< 1M)
    *   '1M', '3M', '6M', '1Y'  -> true  (>= 1M)
    * - When a live `visibleLogicalRange` ({ from, to }) is available:
    *   returns `true` iff `calendarDays >= CANDLES_LOD_MIN_CALENDAR_DAYS || logicalSpan >= CANDLES_LOD_MIN_LOGICAL_BARS`.
    */
   export function computeAutoCandlesLod(
     sortedCandles: ReadonlyArray<{ timestamp: number }>,
     visibleLogicalRange: { from: number; to: number } | null | undefined,
     fallbackTimeframe: Timeframe
   ): boolean
   ```

---

## 3. UI & Chart Plugin Layer (`src/features/` & `src/ui/`)

### 3.1 `IndicatorToolbar.tsx` (`src/features/chart/IndicatorToolbar.tsx`)
- Add the **`CANDLES`** toggle pill at the start of `OVERLAY_TOGGLES`:
  ```ts
  {
    id: 'CANDLES',
    label: 'CANDLES',
    dotClass: 'bg-teal-400',
    activeClass: 'border-teal-500/50 bg-teal-500/15 text-teal-200',
    formatValue: (s) =>
      s.latestPrice !== undefined && s.latestPrice !== null
        ? s.latestPrice.toFixed(2)
        : null,
  },
  ```

### 3.2 `ChartContainer.tsx` (`src/features/chart/ChartContainer.tsx`)

1. **Default Active Indicators & Initial Auto-LOD State**:
   - Update `DEFAULT_ACTIVE_INDICATORS`:
     ```ts
     const DEFAULT_ACTIVE_INDICATORS: IndicatorId[] = [
       'CANDLES',
       'VOLUME',
       'PRICE_15M',
       'SMA_20',
     ];
     ```
   - In `useState<IndicatorId[]>` initializer:
     - Compute `shouldShowPrice15m = TIMEFRAME_FOCUS_DAYS[timeframe] < 90` (`true` for `< 3M`).
     - Compute `shouldShowCandles = TIMEFRAME_FOCUS_DAYS[timeframe] >= 30` (`false` for `15m`, `1h`, `1D`, `1W`; `true` for `1M`, `3M`, `6M`, `1Y`).
     - Synchronize `'PRICE_15M'` and `'CANDLES'` in the initial `activeIndicators` array accordingly.

2. **Smart Auto-Sync for Both `PRICE_15M` (< 3M) and `CANDLES` (>= 1M)**:
   - Track `lastAutoPriceLodStateRef = useRef<boolean>(TIMEFRAME_FOCUS_DAYS[timeframe] < 90)` and `lastAutoCandlesLodStateRef = useRef<boolean>(TIMEFRAME_FOCUS_DAYS[timeframe] >= 30)`.
   - On timeframe/ticker switch (`timeframeKey !== lastTimeframeKeyRef.current`):
     - Sync `'PRICE_15M'` to `TIMEFRAME_FOCUS_DAYS[timeframe] < 90` and `'CANDLES'` to `TIMEFRAME_FOCUS_DAYS[timeframe] >= 30`.
   - On viewport zoom (`viewportRevision` change):
     - Compute `shouldShowPrice15m = computeAutoIntradayLod(sortedCandles, logicalRange, timeframe)`.
     - Compute `shouldShowCandles = computeAutoCandlesLod(sortedCandles, logicalRange, timeframe)`.
     - If `shouldShowPrice15m !== lastAutoPriceLodStateRef.current`, update ref and sync `'PRICE_15M'` in `activeIndicators`.
     - If `shouldShowCandles !== lastAutoCandlesLodStateRef.current`, update ref and sync `'CANDLES'` in `activeIndicators`.

3. **Fix `VOL` / Indicator Toggle Disappearing Chart Bug**:
   - **Effect 1 — Series Data & Viewport Focus (`[ticker, timeframe, sortedCandles, focusRevision]`)**:
     - Do **NOT** include `activeIndicators` in this effect's dependency array.
     - Upload full data to `candleSeries`, `volumeSeries`, `sma20Series`, `ema50Series`, `vwapSeries`, `bbUpperSeries`, and `bbLowerSeries` once whenever `sortedCandles` updates.
     - Apply `computeTimeframeFocusWindow` and `rightPriceScale: { autoScale: true }` when `currentSeriesKey !== lastFittedSeriesKeyRef.current`.
   - **Effect 2 — Non-Destructive Indicator Visibility (`[activeIndicators, sortedCandles]`)**:
     - Never call `.setData([])` when hiding an indicator.
     - Toggle `CANDLES` via `candleSeries.applyOptions({ visible: true, upColor: showCandles ? '#10b981' : 'transparent', downColor: showCandles ? '#f43f5e' : 'transparent', borderUpColor: showCandles ? '#10b981' : 'transparent', borderDownColor: showCandles ? '#f43f5e' : 'transparent', wickUpColor: showCandles ? '#10b981' : 'transparent', wickDownColor: showCandles ? '#f43f5e' : 'transparent' })`.
     - Toggle `VOLUME`, `SMA_20`, `EMA_50`, `VWAP`, and `BB_20` strictly via `.applyOptions?.({ visible })` (and for `volumeSeries`, preserve `scaleMargins: { top: 0.82, bottom: 0 }`).

### 3.3 `App.tsx` (`src/App.tsx`)
- Include `'CANDLES'` in initial `activeIndicators`: `['CANDLES', 'VOLUME', 'PRICE_15M', 'SMA_20']`.

---

## 4. Ordered File Manifest

- [ ] `[MODIFY]` `src/core/indicators/technicalIndicators.ts` — Add `'CANDLES'` to `IndicatorIdSchema`, `CANDLES_LOD_MIN_CALENDAR_DAYS = 25`, `CANDLES_LOD_MIN_LOGICAL_BARS = 19`, and `computeAutoCandlesLod()`.
- [ ] `[MODIFY]` `src/features/chart/IndicatorToolbar.tsx` — Add the `CANDLES` pill (`data-testid="indicator-toggle-CANDLES"`) to `OVERLAY_TOGGLES`.
- [ ] `[MODIFY]` `src/features/chart/ChartContainer.tsx` — Wire Smart Auto-Sync for `CANDLES` (`< 1M` auto-hide, `>= 1M` auto-show), decouple series `.setData()` from `activeIndicators` toggling so repeated `VOL` toggles never clear or corrupt the chart, and hide `candleSeries` non-destructively via transparent colors.
- [ ] `[MODIFY]` `src/App.tsx` — Add `'CANDLES'` to default `activeIndicators` in `preferencesStore`.
- [ ] `[MODIFY]` `src/core/indicators/__tests__/intradayPriceLine.test.ts` — Add unit tests for `computeAutoCandlesLod()` across `< 1M` (`1D`, `1W`, zoomed-in ranges) and `>= 1M` (`1M`, `3M`, `6M`, `1Y`, zoomed-out ranges).
- [ ] `[MODIFY]` `src/features/chart/__tests__/ChartContainer.test.tsx` — Add tests verifying the 3-tier Auto-LOD (`1D`/`1W`: `PRICE_15M` ON + `CANDLES` OFF; `1M`: both ON; `3M`/`1Y`: `PRICE_15M` OFF + `CANDLES` ON) and verifying that repeated `VOL` toggles do not reset or clear series data.

---

## 5. Verification & Test Matrix

1. **Static Typecheck**:
   - Run `npm run typecheck` (`tsc --noEmit`) — must exit with code `0`.
2. **Unit & Component Tests**:
   - Run `npm run test` (`vitest run`) — all test suites must pass.
   - Verify in `src/core/indicators/__tests__/intradayPriceLine.test.ts`:
     - `IndicatorIdSchema.parse('CANDLES')` succeeds.
     - `computeAutoCandlesLod()` returns `false` for `1D`, `1W` and visible ranges `< 25` calendar days and `< 19` bars.
     - `computeAutoCandlesLod()` returns `true` for `1M`, `3M`, `6M`, `1Y` and visible ranges `>= 25` calendar days or `>= 19` bars.
   - Verify in `src/features/chart/__tests__/ChartContainer.test.tsx`:
     - Mounting `ChartContainer` with `timeframe="1D"` or `"1W"` sets `CANDLES` OFF (`aria-pressed="false"`) and `PRICE_15M` ON (`aria-pressed="true"`).
     - Mounting `ChartContainer` with `timeframe="1M"` sets both `CANDLES` ON and `PRICE_15M` ON.
     - Mounting `ChartContainer` with `timeframe="3M"` or `"1Y"` sets `CANDLES` ON and `PRICE_15M` OFF.
