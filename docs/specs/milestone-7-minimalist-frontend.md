# Vertical Slice Specification: Minimalist Long-Term Strategy Frontend (`milestone-7-minimalist-frontend`)

## 1. Slice Scope & Architectural Invariants Check

### 1.1 Objective & Product Philosophy
MarketView's original mission is a **minimalist, beginner-friendly stock market tracker** focused on long-term strategy rather than high-frequency day trading. This vertical slice streamlines the React frontend while preserving the entire headless core (`src/core/`) and stock API adapters intact:

1. **Preserve Headless Backend & Stock APIs (`src/core/`)**:
   - Keep all market data providers (`YahooFinanceProvider`, `FinnhubProvider`, `DeterministicDemoProvider`, `ResilientMarketDataProvider`, `CachedMarketDataProvider`), `StorageRepository` implementations, and headless stores (`marketStore`, `watchlistStore`, `annotationStore`, `tradeJournalStore`, `alertStore`, `preferencesStore`) untouched in architecture.
2. **Apple Stocks Timeframe Focus (`1D`, `1W`, `1M`, `3M`, `6M`, `1Y`) Over Full History**:
   - Extend `TimeframeSchema` and all `MarketDataProvider` adapters so `'1D' | '1W' | '1M' | '3M' | '6M' | '1Y'` load the **same continuous historical daily series** (up to 365–500 bars / 2 years), while clicking `1D`, `1W`, `1M`, `3M`, `6M`, or `1Y` zooms/focuses the chart camera (`chart.timeScale().setVisibleRange({ from, to })` via `computeTimeframeFocusWindow`) onto the recent N days (`5d`, `10d`, `30d`, `90d`, `180d`, `365d`).
   - Users can freely pan or zoom outside the initial focused range and still see the full price history, moving averages, memos, and trendlines without data cutoff or network refetching.
3. **Volume ("Quantity") On By Default + Toggleable Common Indicators**:
   - Keep trading `VOLUME` enabled by default (`['VOLUME', 'SMA_20']`) and positioned first in `IndicatorToolbar` with a formatted volume quantity readout (e.g., `48.2M`), alongside toggleable common indicators (`SMA 20`, `EMA 50`, `BB 20`, `VWAP`, `RSI 14`) so users can toggle one or more overlays simultaneously.
4. **Minimalist Chart Toolbar (Pointer, Memo/Sticker, Trendline Only)**:
   - Keep **Pointer**, **Sticker** (Memo), and **Trendline** (Drawing) in `ChartToolbar`.
   - Hide **Fibonacci** (`Fib`) and **Trade Marker** (the execution/buying reminder button on the far right of the toolbar) from the user-facing UI.
5. **Turn Off Real-Time Trading & Complex Drawer Features**:
   - Hide the **Trade Journal** header button, `TradeJournalDrawer`, and `j` hotkey.
   - Hide the **Price Alerts** header button, `PriceAlertsPopover`, triggered alert notification banner, and `PriceAlertLinesLayer` on the chart.
   - Hide the **`LIVE 15s / PAUSED`** real-time auto-polling toggle button in the header and default `pollIntervalSec` to `0` (on-demand fetch + manual refresh button + data source selector).
6. **Remove Developer Jargon Badges**:
   - Remove `LIVE M1-M6` and `Logical (timestamp, price) Architecture` from `TopHeaderBar`.
   - Simplify the `ChartContainer` top-left watermark to `{ticker} · {timeframe} · {candles.length} bars` (removing `Logical (t, p) Engine`).

### 1.2 Architectural Invariants Verification

| Invariant | Verification |
| :--- | :--- |
| **1. Strict Headless Core (`src/core/**`)** | Zero imports from `src/ui/**`, `src/features/**`, `react`, `react-dom`, `lightweight-charts`, or browser DOM globals. Confirmed via `src/core/__tests__/architecture-boundaries.test.ts`. |
| **2. Market Data Adapter Pattern (`src/core/providers/`)** | All quote, candle, and symbol search requests for the new `1D`, `1W`, `1M`, `3M`, `6M`, `1Y` timeframes flow exclusively through `MarketDataProvider` wrapped by `CachedMarketDataProvider` and `ResilientMarketDataProvider`. |
| **3. Logical Chart Coordinates (`src/core/schemas/annotation.ts`)** | All chart memos (`sticker`) and drawings (`trendline`) persist exclusively as `{ timestamp, price }` logical anchors via `StorageRepository` and project to screen `(x, y)` coordinates only at render time via `ChartOverlayPlugin`. |

---

## 2. Headless Core Contracts (`src/core/`)

### 2.1 Market Timeframe Schema (`src/core/schemas/market.ts`)
Extend `TimeframeSchema` with `'1M'`, `'3M'`, `'6M'`, and `'1Y'` while keeping `'15m'` and `'1h'` valid so all existing core unit tests and persisted preferences validate cleanly:

```ts
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
```

### 2.2 User Preferences Defaults (`src/core/schemas/preferences.ts`)
Keep `UserPreferencesSchema` backward-compatible while ensuring `VOLUME` and `SMA_20` remain the default active indicators:

```ts
export const UserPreferencesSchema = z.object({
  activeTicker: TickerSymbolSchema.default('AAPL'),
  activeTimeframe: TimeframeSchema.default('1D'),
  activeWatchlistId: z.string().min(1).default('wl-default'),
  providerMode: ProviderModeSchema.default('yahoo'),
  finnhubApiKey: z.string().default(''),
  pollIntervalSec: LivePollIntervalSchema.default(15),
  activeIndicators: z.array(IndicatorIdSchema).default(['VOLUME', 'SMA_20']),
  isSidebarCollapsed: z.boolean().default(false),
});
```

### 2.3 Provider Timeframe Resolution Mappings (`src/core/providers/*.ts`)

1. **`YahooFinanceProvider.ts` (`YAHOO_TIMEFRAME_MAP`)**:
   ```ts
   const YAHOO_TIMEFRAME_MAP: Record<
     Timeframe,
     { interval: string; range: string }
   > = {
     '15m': { interval: '15m', range: '5d' },
     '1h': { interval: '60m', range: '1mo' },
     '1D': { interval: '5m', range: '1d' },
     '1W': { interval: '15m', range: '5d' },
     '1M': { interval: '1d', range: '1mo' },
     '3M': { interval: '1d', range: '3mo' },
     '6M': { interval: '1d', range: '6mo' },
     '1Y': { interval: '1d', range: '1y' },
   };
   ```
2. **`FinnhubProvider.ts` (`FINNHUB_RESOLUTION_MAP` & `TIMEFRAME_SECONDS`)**:
   ```ts
   const FINNHUB_RESOLUTION_MAP: Record<Timeframe, string> = {
     '15m': '15',
     '1h': '60',
     '1D': 'D',
     '1W': 'W',
     '1M': 'D',
     '3M': 'D',
     '6M': 'D',
     '1Y': 'W',
   };

   const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
     '15m': 15 * 60,
     '1h': 60 * 60,
     '1D': 24 * 60 * 60,
     '1W': 7 * 24 * 60 * 60,
     '1M': 24 * 60 * 60,
     '3M': 24 * 60 * 60,
     '6M': 24 * 60 * 60,
     '1Y': 7 * 24 * 60 * 60,
   };
   ```
3. **`DeterministicDemoProvider.ts` (`TIMEFRAME_SECONDS`)**:
   - Uses the same `Record<Timeframe, number>` step mapping so deterministic offline/demo charts render distinct, realistic histories for `1D`, `1W`, `1M`, `3M`, `6M`, and `1Y`.

### 2.4 Technical Indicators Summary Volume Readout (`src/core/indicators/technicalIndicators.ts`)
Extend `ChartIndicatorsSummary` with `latestVolume: number | null` (computed from the latest candle's `volume`) and a pure `formatCompactVolume(volume: number): string` helper (e.g. `1_250_000` -> `'1.25M'`, `45_000` -> `'45.0K'`) so `IndicatorToolbar` can display the current bar's trading volume quantity right inside the `VOL` pill.

---

## 3. UI & Chart Plugin Layer (`src/features/` & `src/ui/`)

### 3.1 Top Header Bar (`src/ui/layout/TopHeaderBar.tsx`)
- **Timeframes**: Render `PRIMARY_TIMEFRAMES` (`['1D', '1W', '1M', '3M', '6M', '1Y']`) by default (configurable via optional `timeframes?: readonly Timeframe[]` prop).
- **Branding**: Render clean `MarketView` title without the `LIVE M1-M6` pill or `Logical (timestamp, price) Architecture` subtitle.
- **Feature Visibility Props** (allow hiding complex features in the app while keeping legacy test compatibility when explicitly passed):
  - `showJournal?: boolean` (default `false` in `App.tsx`): Hides the `Journal` button when `false`.
  - `showAlerts?: boolean` (default `false` in `App.tsx`): Hides the `Alerts` button, `PriceAlertsPopover`, and triggered alert banner when `false`.
  - `showLivePollToggle?: boolean` (default `false` in `App.tsx`): Hides the `LIVE 15s / PAUSED` auto-poll button when `false`.

### 3.2 Chart Drawing & Memo Toolbar (`src/features/chart/overlays/ChartToolbar.tsx`)
- Keep **Pointer** (`null`), **Sticker** (`'sticker'`, memo tool), and **Trendline** (`'trendline'`, line drawing tool) visible.
- Gate **Fibonacci** (`'fibonacci'`) and **Trade Marker** (`'trade_marker'`) behind an optional `showAdvancedTools?: boolean` prop (defaulting to `false` in `App.tsx`) or comment out in the minimalist toolbar view so beginners only see **Pointer**, **Sticker**, and **Trendline**.

### 3.3 Chart Container & Indicator Toolbar (`src/features/chart/ChartContainer.tsx`, `src/features/chart/IndicatorToolbar.tsx`)
- **Default Active Indicators**: `['VOLUME', 'SMA_20']` so trading volume bars and a basic moving average are immediately visible.
- **Volume First in `IndicatorToolbar`**:
  - Move `VOLUME` (`VOL`) to the first position in `OVERLAY_TOGGLES` and display the formatted volume quantity readout (`formatCompactVolume(summary.latestVolume)`) when active.
  - Keep `SMA 20`, `EMA 50`, `BB 20`, `VWAP`, and the `RSI(14)` badge alongside `VOL` so the user can toggle one or more common indicators at the same time.
- **Watermark Cleanup**:
  - Change `{candles.length} bars · Logical (t, p) Engine` to `{candles.length} bars`.

### 3.4 Overlay Canvas (`src/features/chart/overlays/OverlayCanvas.tsx`)
- In `App.tsx`, pass `alerts={[]}` and filter displayed annotations to minimalist types (`'sticker'`, `'trendline'`) so hidden features (`fibonacci`, `trade_marker`, price alert horizontal lines) never clutter the chart canvas.

### 3.5 Keyboard Shortcuts & App Shell (`src/ui/shortcuts/KeyboardShortcutsPopover.tsx`, `src/App.tsx`)
- Update `App.tsx` keydown listener:
  - `1` -> `'1D'`, `2` -> `'1W'`, `3` -> `'1M'`, `4` -> `'3M'`, `5` -> `'6M'`, `6` -> `'1Y'`.
  - Keep `/` (search), `b` (toggle watchlist sidebar), `s` (Sticker/Memo), `t` (Trendline), `Delete`/`Backspace` (delete selected annotation), `Escape` (cancel tool / deselect).
  - Comment out / disable `j` (Journal drawer), `f` (Fibonacci), and `m` (Trade Marker).
- Comment out / omit `<TradeJournalDrawer />` rendering and real-time quote alert evaluation in `App.tsx`.

---

## 4. Ordered File Manifest

1. `[MODIFY]` [market.ts](file:///home/duke/Project/marketview/src/core/schemas/market.ts) — Add `'1M'`, `'3M'`, `'6M'`, `'1Y'` to `TimeframeSchema` and export `PRIMARY_TIMEFRAMES`.
2. `[MODIFY]` [index.ts](file:///home/duke/Project/marketview/src/core/index.ts) — Re-export `PRIMARY_TIMEFRAMES` and `formatCompactVolume`.
3. `[MODIFY]` [YahooFinanceProvider.ts](file:///home/duke/Project/marketview/src/core/providers/YahooFinanceProvider.ts) — Map `'1D'`, `'1W'`, `'1M'`, `'3M'`, `'6M'`, `'1Y'` in `YAHOO_TIMEFRAME_MAP`.
4. `[MODIFY]` [FinnhubProvider.ts](file:///home/duke/Project/marketview/src/core/providers/FinnhubProvider.ts) — Map `'1M'`, `'3M'`, `'6M'`, `'1Y'` in `FINNHUB_RESOLUTION_MAP` and `TIMEFRAME_SECONDS`.
5. `[MODIFY]` [DeterministicDemoProvider.ts](file:///home/duke/Project/marketview/src/core/providers/DeterministicDemoProvider.ts) — Map `'1M'`, `'3M'`, `'6M'`, `'1Y'` in `TIMEFRAME_SECONDS`.
6. `[MODIFY]` [technicalIndicators.ts](file:///home/duke/Project/marketview/src/core/indicators/technicalIndicators.ts) — Add `latestVolume` to `ChartIndicatorsSummary` and export `formatCompactVolume()`.
7. `[MODIFY]` [IndicatorToolbar.tsx](file:///home/duke/Project/marketview/src/features/chart/IndicatorToolbar.tsx) — Place `VOL` first with live compact volume quantity readout alongside `SMA 20`, `EMA 50`, `BB 20`, `VWAP`, and `RSI(14)`.
8. `[MODIFY]` [ChartContainer.tsx](file:///home/duke/Project/marketview/src/features/chart/ChartContainer.tsx) — Set `DEFAULT_ACTIVE_INDICATORS = ['VOLUME', 'SMA_20']` and remove `Logical (t, p) Engine` jargon from the chart watermark.
9. `[MODIFY]` [ChartToolbar.tsx](file:///home/duke/Project/marketview/src/features/chart/overlays/ChartToolbar.tsx) — Hide `Fib` and `Trade Marker` buttons by default (`showAdvancedTools = false`), keeping only `Pointer`, `Sticker` (Memo), and `Trendline`.
10. `[MODIFY]` [TopHeaderBar.tsx](file:///home/duke/Project/marketview/src/ui/layout/TopHeaderBar.tsx) — Use `PRIMARY_TIMEFRAMES` (`1D`, `1W`, `1M`, `3M`, `6M`, `1Y`), remove `LIVE M1-M6` / `Logical (timestamp, price) Architecture` badges, and hide `Journal`, `Alerts`, and `LIVE 15s / PAUSED` controls in minimalist mode.
11. `[MODIFY]` [KeyboardShortcutsPopover.tsx](file:///home/duke/Project/marketview/src/ui/shortcuts/KeyboardShortcutsPopover.tsx) — Update shortcut reference to reflect minimalist tools (`s`, `t`) and Apple Stocks timeframes (`1`–`6`).
12. `[MODIFY]` [App.tsx](file:///home/duke/Project/marketview/src/App.tsx) — Configure minimalist frontend mode (disable Journal drawer, Alerts, Fibonacci/Trade Marker tools, and auto-polling; wire `1`–`6` timeframe hotkeys).
13. `[MODIFY]` [yahoo-resilient-provider.test.ts](file:///home/duke/Project/marketview/src/core/__tests__/yahoo-resilient-provider.test.ts) & [technical-indicators.test.ts](file:///home/duke/Project/marketview/src/core/__tests__/technical-indicators.test.ts) — Add unit tests for `1M`, `3M`, `6M`, `1Y` timeframe queries and `latestVolume` / `formatCompactVolume`.

---

## 5. Verification & Test Matrix

1. **Architectural Boundary Check**:
   - `npx vitest run src/core/__tests__/architecture-boundaries.test.ts` — Verifies zero UI/DOM imports inside `src/core/**`.
2. **Headless Core & Provider Unit Tests**:
   - `npx vitest run src/core/__tests__/yahoo-resilient-provider.test.ts` — Verifies `TimeframeSchema` validation and `YahooFinanceProvider` / `DeterministicDemoProvider` candle retrieval across `'1D'`, `'1W'`, `'1M'`, `'3M'`, `'6M'`, and `'1Y'`.
   - `npx vitest run src/core/__tests__/technical-indicators.test.ts` — Verifies `computeChartIndicatorsSummary` includes `latestVolume` and `formatCompactVolume` formats thousand/million/billion volumes accurately.
3. **Full Test Suite & Typecheck**:
   - `npm run typecheck` (`tsc --noEmit`) — Passes with zero errors under `strict: true` and `noUncheckedIndexedAccess: true`.
   - `npm run test` (`vitest run`) — All unit and integration test suites pass.
