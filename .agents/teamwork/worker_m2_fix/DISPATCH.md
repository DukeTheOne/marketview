## 2026-11-07T18:47:53Z
You are Worker M2 Fix.
Your working directory is: /home/duke/Project/marketview/.agents/teamwork/worker_m2_fix

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Context & Task:
In Milestone 2 Gate, challenger_m2_1 reported that clicking on an overlay without dragging triggers a spurious `onUpdate` commit across `TrendlinePlugin.tsx`, `FibonacciPlugin.tsx`, and `StickerPlugin.tsx`, causing unnecessary store updates, IndexedDB writes, and workspace dirty state.
Three read-only explorers investigated each plugin and formulated drop-in fix strategies:
- Trendline: `/home/duke/Project/marketview/.agents/teamwork/explorer_m2_fix_1/handoff.md`
- Fibonacci: `/home/duke/Project/marketview/.agents/teamwork/explorer_m2_fix_2/handoff.md`
- Sticker: `/home/duke/Project/marketview/.agents/teamwork/explorer_m2_fix_3/handoff.md`

Your Write Ownership:
You own exclusively:
- `src/features/chart/overlays/plugins/TrendlinePlugin.tsx`
- `src/features/chart/overlays/plugins/FibonacciPlugin.tsx`
- `src/features/chart/overlays/plugins/StickerPlugin.tsx`

Instructions:
1. Read `/home/duke/Project/marketview/ORIGINAL_REQUEST.md` and `/home/duke/Project/marketview/.agents/teamwork/orchestrator_m15/PROJECT.md`.
2. Read the three explorer reports mentioned above.
3. Apply the proposed fixes to `TrendlinePlugin.tsx`, `FibonacciPlugin.tsx`, and `StickerPlugin.tsx`:
   - Add `hasMovedRef` tracking.
   - On `mousedown`, reset `hasMovedRef.current = false` and initialize `dragAnchorsRef.current = null` (or `dragAnchorRef.current = null`).
   - In `mousemove`, only after valid logical coordinates are computed, set `hasMovedRef.current = true` and update the ref and local state. (For line/body drag, check `if (dx === 0 && dy === 0) return;`).
   - In `mouseup`, only commit `onUpdate` if `hasMovedRef.current && dragAnchorsRef.current` (or `dragAnchorRef.current`) is truthy.
   - Clean up refs and local preview state.
4. Execute verification commands:
   - `npx vitest run src/test/empirical-overlay-drag-debounce.test.ts` (all 10 tests must pass 100%)
   - `npm run typecheck` (`tsc --noEmit` must exit 0 with 0 errors)
   - `npm run test` (all tests must pass across all test files)
   - `npm run build` (production build must succeed)
5. Document all code edits and verification results in `/home/duke/Project/marketview/.agents/teamwork/worker_m2_fix/handoff.md`.
6. Send a completion message to the parent orchestrator with your results.
