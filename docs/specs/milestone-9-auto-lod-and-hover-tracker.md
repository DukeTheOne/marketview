# Vertical Slice Specification: Milestone 9 — Auto-Adaptive LOD (< 3M) & Interactive Price Hover Tracker

## 1. Slice Scope & Architectural Invariants Check

### Problem Statement & Goal
Building on the 15-minute intraday price line (`PRICE_15M`) introduced in Milestone 8, this slice adds two cohesive chart interactions:

1. **Auto-Adaptive Level of Detail (LOD) with Smart Manual Override**:
   - When the visible chart time scope is **`< 3 months`** (e.g., selecting `1D`, `1W`, `1M`, or zooming in via mouse wheel/pinch so the visible span is `< 3 months`), the 15-minute price line (`PRICE_15M`) is **automatically shown**.
   - When the visible chart time scope is **`>= 3 months`** (e.g., selecting `3M`, `6M`, `1Y`, or zooming out to `>= 3 months`), the 15-minute price line is **automatically hidden** so macro views remain clean.
   - **Smart Auto-Sync Toggle**: The `15m PRICE` pill in `IndicatorToolbar` automatically reflects the current auto-LOD state when switching timeframes or zooming across the 3-month threshold, while allowing the user to click the pill at any time to manually show or hide the price line for the current view until the viewport crosses the 3-month threshold again.

2. **Priority-Aware Cursor Hover Dot & Price Callout**:
   - When the cursor moves over the chart, a **deeper blue tracking dot** (`#1d4ed8` with a `#e0f2fe` ring and subtle blue halo) and a **floating price label** (`$XXX.XX`) track the series horizontally:
     - **Priority 1 (`PRICE_15M` visible)**: Follows the **15-minute intraday price line** points first.
     - **Priority 2 (`PRICE_15M` hidden)**: Falls back to following the **daily candlestick ("mean bar") close prices**.

### Architectural Invariants Verification
- [x] **Zero UI imports in `src/core/`**: Auto-LOD threshold evaluation (`computeAutoIntradayLod`) and nearest-point cursor snapping (`findNearestHoverPoint`) are pure headless functions in `src/core/indicators/technicalIndicators.ts` with zero DOM, React, or `lightweight-charts` dependencies.
- [x] **All external API responses parsed through `src/core/schemas/`**: Unchanged; uses existing `OHLCVCandleSchema` series from `marketStore`.
- [x] **All chart annotations use logical `(timestamp, price)` coordinates**: Hover tracking uses `pointer-events-none` overlays and passive container `onMouseMove`/`onMouseLeave` listeners so annotation placement (`StickerPlugin`, `TrendlinePlugin`) and chart panning/zooming are never obstructed.
- [x] **All persistence flows through `StorageRepository`**: No direct browser storage calls introduced.

---

## 2. Headless Core Contracts (`src/core/`)

### 2.1 Auto-Adaptive LOD & Hover Snapping Helpers (`src/core/indicators/technicalIndicators.ts`)

1. **Auto-Adaptive LOD Constants & Pure Evaluator**:
   ```ts
   /**
    * Thresholds defining a "< 3 months" viewport span.
    * 3M is 90 calendar days (~63 trading days). Using 75 calendar days / 58 logical bars
    * cleanly separates 1D/1W/1M (<= 30 calendar days, <= 30 bars) and zoomed-in viewports
    * from 3M/6M/1Y (>= 88 calendar days, >= 60 bars) even when 90d boundaries fall on weekends.
    */
   export const INTRADAY_LOD_MAX_CALENDAR_DAYS = 75;
   export const INTRADAY_LOD_MAX_LOGICAL_BARS = 58;

   /**
    * Pure helper that evaluates whether the current chart viewport spans < 3 months
    * and should auto-enable the 15-minute intraday price line.
    */
   export function computeAutoIntradayLod(
     sortedCandles: ReadonlyArray<{ timestamp: number }>,
     visibleLogicalRange: { from: number; to: number } | null | undefined,
     fallbackTimeframe: Timeframe
   ): boolean
   ```
   - **Behavior of `computeAutoIntradayLod()`**:
     - Define timeframe preset map: `'15m' | '1h' | '1D' | '1W' | '1M' -> true` (`TIMEFRAME_FOCUS_DAYS[tf] < 90`), and `'3M' | '6M' | '1Y' -> false` (`TIMEFRAME_FOCUS_DAYS[tf] >= 90`).
     - If `!visibleLogicalRange` or `sortedCandles.length < 2` or `!Number.isFinite(visibleLogicalRange.from)` or `!Number.isFinite(visibleLogicalRange.to)`:
       - Return `TIMEFRAME_FOCUS_DAYS[fallbackTimeframe] < 90`.
     - Compute `logicalSpan = visibleLogicalRange.to - visibleLogicalRange.from`.
     - Clamp `startIndex = Math.max(0, Math.min(sortedCandles.length - 1, Math.floor(visibleLogicalRange.from)))` and `endIndex = Math.max(startIndex, Math.min(sortedCandles.length - 1, Math.ceil(visibleLogicalRange.to)))`.
     - Compute `startTs = sortedCandles[startIndex]?.timestamp ?? 0` and `endTs = sortedCandles[endIndex]?.timestamp ?? startTs`.
     - Compute `calendarDays = (endTs - startTs) / 86400`.
     - Return `calendarDays < INTRADAY_LOD_MAX_CALENDAR_DAYS && logicalSpan <= INTRADAY_LOD_MAX_LOGICAL_BARS`.

2. **Projected Hover Target Contract & Nearest-Point Resolver**:
   ```ts
   export interface ProjectedHoverPoint {
     x: number;
     y: number;
     price: number;
     timestamp: number;
     source: 'price_15m' | 'daily_bar';
   }

   /**
    * Finds the projected hover point closest horizontally to `cursorX`.
    * Returns `null` if `points` is empty, `cursorX` is not finite, or the closest point
    * exceeds `maxSnapDistancePx`.
    */
   export function findNearestHoverPoint(
     cursorX: number,
     points: ReadonlyArray<ProjectedHoverPoint>,
     maxSnapDistancePx = 120
   ): ProjectedHoverPoint | null
   ```
   - **Behavior of `findNearestHoverPoint()`**:
     - Iterate through `points` (which are already restricted to visible points from the active priority source: `'price_15m'` when `PRICE_15M` is shown, or `'daily_bar'` when `PRICE_15M` is hidden).
     - Track the point with minimum `Math.abs(pt.x - cursorX)`.
     - If `bestDistance <= maxSnapDistancePx`, return `bestPoint`; otherwise return `null`.

---

## 3. UI & Chart Plugin Layer (`src/features/` & `src/ui/`)

### 3.1 `ChartContainer.tsx` (`src/features/chart/ChartContainer.tsx`)

1. **Smart Auto-Sync State Machine for `PRICE_15M`**:
   - Maintain refs:
     - `lastAutoLodStateRef = useRef<boolean | null>(null)`
     - `lastTimeframeKeyRef = useRef<string>('')`
   - In the viewport / timeframe effect (and whenever `visibleLogicalRange` changes via `subscribeVisibleLogicalRangeChange`):
     - Query `const logicalRange = chart.timeScale().getVisibleLogicalRange()`.
     - Compute `const shouldShowByLod = computeAutoIntradayLod(sortedCandles, logicalRange, timeframe)`.
     - Compute `const timeframeKey = `${ticker}:${timeframe}:${focusRevision}``.
     - If `timeframeKey !== lastTimeframeKeyRef.current`:
       - The user explicitly switched timeframe or ticker (or clicked the timeframe focus button). Sync `PRICE_15M` to `TIMEFRAME_FOCUS_DAYS[timeframe] < 90` (ON for `1D`, `1W`, `1M`; OFF for `3M`, `6M`, `1Y`) and set `lastAutoLodStateRef.current = TIMEFRAME_FOCUS_DAYS[timeframe] < 90` and `lastTimeframeKeyRef.current = timeframeKey`.
     - Else if `lastAutoLodStateRef.current !== shouldShowByLod`:
       - The user zoomed across the 3-month LOD threshold. Update `lastAutoLodStateRef.current = shouldShowByLod` and sync `'PRICE_15M'` in `activeIndicators` (add if `shouldShowByLod === true`, remove if `shouldShowByLod === false`).
   - Clicking the `15m PRICE` button in `IndicatorToolbar` calls `handleToggleIndicator('PRICE_15M')`, which toggles `'PRICE_15M'` in `activeIndicators` without mutating `lastAutoLodStateRef.current`—preserving the user's manual override until the next timeframe click or zoom across the 3-month boundary.

2. **Unified Projection Memo (`projectedOverlayGeometry`)**:
   - Compute both:
     - `pricePolylinePoints: string` (for `<polyline>` when `showPrice15m` is true)
     - `hoverCandidates: ProjectedHoverPoint[]`:
       - When `showPrice15m` (`activeIndicators.includes('PRICE_15M')`) is `true`:
         Populate `hoverCandidates` from the visible projected `intradayPricePoints` (`{ x, y, price: pt.price, timestamp: pt.timestamp, source: 'price_15m' }`).
       - When `showPrice15m` is `false`:
         Populate `hoverCandidates` from the visible projected `sortedCandles` (`{ x: baseX, y: priceToCoordinate(c.close), price: c.close, timestamp: c.timestamp, source: 'daily_bar' }`).

3. **Cursor Hover Tracking & Deeper Blue Dot + Price Callout Rendering**:
   - Add state `const [hoverCursorX, setHoverCursorX] = useState<number | null>(null)` to `ChartContainer`.
   - Attach passive handlers on `ChartContainer`'s root `<div className="relative h-full w-full ...">`:
     - `onMouseMove={(e) => { const rect = e.currentTarget.getBoundingClientRect(); setHoverCursorX(e.clientX - rect.left); }}`
     - `onMouseLeave={() => setHoverCursorX(null)}`
   - Compute `const activeHoverPoint = useMemo(() => hoverCursorX !== null ? findNearestHoverPoint(hoverCursorX, hoverCandidates) : null, [hoverCursorX, hoverCandidates])`.
   - When `activeHoverPoint !== null`, render:
     - Inside the SVG overlay (or dedicated `data-testid="chart-hover-tracker"` layer, `pointer-events-none`):
       - Halo circle: `<circle cx={activeHoverPoint.x} cy={activeHoverPoint.y} r={8} fill="rgba(37, 99, 235, 0.25)" />`
       - Deeper blue dot (`data-testid="chart-hover-dot"`): `<circle cx={activeHoverPoint.x} cy={activeHoverPoint.y} r={4.5} fill="#1d4ed8" stroke="#e0f2fe" strokeWidth={1.75} />`
     - Floating price callout badge (`data-testid="chart-hover-price-label"`):
       - Positioned near `(activeHoverPoint.x, activeHoverPoint.y)` (offset `+10px` right / `-28px` up by default, clamping/flipping left when `activeHoverPoint.x > dimensions.width - 110` and clamping down when `activeHoverPoint.y < 36`).
       - Displays `$${activeHoverPoint.price.toFixed(2)}` in a compact deep-blue badge (`border border-blue-500/60 bg-blue-950/90 px-1.5 py-0.5 font-mono text-[11px] font-bold text-blue-100 shadow-lg`).

---

## 4. Ordered File Manifest

- [ ] `[MODIFY]` `src/core/indicators/technicalIndicators.ts` — Add `INTRADAY_LOD_MAX_CALENDAR_DAYS`, `INTRADAY_LOD_MAX_LOGICAL_BARS`, `computeAutoIntradayLod()`, `ProjectedHoverPoint`, and `findNearestHoverPoint()`.
- [ ] `[MODIFY]` `src/features/chart/ChartContainer.tsx` — Wire Smart Auto-Sync LOD on timeframe change and zoom range change, project `hoverCandidates` (15m price line points first when visible, daily bar close points when hidden), and render the deeper blue hover dot (`data-testid="chart-hover-dot"`) and price callout (`data-testid="chart-hover-price-label"`).
- [ ] `[MODIFY]` `src/core/indicators/__tests__/intradayPriceLine.test.ts` — Add unit tests for `computeAutoIntradayLod()` across `< 3M` (`1D`, `1W`, `1M`, zoomed-in ranges) and `>= 3M` (`3M`, `6M`, `1Y`, zoomed-out ranges), and `findNearestHoverPoint()` priority snapping.
- [ ] `[MODIFY]` `src/features/chart/__tests__/ChartContainer.test.tsx` — Add component tests verifying auto-adaptive `PRICE_15M` state on `< 3M` vs `>= 3M` timeframes, manual override via `indicator-toggle-PRICE_15M`, and hover dot/price callout rendering.

---

## 5. Verification & Test Matrix

1. **Static Typecheck**:
   - Run `npm run typecheck` (`tsc --noEmit`) — must exit with code `0`.
2. **Unit & Component Tests**:
   - Run `npm run test` (`vitest run`) — all test suites must pass.
   - Verify in `src/core/indicators/__tests__/intradayPriceLine.test.ts`:
     - `computeAutoIntradayLod()` returns `true` for `1D`, `1W`, `1M` and any visible logical range spanning `< 75` calendar days and `<= 58` bars.
     - `computeAutoIntradayLod()` returns `false` for `3M`, `6M`, `1Y` and any visible logical range spanning `>= 75` calendar days or `> 58` bars.
     - `findNearestHoverPoint()` snaps to the closest `price_15m` or `daily_bar` point by horizontal cursor distance and returns `null` when outside `maxSnapDistancePx`.
   - Verify in `src/features/chart/__tests__/ChartContainer.test.tsx`:
     - Mounting `ChartContainer` with `timeframe="1M"` auto-enables `PRICE_15M` (`aria-pressed="true"` on `indicator-toggle-PRICE_15M`).
     - Mounting `ChartContainer` with `timeframe="3M"` or `timeframe="1Y"` auto-disables `PRICE_15M` (`aria-pressed="false"` on `indicator-toggle-PRICE_15M`).
