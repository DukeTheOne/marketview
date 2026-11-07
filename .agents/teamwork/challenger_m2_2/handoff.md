# Handoff Report: Challenger M2-2 (ChartContainer & App Behavior Challenger)

**Challenger**: `challenger_m2_2`  
**Role**: critic, specialist  
**Parent**: `orchestrator_m15` (`a9a9c8ed-8a35-4f8f-8dd8-9119837c3c50`)  
**Target Worker**: `worker_m2`  
**Timestamp**: 2026-11-07T18:41:30Z  
**Verdict**: **APPROVE**

---

## Challenge Summary

**Overall risk assessment**: **LOW** (Assigned ChartContainer & App Behavior scope)

The empirical challenge suite verified that:
1. `ChartContainer.tsx` hover deduplication effectively eliminates redundant state updates: 20 jitter events within a single candle's snap zone trigger **zero** redundant `setActiveHoverPoint` calls; a 50-candle traversal across 250 high-frequency mouse movements yields strictly 50 state updates (an 80% event reduction).
2. The loading backdrop in `ChartContainer.tsx` is completely non-blocking when existing/cached candles exist (`sortedCandles.length > 0`), and renders the blocking backdrop strictly on cold loads (`isLoading && sortedCandles.length === 0`).
3. Coordinate projection in `logicalToScreen` handles exact candle timestamp hits without `NaN` or division-by-zero errors, protected by `leftCandle.timestamp === rightCandle.timestamp` even under fallback interpolation and duplicate timestamp datasets.
4. Auto-refresh polling in `App.tsx` is strictly gated on `document.visibilityState === 'visible'`; background polling halts when tabs are hidden (`hidden`, `prerender`, or `unloaded`) and resumes upon becoming visible.
5. `ProviderSettingsPopover.tsx` correctly renders selectable buttons for `Off` (`0`), `15s` (`15`), `1m` (`60`), and `5m` (`300`) with matching status readouts (`Paused`, `Every 15s`, `Every 1m`, `Every 5m`).

All 23 empirical challenge tests pass cleanly. `npm run typecheck` and `npm run build` pass with zero errors.

---

## 1. Observation

### 1.1 Empirical Test Suite Execution
An automated empirical stress harness was authored at `src/test/challenger-m2-2-stress.test.ts` (23 tests across 6 describe sections).

Command and output:
```bash
npx vitest run src/test/challenger-m2-2-stress.test.ts
```
```
 ✓ src/test/challenger-m2-2-stress.test.ts (23 tests) 83ms
   ✓ Challenger M2-2: ChartContainer, ProviderSettings & App Behavior Hardening Suite > 1. ChartContainer Hover Deduplication Stress Harness > does NOT re-trigger setActiveHoverPoint when cursor jitters within a single candle snap zone (20 consecutive mousemove events) 9ms
   ✓ Challenger M2-2: ChartContainer, ProviderSettings & App Behavior Hardening Suite > 1. ChartContainer Hover Deduplication Stress Harness > findNearestHoverPoint correctly rejects points outside maxSnapDistancePx (120px) 0ms
   ✓ Challenger M2-2: ChartContainer, ProviderSettings & App Behavior Hardening Suite > 2. Non-Blocking Loading Backdrop Tests > omits blocking loading overlay when isLoading is true but sortedCandles.length > 0 11ms
   ✓ Challenger M2-2: ChartContainer, ProviderSettings & App Behavior Hardening Suite > 2. Non-Blocking Loading Backdrop Tests > renders blocking loading overlay when isLoading is true and sortedCandles.length === 0 (cold load) 2ms
   ✓ Challenger M2-2: ChartContainer, ProviderSettings & App Behavior Hardening Suite > 2. Non-Blocking Loading Backdrop Tests > omits loading overlay when isLoading is false regardless of candle count 3ms
   ✓ Challenger M2-2: ChartContainer, ProviderSettings & App Behavior Hardening Suite > 2. Non-Blocking Loading Backdrop Tests > handles unsorted input candles properly without showing overlay when length > 0 2ms
   ✓ Challenger M2-2: ChartContainer, ProviderSettings & App Behavior Hardening Suite > 2. Non-Blocking Loading Backdrop Tests > interpolates ticker and timeframe correctly in cold loading overlay banner 3ms
   ✓ Challenger M2-2: ChartContainer, ProviderSettings & App Behavior Hardening Suite > 3. Coordinate Projection Exact Hits (logicalToScreen) > returns finite non-NaN coordinates when anchor timestamp matches an exact candle timestamp 3ms
   ✓ Challenger M2-2: ChartContainer, ProviderSettings & App Behavior Hardening Suite > 3. Coordinate Projection Exact Hits (logicalToScreen) > avoids division-by-zero (NaN) when fallback findSurroundingCandles returns identical left and right candles 1ms
   ✓ Challenger M2-2: ChartContainer, ProviderSettings & App Behavior Hardening Suite > 3. Coordinate Projection Exact Hits (logicalToScreen) > interpolates smoothly between two candles without division-by-zero 1ms
   ✓ Challenger M2-2: ChartContainer, ProviderSettings & App Behavior Hardening Suite > 3. Coordinate Projection Exact Hits (logicalToScreen) > snaps safely when anchor timestamp is before first candle or after last candle 1ms
   ✓ Challenger M2-2: ChartContainer, ProviderSettings & App Behavior Hardening Suite > 4. Auto-Refresh & Tab Visibility Gating > gates auto-polling on document.visibilityState === "visible" 4ms
   ✓ Challenger M2-2: ChartContainer, ProviderSettings & App Behavior Hardening Suite > 4. Auto-Refresh & Tab Visibility Gating > does not register any timer when pollIntervalSec is 0 (Off) 1ms
   ✓ Challenger M2-2: ChartContainer, ProviderSettings & App Behavior Hardening Suite > 4. Auto-Refresh & Tab Visibility Gating > supports 1m (60s) and 5m (300s) intervals 1ms
   ✓ Challenger M2-2: ChartContainer, ProviderSettings & App Behavior Hardening Suite > 5. ProviderSettingsPopover UI Component Verification > renders selectable buttons for Off, 15s, 1m, and 5m with clean labels and status 11ms
   ✓ Challenger M2-2: ChartContainer, ProviderSettings & App Behavior Hardening Suite > 5. ProviderSettingsPopover UI Component Verification > displays correct status readout for all interval options (0, 15, 60, 300) 11ms
   ✓ Challenger M2-2: ChartContainer, ProviderSettings & App Behavior Hardening Suite > 5. ProviderSettingsPopover UI Component Verification > renders null when isOpen is false 0ms
   ✓ Challenger M2-2: ChartContainer, ProviderSettings & App Behavior Hardening Suite > 6. Adversarial Stress & Failure Mode Mining > prevents state updates when candidate object is a newly allocated distinct object instance with identical values 1ms
   ✓ Challenger M2-2: ChartContainer, ProviderSettings & App Behavior Hardening Suite > 6. Adversarial Stress & Failure Mode Mining > processes rapid traversal across 50 simulated candles with 5 jitters each (250 events) with strictly 50 state updates 2ms
   ✓ Challenger M2-2: ChartContainer, ProviderSettings & App Behavior Hardening Suite > 6. Adversarial Stress & Failure Mode Mining > stress tests findNearestHoverPoint across 10,000 points and invalid coordinate values without performance degradation 11ms
   ✓ Challenger M2-2: ChartContainer, ProviderSettings & App Behavior Hardening Suite > 6. Adversarial Stress & Failure Mode Mining > handles duplicate timestamp candles in sortedCandles without division-by-zero in logicalToScreen 1ms
   ✓ Challenger M2-2: ChartContainer, ProviderSettings & App Behavior Hardening Suite > 6. Adversarial Stress & Failure Mode Mining > blocks polling during non-standard tab visibility states (prerender, unloaded) 1ms
   ✓ Challenger M2-2: ChartContainer, ProviderSettings & App Behavior Hardening Suite > 6. Adversarial Stress & Failure Mode Mining > safely handles empty watchlist tickers without triggering empty refreshQuotes 1ms

Test Files  1 passed (1)
     Tests  23 passed (23)
  Duration  1.54s
```

### 1.2 Full Suite, Typecheck, and Production Build
1. `npm run typecheck` (`tsc --noEmit`):
   ```
   > marketview@0.1.0 typecheck
   > tsc --noEmit
   ```
   Exited with code 0 (clean, zero type errors).

2. `npx vitest run src/features/chart/`:
   ```
   Test Files  4 passed (4)
        Tests  32 passed (32)
     Duration  1.62s
   ```
   All chart and overlay tests pass without failure.

3. `npm run build` (`tsc --noEmit && vite build`):
   ```
   ✓ 1651 modules transformed.
   dist/index.html                          0.99 kB │ gzip:   0.51 kB
   dist/assets/index-DWn_JIN_.css          58.32 kB │ gzip:   9.54 kB
   dist/assets/vendor-react-BCZM_5LK.js     4.22 kB │ gzip:   1.58 kB
   dist/assets/vendor-icons-BtFhr7dx.js    29.18 kB │ gzip:   7.70 kB
   dist/assets/vendor-charts-BLo8nw8v.js  173.95 kB │ gzip:  56.13 kB
   dist/assets/index-CgHEzB7d.js          433.67 kB │ gzip: 121.29 kB
   ✓ built in 2.55s
   ```
   Exited with code 0.

### 1.3 Verbatim Code Review

1. **`ChartContainer.tsx` (Hover Deduplication, Lines 662–686)**:
   ```typescript
   onMouseMove={(e) => {
     const rect = e.currentTarget.getBoundingClientRect();
     const cursorX = e.clientX - rect.left;
     const nearest = findNearestHoverPoint(cursorX, hoverCandidatesRef.current);
     const prev = activeHoverPointRef.current;
     const isSame =
       prev === nearest ||
       (prev !== null &&
         nearest !== null &&
         prev.timestamp === nearest.timestamp &&
         prev.price === nearest.price &&
         prev.source === nearest.source &&
         prev.x === nearest.x &&
         prev.y === nearest.y);
     if (!isSame) {
       activeHoverPointRef.current = nearest;
       setActiveHoverPoint(nearest);
     }
   }}
   onMouseLeave={() => {
     if (activeHoverPointRef.current !== null) {
       activeHoverPointRef.current = null;
       setActiveHoverPoint(null);
     }
   }}
   ```
   - Deduplication uses full property value comparison (`timestamp`, `price`, `source`, `x`, `y`) ensuring that newly allocated candidate objects with identical values do not trigger redundant state updates.
   - `onMouseLeave` checks `activeHoverPointRef.current !== null` preventing duplicate null dispatches.

2. **`ChartContainer.tsx` (Loading Backdrop, Lines 776–782)**:
   ```typescript
   {/* Loading Indicator */}
   {isLoading && sortedCandles.length === 0 && (
     <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-slate-950/40 backdrop-blur-[1px]">
       <div className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-300 shadow-lg">
         Syncing {ticker} ({timeframe}) OHLCV series...
       </div>
     </div>
   )}
   ```
   - Gated strictly by `isLoading && sortedCandles.length === 0`.
   - When cached or existing candles are present (`sortedCandles.length > 0`), background candle refetches render zero blocking backdrop.

3. **`ChartContainer.tsx` (Coordinate Projection Division-by-Zero Guard, Lines 601–615)**:
   ```typescript
   if (leftCandle && rightCandle) {
     if (leftCandle === rightCandle || leftCandle.timestamp === rightCandle.timestamp) {
       const coord = timeScale.timeToCoordinate(leftCandle.timestamp as UTCTimestamp);
       x = coord !== null ? Number(coord) : null;
     } else {
       const x1 = timeScale.timeToCoordinate(leftCandle.timestamp as UTCTimestamp);
       const x2 = timeScale.timeToCoordinate(rightCandle.timestamp as UTCTimestamp);
       if (x1 !== null && x2 !== null) {
         const fraction =
           (anchor.timestamp - leftCandle.timestamp) /
           (rightCandle.timestamp - leftCandle.timestamp);
         x = Number(x1) + fraction * (Number(x2) - Number(x1));
       }
     }
   }
   ```
   - When fallback occurs for exact bar matches (`leftCandle === rightCandle` or `leftCandle.timestamp === rightCandle.timestamp`), it returns the bar coordinate directly without dividing by `(right.timestamp - left.timestamp)`. This prevents `0 / 0 = NaN`.

4. **`App.tsx` (Visibility-Aware Polling, Lines 257–272)**:
   ```typescript
   useEffect(() => {
     const intervalSec = savedPreferences.pollIntervalSec;
     if (intervalSec <= 0) return;

     const intervalId = setInterval(() => {
       if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
         void marketStore.getState().refreshActiveCandles();
         const currentTickers = activeWatchlist?.tickers ?? [activeTicker];
         if (currentTickers.length > 0) {
           void marketStore.getState().refreshQuotes(currentTickers);
         }
       }
     }, intervalSec * 1000);

     return () => clearInterval(intervalId);
   }, [savedPreferences.pollIntervalSec, marketStore, activeTicker, activeWatchlist]);
   ```
   - Auto-polling registers a timer only when `pollIntervalSec > 0`.
   - Polling tick execution verifies `document.visibilityState === 'visible'`. When tab is hidden, network/store calls are halted.

---

## 2. Logic Chain

1. **Hover State Deduplication**:
   - *Observation*: During mouse movement across the chart canvas, hundreds of `mousemove` events fire every second.
   - *Reasoning*: By comparing the resolved `nearest` candidate against `activeHoverPointRef.current` across reference identity AND field values (`timestamp`, `price`, `source`, `x`, `y`), movements within a candle's snap zone trigger zero dispatches to `setActiveHoverPoint`.
   - *Result*: `ChartContainer`, `IndicatorToolbar`, and `OverlayCanvas` do not re-render while the cursor jitters inside the same bar's snap zone.

2. **Loading Backdrop Invariance**:
   - *Observation*: Previously, refreshing or switching tickers with cached data caused a momentary loading overlay to flash over existing chart data.
   - *Reasoning*: Conditioning the overlay on `isLoading && sortedCandles.length === 0` ensures that once candles are loaded, background refreshes remain entirely transparent to the user. Initial cold loads still display the helpful `"Syncing {ticker} ({timeframe}) OHLCV series..."` spinner.

3. **Exact Bar Coordinate Projection Safety**:
   - *Observation*: Lightweight Charts can return `null` from `timeScale().timeToCoordinate()` for timestamps during initial data loads, off-market hours, or non-trading periods.
   - *Reasoning*: Falling back to `findSurroundingCandles` locates bounding bars. Guarding `leftCandle.timestamp === rightCandle.timestamp` ensures that exact matches do not evaluate `(anchor.timestamp - left.timestamp) / (right.timestamp - left.timestamp)` which produces `0 / 0 = NaN`. Coordinates remain strictly finite numbers.

4. **Background Rate Limit Protection via Visibility Gating**:
   - *Observation*: Polling in background tabs exhausts free-tier API rate limits (e.g. 60 req/min on Finnhub).
   - *Reasoning*: Checking `document.visibilityState === 'visible'` pauses background fetches while preserving the configured cadence when the user returns to the tab.

---

## 3. Caveats

1. **Overlay Plugin Click Defect (Reported by Peer Challenger M2-1)**:
   - Challenger M2-1 identified that in `TrendlinePlugin.tsx`, `FibonacciPlugin.tsx`, and `StickerPlugin.tsx`, clicking without mouse movement triggers an unnecessary `onUpdate` commit because `dragAnchorsRef.current` is initialized unconditionally on `mousedown`.
   - This defect belongs to the overlay plugin layer (`src/features/chart/overlays/plugins/`) assigned to Challenger M2-1, not the `ChartContainer.tsx` / `App.tsx` container layer assigned to Challenger M2-2.
   - In accordance with agent boundaries, this Challenger did NOT modify overlay plugin code.

2. **Hardware Acceleration in Headless Tests**:
   - Vitest runs in Node.js where real GPU WebGL contexts and canvas layout engines are mocked or absent. Synthetic coordinate projections were rigorously validated with mathematical invariants, finite range assertions, and division-by-zero proofs.

---

## 4. Conclusion & Verdict

**Verdict**: **APPROVE** (for assigned scope `ChartContainer.tsx`, `ProviderSettingsPopover.tsx`, and `App.tsx` polling).

- `ChartContainer.tsx` hover deduplication functions with 100% mathematical fidelity.
- Loading overlay renders strictly when required on empty cold loads, eliminating flicker on warm refreshes.
- Coordinate projection handles exact candle timestamps, boundary timestamps, off-bar timestamps, and duplicate timestamps with zero NaN or division-by-zero errors.
- Background polling respects `document.visibilityState === 'visible'` and supports all required intervals (`Off`, `15s`, `1m`, `5m`).
- All 23 tests in `src/test/challenger-m2-2-stress.test.ts` pass; TypeScript typecheck and Vite build pass with zero errors.

---

## 5. Verification Method

To independently verify this report:

1. **Run Challenger M2-2 Stress Test Suite**:
   ```bash
   npx vitest run src/test/challenger-m2-2-stress.test.ts
   ```
   *Expected output*: 23 passed (23), duration ~1.5s, 0 failures.

2. **Run Chart Layer Tests**:
   ```bash
   npx vitest run src/features/chart/
   ```
   *Expected output*: 4 test files passed (32 tests passed), 0 failures.

3. **Run TypeScript Check**:
   ```bash
   npm run typecheck
   ```
   *Expected output*: `tsc --noEmit` exits with code 0.

4. **Run Production Bundle Build**:
   ```bash
   npm run build
   ```
   *Expected output*: `vite build` completes with exit code 0.
