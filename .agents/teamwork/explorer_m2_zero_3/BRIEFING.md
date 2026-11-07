# BRIEFING — 2026-11-07T19:06:00Z

## Mission
Analyze handleStartDrag in StickerPlugin.tsx and formulate an airtight strategy to guard against zero-displacement mousemove events during sticker drag.

## 🔒 My Identity
- Archetype: explorer
- Roles: read-only investigation, defect analysis, diff preparation
- Working directory: /home/duke/Project/marketview/.agents/teamwork/explorer_m2_zero_3
- Original parent: a9a9c8ed-8a35-4f8f-8dd8-9119837c3c50
- Milestone: M2 Zero-Displacement Fix

## 🔒 Key Constraints
- Read-only investigation — do NOT implement directly in source code
- Provide exact code diff and verification method in handoff.md
- Ensure textarea 250ms debouncing and flushes remain unaffected

## Current Parent
- Conversation ID: a9a9c8ed-8a35-4f8f-8dd8-9119837c3c50
- Updated: 2026-11-07T19:00:00Z

## Investigation State
- **Explored paths**:
  - `src/features/chart/overlays/plugins/StickerPlugin.tsx`
  - `src/features/chart/overlays/plugins/TrendlinePlugin.tsx`
  - `src/features/chart/overlays/plugins/FibonacciPlugin.tsx`
  - `src/features/chart/ChartContainer.tsx`
  - `src/test/empirical-overlay-stress.test.ts`
  - `src/test/empirical-overlay-drag-debounce.test.ts`
  - Challenger handoffs (`challenger_m2_verif_1`, `challenger_m2_verif_2`)
- **Key findings**:
  - `handleStartDrag` in `StickerPlugin.tsx` unconditionally marks `hasMovedRef.current = true` on the first valid `logical` coordinate returned by `screenToLogical`.
  - In browser interactions where a zero-displacement `mousemove` event occurs at the exact `mousedown` coordinate, this commits a spurious `onUpdate` on `mouseup` with unchanged coordinates.
  - Furthermore, synthetic unit tests often invoke `onMouseDown` without `clientX`/`clientY` properties; relying solely on screen coordinates fails in those environments.
  - An airtight dual-guard solution checks: (1) screen displacement against `dragStartPointRef.current` when coordinates exist, and (2) logical displacement against `primaryAnchor` (`initialAnchor`) for synthetic or sub-pixel events.
  - If logical coordinates equal `initialAnchor`, `hasMovedRef.current` is not set (and if previously set during drag, it resets to false and clears `dragAnchorRef`), preventing any spurious update if the user returns to the starting position.
  - Textarea 250ms debouncing and blur/unmount flushes operate independently via `pendingMarkdownRef` and `debounceTimerRef`, and remain 100% unaffected.
- **Unexplored areas**: None. The defect mechanism, edge cases, and fix strategy are completely isolated and mapped.

## Key Decisions Made
- Implemented dual-guard mechanism (screen coordinates + logical coordinates) in `handleStartDrag`.
- Handle synthetic callers where `clientX`/`clientY` are missing by setting `dragStartPointRef.current = null` and relying on logical anchor comparison.
- Reset `hasMovedRef.current = false`, `dragAnchorRef.current = null`, `setDragAnchor(null)` when the cursor returns to the initial anchor during drag.

## Artifact Index
- DISPATCH.md — Initial dispatch message
- BRIEFING.md — Persistent context
- progress.md — Liveness heartbeat and milestone checklist
- handoff.md — 5-Component handoff report with exact git diff patch
