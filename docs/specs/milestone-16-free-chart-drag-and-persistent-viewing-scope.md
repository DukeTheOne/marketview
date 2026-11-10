# Vertical Slice Specification: Milestone 16 — Free 2D Chart Dragging, Momentary Scope Action Buttons & Persistent Viewing Scope (`milestone-16-free-chart-drag-and-persistent-viewing-scope`)

## 1. Slice Scope & Architectural Invariants Check

### 1.1 Problem Statement & UX Goals
1. **Left-Click Mouse Dragging on the Chart (Free 2D Panning)**:
   - Currently, `ChartContainer` forces `rightPriceScale.autoScale = true` on load and only subscribes to `timeScale().subscribeVisibleLogicalRangeChange`. In TradingView `lightweight-charts` v5, when `autoScale` is `true`, `priceScale._internal_startScroll(localY)` immediately exits, blocking vertical mouse dragging on the chart canvas, while overlays fail to re-project during vertical price scale changes.
   - **Goal**: Allow the user to hold left-click anywhere on the chart pane and smoothly drag the chart around with the mouse (both horizontally across time and vertically across price, with a clean standard arrow `cursor-default` at rest and tactile `cursor-grabbing` hand feedback while dragging), while keeping all SVG/HTML overlays (`StickerPlugin`, `TrendlinePlugin`, `15m Price Line`, `HoverTracker`, `PriceAlertLinesLayer`) synchronized at 60fps.
2. **Preserve the Current "Actual Viewing" Scope Across Stock Switches**:
   - Currently, `App.tsx` increments `focusRevision` inside `onSelectTicker` and `onAddTicker`, and `ChartContainer.tsx` re-runs `computeTimeframeFocusWindow(sorted, timeframe)` whenever `ticker` changes. If a user clicks `3M`, zooms in/out or pans to a custom window, and then switches to another stock in the watchlist, the chart discards their actual zoomed viewing scope and snaps back to the preset `3M` window.
   - **Goal**: Clicking a time scope button (`3M`, `1M`, etc.) focuses the chart onto that horizon at the moment of the click, **but** any subsequent zoom or pan updates the user's live "actual viewing" scope (`{ from, to, barCount }`). When switching to another stock, carry over the current actual viewing scope (preserving the visible bar span and right-edge offset relative to the latest bar) while auto-scaling the Y-axis (`rightPriceScale: { autoScale: true }`) to fit the new stock's price level.
3. **Momentary Time Scope Action Buttons with Clicked Animation (Not Toggled)**:
   - Because zooming or dragging immediately changes the actual viewing window away from a preset horizon, the time scope buttons (`1D`, `1W`, `1M`, `3M`, `6M`, `1Y`) in `TopHeaderBar` must **not** remain permanently toggled/highlighted.
   - **Goal**: Render the time scope buttons as momentary quick-focus action buttons without a persistent active toggle state. When clicked, play a crisp clicked animation (`380ms` emerald pulse/ring + `scale-95` tactile press) that fades back to the neutral button style.
4. **Always Default to `3M` on Website Launch & Never Sync Scope to Backend Database**:
   - **Goal**: When launching the website, always initialize the chart viewing scope to **`3M`** (`DEFAULT_INITIAL_TIMEFRAME = '3M'`). Never sync the time scope to the backend Cloud Sync database (Firestore) or overwrite the active viewing scope during cloud pull/merge operations.

---

### 1.2 Architectural Invariants Check
- [x] **Zero DOM/UI imports in `src/core/`**: Confirmed. `DEFAULT_INITIAL_TIMEFRAME`, `LogicalRangeWindow`, `computeCarryOverLogicalRange`, and `mergeWorkspaceSnapshots` in `src/core/` use pure TypeScript and Zod with zero DOM, React, or `lightweight-charts` imports.
- [x] **All external market data flows through `MarketDataProvider`**: Confirmed. No changes to market data provider boundaries or caching decorators.
- [x] **All chart overlays use logical `{ timestamp, price }` coordinates and register via `ChartOverlayPlugin`**: Confirmed. Overlays continue storing logical `{ timestamp, price }` anchors and re-project to screen pixels whenever the user pans/drags the chart in 2D.

---

## 2. Headless Core Contracts (`src/core/`)

### 2.1 Default Launch Scope & Carry-Over Logical Range Calculator (`src/core/schemas/market.ts`)
Add `DEFAULT_INITIAL_TIMEFRAME` (`'3M'`) and a pure helper `computeCarryOverLogicalRange` to translate the user's current actual viewing logical range from one ticker's bar series (`prevBarCount`) to another ticker's bar series (`nextBarCount`):

```typescript
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
```

Re-export `DEFAULT_INITIAL_TIMEFRAME`, `computeCarryOverLogicalRange`, and `type LogicalRangeWindow` from `src/core/index.ts`.

### 2.2 Exclude Time Scope from Cloud Database Merge (`src/core/serialization/workspaceExport.ts`)
1. `computeWorkspaceContentHash(snapshot: WorkspaceBackup)` already excludes `activeTimeframe` so clicking a time scope never marks the workspace dirty or triggers a Firestore write.
2. In `mergeWorkspaceSnapshots(local, remote, nowSec)`:
   - Always preserve `local.preferences.activeTimeframe` (even when `isLocalFreshDefault` is `true` or `remote.exportedAt >= local.exportedAt`) so the backend cloud database never dictates or overwrites the local viewing scope:
   ```typescript
   activeTimeframe: local.preferences?.activeTimeframe ?? '3M',
   ```

---

## 3. UI & Chart Plugin Layer (`src/features/` & `src/ui/`)

### 3.1 Momentary Time Scope Action Buttons with Clicked Animation (`src/ui/layout/TopHeaderBar.tsx`)
1. **Hook Order Preservation**:
   - Keep the existing first 4 `useState` declarations (`isAlertsOpen`, `isProviderSettingsOpen`, `isShortcutsOpen`, `isSyncOpen`) in their exact positions (indices `1..4`) for compatibility with existing hook-dispatcher unit tests.
   - Add after `isSyncOpen`:
     ```typescript
     const [pulsingTimeframe, setPulsingTimeframe] = useState<Timeframe | null>(null);
     const pulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
     ```
   - Clean up `pulseTimerRef.current` on unmount via `useEffect`.
2. **Non-Toggled Momentary Click Behavior**:
   - Make `activeTimeframe?: Timeframe` optional in `TopHeaderBarProps`.
   - When a user clicks any time scope button `tf` in `TIMEFRAMES` (`1D`, `1W`, `1M`, `3M`, `6M`, `1Y`):
     - Call `onSelectTimeframe(tf)`.
     - Set `setPulsingTimeframe(tf)` and schedule a `380ms` timeout to reset `setPulsingTimeframe(null)`.
   - Render each button without a permanent toggled highlight:
     ```tsx
     {TIMEFRAMES.map((tf) => {
       const isPulsing = pulsingTimeframe === tf;
       return (
         <button
           key={tf}
           type="button"
           data-testid={`timeframe-btn-${tf}`}
           data-pulsing={isPulsing ? 'true' : 'false'}
           onClick={() => handleTimeframeClick(tf)}
           title={`Focus ${tf} scope`}
           className={`rounded-md px-2.5 py-1 font-mono text-xs font-medium transition-all duration-200 active:scale-90 ${
             isPulsing
               ? 'scale-95 bg-emerald-500/25 text-emerald-300 ring-1 ring-emerald-400/60 shadow-inner'
               : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-100'
           }`}
         >
           {tf}
         </button>
       );
     })}
     ```

### 3.2 Free 2D Left-Click Chart Dragging & Persistent Viewing Scope (`src/features/chart/ChartContainer.tsx`)
1. **Hook Order Preservation**:
   - Keep the existing `useRef` declarations (`refs[0..11]`: `containerRef` through `hoverCandidatesRef`) and existing `useState` declarations (`stateSpies[0..3]`: `viewportRevision`, `dimensions`, `activeHoverPoint`, `activeIndicators`) in their exact positions.
   - Append new refs/state after `activeIndicators`:
     - `viewingLogicalRangeRef = useRef<{ from: number; to: number; barCount: number } | null>(null)`
     - `sortedCandlesLengthRef = useRef<number>(0)`
     - `lastAppliedTickerRef = useRef<string>('')`
     - `lastAppliedFocusRevisionRef = useRef<number>(-1)`
     - `isApplyingProgrammaticRangeRef = useRef<boolean>(false)`
     - `isDraggingChartRef = useRef<boolean>(false)`
     - `[isDraggingChart, setIsDraggingChart] = useState<boolean>(false)`
2. **Explicit `handleScroll` & `handleScale` Chart Options**:
   - In `createChart(container, { ... })`, explicitly pass:
     ```typescript
     handleScroll: {
       mouseWheel: true,
       pressedMouseMove: true,
       horzTouchDrag: true,
       vertTouchDrag: true,
     },
     handleScale: {
       axisPressedMouseMove: {
         time: true,
         price: true,
       },
       axisDoubleClickReset: {
         time: true,
         price: true,
       },
       mouseWheel: true,
       pinch: true,
     },
     ```
3. **Free 2D Left-Click Drag Panning (Horizontal Time + Vertical Price)**:
   - On the `ChartContainer` root `div`, add `onMouseDownCapture`:
     - Trigger when `e.button === 0` (left click), `containerRef.current?.contains(e.target as Node)` is `true` (click originated on the chart canvas rather than an overlay toolbar/sticker/handle), and the click is inside the main chart pane (`localX < width - rightPriceAxisWidth` and `localY < height - timeAxisHeight`).
     - Snapshot `wasAutoScale = chart.priceScale?.('right')?.options?.()?.autoScale ?? true`.
     - Immediately unlock vertical auto-scaling (`chart.priceScale?.('right')?.setAutoScale?.(false)` and `chart.priceScale?.('right')?.applyOptions?.({ autoScale: false })`) before Lightweight Charts starts its drag gesture so Lightweight Charts' native `_internal_startScrollPrice` + `_internal_startScrollTime` pans the chart in full 2D (both X and Y) with the mouse.
     - Set `isDraggingChartRef.current = true` and `setIsDraggingChart(true)`.
     - Attach `window` `mousemove` and `mouseup` listeners for the drag lifecycle:
       - On `mousemove`: if `Math.abs(moveEvent.clientY - startY) >= 3`, mark `hasPannedVertically = true`; call `setViewportRevision((rev) => rev + 1)` so all overlays re-project smoothly during vertical and horizontal dragging.
       - On `mouseup`: remove window listeners, set `isDraggingChartRef.current = false` and `setIsDraggingChart(false)`, and if `!hasPannedVertically && wasAutoScale`, restore `chart.priceScale?.('right')?.setAutoScale?.(true)` so simple clicks or purely horizontal drags retain vertical auto-scale.
   - Apply `cursor-default` (clean arrow pointer at rest) and `cursor-grabbing` (hand holding while actively dragging) to the chart pane.
4. **Continuous Tracking of "Actual Viewing" Scope & Carry-Over on Stock Switch**:
   - Inside `chart.timeScale().subscribeVisibleLogicalRangeChange`:
     - When `!isApplyingProgrammaticRangeRef.current` and `sortedCandlesLengthRef.current > 0`:
       - Query `const range = chart.timeScale().getVisibleLogicalRange?.()`.
       - If `range && Number.isFinite(range.from) && Number.isFinite(range.to)`, update `viewingLogicalRangeRef.current = { from: range.from, to: range.to, barCount: sortedCandlesLengthRef.current }`.
   - Inside the data-loading & viewport focus `useEffect` (`[ticker, timeframe, sortedCandles, focusRevision, computedIndicators]`):
     - Snapshot `const priorViewingScope = viewingLogicalRangeRef.current` before calling `candleSeries.setData(...)`.
     - Update `sortedCandlesLengthRef.current = sorted.length`.
     - Upload series data (`candleSeries.setData`, `volumeSeries.setData`, indicator series `setData`).
     - When `sorted.length > 0`:
       - **Branch A — Initial Launch or Explicit Time Scope Button Click (`lastAppliedFocusRevisionRef.current === -1 || focusRevision !== lastAppliedFocusRevisionRef.current`)**:
         - Compute `focusWindow = computeTimeframeFocusWindow(sorted, timeframe)`.
         - Re-enable `rightPriceScale` `autoScale: true`.
         - Apply `timeScale.setVisibleLogicalRange({ from: fromIndex, to: toIndex })` under `isApplyingProgrammaticRangeRef.current = true`.
         - Save `viewingLogicalRangeRef.current = { from: fromIndex, to: toIndex, barCount: sorted.length }`.
         - Update `lastAppliedFocusRevisionRef.current = focusRevision` and `lastAppliedTickerRef.current = ticker`.
       - **Branch B — Stock Switch (`ticker !== lastAppliedTickerRef.current`)**:
         - Do **not** call `computeTimeframeFocusWindow`!
         - Compute `carryOver = priorViewingScope ? computeCarryOverLogicalRange(priorViewingScope, priorViewingScope.barCount, sorted.length) : null`.
         - Re-enable `rightPriceScale` `autoScale: true` so the new stock's price range fits vertically.
         - If `carryOver` is non-null, apply `timeScale.setVisibleLogicalRange(carryOver)` under `isApplyingProgrammaticRangeRef.current = true` and update `viewingLogicalRangeRef.current = { from: carryOver.from, to: carryOver.to, barCount: sorted.length }`.
         - Update `lastAppliedTickerRef.current = ticker`.
       - **Branch C — Background Quote/Candle Refresh on Same Stock (`ticker === lastAppliedTickerRef.current && focusRevision === lastAppliedFocusRevisionRef.current`)**:
         - Do not reset `timeScale` logical range or `rightPriceScale` `autoScale`.
   - In the top-left watermark badge of `ChartContainer.tsx`, remove the static `{timeframe}` pill so it displays `{ticker}` and `{candles.length} bars` without falsely implying a locked timeframe toggle.

### 3.3 Default to `'3M'` on Launch & Decouple Scope from Stock Switching / Cloud Sync (`src/App.tsx`)
1. Initialize `marketStore` with `DEFAULT_INITIAL_TIMEFRAME` (`'3M'`):
   ```typescript
   marketStore: createMarketStore(cachedProvider, 'AAPL', DEFAULT_INITIAL_TIMEFRAME, 365),
   ```
2. In the initial hydration `useEffect`:
   - Always launch with `'3M'` (`await marketStore.getState().setActiveTimeframe(DEFAULT_INITIAL_TIMEFRAME)`) instead of restoring `hydratedPrefs.activeTimeframe`.
3. In keyboard shortcuts (`1`–`6`) and `TopHeaderBar`'s `onSelectTimeframe`:
   - Increment `setFocusRevision((rev) => rev + 1)` and call `void marketStore.getState().setActiveTimeframe(tf)`.
   - Remove `preferencesStore.getState().updatePreferences({ activeTimeframe: ... })` calls.
4. In `onSelectTicker`, `onAddTicker`, and `onRefresh`:
   - Remove `setFocusRevision((rev) => rev + 1)` so selecting/adding a stock or refreshing quotes/candles preserves the user's current actual viewing scope.
5. In `handleSyncNow`:
   - Remove `setActiveTimeframe` and `setFocusRevision` calls when syncing with Firebase so Cloud Sync never alters the chart's viewing scope.

---

## 4. Ordered File Manifest

1. `[MODIFY]` [market.ts](file:///home/duke/Project/marketview/src/core/schemas/market.ts)
   - Add `DEFAULT_INITIAL_TIMEFRAME = '3M'`, `LogicalRangeWindow`, and `computeCarryOverLogicalRange`.
2. `[MODIFY]` [workspaceExport.ts](file:///home/duke/Project/marketview/src/core/serialization/workspaceExport.ts)
   - Ensure `mergeWorkspaceSnapshots` always preserves local `activeTimeframe` (defaulting to `'3M'`) and never overwrites it from remote cloud snapshots.
3. `[MODIFY]` [index.ts](file:///home/duke/Project/marketview/src/core/index.ts)
   - Re-export `DEFAULT_INITIAL_TIMEFRAME`, `computeCarryOverLogicalRange`, and `type LogicalRangeWindow`.
4. `[MODIFY]` [TopHeaderBar.tsx](file:///home/duke/Project/marketview/src/ui/layout/TopHeaderBar.tsx)
   - Convert time scope buttons from a persistent toggle bar into momentary quick-focus action buttons with a `380ms` clicked pulse animation (`data-pulsing="true"`).
5. `[MODIFY]` [ChartContainer.tsx](file:///home/duke/Project/marketview/src/features/chart/ChartContainer.tsx)
   - Enable explicit `handleScroll` / `handleScale`, add 2D left-click chart drag support (`onMouseDownCapture` unlocking `autoScale` + `mousemove` `viewportRevision` updates + `cursor-grab`/`cursor-grabbing`), and carry over `viewingLogicalRangeRef` via `computeCarryOverLogicalRange` when switching stocks.
6. `[MODIFY]` [App.tsx](file:///home/duke/Project/marketview/src/App.tsx)
   - Default initial launch scope to `'3M'`, stop persisting/syncing `activeTimeframe` to storage/cloud, and remove `setFocusRevision` from `onSelectTicker`, `onAddTicker`, and `onRefresh`.
7. `[MODIFY]` [chart-autoscale-and-toolbar.test.ts](file:///home/duke/Project/marketview/src/features/chart/__tests__/chart-autoscale-and-toolbar.test.ts), [firebase-sync-and-gc.test.ts](file:///home/duke/Project/marketview/src/core/__tests__/firebase-sync-and-gc.test.ts), & [milestone5-e2e.test.ts](file:///home/duke/Project/marketview/src/test/e2e/milestone5-e2e.test.ts)
   - Add unit tests for `DEFAULT_INITIAL_TIMEFRAME`, `computeCarryOverLogicalRange`, stock-switch viewing scope preservation after custom zoom/pan, 2D left-click chart dragging, momentary time scope button click animation, and cloud sync scope isolation.

---

## 5. Verification & Test Matrix

1. **Headless Core Unit Tests (`npx vitest run src/core/`)**:
   - `DEFAULT_INITIAL_TIMEFRAME` equals `'3M'`.
   - `computeCarryOverLogicalRange`:
     - Preserves exact zoomed-in `{ from, to }` logical range when switching between two stocks with 365 bars after user zoomed in from `3M` (63 bars) to 25 bars.
     - Preserves panned right-edge offset and visible bar span when switching from a 365-bar stock to a 120-bar stock.
     - Clamps gracefully when a deep historical pan on a 365-bar stock switches to a newly listed 30-bar stock.
   - `mergeWorkspaceSnapshots` never overwrites local `activeTimeframe` with remote cloud `activeTimeframe`.
2. **Chart & UI Unit Tests (`npx vitest run src/features/chart/ src/test/`)**:
   - `TopHeaderBar` renders `1D`, `1W`, `1M`, `3M`, `6M`, `1Y` without permanent toggled styling (`bg-emerald-500 text-slate-950` is absent at rest) and triggers `data-pulsing="true"` animation on click.
   - `ChartContainer` carries over the user's zoomed logical range (`setVisibleLogicalRange`) when `ticker` changes without `focusRevision` changing, and only resets to `computeTimeframeFocusWindow` when `focusRevision` increments.
   - `ChartContainer` unlocks `rightPriceScale` `autoScale` on left-click drag inside the chart pane and increments `viewportRevision` during `mousemove` so overlays track 2D dragging.
3. **Full Suite & Typecheck**:
   - `npm run typecheck` (`tsc --noEmit`) passes with zero errors.
   - `npm run test` (`vitest run`) passes all test suites with zero regressions.
