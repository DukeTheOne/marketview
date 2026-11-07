# Dispatch for Challenger M2-1 (Overlays Drag & Typing Adversarial Challenger)

**Role**: Overlay Drag & Debounce Adversarial Challenger
**Working Directory**: /home/duke/Project/marketview/.agents/teamwork/challenger_m2_1
**Project Root**: /home/duke/Project/marketview
**Original Request**: /home/duke/Project/marketview/.agents/teamwork/ORIGINAL_REQUEST.md
**Specification Document**: /home/duke/Project/marketview/docs/specs/milestone-15-performance-and-behavior-hardening.md
**Worker Handoff**: /home/duke/Project/marketview/.agents/teamwork/worker_m2/handoff.md

## Tasks:
Adversarially test the overlay drag buffering and typing debouncing in:
1. `TrendlinePlugin.tsx` & `FibonacciPlugin.tsx`:
   - Simulate rapid mousemove dragging across 100 pixels.
   - Verify that `onUpdate` is NOT called during `mousemove`.
   - Verify that `onUpdate` is called exactly ONCE on `mouseup` with the final anchors.
   - Verify click without mouse movement does not trigger spurious updates.
2. `StickerPlugin.tsx`:
   - Pin drag: verify zero `onUpdate` calls during `mousemove`, exactly one commit on `mouseup`.
   - Note textarea: simulate 20 rapid keystrokes within 200ms. Verify local state updates immediately, and `onUpdate` is fired once after 250ms of inactivity.
   - Note blur flush: simulate typing followed immediately by `blur` event before 250ms expires. Verify pending text is flushed synchronously to `onUpdate`.
   - Note unmount flush: simulate typing followed immediately by component unmount. Verify pending text is flushed.
3. Execute empirical tests with vitest / react-testing-library.
4. Output your report and verdict (`APPROVE` or `REJECT`) in `/home/duke/Project/marketview/.agents/teamwork/challenger_m2_1/handoff.md`.

## 2026-11-07T18:28:09Z
You are Challenger M2-1 (Overlay Drag & Typing Adversarial Challenger).
Your working directory is: /home/duke/Project/marketview/.agents/teamwork/challenger_m2_1
Your task description is in: /home/duke/Project/marketview/.agents/teamwork/challenger_m2_1/DISPATCH.md
Read /home/duke/Project/marketview/.agents/teamwork/ORIGINAL_REQUEST.md, the spec in docs/specs/milestone-15-performance-and-behavior-hardening.md, and worker_m2 handoff at /home/duke/Project/marketview/.agents/teamwork/worker_m2/handoff.md.
Adversarially test drag buffering (no store updates during mousemove, single commit on mouseup) and sticker note typing debouncing (250ms delay, flush on blur/unmount).
Write your challenge report and verdict (APPROVE or REJECT) to /home/duke/Project/marketview/.agents/teamwork/challenger_m2_1/handoff.md and notify your parent.
