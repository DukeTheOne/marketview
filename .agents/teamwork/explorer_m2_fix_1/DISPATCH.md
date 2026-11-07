## 2026-11-07T18:42:22Z
Sender: a9a9c8ed-8a35-4f8f-8dd8-9119837c3c50
Priority: MESSAGE_PRIORITY_HIGH

You are Explorer M2 Fix 1.
Your working directory is: /home/duke/Project/marketview/.agents/teamwork/explorer_m2_fix_1

Read:
- /home/duke/Project/marketview/ORIGINAL_REQUEST.md
- /home/duke/Project/marketview/.agents/teamwork/orchestrator_m15/PROJECT.md
- /home/duke/Project/marketview/.agents/teamwork/challenger_m2_1/handoff.md
- /home/duke/Project/marketview/src/test/empirical-overlay-drag-debounce.test.ts
- /home/duke/Project/marketview/src/features/chart/overlays/plugins/TrendlinePlugin.tsx

Context & Problem:
In Milestone 2 Gate, challenger_m2_1 reported REJECT because clicking without dragging on Trendline, Fibonacci, and Sticker overlays triggers a spurious onUpdate store commit.
Specifically for TrendlinePlugin.tsx:
In `handleStartDragHandle` and `handleStartDragLine`, `dragAnchorsRef.current` is set on `mousedown`. On `mouseup`, it unconditionally calls `if (dragAnchorsRef.current) { onUpdate({ anchors: dragAnchorsRef.current }); }`. If the user merely clicked to select without moving the mouse, `onUpdate` is fired with identical coordinates.

Task:
Analyze `TrendlinePlugin.tsx` in depth. Investigate how drag handle and line drag interactions work. Formulate the exact, safest, and most idiomatic fix strategy (e.g. `hasMovedRef` or tracking actual drag displacement) so that:
1. Pure click (mousedown + mouseup without movement) NEVER calls `onUpdate`.
2. Actual drag (mousedown + mousemove + mouseup) preserves 60fps drag preview in local state and calls `onUpdate` exactly once on mouseup.
3. Test 1, 2, and 3 in `src/test/empirical-overlay-drag-debounce.test.ts` pass cleanly.

Do NOT modify implementation code files yourself (you are a read-only explorer). Write your comprehensive findings and recommended fix strategy to:
`/home/duke/Project/marketview/.agents/teamwork/explorer_m2_fix_1/handoff.md`
Then send a completion message to the parent orchestrator.
