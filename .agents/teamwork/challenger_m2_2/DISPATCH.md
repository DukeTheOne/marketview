# Dispatch for Challenger M2-2 (ChartContainer & App Behavior Challenger)

**Role**: Chart Container & App Behavior Challenger
**Working Directory**: /home/duke/Project/marketview/.agents/teamwork/challenger_m2_2
**Project Root**: /home/duke/Project/marketview
**Original Request**: /home/duke/Project/marketview/.agents/teamwork/ORIGINAL_REQUEST.md
**Specification Document**: /home/duke/Project/marketview/docs/specs/milestone-15-performance-and-behavior-hardening.md
**Worker Handoff**: /home/duke/Project/marketview/.agents/teamwork/worker_m2/handoff.md

## Tasks:
Adversarially challenge `ChartContainer.tsx`, `ProviderSettingsPopover.tsx`, and `App.tsx`:
1. `ChartContainer.tsx` hover deduplication:
   - Simulate cursor movement within a single candle's snap zone (e.g. 20 consecutive mousemove events with x coordinates mapping to the same candle).
   - Verify `setActiveHoverPoint` is not called repeatedly; no redundant state updates occur.
2. `ChartContainer.tsx` loading backdrop:
   - Verify that when `isLoading === true` and `sortedCandles.length > 0`, the blocking loading overlay is NOT rendered.
   - Verify that when `isLoading === true` and `sortedCandles.length === 0`, the loading overlay IS rendered.
3. Coordinate projection exact hits:
   - Verify `logicalToScreen` when anchor timestamp matches an exact candle timestamp returns finite coordinates with zero `NaN` or division-by-zero errors.
4. Auto-refresh & tab visibility:
   - Verify `pollIntervalSec` interval logic; verify polling is gated on `document.visibilityState === 'visible'`.
5. Output your report and verdict (`APPROVE` or `REJECT`) in `/home/duke/Project/marketview/.agents/teamwork/challenger_m2_2/handoff.md`.


## 2026-11-07T18:28:09Z
You are Challenger M2-2 (ChartContainer & App Behavior Challenger).
Your working directory is: /home/duke/Project/marketview/.agents/teamwork/challenger_m2_2
Your task description is in: /home/duke/Project/marketview/.agents/teamwork/challenger_m2_2/DISPATCH.md
Read /home/duke/Project/marketview/.agents/teamwork/ORIGINAL_REQUEST.md, the spec in docs/specs/milestone-15-performance-and-behavior-hardening.md, and worker_m2 handoff at /home/duke/Project/marketview/.agents/teamwork/worker_m2/handoff.md.
Adversarially test ChartContainer hover deduplication (no redundant re-renders in snap zone), non-blocking loading backdrop (when candles > 0), coordinate projection exact hits, and visibility-aware polling.
Write your challenge report and verdict (APPROVE or REJECT) to /home/duke/Project/marketview/.agents/teamwork/challenger_m2_2/handoff.md and notify your parent.
