# BRIEFING — 2026-11-07T19:25:30Z

## Mission
Formulate an exact, airtight remediation strategy for TrendlinePlugin to fix the drag-away-and-return-to-origin defect across handle and line dragging, including defense-in-depth anchor equality checking.

## 🔒 My Identity
- Archetype: explorer
- Roles: investigator, analyzer, synthesizer
- Working directory: /home/duke/Project/marketview/.agents/teamwork/explorer_m2_return_1
- Original parent: a9a9c8ed-8a35-4f8f-8dd8-9119837c3c50
- Milestone: M2 Return (Trendline)

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Strict headless core architecture compliance
- Check DEAD_ENDS.md to avoid previously failed approaches
- Do NOT modify source files directly

## Current Parent
- Conversation ID: a9a9c8ed-8a35-4f8f-8dd8-9119837c3c50
- Updated: 2026-11-07T19:25:30Z

## Investigation State
- **Explored paths**: `TrendlinePlugin.tsx` (handle & line drag handlers, state lifecycle), `DEAD_ENDS.md` (iterations 3, 4, 5), `reviewer_m2_final_1/handoff.md`, `empirical-overlay-stress.test.ts`.
- **Key findings**:
  1. Handle dragging: Guard 1 screen check (`moveEvent.clientX === dragStartPointRef.current.x && moveEvent.clientY === dragStartPointRef.current.y`) returned early without checking `hasMovedRef.current`, leaving `hasMovedRef.current = true` and `dragAnchorsRef.current` with stale displaced coordinates; Guard 2 also compared against `effectiveAnchor` instead of initial `annotation.anchors[index]`.
  2. Line dragging: Guard 1 screen check (`dx === 0 && dy === 0`) returned early without resetting `hasMovedRef.current` or `dragAnchorsRef.current`. Furthermore, `handleMouseUp` lacked equality comparison against `annotation.anchors`, unconditionally calling `onUpdate({ anchors: dragAnchorsRef.current })`.
  3. Solution: In both handle and line dragging, when the cursor returns to origin (in screen or logical space), if `hasMovedRef.current` is true, immediately reset `hasMovedRef.current = false`, `dragAnchorsRef.current = null`, and `setDragAnchors(null)`. In `handleMouseUp`, compare `[a1, a2]` with `annotation.anchors[0]` and `annotation.anchors[1]` as defense-in-depth.
- **Unexplored areas**: None for TrendlinePlugin.

## Key Decisions Made
- Confirmed exact 2-tier guard structure: Guard 1 (screen-space) + Guard 2 (logical-space) with origin reset.
- Confirmed defense-in-depth equality check in `handleMouseUp` for both handles and line.
- Preserved 60fps local drag buffering and single-commit semantics.

## Artifact Index
- /home/duke/Project/marketview/.agents/teamwork/explorer_m2_return_1/DISPATCH.md — Dispatch log
- /home/duke/Project/marketview/.agents/teamwork/explorer_m2_return_1/BRIEFING.md — Situational awareness memory
- /home/duke/Project/marketview/.agents/teamwork/explorer_m2_return_1/progress.md — Liveness progress log
- /home/duke/Project/marketview/.agents/teamwork/explorer_m2_return_1/handoff.md — 5-component handoff report
