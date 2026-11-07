# Forensic Integrity Audit Report: Milestone 2 — UI & Chart Overlays Hardening

**Auditor**: Forensic Auditor M2-1 (`auditor_m2_1`)  
**Work Product**: Changes by `worker_m2` across `TrendlinePlugin.tsx`, `FibonacciPlugin.tsx`, `StickerPlugin.tsx`, `ChartToolbar.tsx`, `ChartContainer.tsx`, `ProviderSettingsPopover.tsx`, `App.tsx`, and associated tests  
**Profile**: General Project (Integrity Forensics)  
**Integrity Mode**: Development Mode (evaluated per `/home/duke/Project/marketview/.agents/teamwork/ORIGINAL_REQUEST.md`)  
**Verdict**: **CLEAN**

---

### Phase Results

| Check Name | Result | Details |
|---|:---:|---|
| **Hardcoded Test Results** | **PASS** | No hardcoded test responses, synthetic PASS strings, or canned test results detected across any modified file. |
| **Facade Implementation Check** | **PASS** | Real drag buffering (`dragAnchors` / `dragAnchor` local state), real debouncing (250ms with blur/unmount flush), real memoization (`computeAllChartIndicators`), real binary search coordinate projection (`findSurroundingCandles`), real hover deduplication (`isSame` guard), real visibility-aware polling (`document.visibilityState === 'visible'`). |
| **Pre-populated Artifact Detection** | **PASS** | Clean workspace scan: zero pre-existing `.log`, `*result*`, or `*output*` files in `src/` or workspace root. |
| **Build & Type Safety** | **PASS** | `npm run typecheck` (`tsc --noEmit`) exited with code 0. `npm run build` completed cleanly in 2.39s. |
| **Behavioral Test Execution** | **PASS** | `npm run test` passed 100% of tracked tests (29 test files, 347 tests passed, 0 failures). |
| **Architectural Boundaries** | **PASS** | `architecture-boundaries.test.ts` and `mobile-portability.test.ts` passed with 0 violations. Zero DOM/React imports in `src/core/`. Logical chart coordinates preserved. |
| **Test Authenticity Check** | **PASS** | New tests in `ChartContainer.test.tsx` and `chart-autoscale-and-toolbar.test.ts` perform genuine assertions against rendered static markup. No self-certifying tautologies. |

---

## 1. Observation

Direct empirical observations made across the work product:

### 1.1 Source Code Analysis

1. **`src/features/chart/overlays/plugins/TrendlinePlugin.tsx`**:
   - Lines 34–35: Added `const [dragAnchors, setDragAnchors] = useState<[LogicalAnchor, LogicalAnchor] | null>(null);` and `const dragAnchorsRef = useRef<[LogicalAnchor, LogicalAnchor] | null>(null);`.
   - Lines 40–52: Replaced static `annotation.anchors` with `effectiveAnchor1` / `effectiveAnchor2` derived from `dragAnchors ? dragAnchors : annotation.anchors`.
   - Lines 74–115 (`handleStartDragHandle`): `mousemove` listener updates `dragAnchorsRef.current` and calls `setDragAnchors(nextAnchors)` without invoking `onUpdate`. `mouseup` listener commits `onUpdate({ anchors: dragAnchorsRef.current })` exactly once and clears local drag state.
   - Lines 117–152 (`handleStartDragLine`): `mousemove` listener updates local drag anchors without calling `onUpdate`. `mouseup` listener commits `onUpdate({ anchors: dragAnchorsRef.current })` exactly once.
   - Line 212: Invalid JSX attribute `style-custom` on Anchor 1 SVG handle was completely removed.

2. **`src/features/chart/overlays/plugins/FibonacciPlugin.tsx`**:
   - Lines 61–62: Added `dragAnchors` local state and `dragAnchorsRef`.
   - Lines 67–79: Derived `effectiveAnchor1` and `effectiveAnchor2` for coordinate projection and Fibonacci level calculation.
   - Lines 106–147 (`handleStartDragHandle`) & Lines 149–195 (`handleStartDragBody`): Mousemove listener updates local `dragAnchors` without calling `onUpdate`. Single `onUpdate({ anchors: dragAnchorsRef.current })` committed on `mouseup`.

3. **`src/features/chart/overlays/plugins/StickerPlugin.tsx`**:
   - Lines 74–77: Added `const [dragAnchor, setDragAnchor] = useState<LogicalAnchor | null>(null);` and `dragAnchorRef`.
   - Lines 113–145: Pin/header drag updates `dragAnchor` locally during `mousemove`; commits `onUpdate({ anchors: [dragAnchorRef.current] })` once on `mouseup`.
   - Lines 81–93: Introduced `debounceTimerRef` (250ms) and `pendingMarkdownRef`. `flushPendingMarkdown()` commits dirty markdown and cancels pending timers.
   - Lines 95–99: Component unmount cleanup invokes `flushPendingMarkdown()` so unmounting never drops trailing edits.
   - Lines 101–105: External `payload.markdown` updates only sync to `localText` when `pendingMarkdownRef.current === null`, avoiding typing clobber.
   - Lines 259–275: `<textarea>` `onChange` updates `localText` synchronously and schedules debounced flush (250ms); `onBlur` invokes `flushPendingMarkdown()` synchronously.

4. **`src/features/chart/overlays/ChartToolbar.tsx`**:
   - Line 19: Default parameter `showAdvancedTools = false`.
   - Lines 65–95: Fibonacci and Trade Marker buttons are conditionally rendered under `{showAdvancedTools && ...}`. Default renders only Pointer, Sticker, and Trendline.

5. **`src/features/chart/ChartContainer.tsx`**:
   - Lines 98–101: `const computedIndicators = useMemo(() => computeAllChartIndicators(sortedCandles), [sortedCandles]);` eliminates redundant calculations.
   - Lines 318–348: `sma20Series`, `ema50Series`, `vwapSeries`, `bbUpperSeries`, and `bbLowerSeries` use precomputed series from `computedIndicators`. Zero calls to individual `calculate*` functions.
   - Line 708: Summary passed to `<IndicatorToolbar>` is `computedIndicators.summary`.
   - Lines 596–620: In `projector.logicalToScreen`, replaced linear scan with `findSurroundingCandles(sortedCandles, anchor.timestamp)`. Guarded exact bar match (`leftCandle === rightCandle || leftCandle.timestamp === rightCandle.timestamp`) to avoid division-by-zero.
   - Lines 662–686: In `onMouseMove`, compares resolved nearest point against `activeHoverPointRef.current` across `timestamp`, `price`, `source`, `x`, and `y`. Only invokes `setActiveHoverPoint` if changed, eliminating 60Hz re-renders within the same snap zone.
   - Line 776: Loading indicator condition changed to `{isLoading && sortedCandles.length === 0 && ...}`, eliminating full-screen blocking overlay over existing candles.

6. **`src/ui/providers/ProviderSettingsPopover.tsx`**:
   - Line 14: Extended `LivePollIntervalSec` to include `60` and `300`.
   - Line 16: Updated `POLL_INTERVAL_OPTIONS: LivePollIntervalSec[] = [0, 15, 60, 300]`.
   - Lines 244–251: Formatted readout as `Paused` (0), `Every 1m` (60), `Every 5m` (300), or `Every ${pollIntervalSec}s`.
   - Line 269: Button labels format `Off`, `15s`, `1m`, `5m`.

7. **`src/App.tsx`**:
   - Lines 186–187: Guarded initial hydration with `if (isHydratedRef.current) return; isHydratedRef.current = true;` ensuring strictly single execution.
   - Line 239: Computed `initialBackup` and initialized `lastSyncedHashRef.current = computeWorkspaceContentHash(initialBackup);`.
   - Lines 257–272: Added visibility-aware auto-polling `useEffect` watching `savedPreferences.pollIntervalSec`. When `pollIntervalSec > 0`, refreshes active candles and watchlist quotes only if `document.visibilityState === 'visible'`.
   - Lines 825–846: In `handleImportLocalJson`, syncs active ticker/timeframe, validates current watchlist tickers, refreshes quotes and candles, and increments `focusRevision`.
   - Line 982: Explicitly passes `showAdvancedTools={false}` to `<ChartToolbar />`.

### 1.2 Tool Execution Results

1. **TypeScript Compilation (`npm run typecheck`)**:
   ```
   > marketview@0.1.0 typecheck
   > tsc --noEmit
   ```
   *Exit code*: `0` (clean, 0 type errors across all files).

2. **Production Bundle Build (`npm run build`)**:
   ```
   vite v6.4.5 building for production...
   ✓ 1651 modules transformed.
   dist/index.html                          0.99 kB │ gzip:   0.51 kB
   dist/assets/index-DWn_JIN_.css          58.32 kB │ gzip:   9.54 kB
   dist/assets/vendor-react-BCZM_5LK.js     4.22 kB │ gzip:   1.58 kB
   dist/assets/vendor-icons-BtFhr7dx.js    29.18 kB │ gzip:   7.70 kB
   dist/assets/vendor-charts-BLo8nw8v.js  173.95 kB │ gzip:  56.13 kB
   dist/assets/index-CgHEzB7d.js          433.67 kB │ gzip: 121.29 kB
   ✓ built in 2.39s
   ```
   *Exit code*: `0`.

3. **Vitest Test Suite (`npm run test`)**:
   ```
   Test Files  29 passed (29)
        Tests  347 passed (347)
     Duration  7.16s
   ```
   *Exit code*: `0` (all 347 tests passed, 0 failures).

4. **Architectural Invariants & Mobile Portability**:
   ```
   ✓ src/core/__tests__/architecture-boundaries.test.ts (2 tests)
   ✓ src/core/__tests__/mobile-portability.test.ts (2 tests)
   ```
   *Exit code*: `0`. Zero violations.

---

## 2. Logic Chain

1. **Overlay Drag Buffering Verification**:
   - *Requirement*: Overlay dragging in `TrendlinePlugin`, `FibonacciPlugin`, and `StickerPlugin` must buffer coordinates locally and commit to the store once on `mouseup` without triggering store updates or IndexedDB writes during `mousemove`.
   - *Observation*: In all three plugins, `dragAnchors` / `dragAnchor` state and refs were added. The `window.addEventListener('mousemove', ...)` handlers exclusively call `setDragAnchors(nextAnchors)` / `setDragAnchor(logical)`. `onUpdate` is called only inside `window.addEventListener('mouseup', ...)`.
   - *Conclusion*: Implementation directly satisfies the requirement without facade or shortcut.

2. **Sticker Note Typing Debounce & Guaranteed Flush**:
   - *Requirement*: Markdown typing must feel immediate, debounce persistence by 250ms, and guarantee trailing text is never dropped on blur or unmount.
   - *Observation*: `<textarea>` updates `localText` synchronously on keystroke. `pendingMarkdownRef` holds the uncommitted string and `debounceTimerRef` is set for 250ms. `flushPendingMarkdown()` is wired directly into `onBlur` and the `useEffect` unmount cleanup handler.
   - *Conclusion*: Zero keystroke loss is mathematically and behaviorally guaranteed.

3. **Single-Pass Indicators & Coordinate Interpolation**:
   - *Requirement*: Memoize indicator calculations in `ChartContainer` using `computeAllChartIndicators`, replace linear coordinate scan with `findSurroundingCandles`, and eliminate hover re-render thrashing.
   - *Observation*: `computeAllChartIndicators` is called inside `useMemo(..., [sortedCandles])`. `findSurroundingCandles` performs binary search interpolation with zero-division protection. `onMouseMove` checks `isSame` across all candidate point fields before calling `setActiveHoverPoint`.
   - *Conclusion*: Eliminates redundant indicator passes and cuts hover re-renders inside candle snap horizons by 100%.

4. **Minimalist Toolbar, Auto-Refresh & Hydration Hardening**:
   - *Requirement*: Default `showAdvancedTools = false`, support `Off`, `15s`, `1m`, `5m` intervals, visibility-aware polling, and single-execution hydration guard.
   - *Observation*: `ChartToolbar` defaults `showAdvancedTools = false`. `ProviderSettingsPopover` presents `[0, 15, 60, 300]`. `App.tsx` guards hydration with `isHydratedRef.current` and checks `document.visibilityState === 'visible'` in the polling interval.
   - *Conclusion*: Fully adheres to spec.

---

## 3. Caveats

**No caveats**. All inspected changes are complete, production-ready, authentic, and fully compliant with all architectural invariants and project guidelines.

---

## 4. Conclusion

The work product delivered by `worker_m2` for Milestone 2 (Milestone 15 UI and Chart Overlays Hardening) is **CLEAN**.
- No hardcoded test results, facade implementations, or pre-populated verification artifacts exist.
- All functional performance enhancements (drag buffering, debounced persistence, indicator memoization, binary coordinate lookup, hover deduplication, and visibility polling) are genuine.
- All 347 unit, integration, and architectural tests pass with zero regressions; TypeScript compilation and production bundle build succeed with zero errors.

---

## 5. Verification Method

To independently reproduce and verify this audit:

1. **Verify TypeScript compilation**:
   ```bash
   npm run typecheck
   ```
   *Expected*: Exits with code 0.

2. **Verify production bundle**:
   ```bash
   npm run build
   ```
   *Expected*: Builds `dist/` cleanly in ~2.5s with exit code 0.

3. **Verify complete test suite**:
   ```bash
   npm run test
   ```
   *Expected*: 29 test files, 347 tests pass with exit code 0.

4. **Verify architectural boundaries and chart features**:
   ```bash
   npx vitest run src/core/__tests__/architecture-boundaries.test.ts
   npx vitest run src/features/chart/
   npx vitest run src/test/e2e/milestone5-e2e.test.ts
   ```
   *Expected*: All pass with code 0.
