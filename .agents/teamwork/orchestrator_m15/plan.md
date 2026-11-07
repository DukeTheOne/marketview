# Milestone 15 Execution Plan: Performance and App Behavior Hardening

## Objective
Implement all requirements (R1 through R5) specified in `docs/specs/milestone-15-performance-and-behavior-hardening.md` and `ORIGINAL_REQUEST.md` (2026-11-07T17:24:58Z), preserving all architectural boundaries, verifying with unit and integration tests, and ensuring clean forensic audits.

## Milestones & Work Breakdown
1. **Survey & Baseline (Step 0)**:
   - Dispatch Explorers to map the existing files, current test status, and exact implementation touchpoints for M15.
   - Synthesize survey findings into `PROJECT.md`.
2. **Milestone 1: Headless Core Hardening (R2 Core, R3, R4 Schema, R5 Stores)**:
   - `src/core/indicators/technicalIndicators.ts`: implement `computeAllChartIndicators` and `findSurroundingCandles`. Re-export in `src/core/index.ts`.
   - `src/core/schemas/preferences.ts`: extend `LivePollIntervalSchema` to support `60` and `300`.
   - `src/core/serialization/workspaceExport.ts`: exclude `activeIndicators` and `pollIntervalSec` from `computeWorkspaceContentHash`; preserve local values in `mergeWorkspaceSnapshots`.
   - `src/core/stores/annotationStore.ts`: synchronous `set(...)` before async `saveAnnotations`.
   - `src/core/stores/watchlistStore.ts`: validate `activeWatchlistId` membership in `hydrate()`; synchronous `set(...)` before async `saveWatchlists`.
   - Unit tests for core additions in `src/core/__tests__/technical-indicators.test.ts`, `firebase-sync-and-gc.test.ts`, and `watchlist-store.test.ts`.
3. **Milestone 2: UI & Chart Overlays Hardening (R1, R2 ChartContainer, R4 Minimalist Toolbar & Polling, R5 App.tsx)**:
   - `src/features/chart/overlays/plugins/TrendlinePlugin.tsx`: drag buffering via local state `dragAnchors`, single commit on `mouseup`, fix `style-custom` attribute.
   - `src/features/chart/overlays/plugins/FibonacciPlugin.tsx`: drag buffering via local state `dragAnchors`, single commit on `mouseup`.
   - `src/features/chart/overlays/plugins/StickerPlugin.tsx`: drag buffering via local state `dragAnchor`, 250ms debounced markdown update with flush on blur/unmount.
   - `src/features/chart/overlays/ChartToolbar.tsx`: default `showAdvancedTools = false`.
   - `src/features/chart/ChartContainer.tsx`: memoize `computeAllChartIndicators`, binary search `findSurroundingCandles` in `logicalToScreen`, deduplicate `activeHoverPoint` updates, non-blocking loading backdrop when `sortedCandles.length > 0`.
   - `src/ui/providers/ProviderSettingsPopover.tsx`: auto-refresh options `Off`, `15s`, `1m`, `5m` defaulting to `Off`.
   - `src/App.tsx`: guard initial hydration with `isHydratedRef.current`, initialize `lastSyncedHashRef.current`, set `showAdvancedTools={false}`, add visibility-aware auto-polling `useEffect`, refresh quotes after `handleImportLocalJson`.
4. **Milestone 3: Verification, Adversarial Testing & Forensic Audit**:
   - Run typecheck (`npm run typecheck`) and full test suite (`npm run test`).
   - Challengers stress-test coordinates, drag buffering, debounce, and edge cases.
   - Reviewers verify code quality, contracts, and architecture boundaries.
   - Forensic Auditor audits integrity and absence of shortcuts.
   - Milestone 15 completion report to Sentinel.
