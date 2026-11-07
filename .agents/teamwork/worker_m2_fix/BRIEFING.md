# BRIEFING — 2026-11-07T18:52:00Z

## Mission
Fix spurious onUpdate commits when clicking on chart overlays without dragging across TrendlinePlugin, FibonacciPlugin, and StickerPlugin.

## 🔒 My Identity
- Archetype: worker
- Roles: implementer, qa
- Working directory: /home/duke/Project/marketview/.agents/teamwork/worker_m2_fix
- Original parent: a9a9c8ed-8a35-4f8f-8dd8-9119837c3c50
- Milestone: milestone_2_gate_fix

## 🔒 Key Constraints
- Own exclusively: `src/features/chart/overlays/plugins/TrendlinePlugin.tsx`, `src/features/chart/overlays/plugins/FibonacciPlugin.tsx`, `src/features/chart/overlays/plugins/StickerPlugin.tsx`.
- Strict Headless Core & architecture invariants: no forbidden imports, minimal changes.
- Add hasMovedRef tracking to avoid spurious commits on simple clicks.
- Must pass `npx vitest run src/test/empirical-overlay-drag-debounce.test.ts`, `npm run typecheck`, `npm run test`, and `npm run build`.

## Current Parent
- Conversation ID: a9a9c8ed-8a35-4f8f-8dd8-9119837c3c50
- Updated: 2026-11-07T18:52:00Z

## Task Summary
- **What to build**: Fix click-without-drag spurious `onUpdate` commit across TrendlinePlugin, FibonacciPlugin, StickerPlugin.
- **Success criteria**: Vitest passing (including 10 empirical overlay tests), typecheck clean, full test suite clean, build clean.
- **Interface contracts**: `ChartAnnotation` schema, plugin props `(annotation, isSelected, onSelect, onUpdate, onDelete)`.
- **Code layout**: Plugins located in `src/features/chart/overlays/plugins/`.

## Key Decisions Made
- Implemented `hasMovedRef = useRef<boolean>(false)` in TrendlinePlugin, FibonacciPlugin, and StickerPlugin.
- In `mousedown` handlers, initialize `dragAnchorsRef.current = null` (or `dragAnchorRef.current = null`) and set `hasMovedRef.current = false`.
- In `mousemove` handlers, only set `hasMovedRef.current = true` and update `dragAnchorsRef` after computing valid logical coordinates from projector. Ignore `dx === 0 && dy === 0` for line/body dragging.
- In `mouseup` handlers, guard `onUpdate` commit with `if (hasMovedRef.current && dragAnchorsRef.current)` (or `dragAnchorRef.current`), and reset `hasMovedRef.current = false`, `dragAnchorsRef.current = null`, `setDragAnchors(null)`.

## Artifact Index
- DISPATCH.md — dispatch instructions
- BRIEFING.md — persistent working memory
- progress.md — liveness heartbeat
- handoff.md — 5-component handoff report

## Change Tracker
- **Files modified**:
  - `src/features/chart/overlays/plugins/TrendlinePlugin.tsx`: Added `hasMovedRef`, `dragAnchorsRef.current = null` on mousedown, `dx === 0 && dy === 0` guard, and guarded `onUpdate` commit on mouseup.
  - `src/features/chart/overlays/plugins/FibonacciPlugin.tsx`: Added `hasMovedRef`, `dragAnchorsRef.current = null` on mousedown, `dx === 0 && dy === 0` guard, and guarded `onUpdate` commit on mouseup.
  - `src/features/chart/overlays/plugins/StickerPlugin.tsx`: Added `hasMovedRef`, `dragAnchorRef.current = null` on mousedown, and guarded `onUpdate` commit on mouseup.
- **Build status**: PASS (all 33 test files, 407 tests; 0 type errors; production build clean)
- **Pending issues**: None

## Quality Status
- **Build/test result**: PASS (10/10 empirical tests passed, 407/407 vitest suite passed, `npm run build` passed)
- **Lint status**: Clean (tsc --noEmit passed with 0 errors)
- **Tests added/modified**: Verified against `src/test/empirical-overlay-drag-debounce.test.ts` (10/10 passing)
