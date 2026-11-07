# Dispatch for Reviewer M2-2 (ChartContainer, Settings & App.tsx Review)

**Role**: Chart Container & App Lifecycle Reviewer
**Working Directory**: /home/duke/Project/marketview/.agents/teamwork/reviewer_m2_2
**Project Root**: /home/duke/Project/marketview
**Original Request**: /home/duke/Project/marketview/.agents/teamwork/ORIGINAL_REQUEST.md
**Specification Document**: /home/duke/Project/marketview/docs/specs/milestone-15-performance-and-behavior-hardening.md
**Worker Handoff**: /home/duke/Project/marketview/.agents/teamwork/worker_m2/handoff.md

## Tasks:
Review the changes made by worker_m2 in:
1. `src/features/chart/ChartContainer.tsx`:
   - Verify indicator memoization: `const computedIndicators = useMemo(() => computeAllChartIndicators(sortedCandles), [sortedCandles]);`.
   - Verify `findSurroundingCandles` in `logicalToScreen` with exact match guard (`left === right || left.timestamp === right.timestamp`).
   - Verify deduplicated hover point tracking: `setActiveHoverPoint` triggered only when the snapped candidate point changes.
   - Verify non-blocking loading backdrop: `isLoading && sortedCandles.length === 0`.
2. `src/ui/providers/ProviderSettingsPopover.tsx`:
   - Verify `LivePollIntervalSec` union type and options: `[0, 15, 60, 300]`.
   - Verify labels `'Off'`, `'15s'`, `'1m'`, `'5m'` and status readouts.
3. `src/App.tsx`:
   - Verify initial hydration runs strictly once (`isHydratedRef.current`).
   - Verify `lastSyncedHashRef.current` initialized upon hydration.
   - Verify `showAdvancedTools={false}` on `<ChartToolbar />`.
   - Verify visibility-aware auto-polling `useEffect` watching `savedPreferences.pollIntervalSec > 0` and checking `document.visibilityState === 'visible'`.
   - Verify `handleImportLocalJson` quote refresh and active ticker validation.
4. Verification commands:
   - Run `npm run typecheck` (`tsc --noEmit`).
   - Run `npm run test` (`vitest run`).
   - Run `npm run build`.
5. Output your review report and verdict (`APPROVE` or `REQUEST_CHANGES`) in `/home/duke/Project/marketview/.agents/teamwork/reviewer_m2_2/handoff.md`.

## 2026-11-07T18:28:09Z
[Message] timestamp=2026-11-07T18:28:09Z sender=a9a9c8ed-8a35-4f8f-8dd8-9119837c3c50 priority=MESSAGE_PRIORITY_HIGH content=You are Reviewer M2-2 (ChartContainer, Settings & App.tsx).
Your working directory is: /home/duke/Project/marketview/.agents/teamwork/reviewer_m2_2
Your task description is in: /home/duke/Project/marketview/.agents/teamwork/reviewer_m2_2/DISPATCH.md
Read /home/duke/Project/marketview/.agents/teamwork/ORIGINAL_REQUEST.md, the spec in docs/specs/milestone-15-performance-and-behavior-hardening.md, and worker_m2 handoff at /home/duke/Project/marketview/.agents/teamwork/worker_m2/handoff.md.
Review ChartContainer.tsx, ProviderSettingsPopover.tsx, and App.tsx. Run typecheck, tests, and build.
Write your review report and verdict (APPROVE or REQUEST_CHANGES) to /home/duke/Project/marketview/.agents/teamwork/reviewer_m2_2/handoff.md and notify your parent.
