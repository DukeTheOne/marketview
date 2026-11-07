## 2026-11-07T19:06:11Z
You are Worker M2 Zero.
Your working directory is: /home/duke/Project/marketview/.agents/teamwork/worker_m2_zero

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Context & Task:
In Milestone 2 Gate, challenger_m2_verif_1 identified that a zero-displacement mousemove event (`moveEvent.clientX === dragStartPoint.x && moveEvent.clientY === dragStartPoint.y`) on Trendline handles, Fibonacci handles, and Sticker pins triggers `hasMovedRef.current = true`, committing a spurious `onUpdate` on mouseup with unchanged anchors.
Three read-only explorers have investigated each plugin and formulated exact drop-in diffs with dual-guard protection (screen coordinates + logical coordinates displacement checks):
- Trendline: `/home/duke/Project/marketview/.agents/teamwork/explorer_m2_zero_1/handoff.md`
- Fibonacci: `/home/duke/Project/marketview/.agents/teamwork/explorer_m2_zero_2/handoff.md`
- Sticker: `/home/duke/Project/marketview/.agents/teamwork/explorer_m2_zero_3/handoff.md`

Your Write Ownership:
You own exclusively:
- `src/features/chart/overlays/plugins/TrendlinePlugin.tsx`
- `src/features/chart/overlays/plugins/FibonacciPlugin.tsx`
- `src/features/chart/overlays/plugins/StickerPlugin.tsx`
- `src/test/empirical-overlay-stress.test.ts`

Instructions:
1. Read `/home/duke/Project/marketview/ORIGINAL_REQUEST.md` and `/home/duke/Project/marketview/.agents/teamwork/orchestrator_m15/PROJECT.md`.
2. Read the three explorer reports mentioned above.
3. Apply the proposed fixes to `TrendlinePlugin.tsx`, `FibonacciPlugin.tsx`, and `StickerPlugin.tsx`:
   - Store `dragStartPointRef.current = { x: e.clientX, y: e.clientY }` if client coordinates exist on mousedown.
   - In `handleMouseMove`, fast-return if `dragStartPointRef.current` matches `moveEvent.clientX` and `moveEvent.clientY`.
   - Also check logical displacement: if `logical` coordinates match the current anchor, do not mark moved!
   - On mouseup, verify anchors actually changed before calling `onUpdate`, and clean up `dragStartPointRef.current = null`.
4. In `src/test/empirical-overlay-stress.test.ts`:
   - Align the 3 defect-demonstration tests (Trendline handle, Fibonacci handle, Sticker pin) to assert `expect(onUpdate).not.toHaveBeenCalled();` (reflecting the resolution of the defect).
5. Run verification commands:
   - `npx vitest run src/test/empirical-overlay-drag-debounce.test.ts src/test/empirical-overlay-stress.test.ts` (all 28 tests must pass 100%)
   - `npm run typecheck` (`tsc --noEmit` must exit 0 with 0 errors)
   - `npm run test` (all tests pass across all test files)
   - `npm run build` (production build succeeds)
6. Document your code edits and verification results in `/home/duke/Project/marketview/.agents/teamwork/worker_m2_zero/handoff.md`.
7. Send a completion message to the parent orchestrator with your results.
