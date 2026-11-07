# Specification Mining Report: Milestone 15 — Performance & Behavior Hardening

**Author**: Spec Miner (Survey)  
**Date**: 2026-11-07T17:32:00Z  
**Target Specification**: `docs/specs/milestone-15-performance-and-behavior-hardening.md`  
**Request Reference**: `.agents/teamwork/ORIGINAL_REQUEST.md` (Section `## 2026-11-07T17:24:58Z`)  
**Scope**: Full feature extraction for Requirements R1 through R5, interface contracts, acceptance criteria, edge cases, and test requirements.

---

## Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| F1 | R1: Overlay Drag | Trendline Drag Buffering | Buffer handle and line dragging coordinates in local component state (`dragAnchors`, `dragAnchorsRef`) during `mousemove` at 60fps; invoke `onUpdate({ anchors })` exactly once on `mouseup` | User mouse dragging on handles (0 or 1) or line body | Ephemeral visual update via `dragAnchors` without store writes; single `onUpdate` commit on release | If coordinates cannot be projected to logical anchors, drag update is ignored; unmount/blur cleans up event listeners | Spec §1.1.1, §3.2.1, Manifest #8, `TrendlinePlugin.tsx:78-138` |
| F2 | R1: Overlay Drag | Trendline JSX Attribute Cleanup | Remove invalid JSX `style-custom` attribute on Anchor 1 handle element | DOM props in JSX | Valid HTML/SVG DOM markup | React console warnings eliminated | Spec §3.2.1, Manifest #8, `TrendlinePlugin.tsx:195` |
| F3 | R1: Overlay Drag | Fibonacci Drag Buffering | Buffer handle and zone dragging coordinates in local state (`dragAnchors`, `dragAnchorsRef`) during `mousemove`; invoke `onUpdate({ anchors })` once on `mouseup` | User mouse dragging on 0% / 100% handles or zone fill / diagonal body | Ephemeral visual update via `dragAnchors`; single `onUpdate` commit on release | Skips unprojectable screen coordinates; cleans up listeners on `mouseup` | Spec §1.1.1, §3.2.2, Manifest #9, `FibonacciPlugin.tsx:110-176` |
| F4 | R1: Overlay Drag | Sticker Drag Buffering | Buffer sticker pin and header dragging in local state (`dragAnchor`, `dragAnchorRef`); invoke `onUpdate({ anchors: [dragAnchor] })` once on `mouseup` | Mouse drag on pin icon or grip handle | Instant visual translation without store write; single `onUpdate` commit on release | Ignores unprojectable screen coordinates; cleans up listeners on `mouseup` | Spec §1.1.1, §3.2.3, Manifest #7, `StickerPlugin.tsx:94-116` |
| F5 | R1: Keystroke Persistence | Sticker Textarea Debouncing | Keep `<textarea>` value in synchronous local state (`localText`); debounce `onUpdate({ payload: { markdown } })` by 250ms via timer ref; flush immediately on `onBlur` or unmount | Character typing events in note `<textarea>` | Immediate textarea text update; debounced store & repository write (250ms) | Pending uncommitted keystrokes flushed on blur or unmount so edits are never lost | Spec §1.1.2, §3.2.3, Manifest #7, `StickerPlugin.tsx:227-236` |
| F6 | R2: Technical Indicators | Single-Pass Indicator Engine | `computeAllChartIndicators(candles)` calculates SMA 20, EMA 50, VWAP, RSI 14, BB 20, and summary in a single pass over sorted candles | `candles: OHLCVCandle[]` | `ComputedChartIndicators` (`sma20`, `ema50`, `vwap`, `rsi14`, `bb20`, `summary`) | Returns empty arrays and null summary for empty input or non-finite candles without throwing | Spec §1.1.4, §2.1, Manifest #1, `technicalIndicators.ts` |
| F7 | R2: Coordinate Lookup | Binary Search Surrounding Candles | `findSurroundingCandles(sortedCandles, timestamp)` uses $O(\log N)$ binary search to find bounding `{ left, right }` candles for off-bar timestamp interpolation | `sortedCandles: ReadonlyArray<T>`, `targetTimestamp: number` | `{ left: T \| null, right: T \| null }` | Returns `{ left: null, right: null }` for empty arrays; handles out-of-bounds timestamps | Spec §1.1.4, §2.1, Manifest #1, `technicalIndicators.ts` |
| F8 | R2: Rendering Optimization | Single-Pass Indicator Memoization in Chart | Replace redundant separate indicator calculations in `ChartContainer` with single memoized `computeAllChartIndicators(sortedCandles)` call | `sortedCandles` dependency | Precomputed indicator series for chart series and summary | Avoids redundant duplicate passes on candle updates | Spec §1.1.4, §3.1, Manifest #11, `ChartContainer.tsx:99-102, 318-352` |
| F9 | R2: Coordinate Lookup | $O(\log N)$ Interpolation in CoordinateProjector | Replace $O(N)$ linear scan in `projector.logicalToScreen` with `findSurroundingCandles(sortedCandles, anchor.timestamp)` | `anchor: LogicalAnchor` | `ScreenPoint \| null` (`{ x, y }`) | Smooth linear interpolation between bounding candles; snaps if single side found | Spec §1.1.4, §3.1, Manifest #11, `ChartContainer.tsx:608-634` |
| F10 | R2: Rendering Optimization | Deduplicated Hover Tracker State | Store `activeHoverPoint` directly in state; in `onMouseMove`, compute candidate via `findNearestHoverPoint` and update state ONLY when candidate actually changes | Mouse move event on chart canvas | State update occurs only when snapped bar index/point changes; zero re-renders within same snap zone | Clears on `onMouseLeave`; ignores non-finite coordinates | Spec §1.1.3, §3.1, Manifest #11, `ChartContainer.tsx:86, 578-584, 674-678` |
| F11 | R2: Rendering Optimization | Non-Blocking Chart Loading Backdrop | Display blocking `"Syncing {ticker} ({timeframe}) OHLCV series..."` overlay ONLY when `isLoading && sortedCandles.length === 0` | `isLoading: boolean`, `sortedCandles.length` | Render overlay conditional JSX | Prevents full-screen loading flash over existing rendered candles during background refresh | Spec §1.1.9, §3.1, Manifest #11, `ChartContainer.tsx:768-774` |
| F12 | R3: Cloud Sync Isolation | Cloud Content Hash Isolation | Exclude `activeIndicators` and `pollIntervalSec` from `computeWorkspaceContentHash` preferences projection | `snapshot: WorkspaceBackup` | Deterministic FNV-1a 32-bit hex hash string | View and indicator toggles never alter hash or mark workspace dirty | Spec §1.1.5, §2.3, Manifest #3, `workspaceExport.ts:451-459` |
| F13 | R3: Cloud Sync Isolation | Local Preference Preservation on Multi-Device Merge | On initialized devices (`hasSyncedBefore === true`), preserve local `activeIndicators` and `pollIntervalSec` during `mergeWorkspaceSnapshots` | `local: WorkspaceBackup`, `remote: WorkspaceBackup`, `nowSec?: number` | Merged `WorkspaceBackup` | Keeps device-specific view settings while merging domain entities (watchlists, annotations, tombstones) | Spec §1.1.5, §2.3, Manifest #3, `workspaceExport.ts:290-312` |
| F14 | R4: Minimalist Toolbar | Minimalist Chart Toolbar Default | Default `showAdvancedTools = false` in `ChartToolbar.tsx` and pass `showAdvancedTools={false}` in `src/App.tsx`; show only Pointer, Sticker, and Trendline | Props or default state | Renders 3 minimalist buttons; hides Fibonacci and Trade Marker | Buttons cleanly excluded from DOM | Spec §1.1.6, §3.2.4, Manifest #10 & #13, `ChartToolbar.tsx:19`, `App.tsx:928` |
| F15 | R4: Polling Interval | Extended Live Poll Interval Schema | Add `60` (1m) and `300` (5m) to `LivePollIntervalSchema` alongside `0`, `5`, `15`, `30` | Number literal | Validated `LivePollInterval` (0 \| 5 \| 15 \| 30 \| 60 \| 300) | Throws Zod error for unsupported intervals | Spec §1.1.7, §2.2, Manifest #2, `preferences.ts:8-14` |
| F16 | R4: Polling UI | Relaxed Auto-Refresh Options in Popover | Offer `[0, 15, 60, 300]` in `ProviderSettingsPopover.tsx` with labels `'Off'`, `'15s'`, `'1m'`, `'5m'` and clean status readout | `pollIntervalSec: LivePollIntervalSec` | Rendered interval buttons with active indicator and status text | Disables interval on `0` ('Paused') | Spec §1.1.7, §3.3.1, Manifest #12, `ProviderSettingsPopover.tsx:14-16, 243-267` |
| F17 | R4: Polling Execution | Visibility-Aware Auto-Refresh Polling | In `src/App.tsx`, run `setInterval` (`pollIntervalSec * 1000`) when `pollIntervalSec > 0` refreshing active candles and watchlist quotes whenever `document.visibilityState === 'visible'` | `savedPreferences.pollIntervalSec`, `visibilitychange` | Automatic background quote and candle refresh | Pauses polling when tab is hidden to conserve API quota and avoid background thrashing | Spec §1.1.7, §3.3.2, Manifest #13, `App.tsx` |
| F18 | R5: Store Consistency | Synchronous Optimistic Annotation Updates | In `annotationStore.ts`, invoke `set(...)` immediately after Zod validation and BEFORE `await repository.saveAnnotations(next)` in `addAnnotation`, `updateAnnotation`, `deleteAnnotation` | Store action inputs (`addAnnotation`, `updateAnnotation`, `deleteAnnotation`) | Immediate store state update followed by async IndexedDB write | If validation fails, throws Zod error synchronously without mutating state | Spec §1.1.8, §2.4.1, Manifest #5, `annotationStore.ts:84-126` |
| F19 | R5: Store Consistency | Synchronous Optimistic Watchlist Updates | In `watchlistStore.ts`, invoke `set(...)` immediately after validation and BEFORE `await repository.saveWatchlists(next)` in all mutators (`createWatchlist`, `renameWatchlist`, `deleteWatchlist`, `addTicker`, `removeTicker`) | Watchlist store mutator inputs | Immediate store state update followed by async IndexedDB write | Rejects invalid names/tickers synchronously via Zod before state update | Spec §1.1.8, §2.4.2, Manifest #6, `watchlistStore.ts:93-169` |
| F20 | R5: Hydration Hardening | Validated `activeWatchlistId` Hydration Fallback | In `watchlistStore.hydrate()`, verify `existing.some((w) => w.id === get().activeWatchlistId)` before retaining `activeWatchlistId`; fallback to `firstId` if invalid/deleted | Loaded watchlists from `repository.getWatchlists()` | Validated active watchlist ID in store state | Gracefully recovers from stale or deleted watchlist IDs | Spec §1.1.8, §2.4.2, Manifest #6, `watchlistStore.ts:55-63` |
| F21 | R5: Hydration Hardening | Idempotent Initial App Hydration Guard | Guard initial hydration `useEffect` in `App.tsx` with `isHydratedRef.current` so token refreshes or auth session transitions never re-trigger initial hydration | App mount, auth session changes | Initial hydration executed strictly once | Prevents state wipes or race conditions on auth token refresh | Spec §1.1.8, §3.3.2, Manifest #13, `App.tsx:127, 185-231` |
| F22 | R5: Hydration Hardening | Post-Hydration Hash Initialization | Initialize `lastSyncedHashRef.current = computeWorkspaceContentHash(...)` immediately upon hydration completion in `App.tsx` | Hydrated stores state | Initialized reference hash | Prevents spurious `isDirty` trigger on initial startup | Spec §1.1.8, §3.3.2, Manifest #13, `App.tsx:226-231` |
| F23 | R5: Hydration Hardening | Post-Import Local Backup Refresh | In `handleImportLocalJson` in `App.tsx`, refresh quotes and validate active ticker after hydrating imported backup | Imported `.json` backup file | Hydrated stores + refreshed active quotes | Prevents stale ticker view after restoring a backup | Spec §1.1.8, §3.3.2, Manifest #13, `App.tsx:773-793` |

---

## Edge Cases

| # | Feature | Input | Observed Behavior |
|---|---------|-------|-------------------|
| E1 | `findSurroundingCandles` | Empty candles array `[]` | Returns `{ left: null, right: null }` without throwing. |
| E2 | `findSurroundingCandles` | Target timestamp before the first candle in sorted series | Returns `{ left: null, right: sortedCandles[0] }`. |
| E3 | `findSurroundingCandles` | Target timestamp after the last candle in sorted series | Returns `{ left: sortedCandles[last], right: null }`. |
| E4 | `findSurroundingCandles` | Target timestamp matches an exact candle timestamp | Returns `{ left: sortedCandles[idx], right: sortedCandles[idx] }` (or `{ left: sortedCandles[idx], right: sortedCandles[idx + 1] ?? null }`). |
| E5 | `findSurroundingCandles` | Target timestamp falls strictly between two candles | Returns `{ left: sortedCandles[i], right: sortedCandles[i+1] }`. |
| E6 | `computeAllChartIndicators` | Fewer than 20 candles | `sma20`, `ema50`, `bb20` are empty arrays; `summary` contains nulls for moving averages and bands; `vwap` and `rsi14` computed if conditions met. |
| E7 | `computeAllChartIndicators` | Between 20 and 49 candles | `sma20`, `bb20`, `vwap`, `rsi14` are populated; `ema50` remains empty array (requires 50 bars). |
| E8 | `computeAllChartIndicators` | Zero-volume candles in series | Skips bars in VWAP until cumulative volume > 0; typical prices on zero-volume bars do not corrupt cumulative values. |
| E9 | `computeAllChartIndicators` | Flat closing prices across all candles | `calculateBollingerBands` upper === middle === lower; RSI returns 50; moving averages equal close price. |
| E10 | Overlay Drag Buffering | Mouse down and up without mouse movement (click-in-place) | `dragAnchors` remains `null`; `mouseup` does not commit corrupted anchors or trigger unnecessary IndexedDB writes. |
| E11 | Overlay Drag Buffering | Mouse dragged outside browser viewport during drag | `window` event listeners capture mouse events; on `mouseup`, commit completes and listeners are removed cleanly. |
| E12 | Sticker Note Debouncing | Rapid typing (>20 characters in under 1 second) | Local state updates synchronously on each keystroke (zero lag); timer resets; single `onUpdate` is fired 250ms after final keystroke. |
| E13 | Sticker Note Debouncing | User types and immediately clicks away (`onBlur`) or closes note before 250ms expires | Pending text is flushed immediately to `onUpdate`, clearing the timer ref, ensuring no keystrokes are lost. |
| E14 | Cloud Content Hash | Toggle indicator between `CANDLES` and `PRICE_15M`, or add `VOLUME` | `computeWorkspaceContentHash` returns identical hash; `isDirty` remains `false`. |
| E15 | Cloud Content Hash | Change auto-refresh interval from `Off` (0) to `1m` (60) | `computeWorkspaceContentHash` returns identical hash; `isDirty` remains `false`. |
| E16 | Multi-Device Snapshot Merge | Remote snapshot has `activeIndicators: ['PRICE_15M']` but local device already synced before with `activeIndicators: ['CANDLES', 'VOLUME']` | Local `activeIndicators` (`['CANDLES', 'VOLUME']`) is preserved; local `pollIntervalSec` is preserved. |
| E17 | Multi-Device Snapshot Merge | First sync on a fresh device (`hasSyncedBefore === false`) | Adopts remote preferences as initial baseline. |
| E18 | Watchlist Hydration | Local storage has watchlists `[wl-1, wl-2]`, but `activeWatchlistId` was set to `wl-deleted` | `hydrate()` falls back to `wl-1` (`firstId`). |
| E19 | Watchlist Hydration | Fresh device with zero watchlists in repository | Seeds default watchlists (`wl-core-leaders`, `wl-high-beta`), sets `activeWatchlistId` to `wl-core-leaders`. |
| E20 | Visibility-Aware Polling | Browser tab minimized or switched to background (`document.visibilityState === 'hidden'`) | Interval ticks do not trigger network fetch or store updates; resumes when user switches back to tab. |
| E21 | Chart Loading Overlay | Switching timeframe or ticker with cached candles already rendered | `sortedCandles.length > 0`, so loading backdrop does NOT display, preventing screen flashing. |

---

## 1. Observation

### Codebase and Specification State
1. **Authoritative Specification**:
   - `docs/specs/milestone-15-performance-and-behavior-hardening.md` (lines 1–205) defines 9 targeted improvements partitioned into Requirements R1 through R5.
   - `.agents/teamwork/ORIGINAL_REQUEST.md` (lines 47–103, section `## 2026-11-07T17:24:58Z`) formalizes the requirements and acceptance criteria.
2. **Current Implementation Deficiencies Observed**:
   - **Trendline Dragging**: In `src/features/chart/overlays/plugins/TrendlinePlugin.tsx:94` and `:126`, `onUpdate({ anchors })` is invoked directly inside `handleMouseMove` on every single pixel. Line 195 contains the invalid JSX attribute `style-custom={{ backgroundColor: payload.color }}`.
   - **Fibonacci Dragging**: In `src/features/chart/overlays/plugins/FibonacciPlugin.tsx:126` and `:165`, `onUpdate({ anchors })` is invoked directly inside `handleMouseMove` on every single pixel.
   - **Sticker Dragging & Typing**: In `src/features/chart/overlays/plugins/StickerPlugin.tsx:105`, `onUpdate({ anchors: [logical] })` is invoked on every pixel. In lines 229–232, `<textarea onChange>` calls `onUpdate({ payload: { markdown: e.target.value } })` on every keystroke without debouncing.
   - **Indicator Redundancy & Coordinate Search**: In `src/features/chart/ChartContainer.tsx:99-102` and `:318-352`, SMA, EMA, VWAP, and Bollinger Bands are calculated repeatedly. In `:608-616`, `projector.logicalToScreen` uses an $O(N)$ linear loop over `sortedCandles`.
   - **Hover Tracker Re-renders**: In `src/features/chart/ChartContainer.tsx:86` and `:674-678`, `hoverCursorX` is set on every 1px move, re-rendering `ChartContainer` and `renderOverlayLayer` at 60Hz even when the snapped candle point is unchanged.
   - **Loading Overlay Flicker**: In `src/features/chart/ChartContainer.tsx:768`, `{isLoading && (` renders a full-screen loading veil over existing candles during background updates.
   - **Cloud Sync Leakage**: In `src/core/serialization/workspaceExport.ts:456-457`, `computeWorkspaceContentHash` includes `pollIntervalSec` and `activeIndicators`. In lines 290–300, `mergeWorkspaceSnapshots` does not preserve `activeIndicators` or `pollIntervalSec` on initialized devices.
   - **Toolbar Advanced Tools**: In `src/features/chart/overlays/ChartToolbar.tsx:19`, `showAdvancedTools = true` by default. In `src/App.tsx:928`, `showAdvancedTools={true}` is explicitly passed.
   - **Poll Intervals**: In `src/core/schemas/preferences.ts:8-13`, `LivePollIntervalSchema` only accepts `0 | 5 | 15 | 30`. In `src/ui/providers/ProviderSettingsPopover.tsx:14-16`, options are restricted to `[0, 5, 15, 30]`. `src/App.tsx` has no auto-refresh polling timer.
   - **Store Mutation Latency**: In `src/core/stores/annotationStore.ts:85-89, 115-116, 121-126` and `src/core/stores/watchlistStore.ts:94-98, 113-114, 124-130, 150-151, 168-169`, `set(...)` is called asynchronously after `await repository.save*()`.
   - **Watchlist Stale ID**: In `src/core/stores/watchlistStore.ts:59`, `activeWatchlistId: get().activeWatchlistId || firstId` does not check if `get().activeWatchlistId` still exists in `existing`.
   - **App Hydration Guard & Quotes Refresh**: In `src/App.tsx:185-240`, initial hydration is not guarded by `isHydratedRef.current` and does not set `lastSyncedHashRef.current`. In `:773-793`, `handleImportLocalJson` does not refresh active quotes.
3. **Current Test Baseline**:
   - `npm run test` executes 29 test files, 331 tests passing cleanly (Exit 0).
   - `npm run typecheck` passes with zero errors (Exit 0).

---

## 2. Logic Chain

1. **Overlay Drag Performance (R1)**:
   - When a user drags an annotation handle or line, mouse events fire at 60–120Hz.
   - Directly calling `onUpdate({ anchors })` in `mousemove` dispatches to `annotationStore.updateAnnotation`, triggering Zod schema parsing, async IndexedDB writes, full App re-rendering, and workspace hash computation on every pixel.
   - By buffering the dragging coordinates in local component state (`dragAnchors` / `dragAnchor`), the overlay renders the transformed SVG/HTML coordinates at 60fps with zero store mutations or I/O.
   - Committing `onUpdate({ anchors })` once on `mouseup` ensures persistence happens exactly once per gesture.
2. **Sticker Textarea Lag Elimination (R1)**:
   - Keystrokes in `<textarea>` must feel immediate (0 latency). Calling async store updates per character introduces typing lag and race conditions between store hydration and local component state.
   - Managing `localText` synchronously and debouncing `onUpdate` by 250ms batches rapid typing into a single update.
   - Flushing pending changes on `onBlur` or unmount prevents data loss if the user switches focus or closes the card before 250ms elapses.
3. **Indicator Calculation & Coordinate Lookup Hardening (R2)**:
   - Technical indicators (SMA 20, EMA 50, VWAP, RSI 14, Bollinger Bands) all iterate over the same ascending `sortedCandles`.
   - Computing them once via `computeAllChartIndicators` in a single pass eliminates redundant array sorting, validation, and multi-pass traversal.
   - For chart coordinate projection of off-bar timestamps, an $O(N)$ linear scan degrades as candle counts increase. Ascending timestamps are ordered; therefore, an $O(\log N)$ binary search (`findSurroundingCandles`) reduces search steps to at most $\lceil \log_2(1000) \rceil \approx 10$ comparisons.
   - In `ChartContainer`, cursor mouse move within a candle's snap zone resolves to the same nearest candidate. Storing `activeHoverPoint` directly and updating state only when the snapped candidate changes reduces React re-render frequency from 60Hz to only when crossing bar boundaries.
4. **Cloud Sync Isolation (R3)**:
   - User preferences like `activeIndicators` (e.g. toggling Volume or Price 15m) and `pollIntervalSec` are viewport/session preferences, not domain data.
   - Including them in `computeWorkspaceContentHash` falsely marks the cloud workspace dirty (`isDirty = true`) when navigating or toggling an indicator.
   - Stripping them from `computeWorkspaceContentHash` and preserving them in `mergeWorkspaceSnapshots` on initialized devices guarantees that multi-device sync synchronizes only true domain data (watchlists, notes, drawings, tombstones, API keys) without overriding a device's active view configuration.
5. **Minimalist Toolbar & Polling (R4)**:
   - Day-trading tools (`Fib` and `Trade Marker`) add cognitive clutter to a minimalist swing/position trading workflow. Setting `showAdvancedTools={false}` keeps the toolbar focused on Pointer, Sticker, and Trendline.
   - Relaxing auto-polling to include `1m` (60s) and `5m` (300s) aligns with long-term monitoring while preventing rate-limit exhaustion.
   - Implementing a visibility-aware timer (`document.visibilityState === 'visible'`) avoids burning API quota when tabs are in the background.
6. **Store Consistency & Hydration (R5)**:
   - Asynchronous store updates (`await repository.save*()` followed by `set()`) introduce read-modify-write race conditions when multiple actions are fired in quick succession. Calling `set()` synchronously immediately updates in-memory Zustand state so subsequent calls read consistent state.
   - Checking `existing.some((w) => w.id === currentId)` in `watchlistStore.hydrate()` guarantees that if an active watchlist was deleted on another device or prior session, the store safely falls back to `firstId`.
   - Guarding initial hydration with `isHydratedRef.current` ensures token refreshes or Firebase auth transitions do not trigger unexpected store re-hydrations.

---

## 3. Caveats

1. **No Source Modifications**:
   - As Specification Miner, this role is strictly read-only. No source files or tests were modified in this phase.
2. **Backward Compatibility**:
   - `LivePollIntervalSchema` retains `0`, `5`, `15`, `30` alongside new values `60` and `300` to ensure existing preferences in IndexedDB or existing unit tests continue to parse without schema errors.
   - `FibonacciPlugin` and `TradeMarkerPlugin` remain registered in `overlayPluginRegistry` and present in the codebase; they are simply hidden from the toolbar UI when `showAdvancedTools === false`.
3. **No Unprobed Requirements**:
   - All 5 requirements (R1 through R5) have been traced from `ORIGINAL_REQUEST.md` to `milestone-15-performance-and-behavior-hardening.md` and mapped to existing codebase locations.

---

## 4. Conclusion

Milestone 15 performance and app behavior hardening is thoroughly specified with 23 itemized features across 5 core requirements:
- **R1**: Local drag buffering (`dragAnchors`, `dragAnchor`) for 60fps rendering in Trendline, Fibonacci, and Sticker overlays; 250ms debounced `<textarea>` persistence in Sticker with `onBlur`/unmount flush; removal of invalid `style-custom` attribute.
- **R2**: Pure `computeAllChartIndicators` single-pass indicator engine and $O(\log N)$ `findSurroundingCandles` binary search helper; memoization and deduplicated hover point tracking in `ChartContainer`; non-blocking loading overlay backdrop.
- **R3**: Strict cloud sync isolation in `workspaceExport.ts` by removing `activeIndicators` and `pollIntervalSec` from content hash calculation and preserving local values on multi-device merge.
- **R4**: Minimalist toolbar defaulting to Pointer, Sticker, and Trendline (`showAdvancedTools = false`); `LivePollIntervalSchema` extended to `60` and `300`; selectable `Off`, `15s`, `1m`, `5m` options in settings popover; visibility-aware auto-refresh timer in `App.tsx`.
- **R5**: Optimistic synchronous `set(...)` calls in `annotationStore` and `watchlistStore`; fallback to `firstId` on invalid `activeWatchlistId` in `watchlistStore.hydrate()`; idempotent initial hydration guard and quote refresh in `App.tsx`.

The target files and test files are fully identified and verified against existing baselines.

---

## 5. Verification Method

### Independent Verification Commands
1. **Type Safety Verification**:
   ```bash
   npm run typecheck
   ```
   *Expected outcome*: Exits with code 0 and zero TypeScript compiler errors.
2. **Test Suite Verification**:
   ```bash
   npm run test
   ```
   *Expected outcome*: All existing 29 test suites (331 tests) plus newly added unit tests for `findSurroundingCandles`, `computeAllChartIndicators`, hash invariance, and store hydration pass with zero failures.
3. **Targeted Unit Test Verification**:
   ```bash
   npx vitest run src/core/__tests__/technical-indicators.test.ts
   npx vitest run src/core/__tests__/firebase-sync-and-gc.test.ts
   npx vitest run src/core/__tests__/watchlist-store.test.ts
   npx vitest run src/core/__tests__/annotation-store.test.ts
   npx vitest run src/features/chart/__tests__/chart-autoscale-and-toolbar.test.ts
   ```
4. **Production Build Verification**:
   ```bash
   npm run build
   ```
   *Expected outcome*: Vite compiles production bundle into `dist/` cleanly.

### Invalidation Conditions
- Any occurrence of `annotationStore.updateAnnotation` or IndexedDB writes during `mousemove` in overlay drag operations.
- Failure of `computeWorkspaceContentHash` to produce identical hashes when toggling indicators or changing poll intervals.
- `ChartToolbar` rendering `Fib` or `Trade Marker` buttons when `showAdvancedTools` is omitted or false.
- Failure of `findSurroundingCandles` to return correct bounding candles or handle edge cases (empty array, out-of-bounds timestamps).
- Runtime type errors or regressions in existing tests.
