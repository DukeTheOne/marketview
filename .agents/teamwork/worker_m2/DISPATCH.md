# Dispatch for Worker M2 (UI & Chart Overlays Hardening)

**Role**: UI and Feature Implementation Specialist
**Working Directory**: /home/duke/Project/marketview/.agents/teamwork/worker_m2
**Project Root**: /home/duke/Project/marketview
**Original Request**: /home/duke/Project/marketview/.agents/teamwork/ORIGINAL_REQUEST.md
**Specification Document**: /home/duke/Project/marketview/docs/specs/milestone-15-performance-and-behavior-hardening.md
**Project Plan**: /home/duke/Project/marketview/.agents/teamwork/orchestrator_m15/PROJECT.md
**UI Survey Report**: /home/duke/Project/marketview/.agents/teamwork/explorer_survey_ui_3/handoff.md

## Scope & Exclusively Owned Files:
1. `src/features/chart/overlays/plugins/TrendlinePlugin.tsx`
2. `src/features/chart/overlays/plugins/FibonacciPlugin.tsx`
3. `src/features/chart/overlays/plugins/StickerPlugin.tsx`
4. `src/features/chart/overlays/ChartToolbar.tsx`
5. `src/features/chart/ChartContainer.tsx`
6. `src/ui/providers/ProviderSettingsPopover.tsx`
7. `src/App.tsx`
8. Relevant UI / Chart test files in `src/features/chart/__tests__/` if needed.

## Tasks:
1. **`src/features/chart/overlays/plugins/TrendlinePlugin.tsx`**:
   - Buffer drag coordinates in local state `const [dragAnchors, setDragAnchors] = useState<[LogicalAnchor, LogicalAnchor] | null>(null)` and `dragAnchorsRef`.
   - Update `dragAnchorsRef.current` and `setDragAnchors(nextAnchors)` during mouse movement (60fps rendering without store updates).
   - Commit `onUpdate({ anchors: dragAnchorsRef.current })` exactly once on `mouseup` and reset `dragAnchors`.
   - Remove invalid JSX attribute `style-custom={{ backgroundColor: payload.color }}` on line 195.
2. **`src/features/chart/overlays/plugins/FibonacciPlugin.tsx`**:
   - Buffer drag coordinates in local state `dragAnchors` and `dragAnchorsRef`.
   - Update on mouse movement, commit once on `mouseup`.
3. **`src/features/chart/overlays/plugins/StickerPlugin.tsx`**:
   - Buffer pin/header drag in local state `dragAnchor` and `dragAnchorRef`, commit once on `mouseup`.
   - Keep `<textarea>` `localText` synchronous for 0-latency typing.
   - Debounce `onUpdate({ payload: { markdown } })` by 250ms via timer ref, and flush immediately on `onBlur` or component unmount.
4. **`src/features/chart/overlays/ChartToolbar.tsx`**:
   - Set default `showAdvancedTools = false` so Pointer, Sticker, Trendline are shown, and Fibonacci / Trade Marker are hidden.
5. **`src/features/chart/ChartContainer.tsx`**:
   - Indicator Memoization: `const computedIndicators = useMemo(() => computeAllChartIndicators(sortedCandles), [sortedCandles]);`. Pass `computedIndicators.summary` to `<IndicatorToolbar />` and use `computedIndicators.sma20`, `ema50`, `vwap`, `bb20` in series effect.
   - Deduplicated Hover Point: replace `hoverCursorX` state with `activeHoverPoint` state (`useState<ProjectedHoverPoint | null>(null)`). In `onMouseMove`, compute candidate via `findNearestHoverPoint(cursorX, hoverCandidatesRef.current)`. Update state ONLY if the candidate point actually changed.
   - Coordinate Projection: in `projector.logicalToScreen`, use `findSurroundingCandles(sortedCandles, anchor.timestamp)`. Guard exact matches (`if (left === right || left.timestamp === right.timestamp) return coordinate(left.timestamp)`) to avoid division-by-zero.
   - Loading Overlay: render the blocking overlay only when `isLoading && sortedCandles.length === 0`.
6. **`src/ui/providers/ProviderSettingsPopover.tsx`**:
   - Update `export type LivePollIntervalSec = 0 | 5 | 15 | 30 | 60 | 300;`
   - Set `POLL_INTERVAL_OPTIONS: LivePollIntervalSec[] = [0, 15, 60, 300];`
   - Labels: `'Off'` (`0`), `'15s'` (`15`), `'1m'` (`60`), `'5m'` (`300`).
   - Status: `'Paused'` (`0`), `'Every 15s'`, `'Every 1m'`, `'Every 5m'`.
7. **`src/App.tsx`**:
   - Guard initial hydration with `isHydratedRef.current` so auth session changes do not re-trigger hydration.
   - Set `lastSyncedHashRef.current = computeWorkspaceContentHash(initialBackup)` upon hydration completion.
   - Set `showAdvancedTools={false}` on `<ChartToolbar />`.
   - Add visibility-aware auto-polling `useEffect` watching `savedPreferences.pollIntervalSec > 0`: run `setInterval` (`pollIntervalSec * 1000`) refreshing active candles and watchlist quotes when `document.visibilityState === 'visible'`.
   - In `handleImportLocalJson`, refresh active quotes and validate active ticker after restoring backup.
8. **Verification**:
   - Run `npm run typecheck` (`tsc --noEmit`) -> MUST pass with ZERO errors across the entire codebase!
   - Run `npm run test` (`vitest run`) -> MUST pass all tests cleanly!
   - Run `npx vitest run src/features/chart/` -> all chart tests must pass.

## MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Output your handoff report to `/home/duke/Project/marketview/.agents/teamwork/worker_m2/handoff.md`.

## 2026-11-07T18:08:11Z
[Message] timestamp=2026-11-07T18:08:11Z sender=a9a9c8ed-8a35-4f8f-8dd8-9119837c3c50 priority=MESSAGE_PRIORITY_HIGH content=You are the UI and Feature Implementation Worker (worker_m2).
Your working directory is: /home/duke/Project/marketview/.agents/teamwork/worker_m2
Your detailed tasks are in: /home/duke/Project/marketview/.agents/teamwork/worker_m2/DISPATCH.md
Read /home/duke/Project/marketview/.agents/teamwork/ORIGINAL_REQUEST.md (specifically ## 2026-11-07T17:24:58Z), /home/duke/Project/marketview/docs/specs/milestone-15-performance-and-behavior-hardening.md, and /home/duke/Project/marketview/.agents/teamwork/explorer_survey_ui_3/handoff.md.

Implement Milestone 2:
1. `src/features/chart/overlays/plugins/TrendlinePlugin.tsx`: drag buffering via local state `dragAnchors`, single commit on `mouseup`, remove `style-custom` attribute.
2. `src/features/chart/overlays/plugins/FibonacciPlugin.tsx`: drag buffering via local state `dragAnchors`, single commit on `mouseup`.
3. `src/features/chart/overlays/plugins/StickerPlugin.tsx`: drag buffering via local state `dragAnchor`, 250ms debounced note typing with blur/unmount flush.
4. `src/features/chart/overlays/ChartToolbar.tsx`: default `showAdvancedTools = false`.
5. `src/features/chart/ChartContainer.tsx`: memoize `computeAllChartIndicators`, use `findSurroundingCandles` in `logicalToScreen` (guard exact hits), deduplicate hover state updates, non-blocking loading backdrop when candles > 0.
6. `src/ui/providers/ProviderSettingsPopover.tsx`: interval options `[0, 15, 60, 300]`, labels 'Off', '15s', '1m', '5m'.
7. `src/App.tsx`: `isHydratedRef` guard, `lastSyncedHashRef` init, `showAdvancedTools={false}`, visibility-aware auto-polling, post-import quote refresh.
8. Verify `npm run typecheck` passes with 0 errors across the entire codebase!
9. Verify `npm run test` passes all tests cleanly!
