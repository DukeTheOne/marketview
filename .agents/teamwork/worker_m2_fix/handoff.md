# Handoff Report: Worker M2 Fix — Elimination of Spurious onUpdate Commits on Overlay Click

- **Agent**: `worker_m2_fix`
- **Archetype / Roles**: implementer, qa
- **Parent**: `orchestrator_m15` (`a9a9c8ed-8a35-4f8f-8dd8-9119837c3c50`)
- **Working Directory**: `/home/duke/Project/marketview/.agents/teamwork/worker_m2_fix`
- **Target Files**:
  - `src/features/chart/overlays/plugins/TrendlinePlugin.tsx`
  - `src/features/chart/overlays/plugins/FibonacciPlugin.tsx`
  - `src/features/chart/overlays/plugins/StickerPlugin.tsx`
- **Timestamp**: 2026-11-07T18:53:00Z
- **Type**: Hard handoff (implementation completed and verified)

---

## 1. Observation

### 1.1 Initial Test Failure
Running `npx vitest run src/test/empirical-overlay-drag-debounce.test.ts` prior to fixes yielded 3 test failures out of 10:

```
FAIL src/test/empirical-overlay-drag-debounce.test.ts > Empirical Adversarial Test: Overlay Drag Buffering & Typing Debounce > TrendlinePlugin Drag Buffering > empirically tests whether clicking without mouse movement triggers spurious onUpdate on trendline
AssertionError: expected "spy" to not be called at all, but actually been called 1 times

FAIL src/test/empirical-overlay-drag-debounce.test.ts > Empirical Adversarial Test: Overlay Drag Buffering & Typing Debounce > FibonacciPlugin Drag Buffering > empirically tests whether clicking without mouse movement triggers spurious onUpdate on Fibonacci
AssertionError: expected "spy" to not be called at all, but actually been called 1 times

FAIL src/test/empirical-overlay-drag-debounce.test.ts > Empirical Adversarial Test: Overlay Drag Buffering & Typing Debounce > StickerPlugin Drag Buffering & Debounced Keystrokes > empirically tests whether clicking sticker pin without movement triggers spurious onUpdate
AssertionError: expected "spy" to not be called at all, but actually been called 1 times
```

### 1.2 Verbatim Code Defect Locations
1. In `src/features/chart/overlays/plugins/TrendlinePlugin.tsx`:
   - Line 78: `handleStartDragHandle` assigned `dragAnchorsRef.current = [effectiveAnchor1, effectiveAnchor2];` upon `mousedown`.
   - Line 122: `handleStartDragLine` assigned `dragAnchorsRef.current = [effectiveAnchor1, effectiveAnchor2];` upon `mousedown`.
   - Lines 106 & 148: `handleMouseUp` evaluated `if (dragAnchorsRef.current) { onUpdate({ anchors: dragAnchorsRef.current }); }`, which evaluated to `true` on simple click without dragging.
2. In `src/features/chart/overlays/plugins/FibonacciPlugin.tsx`:
   - Line 110: `handleStartDragHandle` assigned `dragAnchorsRef.current = [effectiveAnchor1, effectiveAnchor2];` upon `mousedown`.
   - Line 154: `handleStartDragBody` assigned `dragAnchorsRef.current = [effectiveAnchor1, effectiveAnchor2];` upon `mousedown`.
   - Lines 138 & 186: `handleMouseUp` evaluated `if (dragAnchorsRef.current) { onUpdate({ anchors: dragAnchorsRef.current }); }`, which evaluated to `true` on simple click.
3. In `src/features/chart/overlays/plugins/StickerPlugin.tsx`:
   - Line 117: `handleStartDrag` assigned `dragAnchorRef.current = primaryAnchor;` upon `mousedown`.
   - Line 140: `handleMouseUp` evaluated `if (dragAnchorRef.current) { onUpdate({ anchors: [dragAnchorRef.current] }); }`, which evaluated to `true` on simple click.

---

## 2. Logic Chain

1. In browser event dispatch, selecting an overlay by clicking consists of `mousedown` followed by `mouseup` without translation or `mousemove`.
2. Because `dragAnchorsRef.current` (or `dragAnchorRef.current`) was eagerly assigned non-null default coordinates during `mousedown` in all three plugins, `handleMouseUp` observed a truthy ref and committed an `onUpdate` call with unchanged coordinates.
3. Each spurious `onUpdate` triggered `annotationStore.updateAnnotation`, updated `updatedAt`, invoked `repository.saveAnnotations` (IndexedDB write), recalculated `computeWorkspaceContentHash`, marked the workspace dirty (`isDirty = true`), and notified all store subscribers.
4. To solve this without altering the 60fps drag preview behavior:
   - Added a component-scoped `hasMovedRef = useRef<boolean>(false)`.
   - On `mousedown`, reset `hasMovedRef.current = false` and set `dragAnchorsRef.current = null` (or `dragAnchorRef.current = null`).
   - In `mousemove`, only after projecting valid logical coordinates from the mouse displacement (and ignoring `dx === 0 && dy === 0` in line/body drag), set `hasMovedRef.current = true`, update `dragAnchorsRef.current`, and update local preview state (`setDragAnchors` or `setDragAnchor`).
   - In `mouseup`, guard `onUpdate` commit with `if (hasMovedRef.current && dragAnchorsRef.current)` (or `dragAnchorRef.current`).
   - Clean up refs (`hasMovedRef.current = false; dragAnchorsRef.current = null;`) and clear local preview state.
5. On a click without movement, `hasMovedRef.current` is `false` and the ref is `null`, ensuring `onUpdate` is never called.
6. On an actual drag, `hasMovedRef.current` becomes `true` and the ref contains the final projected coordinates, committing `onUpdate` exactly once on mouse release.

---

## 3. Caveats

- **No Caveats**: The fix was applied cleanly across all three plugins strictly within the assigned write ownership boundaries. Existing debouncing behavior in `StickerPlugin` (250ms textarea typing debounce, blur flush, unmount flush) remains untouched and fully operational.

---

## 4. Conclusion

- Spurious `onUpdate` commits on simple click have been eliminated across `TrendlinePlugin.tsx`, `FibonacciPlugin.tsx`, and `StickerPlugin.tsx`.
- All 10 adversarial drag & debounce tests in `src/test/empirical-overlay-drag-debounce.test.ts` pass cleanly (100%).
- All 33 test files in the project pass with 407/407 tests passing.
- TypeScript check (`tsc --noEmit`) passes with 0 errors.
- Production bundle build (`npm run build`) passes cleanly.

---

## 5. Verification Method

To verify these changes independently:

1. **Run Empirical Overlay Drag & Debounce Test Suite**:
   ```bash
   npx vitest run src/test/empirical-overlay-drag-debounce.test.ts
   ```
   *Expected Output*: 10 passed (10). Output confirms `Trendline click without drag called onUpdate: 0 times`, `Fibonacci click without drag called onUpdate: 0 times`, and `Sticker pin click without drag called onUpdate: 0 times`.

2. **Run TypeScript Check**:
   ```bash
   npm run typecheck
   ```
   *Expected Output*: Exit code 0, 0 errors.

3. **Run Full Test Suite**:
   ```bash
   npm run test
   ```
   *Expected Output*: 33 test files passed, 407 tests passed, 0 failures.

4. **Run Production Build**:
   ```bash
   npm run build
   ```
   *Expected Output*: Built cleanly with 0 errors.

5. **Invalidation Conditions**:
   The fix is invalidated if:
   - Clicking an overlay without dragging causes `onUpdate` to be invoked.
   - Dragging an overlay handle or body fails to commit `onUpdate` on `mouseup`.
   - 60fps local preview stops updating during active drag.
