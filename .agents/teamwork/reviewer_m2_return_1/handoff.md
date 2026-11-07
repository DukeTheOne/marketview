# Handoff Report: Reviewer M2 Return 1 (Overlays Reviewer)

- **Agent**: `reviewer_m2_return_1`
- **Archetype / Roles**: reviewer, critic
- **Parent**: `orchestrator_m15` (`a9a9c8ed-8a35-4f8f-8dd8-9119837c3c50`)
- **Working Directory**: `/home/duke/Project/marketview/.agents/teamwork/reviewer_m2_return_1`
- **Timestamp**: 2026-11-07T19:33:00Z
- **Type**: Hard
- **Verdict**: **APPROVE**

---

## 1. Observation

### 1.1 Target Implementation Files Inspected
Direct inspection of the source code modified by `worker_m2_return` confirms:

1. **`src/features/chart/overlays/plugins/TrendlinePlugin.tsx`**:
   - **Handle Dragging (`handleStartDragHandle`)**:
     - *Guard 1 (Screen-space zero displacement, lines 96–108)*:
       ```tsx
       if (
         dragStartPointRef.current &&
         moveEvent.clientX === dragStartPointRef.current.x &&
         moveEvent.clientY === dragStartPointRef.current.y
       ) {
         if (hasMovedRef.current) {
           hasMovedRef.current = false;
           dragAnchorsRef.current = null;
           setDragAnchors(null);
         }
         return;
       }
       ```
     - *Guard 2 (Logical-space zero displacement, lines 121–132)*:
       ```tsx
       const isAnchorUnchanged =
         logical.timestamp === initialAnchor.timestamp &&
         logical.price === initialAnchor.price;

       if (isAnchorUnchanged) {
         if (hasMovedRef.current) {
           hasMovedRef.current = false;
           dragAnchorsRef.current = null;
           setDragAnchors(null);
         }
         return;
       }
       ```
     - *Defense-in-depth on `mouseup` (lines 149–163)*:
       ```tsx
       if (hasMovedRef.current && dragAnchorsRef.current) {
         const [a1, a2] = dragAnchorsRef.current;
         const isUnchanged =
           a1.timestamp === anchor0.timestamp &&
           a1.price === anchor0.price &&
           a2.timestamp === anchor1.timestamp &&
           a2.price === anchor1.price;
         if (!isUnchanged) {
           onUpdate({ anchors: dragAnchorsRef.current });
         }
       }
       hasMovedRef.current = false;
       dragAnchorsRef.current = null;
       setDragAnchors(null);
       ```
   - **Line Dragging (`handleStartDragLine`)**:
     - *Guard 1 (Screen-space, lines 191–199)*: checks `dx === 0 && dy === 0`; if `hasMovedRef.current`, resets `hasMovedRef.current = false`, `dragAnchorsRef.current = null`, `setDragAnchors(null)`.
     - *Guard 2 (Logical-space, lines 205–219)*: checks `newL1` & `newL2` against `anchor0` & `anchor1`; if unchanged and `hasMovedRef.current`, resets drag state and preview.
     - *Defense-in-depth on `mouseup` (lines 234–248)*: compares against `anchor0` and `anchor1` before dispatching `onUpdate`.
   - **JSX Attribute Fix (line 305)**: Invalid JSX attribute `style-custom={{ backgroundColor: payload.color }}` on Anchor 1 handle is completely removed.

2. **`src/features/chart/overlays/plugins/FibonacciPlugin.tsx`**:
   - **Handle Dragging (`handleStartDragHandle`)**:
     - *Guard 1 (Screen-space, lines 129–141)*: returns to `dragStartPointRef.current` resets `hasMovedRef.current = false`, `dragAnchorsRef.current = null`, `setDragAnchors(null)`.
     - *Guard 2 (Logical-space, lines 153–165)*: checks against canonical `initialAnchor` (`anchor0` or `anchor1`). Resets drag state and visual state if unchanged.
     - *Defense-in-depth on `mouseup` (lines 182–195)*: coordinate comparison against `anchor0` and `anchor1` before dispatching `onUpdate`.
   - **Body Dragging (`handleStartDragBody`)**:
     - *Guard 1 (Screen-space, lines 227–235)*: `dx === 0 && dy === 0` resets `hasMovedRef.current = false`, `dragAnchorsRef.current = null`, `setDragAnchors(null)`.
     - *Guard 2 (Logical-space, lines 246–261)*: compares `newL1` & `newL2` against `anchor0` & `anchor1`; resets if unchanged.
     - *Defense-in-depth on `mouseup` (lines 276–290)*: checks coordinates before firing `onUpdate`.

3. **`src/features/chart/overlays/plugins/StickerPlugin.tsx`**:
   - **Pin Dragging (`handleStartDrag`)**:
     - *Guard 1 (Screen-space, lines 131–143)*: resets `hasMovedRef.current = false`, `dragAnchorRef.current = null`, `setDragAnchor(null)`.
     - *Guard 2 (Logical-space, lines 155–166)*: matches `initialAnchor` timestamp and price; resets drag state.
     - *Defense-in-depth on `mouseup` (lines 178–190)*: compares `dragAnchorRef.current` against `annotation.anchors[0]`; suppresses `onUpdate` if identical.
   - **Textarea Keystroke Debounce & Flush (lines 81–107, 305–325)**:
     - Synchronous `localText` state (`setLocalText(val)`).
     - 250ms debounced persistence timer (`setTimeout(flushPendingMarkdown, 250)`).
     - Immediate flush on blur (`onBlur={flushPendingMarkdown}`).
     - Guaranteed cleanup flush on unmount (`useEffect(() => () => flushPendingMarkdown(), [])`).

4. **`src/test/empirical-overlay-stress.test.ts` (lines 1299–1732)**:
   - Added suite `Edge Case 5: Drag-away and return-to-origin suppression and preview reset` containing 5 rigorous tests:
     1. `Trendline handle drag-away and return-to-origin does NOT call onUpdate and resets handle position` (tested at lines 1302–1382).
     2. `Trendline line drag-away and return-to-origin does NOT call onUpdate and resets line position` (tested at lines 1384–1473).
     3. `Fibonacci handle drag-away and return-to-origin does NOT call onUpdate and resets handle position` (tested at lines 1475–1555).
     4. `Fibonacci body drag-away and return-to-origin does NOT call onUpdate and resets body position` (tested at lines 1557–1645).
     5. `Sticker pin drag-away and return-to-origin does NOT call onUpdate and resets sticker position` (tested at lines 1647–1731).

### 1.2 Verbatim Tool Command Results
1. **TypeScript Typecheck**:
   - Command: `npm run typecheck` (`tsc --noEmit`)
   - Result: Exit code `0`, 0 errors.
2. **Targeted Vitest Suite**:
   - Command: `npx vitest run src/test/empirical-overlay-drag-debounce.test.ts src/test/empirical-overlay-stress.test.ts --reporter=verbose`
   - Result: Exit code `0`, `Test Files 2 passed (2)`, `Tests 33 passed (33)`.
3. **Full Project Test Suite**:
   - Command: `npm run test`
   - Result: Exit code `0`, `Test Files 35 passed (35)`, `Tests 441 passed (441)`. Zero failures.
4. **Architectural Boundary Tests**:
   - Command: `npx vitest run src/core/__tests__/architecture-boundaries.test.ts src/core/__tests__/mobile-portability.test.ts`
   - Result: Exit code `0`, `Test Files 2 passed (2)`, `Tests 4 passed (4)`.
5. **Production Build**:
   - Command: `npm run build`
   - Result: Exit code `0`, built bundle in 2.53s (`dist/assets/index-RCtnJ2U4.js` 436.41 kB, `dist/assets/vendor-charts-BLo8nw8v.js` 173.95 kB).

### 1.3 Adversarial Integrity Audit
- **Hardcoded test results**: None. No conditionals branching on test environment IDs, mock strings, or synthetic flags.
- **Dummy or facade implementations**: None. Components render real SVG elements, attach real window listeners, and perform real coordinate projections.
- **Task shortcuts / bypasses**: None. The bug documented in Iteration 5 of `DEAD_ENDS.md` was thoroughly resolved at both screen-space and logical-space layers.
- **Fabricated verification logs**: None. All commands were independently executed and verified in this review session.

---

## 2. Logic Chain

1. **Root Cause Analysis (DEAD_ENDS.md Iteration 5)**:
   - Previously, screen-space checks returned early without checking `if (hasMovedRef.current)`. If a user dragged an anchor away (`hasMovedRef = true`, `dragAnchorsRef` populated) and subsequently returned the cursor to the drag origin before releasing, the early return bypassed resetting `hasMovedRef.current` and left displaced coordinates in `dragAnchorsRef.current`. On `mouseup`, `onUpdate` was invoked with stale intermediate coordinates.
2. **Dual-Guard Remediation Soundness**:
   - Updating Guard 1 (`moveEvent.clientX === dragStartPointRef.current.x && moveEvent.clientY === dragStartPointRef.current.y` and `dx === 0 && dy === 0`) to actively reset `hasMovedRef.current = false`, `dragAnchorsRef.current = null`, and `setDragAnchors(null)` ensures that returning to the starting pixel restores resting state immediately.
   - Updating Guard 2 (`logical.timestamp === initialAnchor.timestamp && logical.price === initialAnchor.price` and `isUnchanged` on both anchors) ensures that even if sub-pixel mouse movement occurs, snapping to the same initial candle/price level also resets `hasMovedRef.current` and preview state.
3. **Subsequent Drag-Away Re-arming**:
   - If a user returns to origin (resetting `hasMovedRef` to `false`) and then continues dragging to a new distinct target without releasing the mouse, subsequent `mousemove` events fail both Guard 1 and Guard 2, properly setting `hasMovedRef.current = true` with the fresh target coordinates.
   - On `mouseup`, `handleMouseUp` commits ONLY the final target position.
4. **Defense-in-Depth Suppression**:
   - Even in edge cases where floating point jitter or synthetic events bypass the guards, the `mouseup` handler explicitly compares `dragAnchorsRef.current` against `annotation.anchors` before invoking `onUpdate`. If coordinates match, `onUpdate` is strictly suppressed.
5. **Sticker Keystroke Zero-Lag & Flush Safety**:
   - `localText` state is synchronous with the textarea DOM. Keystrokes are buffered with a 250ms debounce timer.
   - Both `onBlur` and `unmount` trigger `flushPendingMarkdown()`, which clears the timer and persists pending text immediately. If no edits were made, `onUpdate` is not called.

---

## 3. Caveats

- **No Caveats**: The remediation directly addresses the root cause across all 3 overlay plugins (`TrendlinePlugin`, `FibonacciPlugin`, `StickerPlugin`), adds 5 empirical tests to `src/test/empirical-overlay-stress.test.ts`, and adheres strictly to all architectural invariants.

---

## 4. Conclusion

- **Verdict**: **APPROVE**
- All 7 dispatch objectives are verified:
  1. Return-to-origin in screen space (Guard 1) and logical space (Guard 2) resets `hasMovedRef.current = false`, `dragAnchorsRef.current = null` (or `dragAnchorRef.current = null`), and `setDragAnchors(null)` (or `setDragAnchor(null)`).
  2. On `mouseup`, defense-in-depth equality checks strictly suppress `onUpdate` when anchors match `annotation.anchors`.
  3. Dragging away after returning to origin commits ONLY the final target position.
  4. Stationary mouse movements from rest continue to suppress `onUpdate`.
  5. In `StickerPlugin.tsx`, 250ms debounced textarea editing, blur flush, and unmount flush remain fully operational.
  6. The 5 new Edge Case 5 tests in `src/test/empirical-overlay-stress.test.ts` pass and test real DOM/SVG behavior.
  7. `npm run typecheck` and `npx vitest run src/test/empirical-overlay-drag-debounce.test.ts src/test/empirical-overlay-stress.test.ts` pass with 0 errors (33 passed tests, 441 total across test suite).

---

## 5. Verification Method

To independently verify this implementation:

1. **Targeted Overlay Tests**:
   ```bash
   npx vitest run src/test/empirical-overlay-drag-debounce.test.ts src/test/empirical-overlay-stress.test.ts
   ```
   *Expected outcome*: 33 passed tests (23 tests in `empirical-overlay-stress.test.ts`, 10 tests in `empirical-overlay-drag-debounce.test.ts`).

2. **Full TypeScript Typecheck**:
   ```bash
   npm run typecheck
   ```
   *Expected outcome*: Exits with code 0.

3. **Complete Unit & Integration Test Suite**:
   ```bash
   npm run test
   ```
   *Expected outcome*: 441 passed tests across 35 test files.

4. **Production Build**:
   ```bash
   npm run build
   ```
   *Expected outcome*: Exits with code 0 in ~2.5s.
