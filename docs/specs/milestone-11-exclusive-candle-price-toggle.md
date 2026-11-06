# Vertical Slice Specification: Milestone 11 — Exclusive `CANDLE / PRICE` Toggle & Default Candlestick Mode

## 1. Slice Scope & Architectural Invariants Check

### Problem Statement & Goal
1. **Mutually Exclusive Primary Series (`CANDLES` vs. `PRICE_15M`) Across All Timeframes**:
   - Showing both daily OHLC candlesticks and the 15-minute intraday price polyline simultaneously (or automatically flipping between them when changing timeframes/zoom levels) creates visual overlap and cognitive friction.
   - Standard financial charting tools either show a price line only (Apple Stocks) or show candlesticks first with a direct toggle to switch to a price line (TradingView, Yahoo Finance, Webull).
   - This slice replaces the 3-tier Auto-LOD switching logic and separate `CANDLES` / `15m PRICE` pills with a **strictly mutually exclusive toggle**:
     - **Default Mode (`CANDLES`)**: Across **all** timeframes (`1D`, `1W`, `1M`, `3M`, `6M`, `1Y`, `15m`, `1h`) and all zoom levels, the chart defaults to showing **Candlesticks only** (`'CANDLES'` active, `'PRICE_15M'` inactive).
     - **Exclusive Toggle Invariant**: At any given time, **either** `'CANDLES'` **or** `'PRICE_15M'` is active—never both simultaneously, and never neither (preventing an accidentally blank primary chart).
     - **Sticky Across Timeframes & Zooming**: Switching timeframes or zooming/panning the viewport preserves the user's currently selected chart style (`CANDLES` or `PRICE_15M`) without auto-overriding it.

2. **Unified `CANDLE / PRICE` Indicator Bar Pill**:
   - In `IndicatorToolbar`, replace the separate `CANDLES` and `15m PRICE` buttons with a single dual-state toggle button labeled **`CANDLE / PRICE`** (`data-testid="indicator-toggle-CANDLES"`).
   - Clicking the **`CANDLE / PRICE`** button toggles exclusively between `'CANDLES'` and `'PRICE_15M'` while visually highlighting which half (`CANDLE` in teal vs. `PRICE` in blue) is currently active alongside the live price readout.

### Architectural Invariants Verification
- [x] **Zero UI imports in `src/core/`**: `PrimaryChartStyle`, `getActiveChartStyle()`, `normalizeExclusiveChartStyle()`, and `toggleExclusiveChartStyle()` are pure headless functions in `src/core/indicators/technicalIndicators.ts`.
- [x] **All external API responses parsed through `src/core/schemas/`**: Unchanged.
- [x] **All chart annotations use logical `(timestamp, price)` coordinates**: Keeping `candleSeries` mounted on the `'right'` price scale with transparent colors when in `PRICE_15M` mode guarantees `CoordinateProjector` (`logicalToScreen` / `screenToLogical`) and Y-axis auto-scaling work identically in both modes.
- [x] **All persistence flows through `StorageRepository`**: `IndicatorIdSchema` retains `'CANDLES'` and `'PRICE_15M'` so stored `UserPreferences` remain 100% schema-compatible, with default `activeIndicators` updated to `['CANDLES', 'VOLUME']`.

---

## 2. Headless Core Contracts (`src/core/`)

### 2.1 Exclusive Chart Style Helpers (`src/core/indicators/technicalIndicators.ts`)

Add pure state-transition helpers to enforce mutual exclusion between `'CANDLES'` and `'PRICE_15M'`:

```ts
export type PrimaryChartStyle = 'CANDLES' | 'PRICE_15M';

/**
 * Determines which primary chart style ('CANDLES' or 'PRICE_15M') is active.
 * Defaults to 'CANDLES' whenever 'CANDLES' is present or when neither is present.
 */
export function getActiveChartStyle(
  activeIndicators: ReadonlyArray<IndicatorId>
): PrimaryChartStyle {
  if (
    activeIndicators.includes('PRICE_15M') &&
    !activeIndicators.includes('CANDLES')
  ) {
    return 'PRICE_15M';
  }
  return 'CANDLES';
}

/**
 * Normalizes an indicator array so that exactly one of 'CANDLES' or 'PRICE_15M'
 * is present (defaulting to 'CANDLES' if both or neither are passed), while
 * preserving all other active overlay indicators (e.g. 'VOLUME', 'SMA_20').
 */
export function normalizeExclusiveChartStyle(
  activeIndicators: ReadonlyArray<IndicatorId>
): IndicatorId[] {
  const style = getActiveChartStyle(activeIndicators);
  const others = activeIndicators.filter(
    (id) => id !== 'CANDLES' && id !== 'PRICE_15M'
  );
  return [style, ...others];
}

/**
 * Toggles the primary chart style in an indicator array exclusively between
 * 'CANDLES' and 'PRICE_15M', preserving all other active indicators.
 */
export function toggleExclusiveChartStyle(
  activeIndicators: ReadonlyArray<IndicatorId>
): IndicatorId[] {
  const currentStyle = getActiveChartStyle(activeIndicators);
  const nextStyle: PrimaryChartStyle =
    currentStyle === 'CANDLES' ? 'PRICE_15M' : 'CANDLES';
  const others = activeIndicators.filter(
    (id) => id !== 'CANDLES' && id !== 'PRICE_15M'
  );
  return [nextStyle, ...others];
}
```

### 2.2 Default Preferences (`src/core/schemas/preferences.ts`)

Update `UserPreferencesSchema.shape.activeIndicators` default so new sessions start with Candlesticks + Volume only (never both `CANDLES` and `PRICE_15M`):

```ts
activeIndicators: z
  .array(IndicatorIdSchema)
  .default(['CANDLES', 'VOLUME']),
```

---

## 3. UI & Chart Plugin Layer (`src/features/` & `src/ui/`)

### 3.1 `IndicatorToolbar.tsx` (`src/features/chart/IndicatorToolbar.tsx`)

1. **Unified `CANDLE / PRICE` Toggle Pill**:
   - Remove the two separate `'CANDLES'` and `'PRICE_15M'` entries from `OVERLAY_TOGGLES`.
   - Render a dedicated primary toggle button first in `IndicatorToolbar`:
     - `data-testid="indicator-toggle-CANDLES"`
     - `data-chart-style={activeStyle}` (`'CANDLES'` or `'PRICE_15M'`)
     - `aria-pressed={activeStyle === 'PRICE_15M'}` (or `true` as an active primary mode control, with clear active styling: teal when `CANDLES` is active, blue when `PRICE_15M` is active).
     - Displays segmented label **`CANDLE / PRICE`** where:
       - In `CANDLES` mode: teal dot (`bg-teal-400`), `CANDLE` highlighted (`text-teal-200 font-semibold`), `/` and `PRICE` muted (`text-slate-500`).
       - In `PRICE_15M` mode: blue dot (`bg-blue-400`), `CANDLE` and `/` muted (`text-slate-500`), `PRICE` highlighted (`text-blue-200 font-semibold`).
     - Displays the formatted `summary.latestPrice` readout (`156.50`).
     - Clicking invokes `onToggleIndicator('CANDLES')` (which triggers `toggleExclusiveChartStyle` in `ChartContainer`).

### 3.2 `ChartContainer.tsx` (`src/features/chart/ChartContainer.tsx`)

1. **Default Active Indicators & Exclusive Initialization**:
   - Set `DEFAULT_ACTIVE_INDICATORS: IndicatorId[] = ['CANDLES', 'VOLUME']`.
   - Initialize `activeIndicators` via `useState<IndicatorId[]>(() => normalizeExclusiveChartStyle(defaultIndicators))`.
2. **Remove Timeframe & Viewport Auto-LOD Overrides**:
   - Remove the `useEffect` hooks that auto-toggled `'PRICE_15M'` and `'CANDLES'` on `timeframeKey` or `viewportRevision` changes. The user's selected mode (`CANDLES` by default, or `PRICE_15M` when toggled) remains active across all timeframes and zoom levels.
3. **Exclusive Toggle Handler**:
   - In `handleToggleIndicator(id: IndicatorId)`:
     ```ts
     const handleToggleIndicator = (id: IndicatorId) => {
       setActiveIndicators((prev) => {
         if (id === 'CANDLES' || id === 'PRICE_15M') {
           return toggleExclusiveChartStyle(prev);
         }
         return prev.includes(id)
           ? prev.filter((item) => item !== id)
           : [...prev, id];
       });
     };
     ```

### 3.3 `App.tsx` (`src/App.tsx`)
- Update initial `preferencesStore` override `activeIndicators` from `['CANDLES', 'VOLUME', 'PRICE_15M']` to `['CANDLES', 'VOLUME']`.
- Optional keyboard shortcut `c`: pressing `c` (when not focused in an input) toggles between `CANDLES` and `PRICE_15M` if desired, or keep shortcuts focused on existing bindings.

---

## 4. Ordered File Manifest

- [x] `[MODIFY]` `src/core/indicators/technicalIndicators.ts` — Add `PrimaryChartStyle`, `getActiveChartStyle()`, `normalizeExclusiveChartStyle()`, and `toggleExclusiveChartStyle()`.
- [x] `[MODIFY]` `src/core/schemas/preferences.ts` — Update default `activeIndicators` to `['CANDLES', 'VOLUME']`.
- [x] `[MODIFY]` `src/features/chart/IndicatorToolbar.tsx` — Replace separate `CANDLES` and `15m PRICE` pills with the unified `CANDLE / PRICE` dual-state toggle pill (`data-testid="indicator-toggle-CANDLES"`).
- [x] `[MODIFY]` `src/features/chart/ChartContainer.tsx` — Initialize `activeIndicators` with `normalizeExclusiveChartStyle(defaultIndicators)` (defaulting to `'CANDLES'`), remove timeframe/zoom Auto-LOD overrides, and wire `handleToggleIndicator` to `toggleExclusiveChartStyle()`.
- [x] `[MODIFY]` `src/App.tsx` — Update default `activeIndicators` to `['CANDLES', 'VOLUME']`.
- [x] `[MODIFY]` `src/core/__tests__/preferences-store.test.ts` — Update expected default `activeIndicators` to `['CANDLES', 'VOLUME']`.
- [x] `[MODIFY]` `src/core/indicators/__tests__/intradayPriceLine.test.ts` — Add unit tests for `getActiveChartStyle()`, `normalizeExclusiveChartStyle()`, and `toggleExclusiveChartStyle()`.
- [x] `[MODIFY]` `src/features/chart/__tests__/ChartContainer.test.tsx` — Update component tests to verify default `CANDLES`-only mode across all timeframes (`1D`, `1W`, `1M`, `3M`, `1Y`) and exclusive `CANDLE / PRICE` pill toggling.

---

## 5. Verification & Test Matrix

1. **Static Typecheck**:
   - Run `npm run typecheck` (`tsc --noEmit`) — must exit with code `0`.
2. **Unit & Component Tests**:
   - Run `npm run test` (`vitest run`) — all test suites must pass.
   - Verify in `src/core/indicators/__tests__/intradayPriceLine.test.ts`:
     - `normalizeExclusiveChartStyle(['CANDLES', 'VOLUME', 'PRICE_15M'])` returns `['CANDLES', 'VOLUME']` (never both).
     - `normalizeExclusiveChartStyle(['VOLUME'])` returns `['CANDLES', 'VOLUME']` (defaults to `CANDLES` when neither is present).
     - `toggleExclusiveChartStyle(['CANDLES', 'VOLUME'])` returns `['PRICE_15M', 'VOLUME']`, and toggling again returns `['CANDLES', 'VOLUME']`.
   - Verify in `src/features/chart/__tests__/ChartContainer.test.tsx`:
     - Mounting `ChartContainer` on `1D`, `1W`, `1M`, `3M`, and `1Y` always defaults to `CANDLES` mode (`data-chart-style="CANDLES"`) and never renders both `CANDLES` and `PRICE_15M` simultaneously.
     - `IndicatorToolbar` renders a single `CANDLE / PRICE` toggle button (`data-testid="indicator-toggle-CANDLES"`) that switches between `CANDLES` and `PRICE_15M` modes while preserving `VOLUME` and other overlays.
