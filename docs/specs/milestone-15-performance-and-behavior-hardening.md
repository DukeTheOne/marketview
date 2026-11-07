# Vertical Slice Specification: Milestone 15 — Performance & App Behavior Hardening (`milestone-15-performance-and-behavior-hardening`)

## 1. Slice Scope & Architectural Invariants Check

### 1.1 Audit Summary: Performance & Behavioral Improvements
Before moving on to new features, a full-stack audit of `src/core/`, `src/features/chart/`, `src/ui/`, and `src/App.tsx` identified **9 targeted performance and app-behavior improvements** aligned with MarketView's minimalist, long-term strategy mission:

#### A. Performance & Rendering Bottlenecks
1. **60–120Hz IndexedDB & Full-App Re-render Thrashing During Overlay Dragging (`TrendlinePlugin`, `FibonacciPlugin`, `StickerPlugin`)**:
   - Dragging a trendline (or its endpoints) or a sticker pin currently invokes `onUpdate({ anchors })` inside `window.addEventListener('mousemove')` on **every pixel of mouse movement (60–120Hz)**.
   - Every pixel triggers `annotationStore.updateAnnotation()` → Zod schema parsing → an async IndexedDB `readwrite` transaction (`repository.saveAnnotations`) → full `<App />` re-render → `serializeWorkspaceBackup()` + `computeWorkspaceContentHash()` across the entire workspace.
   - **Fix**: Buffer drag coordinates in local component state (`dragAnchors` / `dragAnchor`) during `mousemove` for 60fps zero-I/O visual projection, and commit `onUpdate({ anchors })` **once** on `mouseup`.
2. **Unbuffered Keystroke Persistence in `StickerPlugin` (`<textarea>`)**:
   - Typing in a sticker note calls `onUpdate({ payload: { markdown } })` on every keystroke, triggering an IndexedDB write and workspace hash recalculation per character, while async store updates can race with `localText`.
   - **Fix**: Update `localText` synchronously on every keystroke, debounce `onUpdate({ payload: { markdown } })` by `250ms`, and flush any pending text update on `onBlur` or component unmount.
3. **60Hz Chart Hover Tracker Full-Tree Re-renders (`ChartContainer.tsx`)**:
   - `onMouseMove` updates `hoverCursorX` state on every 1px mouse movement. Even when the nearest snapped hover point (`activeHoverPoint`) is unchanged, changing `hoverCursorX` re-renders `ChartContainer` and re-invokes `renderOverlayLayer()`, re-rendering `ChartToolbar`, `OverlayCanvas`, and all annotation plugins at 60Hz.
   - **Fix**: Resolve `findNearestHoverPoint(cursorX, hoverCandidates)` inside `onMouseMove` and only update state when the snapped point (`timestamp`, `price`, `source`, `x`, `y`) actually changes (or clears on `onMouseLeave`). Moving the cursor within the same bar's snap zone triggers **zero React re-renders**.
4. **Redundant Double Indicator Calculation & Linear `O(N)` Coordinate Lookup (`ChartContainer.tsx` & `technicalIndicators.ts`)**:
   - On every candle series load, `calculateSMA(20)`, `calculateEMA(50)`, `calculateVWAP()`, and `calculateBollingerBands(20, 2)` are computed in `ChartContainer`'s `useEffect` and then computed **a second time** inside `computeChartIndicatorsSummary(sortedCandles)`.
   - Additionally, `projector.logicalToScreen` falls back to an `O(N)` linear scan over `sortedCandles` for off-bar timestamps on every frame.
   - **Fix**: Memoize the computed indicator series once in `ChartContainer` (`computeAllChartIndicators`), and replace the linear scan in `projector.logicalToScreen` with an `O(log N)` binary search (`findSurroundingCandles`).

#### B. Minimalist App Behavior & Sync Isolation
5. **Strict Cloud Sync Isolation — Sync Only Watchlists, Notes, Drawings & API Keys (`workspaceExport.ts`)**:
   - Previously, `computeWorkspaceContentHash` and `mergeWorkspaceSnapshots` still included `activeIndicators` and `pollIntervalSec` in the cloud sync hash and remote preference overwrites.
   - **Fix**: Strip `activeIndicators` and `pollIntervalSec` from `computeWorkspaceContentHash` and preserve local `activeIndicators` and `pollIntervalSec` on initialized devices during `mergeWorkspaceSnapshots`. Cloud Sync strictly tracks **watchlists**, **annotations (stickers/notes & trendlines)**, **tombstones (`deletedIds`)**, and **API credentials (`providerMode`, `finnhubApiKey`, `firebaseApiKey`, `firebaseProjectId`)**. View, timeframe scope, and indicator toggles stay purely local to what the user clicked in their active view.
6. **Hide Unused Advanced Tools (`Fib` & `Trade Marker`) in Minimalist Mode (`App.tsx` & `ChartToolbar.tsx`)**:
   - `App.tsx` previously passed `showAdvancedTools={true}` to `ChartToolbar`, exposing `Fib` and `Trade Marker` buttons that are not part of the minimalist workflow.
   - **Fix**: Set `showAdvancedTools={false}` in `src/App.tsx` (and default `showAdvancedTools = false` in `ChartToolbar.tsx`), keeping only **Pointer**, **Sticker**, and **Trendline** in the toolbar.
7. **Relaxed Long-Term Auto-Polling (`Off`, `15s`, `1m`, `5m`) & Visibility-Aware Timer (`preferences.ts`, `ProviderSettingsPopover.tsx`, `App.tsx`)**:
   - Offer user-selectable auto-refresh intervals: **`Off` (`0`), `15s` (`15`s), `1m` (`60`s), and `5m` (`300`s)**, defaulting to `Off` (`0`).
   - Wire a visibility-aware `useEffect` interval in `App.tsx` so when the user selects `15s`, `1m` or `5m`, quotes and active candles refresh automatically in the background while the tab is visible.
8. **Optimistic Synchronous Store Updates & Validated `activeWatchlistId` Hydration (`annotationStore.ts`, `watchlistStore.ts`, `App.tsx`)**:
   - Call `set(...)` synchronously before `await repository.save*(next)` in `annotationStore` and `watchlistStore` to eliminate concurrent read-modify-write race conditions.
   - In `watchlistStore.hydrate()`, verify `existing.some((w) => w.id === get().activeWatchlistId)` before retaining `get().activeWatchlistId`; otherwise fall back to `firstId`.
   - Guard the initial hydration `useEffect` in `App.tsx` with `isHydratedRef.current` so token refreshes or sign-in/sign-out never re-trigger initial hydration, initialize `lastSyncedHashRef.current` immediately upon hydration, and refresh quotes after `handleImportLocalJson`.
9. **Flicker-Free Chart Loading Backdrop (`ChartContainer.tsx`)**:
   - Render the blocking `"Syncing {ticker} ({timeframe}) OHLCV series..."` overlay only when `isLoading && sortedCandles.length === 0` so background refreshes and cached ticker switches never flash a full-screen overlay over existing candles.

---

### 1.2 Architectural Invariants Check
- [x] **Zero DOM/UI imports in `src/core/`**: Confirmed. Binary search helper, indicator bundle calculator, schema extensions, and store updates in `src/core/` remain 100% pure TypeScript + Zod.
- [x] **All external market data flows through `MarketDataProvider`**: Confirmed. Relaxed `1m` / `5m` background polling in `App.tsx` flows through `marketStore.getState().refreshQuotes()` and `refreshActiveCandles()`.
- [x] **All chart overlays use logical `{ timestamp, price }` coordinates and register via `ChartOverlayPlugin`**: Confirmed. Local drag previews in `StickerPlugin`, `TrendlinePlugin`, and `FibonacciPlugin` store `LogicalAnchor[]` (`{ timestamp, price }`) and project to screen coordinates exclusively at render time.

---

## 2. Headless Core Contracts (`src/core/`)

### 2.1 Precomputed Indicator Series & Binary Search Helper (`src/core/indicators/technicalIndicators.ts`)
Add a single-pass indicator computation helper and an `O(log N)` binary search helper for off-bar timestamp interpolation:

```ts
export interface ComputedChartIndicators {
  sma20: IndicatorPoint[];
  ema50: IndicatorPoint[];
  vwap: IndicatorPoint[];
  rsi14: IndicatorPoint[];
  bb20: BollingerPoint[];
  summary: ChartIndicatorsSummary;
}

/**
 * Computes all standard chart indicator series and the latest readout summary in a single pass
 * over candles, avoiding redundant sorting and duplicate series calculations.
 */
export function computeAllChartIndicators(
  candles: OHLCVCandle[]
): ComputedChartIndicators;

/**
 * O(log N) binary search over ascending-sorted candles to find the bounding
 * [leftCandle, rightCandle] pair for any arbitrary Unix timestamp.
 */
export function findSurroundingCandles<T extends { timestamp: number }>(
  sortedCandles: ReadonlyArray<T>,
  targetTimestamp: number
): { left: T | null; right: T | null };
```

### 2.2 Relaxed Poll Interval Schema (`src/core/schemas/preferences.ts`)
Extend `LivePollIntervalSchema` to include `60` (1 minute) and `300` (5 minutes) while keeping `0`, `5`, `15`, and `30` valid for backward compatibility with existing tests and stored preferences:

```ts
export const LivePollIntervalSchema = z.union([
  z.literal(0),
  z.literal(5),
  z.literal(15),
  z.literal(30),
  z.literal(60),
  z.literal(300),
]);
export type LivePollInterval = z.infer<typeof LivePollIntervalSchema>;
```

### 2.3 Cloud Sync Hash & Merge Isolation (`src/core/serialization/workspaceExport.ts`)
1. In `computeWorkspaceContentHash(snapshot: WorkspaceBackup)`:
   - Exclude `activeIndicators` and `pollIntervalSec` from the `preferences` hash projection so only account/provider credentials (`providerMode`, `finnhubApiKey`, `firebaseApiKey`, `firebaseProjectId`) are hashed alongside `watchlists`, `annotations`, `trades`, `alerts`, and `deletedIds`.
2. In `mergeWorkspaceSnapshots(local, remote, nowSec)`:
   - When `hasSyncedBefore` is `true`, preserve local `activeIndicators` and `pollIntervalSec` alongside `activeTicker`, `activeTimeframe`, `activeWatchlistId`, and `isSidebarCollapsed`.

### 2.4 Synchronous Optimistic Store Updates & Active Watchlist Validation (`src/core/stores/`)
1. **`src/core/stores/annotationStore.ts`**:
   - In `addAnnotation`, `updateAnnotation`, and `deleteAnnotation`, call `set(...)` synchronously immediately after `ChartAnnotationSchema.parse(...)` and before `await repository.saveAnnotations(next)`.
2. **`src/core/stores/watchlistStore.ts`**:
   - In `hydrate()`, validate that `get().activeWatchlistId` exists in `existing`:
     ```ts
     const currentId = get().activeWatchlistId;
     const validActiveId = existing.some((w) => w.id === currentId)
       ? currentId
       : firstId;
     ```
   - In `createWatchlist`, `renameWatchlist`, `deleteWatchlist`, `addTicker`, and `removeTicker`, call `set(...)` synchronously after Zod validation and before `await repository.saveWatchlists(next)`.

---

## 3. UI & Chart Plugin Layer (`src/features/` & `src/ui/`)

### 3.1 `ChartContainer` Performance Hardening (`src/features/chart/ChartContainer.tsx`)
- **Single-Pass Indicator Memoization**:
  - Replace separate `computeChartIndicatorsSummary` + `useEffect` recalculations with `const computedIndicators = useMemo(() => computeAllChartIndicators(sortedCandles), [sortedCandles])`.
- **Zero-Waste Hover Point State**:
  - Update state in `onMouseMove` only when the snapped `ProjectedHoverPoint` (`timestamp`, `source`, `x`, `y`) actually changes, avoiding 60Hz re-renders of `ChartContainer` and `OverlayCanvas` when moving within the same bar's snap zone.
- **`O(log N)` Coordinate Interpolation**:
  - Use `findSurroundingCandles(sortedCandles, anchor.timestamp)` in `projector.logicalToScreen`.
- **Flicker-Free Loading Banner**:
  - Render the `"Syncing {ticker} ({timeframe}) OHLCV series..."` overlay only when `isLoading && sortedCandles.length === 0`.

### 3.2 Zero-Thrash Drag Buffering & Debounced Typing in Overlay Plugins (`src/features/chart/overlays/`)
1. **`TrendlinePlugin.tsx`**:
   - Maintain `const [dragAnchors, setDragAnchors] = useState<[LogicalAnchor, LogicalAnchor] | null>(null)` and `dragAnchorsRef`.
   - During `handleStartDragHandle` and `handleStartDragLine`, update `setDragAnchors` on `mousemove` without calling `onUpdate`.
   - On `mouseup`, commit `onUpdate({ anchors: dragAnchorsRef.current })` once and clear `dragAnchors`.
   - Fix invalid JSX attribute `style-custom` on Anchor 1 handle.
2. **`FibonacciPlugin.tsx`**:
   - Maintain `const [dragAnchors, setDragAnchors] = useState<[LogicalAnchor, LogicalAnchor] | null>(null)` and `dragAnchorsRef`.
   - During `handleStartDragHandle` and `handleStartDragBody`, update `setDragAnchors` on `mousemove` and commit `onUpdate({ anchors: dragAnchorsRef.current })` once on `mouseup`.
3. **`StickerPlugin.tsx`**:
   - Maintain `const [dragAnchor, setDragAnchor] = useState<LogicalAnchor | null>(null)` during pin/header dragging; commit `onUpdate({ anchors: [dragAnchor] })` once on `mouseup`.
   - Debounce `<textarea>` `onUpdate({ payload: { markdown } })` by `250ms` using a timer ref, and flush immediately on `onBlur` or unmount if dirty.
4. **`ChartToolbar.tsx` & `App.tsx`**:
   - Pass `showAdvancedTools={false}` in `src/App.tsx` (and default `showAdvancedTools = false` in `ChartToolbar.tsx`) so only **Pointer**, **Sticker**, and **Trendline** are shown.

### 3.3 Relaxed Polling UI & Lifecycle Fixes (`src/ui/providers/ProviderSettingsPopover.tsx` & `src/App.tsx`)
1. **`ProviderSettingsPopover.tsx`**:
   - Update `LivePollIntervalSec` to `0 | 5 | 15 | 30 | 60 | 300` and set `POLL_INTERVAL_OPTIONS: LivePollIntervalSec[] = [0, 15, 60, 300]`.
   - Format button labels cleanly: `0` → `'Off'`, `15` → `'15s'`, `60` → `'1m'`, `300` → `'5m'`, with status readout `'Every 15s'` / `'Every 1m'` / `'Every 5m'` / `'Paused'`.
2. **`src/App.tsx`**:
   - Guard the initial hydration `useEffect` with `isHydratedRef.current` so token refreshes or sign-in/sign-out transitions never re-trigger initial IndexedDB hydration.
   - Set `lastSyncedHashRef.current = computeWorkspaceContentHash(...)` immediately after initial store hydration completes.
   - Add a visibility-aware `useEffect` watching `savedPreferences.pollIntervalSec`: when `pollIntervalSec > 0`, run a `setInterval` (`pollIntervalSec * 1000`) that refreshes active candles and watchlist quotes whenever `document.visibilityState === 'visible'`.
   - In `handleImportLocalJson`, refresh quotes and validate active ticker after hydrating the imported backup.

---

## 4. Ordered File Manifest

1. `[MODIFY]` [technicalIndicators.ts](file:///home/duke/Project/marketview/src/core/indicators/technicalIndicators.ts)
   - Add and export `computeAllChartIndicators` and `findSurroundingCandles`.
2. `[MODIFY]` [preferences.ts](file:///home/duke/Project/marketview/src/core/schemas/preferences.ts)
   - Extend `LivePollIntervalSchema` with `z.literal(60)` and `z.literal(300)`.
3. `[MODIFY]` [workspaceExport.ts](file:///home/duke/Project/marketview/src/core/serialization/workspaceExport.ts)
   - Exclude `activeIndicators` and `pollIntervalSec` from `computeWorkspaceContentHash` and preserve them locally on initialized devices in `mergeWorkspaceSnapshots`.
4. `[MODIFY]` [index.ts](file:///home/duke/Project/marketview/src/core/index.ts)
   - Re-export `computeAllChartIndicators`, `findSurroundingCandles`, and `ComputedChartIndicators`.
5. `[MODIFY]` [annotationStore.ts](file:///home/duke/Project/marketview/src/core/stores/annotationStore.ts)
   - Update `addAnnotation`, `updateAnnotation`, and `deleteAnnotation` to call `set()` synchronously before `await repository.saveAnnotations(next)`.
6. `[MODIFY]` [watchlistStore.ts](file:///home/duke/Project/marketview/src/core/stores/watchlistStore.ts)
   - Validate `activeWatchlistId` membership in `hydrate()`, and call `set()` synchronously before `await repository.saveWatchlists(next)` in all mutators.
7. `[MODIFY]` [StickerPlugin.tsx](file:///home/duke/Project/marketview/src/features/chart/overlays/plugins/StickerPlugin.tsx)
   - Buffer pin/header drag in local state (`dragAnchor`) and commit once on `mouseup`; debounce `<textarea>` `onUpdate` calls (`250ms` + flush on `onBlur`/unmount).
8. `[MODIFY]` [TrendlinePlugin.tsx](file:///home/duke/Project/marketview/src/features/chart/overlays/plugins/TrendlinePlugin.tsx)
   - Buffer handle and line dragging in local state (`dragAnchors`) and commit once on `mouseup`; remove invalid `style-custom` prop.
9. `[MODIFY]` [FibonacciPlugin.tsx](file:///home/duke/Project/marketview/src/features/chart/overlays/plugins/FibonacciPlugin.tsx)
   - Buffer handle and zone dragging in local state (`dragAnchors`) and commit once on `mouseup`.
10. `[MODIFY]` [ChartToolbar.tsx](file:///home/duke/Project/marketview/src/features/chart/overlays/ChartToolbar.tsx)
    - Default `showAdvancedTools = false` so `Fib` and `Trade Marker` are hidden by default.
11. `[MODIFY]` [ChartContainer.tsx](file:///home/duke/Project/marketview/src/features/chart/ChartContainer.tsx)
    - Use `computeAllChartIndicators` single-pass memo, `findSurroundingCandles` binary search in `projector.logicalToScreen`, deduplicated `activeHoverPoint` state updates, and non-blocking loading overlay when `sortedCandles.length > 0`.
12. `[MODIFY]` [ProviderSettingsPopover.tsx](file:///home/duke/Project/marketview/src/ui/providers/ProviderSettingsPopover.tsx)
    - Offer `Off` (`0`), `15s` (`15`), `1m` (`60`), and `5m` (`300`) background refresh options, defaulting to `Off` (`0`).
13. `[MODIFY]` [App.tsx](file:///home/duke/Project/marketview/src/App.tsx)
    - Guard initial hydration with `isHydratedRef`, initialize `lastSyncedHashRef` on hydration, set `showAdvancedTools={false}`, add visibility-aware `pollIntervalSec` auto-refresh `useEffect`, and refresh quotes after `handleImportLocalJson`.
14. `[MODIFY]` [technical-indicators.test.ts](file:///home/duke/Project/marketview/src/core/__tests__/technical-indicators.test.ts), [firebase-sync-and-gc.test.ts](file:///home/duke/Project/marketview/src/core/__tests__/firebase-sync-and-gc.test.ts), & [watchlist-store.test.ts](file:///home/duke/Project/marketview/src/core/__tests__/watchlist-store.test.ts)
    - Add unit tests for `findSurroundingCandles`, `computeAllChartIndicators`, `activeIndicators`/`pollIntervalSec` hash invariance, and stale `activeWatchlistId` fallback on `hydrate()`.

---

## 5. Verification & Test Matrix

1. **Headless Core Unit Tests (`npx vitest run src/core/`)**:
   - `findSurroundingCandles` accurately locates exact, between-bar, before-first, and after-last candles in `O(log N)` time.
   - `computeAllChartIndicators` matches individual indicator outputs and summary values in a single pass.
   - `computeWorkspaceContentHash` produces the exact same hash when `activeIndicators` or `pollIntervalSec` changes.
   - `watchlistStore.hydrate()` resets `activeWatchlistId` to the first available watchlist when the previously selected ID no longer exists in storage.
   - `annotationStore` and `watchlistStore` update in-memory state synchronously before async repository persistence completes.
2. **Chart & Overlay Unit Tests (`npx vitest run src/features/chart/`)**:
   - Dragging a trendline, Fibonacci retracement, or sticker previews smoothly during `mousemove` and invokes `onUpdateAnnotation` only once on `mouseup`.
   - `ChartToolbar` hides `Fib` and `Trade Marker` by default (`showAdvancedTools = false`).
3. **Full Suite & Typecheck**:
   - `npm run typecheck` (`tsc --noEmit`) passes with zero errors.
   - `npm run test` (`vitest run`) passes all test files with zero regressions.
