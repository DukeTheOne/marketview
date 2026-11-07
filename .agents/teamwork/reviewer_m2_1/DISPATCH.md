# Dispatch for Reviewer M2-1 (Overlays & Toolbar Review)

**Role**: UI & Overlay Plugin Reviewer
**Working Directory**: /home/duke/Project/marketview/.agents/teamwork/reviewer_m2_1
**Project Root**: /home/duke/Project/marketview
**Original Request**: /home/duke/Project/marketview/.agents/teamwork/ORIGINAL_REQUEST.md
**Specification Document**: /home/duke/Project/marketview/docs/specs/milestone-15-performance-and-behavior-hardening.md
**Worker Handoff**: /home/duke/Project/marketview/.agents/teamwork/worker_m2/handoff.md

## Tasks:
Review the changes made by worker_m2 in:
1. `src/features/chart/overlays/plugins/TrendlinePlugin.tsx`:
   - Verify `dragAnchors` local state and `dragAnchorsRef` buffer mousemove drag updates.
   - Verify `onUpdate({ anchors })` is committed only on `mouseup`.
   - Verify invalid `style-custom` attribute is removed from Anchor 1 handle.
2. `src/features/chart/overlays/plugins/FibonacciPlugin.tsx`:
   - Verify `dragAnchors` buffers handle and body drag.
   - Verify single `onUpdate` commit on `mouseup`.
3. `src/features/chart/overlays/plugins/StickerPlugin.tsx`:
   - Verify `dragAnchor` buffers pin/header drag; single commit on `mouseup`.
   - Verify `<textarea>` maintains `localText` synchronously for 0-latency typing.
   - Verify `onUpdate({ payload: { markdown } })` is debounced by 250ms via timer ref and flushes immediately on `onBlur` or unmount.
4. `src/features/chart/overlays/ChartToolbar.tsx`:
   - Verify `showAdvancedTools = false` default hides Fibonacci and Trade Marker.
5. Verification commands:
   - Run `npm run typecheck` (`tsc --noEmit`).
   - Run `npx vitest run src/features/chart/`.
6. Output your review report and verdict (`APPROVE` or `REQUEST_CHANGES`) in `/home/duke/Project/marketview/.agents/teamwork/reviewer_m2_1/handoff.md`.


## 2026-11-07T18:28:09Z
You are Reviewer M2-1 (Overlays & Toolbar).
Your working directory is: /home/duke/Project/marketview/.agents/teamwork/reviewer_m2_1
Your task description is in: /home/duke/Project/marketview/.agents/teamwork/reviewer_m2_1/DISPATCH.md
Read /home/duke/Project/marketview/.agents/teamwork/ORIGINAL_REQUEST.md, the spec in docs/specs/milestone-15-performance-and-behavior-hardening.md, and worker_m2 handoff at /home/duke/Project/marketview/.agents/teamwork/worker_m2/handoff.md.
Review TrendlinePlugin.tsx, FibonacciPlugin.tsx, StickerPlugin.tsx, and ChartToolbar.tsx. Run typecheck and chart tests.
Write your review report and verdict (APPROVE or REQUEST_CHANGES) to /home/duke/Project/marketview/.agents/teamwork/reviewer_m2_1/handoff.md and notify your parent.
