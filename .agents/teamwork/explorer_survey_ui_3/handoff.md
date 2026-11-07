# Handoff Report: UI, Chart Overlays, and App Component Survey

**Author**: Survey UI Explorer (`explorer_survey_ui_3`)  
**Target Milestone**: Milestone 15 — Performance & Behavior Hardening  
**Target Directory**: `/home/duke/Project/marketview`  
**Date**: 2026-11-07T17:32:00Z  

---

## 1. Observation

A detailed static code inspection was conducted across all files designated in `DISPATCH.md`:
1. `src/features/chart/overlays/plugins/TrendlinePlugin.tsx`
2. `src/features/chart/overlays/plugins/FibonacciPlugin.tsx`
3. `src/features/chart/overlays/plugins/StickerPlugin.tsx`
4. `src/features/chart/overlays/ChartToolbar.tsx`
5. `src/features/chart/ChartContainer.tsx`
6. `src/ui/providers/ProviderSettingsPopover.tsx`
7. `src/App.tsx`
8. Existing feature/chart test suites in `src/features/`

Baseline test check executed via `run_command` (`npm run typecheck && npm run test`): exited with code `0`, passing all 331 tests across 29 test files.

### 1.1 `src/features/chart/overlays/plugins/TrendlinePlugin.tsx`
- **Lines 34–36**:
  ```tsx
  const isDraggingHandleRef = useRef<number | null>(null);
  const isDraggingLineRef = useRef<boolean>(false);
  const dragStartPointRef = useRef<{ x: number; y: number } | null>(null);
  ```
  No local `dragAnchors` state or `dragAnchorsRef` exists in the component.
- **Lines 78–95** (`handleStartDragHandle`):
  Inside `handleMouseMove`:
  ```tsx
  const nextAnchors: [LogicalAnchor, LogicalAnchor] = [
    isDraggingHandleRef.current === 0 ? logical : anchor1,
    isDraggingHandleRef.current === 1 ? logical : anchor2,
  ];
  onUpdate({ anchors: nextAnchors });
  ```
  `onUpdate({ anchors: nextAnchors })` is invoked directly on **every single `mousemove` event (60–120Hz)**.
- **Lines 97–101** (`handleMouseUp`):
  ```tsx
  const handleMouseUp = () => {
    isDraggingHandleRef.current = null;
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
  };
  ```
  `handleMouseUp` merely detaches listeners; it does not commit coordinates.
- **Lines 117–128** (`handleStartDragLine`):
  Inside `handleMouseMove`:
  ```tsx
  if (newL1 && newL2) {
    onUpdate({ anchors: [newL1, newL2] });
  }
  ```
  Line body drag also invokes `onUpdate` on every pixel of mouse movement.
- **Line 195**:
  ```tsx
  {/* Anchor 1 Control Point Handle */}
  <div
    style={{ left: `${p1.x}px`, top: `${p1.y}px` }}
    onMouseDown={(e) => handleStartDragHandle(0, e)}
    title="Drag start anchor"
    className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 flex h-4 w-4 cursor-grab items-center justify-center rounded-full border-2 border-white shadow-md active:cursor-grabbing hover:scale-125 transition-transform"
    style-custom={{ backgroundColor: payload.color }}
  >
  ```
  `style-custom={{ backgroundColor: payload.color }}` is an invalid React JSX DOM property. Note that Anchor 2 (lines 201–208) does not have this attribute.

### 1.2 `src/features/chart/overlays/plugins/FibonacciPlugin.tsx`
- **Lines 61–63**:
  ```tsx
  const isDraggingHandleRef = useRef<number | null>(null);
  const isDraggingBodyRef = useRef<boolean>(false);
  const dragStartPointRef = useRef<{ x: number; y: number } | null>(null);
  ```
  No local `dragAnchors` state or `dragAnchorsRef` exists in the component.
- **Lines 110–127** (`handleStartDragHandle`):
  Inside `handleMouseMove`:
  ```tsx
  const nextAnchors: [LogicalAnchor, LogicalAnchor] = [
    isDraggingHandleRef.current === 0 ? logical : anchor1,
    isDraggingHandleRef.current === 1 ? logical : anchor2,
  ];
  onUpdate({ anchors: nextAnchors });
  ```
  `onUpdate` is called on every mousemove event.
- **Lines 129–133** (`handleMouseUp`):
  Listener cleanup only; no commit on release.
- **Lines 149–166** (`handleStartDragBody`):
  Inside `handleMouseMove`:
  ```tsx
  if (newL1 && newL2) {
    onUpdate({ anchors: [newL1, newL2] });
  }
  ```
  Body dragging invokes `onUpdate` on every mousemove event.

### 1.3 `src/features/chart/overlays/plugins/StickerPlugin.tsx`
- **Lines 73–77**:
  ```tsx
  const primaryAnchor = annotation.anchors[0];
  const screenPos = primaryAnchor ? projector.logicalToScreen(primaryAnchor) : null;
  const isDraggingRef = useRef(false);
  const [localText, setLocalText] = useState(payload.markdown);
  ```
  No local `dragAnchor` state or `dragAnchorRef` exists.
- **Lines 94–107** (`handleStartDrag`):
  Inside `handleMouseMove`:
  ```tsx
  const logical = projector.screenToLogical(point);
  if (logical) {
    onUpdate({ anchors: [logical] });
  }
  ```
  `onUpdate` is called on every mousemove event.
- **Lines 227–236** (`<textarea>`):
  ```tsx
  <textarea
    value={localText}
    onChange={(e) => {
      setLocalText(e.target.value);
      onUpdate({ payload: { markdown: e.target.value } });
    }}
    placeholder="Write chart thesis or level analysis..."
    rows={3}
    className={`w-full resize-none rounded border border-slate-800 bg-slate-950/80 p-2 font-sans text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none ${theme.accent}`}
  />
  ```
  `onUpdate({ payload: { markdown: e.target.value } })` is invoked synchronously on **every single keystroke**. There is no debounce timer, no pending markdown ref, and no blur/unmount flush.

### 1.4 `src/features/chart/overlays/ChartToolbar.tsx`
- **Lines 15–20**:
  ```tsx
  export function ChartToolbar({
    activeTool,
    annotationCount,
    onSelectTool,
    showAdvancedTools = true,
  }: ChartToolbarProps) {
  ```
  `showAdvancedTools` defaults to `true`.
- **Lines 65–95**:
  Renders `Fib` and `Trade Marker` buttons conditionally on `showAdvancedTools`.

### 1.5 `src/features/chart/ChartContainer.tsx`
- **Lines 99–102 & 318–351**:
  ```tsx
  const indicatorSummary = useMemo(
    () => computeChartIndicatorsSummary(sortedCandles),
    [sortedCandles]
  );
  ```
  Inside `useEffect` (lines 318–351):
  ```tsx
  sma20Series.setData(calculateSMA(sorted, 20)...);
  ema50Series.setData(calculateEMA(sorted, 50)...);
  vwapSeries.setData(calculateVWAP(sorted)...);
  const bbPoints = calculateBollingerBands(sorted, 20, 2);
  bbUpperSeries.setData(...);
  bbLowerSeries.setData(...);
  ```
  Indicator calculations (SMA 20, EMA 50, VWAP, BB 20) are executed twice: once in `useEffect` and once inside `computeChartIndicatorsSummary`.
- **Lines 86, 578–584, & 674–678** (Hover Point Tracking):
  ```tsx
  const [hoverCursorX, setHoverCursorX] = useState<number | null>(null);
  ...
  const activeHoverPoint = useMemo(
    () =>
      hoverCursorX !== null
        ? findNearestHoverPoint(hoverCursorX, hoverCandidates)
        : null,
    [hoverCursorX, hoverCandidates]
  );
  ...
  onMouseMove={(e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setHoverCursorX(e.clientX - rect.left);
  }}
  onMouseLeave={() => setHoverCursorX(null)}
  ```
  `setHoverCursorX` is called on every 1px mouse movement. Even when the cursor remains within the same bar's snap zone and `activeHoverPoint` does not change, setting `hoverCursorX` causes `ChartContainer` and `renderOverlayLayer` (including `ChartToolbar`, `OverlayCanvas`, and all plugin components) to re-render at 60Hz.
- **Lines 608–616** (`logicalToScreen` off-bar fallback):
  ```tsx
  for (let i = 0; i < sortedCandles.length; i++) {
    const c = sortedCandles[i]!;
    if (c.timestamp <= anchor.timestamp) {
      leftCandle = c;
    } else {
      rightCandle = c;
      break;
    }
  }
  ```
  A linear $O(N)$ scan loops through `sortedCandles` to find bounding bars for off-bar timestamps.
- **Lines 768–774** (Loading Overlay):
  ```tsx
  {isLoading && (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-slate-950/40 backdrop-blur-[1px]">
      <div className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-300 shadow-lg">
        Syncing {ticker} ({timeframe}) OHLCV series...
      </div>
    </div>
  )}
  ```
  The blocking loading overlay renders whenever `isLoading === true`, even when `sortedCandles.length > 0`, causing visual flicker during background refreshes or cached ticker switching.

### 1.6 `src/ui/providers/ProviderSettingsPopover.tsx`
- **Lines 14 & 16**:
  ```tsx
  export type LivePollIntervalSec = 0 | 5 | 15 | 30;
  const POLL_INTERVAL_OPTIONS: LivePollIntervalSec[] = [0, 5, 15, 30];
  ```
- **Lines 243–245**:
  ```tsx
  <span className="font-mono text-[11px] text-slate-400">
    {pollIntervalSec > 0 ? `Every ${pollIntervalSec}s` : 'Paused'}
  </span>
  ```
- **Lines 263**:
  ```tsx
  {sec === 0 ? 'Off' : `${sec}s`}
  ```
  Does not include `60` (1m) or `300` (5m) interval options, and button labels cannot display minute formatting.

### 1.7 `src/App.tsx`
- **Lines 126–127 & 185–240**:
  ```tsx
  const [isHydrated, setIsHydrated] = useState(false);
  const isHydratedRef = useRef(false);
  ...
  useEffect(() => {
    void (async () => {
      const [hydratedWatchlists, , hydratedPrefs] = await Promise.all([...]);
      ...
      setIsHydrated(true);
      isHydratedRef.current = true;
      if (authSession) {
        setTimeout(() => void handleSyncNow(), 100);
      }
    })();
  }, [
    marketStore,
    watchlistStore,
    annotationStore,
    preferencesStore,
    initialMode,
    initialEnvKey,
    authSession,
  ]);
  ```
  The initial hydration `useEffect` does NOT check `if (isHydratedRef.current) return;` at the entry point. Because `authSession` is in the dependency array, logging in, logging out, or token refresh re-executes store hydration.
  Additionally, upon hydration completion, `lastSyncedHashRef.current` is not initialized with the computed hash of the hydrated backup.
- **Auto-polling `useEffect`**:
  No `useEffect` with `setInterval` exists in `src/App.tsx` to automatically trigger `refreshActiveCandles()` and `refreshQuotes()` when `pollIntervalSec > 0`.
- **Lines 773–793** (`handleImportLocalJson`):
  ```tsx
  const handleImportLocalJson = async (file: File) => {
    const text = await file.text();
    const backup = parseWorkspaceBackup(text);
    const cleaned = garbageCollectWorkspace(backup);

    await repo.saveWatchlists(cleaned.watchlists);
    await watchlistStore.getState().hydrate();

    await repo.saveAnnotations(cleaned.annotations);
    await annotationStore.getState().hydrate();

    if (cleaned.preferences) {
      await preferencesStore.getState().updatePreferences({
        ...cleaned.preferences,
        deletedIds: {
          ...(savedPreferences.deletedIds ?? {}),
          ...(cleaned.deletedIds ?? {}),
        },
      });
    }
  };
  ```
  Does not refresh quotes, validate active ticker, or trigger candle reload after importing backup.
- **Line 928**:
  ```tsx
  <ChartToolbar
    activeTool={activeTool}
    annotationCount={activeTickerAnnotations.length}
    showAdvancedTools={true}
    onSelectTool={(tool) => {
      annotationStore.getState().setActiveTool(tool);
    }}
  />
  ```
  Explicitly sets `showAdvancedTools={true}`.

---

## 2. Logic Chain

1. **Overlay Dragging Bottleneck (Obs 1.1, 1.2, 1.3)**:
   - Calling `onUpdate` inside `handleMouseMove` dispatches to `annotationStore.updateAnnotation` on every pixel change (60–120Hz).
   - In `annotationStore.updateAnnotation`, every call executes `ChartAnnotationSchema.parse()` and invokes `await repository.saveAnnotations(next)`.
   - IndexedDB transactions and state broadcasts occur on every pixel, triggering parent re-renders, workspace serializations, and content-hash recalculations.
   - *Inference*: Buffering drag coordinates in local state (`dragAnchors` / `dragAnchor`) and refs (`dragAnchorsRef` / `dragAnchorRef`) during `mousemove` allows the SVG projection to update visually at 60fps with zero I/O and zero store updates. Committing `onUpdate({ anchors: ... })` exactly once on `mouseup` eliminates 99%+ of IndexedDB writes and store broadcasts during interaction.

2. **Sticker Keystroke Thrashing (Obs 1.3)**:
   - Calling `onUpdate({ payload: { markdown: e.target.value } })` synchronously in `onChange` triggers an IndexedDB transaction and full workspace hash computation on every character typed.
   - *Inference*: Managing `localText` synchronously while debouncing `onUpdate` by 250ms (and flushing immediately on `onBlur` or component unmount via ref) provides lag-free typing while ensuring zero data loss upon navigation or deselect.

3. **ChartContainer Hover Re-render Elimination (Obs 1.5)**:
   - `hoverCursorX` records raw cursor pixels. In a typical 800px chart, sweeping the mouse generates hundreds of state updates.
   - When the cursor moves within a single candle's snap zone (e.g., ±15px), the snapped `activeHoverPoint` remains identical. Yet `setHoverCursorX` forces `ChartContainer` to re-render and re-execute `renderOverlayLayer` on every pixel.
   - *Inference*: Storing `activeHoverPoint` directly as component state and updating it only when `findNearestHoverPoint(cursorX, hoverCandidates)` yields a distinct point (comparing `timestamp`, `price`, `source`, `x`, `y`) completely suppresses re-renders when the cursor stays within the same bar's snap zone.

4. **Redundant Indicator & Coordinate Calculations (Obs 1.5)**:
   - `computeChartIndicatorsSummary(sortedCandles)` internally calculates SMA, EMA, VWAP, BB, and RSI. `ChartContainer`'s `useEffect` then independently recalculates `calculateSMA(20)`, `calculateEMA(50)`, `calculateVWAP()`, and `calculateBollingerBands(20, 2)`.
   - In `projector.logicalToScreen`, the linear scan `for (let i = 0; i < sortedCandles.length; i++)` is $O(N)$ for every off-bar anchor on every frame.
   - *Inference*: Utilizing `computeAllChartIndicators(sortedCandles)` in a single `useMemo` produces both the series datasets and the summary in one pass over candles. Replacing the linear scan with `findSurroundingCandles` reduces off-bar lookup to $O(\log N)$ binary search.

5. **Loading Overlay Backdrop (Obs 1.5)**:
   - Rendering `"Syncing {ticker} ({timeframe}) OHLCV series..."` on every `isLoading` causes full-canvas flashing during background quote polling and fast ticker switching when candles already exist in memory.
   - *Inference*: Gating on `isLoading && sortedCandles.length === 0` preserves existing candle visuals during background sync while properly showing the loader on cold loads.

6. **Minimalist Toolbar & Relaxed Polling (Obs 1.4, 1.6, 1.7)**:
   - `showAdvancedTools` must default to `false` in `ChartToolbar.tsx` and be set to `showAdvancedTools={false}` in `App.tsx` to hide `Fib` and `Trade Marker`.
   - `ProviderSettingsPopover` options need to be `[0, 15, 60, 300]` formatted as `'Off'`, `'15s'`, `'1m'`, `'5m'`.
   - A visibility-aware `useEffect` in `App.tsx` must hook into `savedPreferences.pollIntervalSec > 0` to poll active candles and watchlist quotes via `setInterval`, respecting `document.visibilityState === 'visible'`.

7. **Hydration & Import Hardening in App.tsx (Obs 1.7)**:
   - Without `if (isHydratedRef.current) return;`, any change in `authSession` triggers a second hydration pass.
   - Initializing `lastSyncedHashRef.current = computeWorkspaceContentHash(initialBackup)` prevents initial false-dirty states.
   - Triggering `refreshQuotes` and active ticker validation after `handleImportLocalJson` ensures the view refreshes immediately after backup import.

---

## 3. Caveats

1. **Core Indicators Dependency**:
   - `computeAllChartIndicators` and `findSurroundingCandles` must be implemented and exported in `src/core/indicators/technicalIndicators.ts` (and re-exported in `src/core/index.ts`) before `ChartContainer.tsx` can import them.
2. **Preference Schema Extension**:
   - `LivePollIntervalSchema` in `src/core/schemas/preferences.ts` must be extended to accept `60` and `300` before `ProviderSettingsPopover` or `App.tsx` can save those values to IndexedDB without validation errors.
3. **Draft Preview Interaction**:
   - When drawing *new* annotations (`activeTool !== null`), draft preview is handled by `OverlayCanvas` (`renderDraftPreview`), not by the individual annotation components. The buffered drag logic in `TrendlinePlugin`, `FibonacciPlugin`, and `StickerPlugin` strictly governs editing *existing* placed annotations.
4. **No caveats** exist regarding DOM leakage: all proposed changes in `src/features/` and `src/ui/` maintain strict compliance with `.agents/rules/architecture-boundaries.md`.

---

## 4. Conclusion & Proposed Implementation Specs

### 4.1 `src/features/chart/overlays/plugins/TrendlinePlugin.tsx`
- **Imports**: Add `useState`.
- **State**:
  ```tsx
  const [dragAnchors, setDragAnchors] = useState<[LogicalAnchor, LogicalAnchor] | null>(null);
  const dragAnchorsRef = useRef<[LogicalAnchor, LogicalAnchor] | null>(null);
  ```
- **Effective Anchors & Projection**:
  ```tsx
  const [effectiveAnchor1, effectiveAnchor2] = dragAnchors ?? [annotation.anchors[0], annotation.anchors[1]];
  if (!effectiveAnchor1 || !effectiveAnchor2) return null;
  const p1 = projector.logicalToScreen(effectiveAnchor1);
  const p2 = projector.logicalToScreen(effectiveAnchor2);
  ```
- **Handle Drag**:
  In `handleMouseMove`:
  ```tsx
  const nextAnchors: [LogicalAnchor, LogicalAnchor] = [
    isDraggingHandleRef.current === 0 ? logical : effectiveAnchor1,
    isDraggingHandleRef.current === 1 ? logical : effectiveAnchor2,
  ];
  dragAnchorsRef.current = nextAnchors;
  setDragAnchors(nextAnchors);
  ```
  In `handleMouseUp`:
  ```tsx
  isDraggingHandleRef.current = null;
  if (dragAnchorsRef.current) {
    onUpdate({ anchors: dragAnchorsRef.current });
  }
  dragAnchorsRef.current = null;
  setDragAnchors(null);
  ```
- **Line Drag**:
  In `handleMouseMove`:
  ```tsx
  if (newL1 && newL2) {
    dragAnchorsRef.current = [newL1, newL2];
    setDragAnchors([newL1, newL2]);
  }
  ```
  In `handleMouseUp`:
  ```tsx
  isDraggingLineRef.current = false;
  dragStartPointRef.current = null;
  if (dragAnchorsRef.current) {
    onUpdate({ anchors: dragAnchorsRef.current });
  }
  dragAnchorsRef.current = null;
  setDragAnchors(null);
  ```
- **JSX Fix**: Remove `style-custom={{ backgroundColor: payload.color }}` on line 195.

### 4.2 `src/features/chart/overlays/plugins/FibonacciPlugin.tsx`
- **Imports**: Add `useState`.
- **State**:
  ```tsx
  const [dragAnchors, setDragAnchors] = useState<[LogicalAnchor, LogicalAnchor] | null>(null);
  const dragAnchorsRef = useRef<[LogicalAnchor, LogicalAnchor] | null>(null);
  ```
- **Effective Anchors & Levels**:
  ```tsx
  const [effectiveAnchor1, effectiveAnchor2] = dragAnchors ?? [annotation.anchors[0], annotation.anchors[1]];
  if (!effectiveAnchor1 || !effectiveAnchor2) return null;
  const p1 = projector.logicalToScreen(effectiveAnchor1);
  const p2 = projector.logicalToScreen(effectiveAnchor2);
  ```
  Pass `effectiveAnchor1.price`, `effectiveAnchor2.price`, `effectiveAnchor1.timestamp` to `calculateFibonacciLevels` and level projection.
- **Handle & Body Drag**:
  Update `dragAnchorsRef.current` and `setDragAnchors(nextAnchors)` in `handleMouseMove`. Commit `onUpdate({ anchors: dragAnchorsRef.current })` and reset in `handleMouseUp`.

### 4.3 `src/features/chart/overlays/plugins/StickerPlugin.tsx`
- **Pin Dragging**:
  Maintain `dragAnchor` state and `dragAnchorRef`.
  Compute `effectiveAnchor = dragAnchor ?? annotation.anchors[0]`.
  In `handleMouseMove`: `dragAnchorRef.current = logical; setDragAnchor(logical);`.
  In `handleMouseUp`: commit `onUpdate({ anchors: [dragAnchorRef.current] })` and clear `dragAnchor`.
- **Keystroke Debouncing**:
  ```tsx
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingMarkdownRef = useRef<string | null>(null);

  const flushPendingMarkdown = () => {
    if (pendingMarkdownRef.current !== null) {
      onUpdate({ payload: { markdown: pendingMarkdownRef.current } });
      pendingMarkdownRef.current = null;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    }
  };

  useEffect(() => {
    return () => {
      flushPendingMarkdown();
    };
  }, []);
  ```
  In `<textarea>`:
  ```tsx
  onChange={(e) => {
    const val = e.target.value;
    setLocalText(val);
    pendingMarkdownRef.current = val;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      flushPendingMarkdown();
    }, 250);
  }}
  onBlur={() => {
    flushPendingMarkdown();
  }}
  ```

### 4.4 `src/features/chart/overlays/ChartToolbar.tsx`
- Change signature default to `showAdvancedTools = false`.

### 4.5 `src/features/chart/ChartContainer.tsx`
- **Memoized Indicators**:
  ```tsx
  const computedIndicators = useMemo(
    () => computeAllChartIndicators(sortedCandles),
    [sortedCandles]
  );
  ```
  Pass `summary={computedIndicators.summary}` to `<IndicatorToolbar />`.
  Use `computedIndicators.sma20`, `computedIndicators.ema50`, `computedIndicators.vwap`, and `computedIndicators.bb20` directly in `useEffect`.
- **Zero-Thrash Hover Point State**:
  Replace `hoverCursorX` state with:
  ```tsx
  const [activeHoverPoint, setActiveHoverPoint] = useState<ProjectedHoverPoint | null>(null);
  const activeHoverPointRef = useRef<ProjectedHoverPoint | null>(null);
  const hoverCandidatesRef = useRef(hoverCandidates);
  hoverCandidatesRef.current = hoverCandidates;
  ```
  In `onMouseMove`:
  ```tsx
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
- **$O(\log N)$ Off-Bar Search in `projector.logicalToScreen`**:
  ```tsx
  const { left: leftCandle, right: rightCandle } = findSurroundingCandles(
    sortedCandles,
    anchor.timestamp
  );
  ```
- **Flicker-Free Loader**:
  `{isLoading && sortedCandles.length === 0 && (`

### 4.6 `src/ui/providers/ProviderSettingsPopover.tsx`
- Update interval type & options:
  ```tsx
  export type LivePollIntervalSec = 0 | 5 | 15 | 30 | 60 | 300;
  const POLL_INTERVAL_OPTIONS: LivePollIntervalSec[] = [0, 15, 60, 300];
  ```
- Labels:
  `sec === 0 ? 'Off' : sec === 60 ? '1m' : sec === 300 ? '5m' : `${sec}s``
  Status text:
  `pollIntervalSec === 0 ? 'Paused' : pollIntervalSec === 60 ? 'Every 1m' : pollIntervalSec === 300 ? 'Every 5m' : `Every ${pollIntervalSec}s``

### 4.7 `src/App.tsx`
- **Hydration Guard**:
  ```tsx
  useEffect(() => {
    if (isHydratedRef.current) return;
    isHydratedRef.current = true;
    void (async () => {
      ...
      const initialBackup: WorkspaceBackup = {
        version: 1,
        exportedAt: Math.floor(Date.now() / 1000),
        watchlists: hydratedWatchlists,
        annotations: annotationStore.getState().annotations,
        trades: [],
        alerts: [],
        deletedIds: hydratedPrefs.deletedIds ?? {},
        preferences: hydratedPrefs,
      };
      lastSyncedHashRef.current = computeWorkspaceContentHash(initialBackup);
      setIsHydrated(true);
      if (authSession) {
        setTimeout(() => void handleSyncNow(), 100);
      }
    })();
  }, [...]);
  ```
- **Visibility-Aware Polling**:
  ```tsx
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
- **`handleImportLocalJson` Quote Refresh**:
  Refresh quotes for active watchlist after backup restoration.
- **Toolbar Minimalist Mode**:
  Pass `showAdvancedTools={false}` to `<ChartToolbar />`.

---

## 5. Verification Method

1. **Typecheck Verification**:
   ```bash
   npm run typecheck
   ```
   Must exit with code `0` and 0 errors (`tsc --noEmit`).

2. **Existing Test Suite Verification**:
   ```bash
   npx vitest run src/features/chart/
   ```
   Must pass all tests in `ChartContainer.test.tsx`, `chart-autoscale-and-toolbar.test.ts`, `fibonacci-plugin.test.ts`, and `overlay-alerts-and-drag.test.ts`.

3. **Full Test Suite & Boundary Check**:
   ```bash
   npm run test
   ```
   Must pass all 331+ tests across all modules.

4. **Interactive Invalidation Conditions**:
   - If dragging a trendline or sticker pin still invokes `onUpdateAnnotation` during `mousemove` instead of waiting for `mouseup`, performance criteria are invalidated.
   - If typing in a sticker note immediately invokes `onUpdateAnnotation` per keystroke instead of debouncing by 250ms, performance criteria are invalidated.
   - If moving mouse within the same candle snap zone re-renders `ChartContainer`, performance criteria are invalidated.
   - If `ChartToolbar` renders `Fib` or `Trade Marker` when rendered without props or with `showAdvancedTools={false}`, acceptance criteria are invalidated.
