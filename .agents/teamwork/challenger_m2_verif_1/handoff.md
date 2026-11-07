# Empirical Handoff Report: Challenger M2 Verif 1

- **Agent**: `challenger_m2_verif_1`
- **Archetype / Roles**: EMPIRICAL CHALLENGER (critic, specialist)
- **Parent**: `orchestrator_m15` (`a9a9c8ed-8a35-4f8f-8dd8-9119837c3c50`)
- **Working Directory**: `/home/duke/Project/marketview/.agents/teamwork/challenger_m2_verif_1`
- **Date / Timestamp**: 2026-11-07T18:59:00Z
- **Verdict**: **REJECT** (Defect Found: Zero-Displacement Handle & Pin Drag Commits Spurious Updates)

---

## 1. Observation

### 1.1 Baseline Test Verification
Running `npx vitest run src/test/empirical-overlay-drag-debounce.test.ts` passed 10/10 tests cleanly:
```
 ✓ src/test/empirical-overlay-drag-debounce.test.ts (10 tests) 319ms
   ✓ Empirical Adversarial Test: Overlay Drag Buffering & Typing Debounce > TrendlinePlugin Drag Buffering > buffers mousemove during handle drag and commits onUpdate exactly once on mouseup
   ✓ Empirical Adversarial Test: Overlay Drag Buffering & Typing Debounce > TrendlinePlugin Drag Buffering > buffers mousemove during whole trendline line drag and commits onUpdate once on mouseup
   ✓ Empirical Adversarial Test: Overlay Drag Buffering & Typing Debounce > TrendlinePlugin Drag Buffering > empirically tests whether clicking without mouse movement triggers spurious onUpdate on trendline
   ✓ Empirical Adversarial Test: Overlay Drag Buffering & Typing Debounce > FibonacciPlugin Drag Buffering > buffers mousemove during zone drag and commits once on mouseup
   ✓ Empirical Adversarial Test: Overlay Drag Buffering & Typing Debounce > FibonacciPlugin Drag Buffering > empirically tests whether clicking without mouse movement triggers spurious onUpdate on Fibonacci
   ✓ Empirical Adversarial Test: Overlay Drag Buffering & Typing Debounce > StickerPlugin Drag Buffering & Debounced Keystrokes > buffers mousemove during pin drag and commits exactly once on mouseup
   ✓ Empirical Adversarial Test: Overlay Drag Buffering & Typing Debounce > StickerPlugin Drag Buffering & Debounced Keystrokes > empirically tests whether clicking sticker pin without movement triggers spurious onUpdate
   ✓ Empirical Adversarial Test: Overlay Drag Buffering & Typing Debounce > StickerPlugin Drag Buffering & Debounced Keystrokes > debounces 20 rapid keystrokes within 200ms and commits onUpdate once after 250ms of inactivity
   ✓ Empirical Adversarial Test: Overlay Drag Buffering & Typing Debounce > StickerPlugin Drag Buffering & Debounced Keystrokes > flushes pending text synchronously on blur event before 250ms debounce expires
   ✓ Empirical Adversarial Test: Overlay Drag Buffering & Typing Debounce > StickerPlugin Drag Buffering & Debounced Keystrokes > flushes pending text on unmount before 250ms debounce expires
```
All 10 tests passed (including tests 3, 5, 7 that previously failed when `dragAnchorsRef` was eagerly populated on `mousedown`).

### 1.2 Adversarial Edge-Case Stress Testing
A dedicated empirical stress suite was created in `src/test/empirical-overlay-stress.test.ts` executing 18 adversarial tests across the 4 edge cases specified in the dispatch:

1. **Edge Case 1: Zero-Displacement Drag Events (`mousemove` at same clientX/clientY)**:
   - **Trendline Line Drag**: `mousedown` at (150, 250), followed by 10 `mousemove` events at (150, 250) -> `onUpdate` called **0 times** (PASSED, properly ignored).
   - **Fibonacci Body Drag**: `mousedown` at (120, 200), followed by 10 `mousemove` events at (120, 200) -> `onUpdate` called **0 times** (PASSED, properly ignored).
   - **Trendline Handle Drag**: `mousedown` on Handle 0 at (100, 300), followed by `mousemove` at (100, 300) -> `onUpdate` called **1 time** with **identical coordinates** `[{"timestamp":1700001000,"price":100},{"timestamp":1700002000,"price":150}]` (**DEFECT: SPURIOUS UPDATE**).
   - **Fibonacci Handle Drag**: `mousedown` on Handle 0 at (100, 300), followed by `mousemove` at (100, 300) -> `onUpdate` called **1 time** with **identical coordinates** (**DEFECT: SPURIOUS UPDATE**).
   - **Sticker Pin Drag**: `mousedown` on Pin at (100, 260), followed by `mousemove` at (100, 260) -> `onUpdate` called **1 time** with **identical coordinates** (**DEFECT: SPURIOUS UPDATE**).

2. **Edge Case 2: Rapid Click-Spam Without Movement**:
   - 50 rapid `mousedown`/`mouseup` cycles on Trendline line -> `onUpdate` called **0 times** (PASSED).
   - 50 rapid `mousedown`/`mouseup` cycles on Trendline handle -> `onUpdate` called **0 times** (PASSED).
   - 50 rapid `mousedown`/`mouseup` cycles on Fibonacci band/handle -> `onUpdate` called **0 times** (PASSED).
   - 50 rapid `mousedown`/`mouseup` cycles on Sticker pin/header -> `onUpdate` called **0 times** (PASSED).

3. **Edge Case 3: Dragging Outside Viewport Bounds (`screenToLogical` returns null)**:
   - Dragging Trendline handle entirely out of bounds -> `onUpdate` called **0 times** (PASSED).
   - Dragging Trendline into bounds, then out of bounds -> `onUpdate` called **1 time** committing the last valid coordinate (PASSED).
   - Dragging Sticker pin entirely out of bounds -> `onUpdate` called **0 times** (PASSED).

4. **Edge Case 4: Textarea Typing Debounce, Blur, and Unmount Permutations**:
   - Focus + blur without typing -> `onUpdate` called **0 times** (PASSED).
   - Typing + immediate blur -> `onUpdate` called **1 time** immediately, timer cleared, no duplicate after 250ms (PASSED).
   - Typing + 300ms wait + blur -> `onUpdate` called **1 time** at 250ms, blur triggers 0 duplicate calls (PASSED).
   - Typing + immediate blur + unmount -> `onUpdate` called **1 time** (PASSED).
   - Typing + unmount before debounce -> `onUpdate` called **1 time** on unmount (PASSED).
   - Clean unmount without typing -> `onUpdate` called **0 times** (PASSED).

### 1.3 Verbatim Code Defect Locations
In `src/features/chart/overlays/plugins/TrendlinePlugin.tsx` (lines 135-138) and `FibonacciPlugin.tsx` (lines 167-170), line and body dragging protect against zero-displacement `mousemove` events using:
```ts
const dx = moveEvent.clientX - dragStartPointRef.current.x;
const dy = moveEvent.clientY - dragStartPointRef.current.y;
if (dx === 0 && dy === 0) return;
```
However, in:
1. `src/features/chart/overlays/plugins/TrendlinePlugin.tsx` (`handleStartDragHandle`, lines 75-103):
```ts
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (isDraggingHandleRef.current === null) return;
      const chartHost = document.querySelector('.overlay-canvas-root');
      if (!chartHost) return;
      const rect = chartHost.getBoundingClientRect();
      const point = {
        x: moveEvent.clientX - rect.left,
        y: moveEvent.clientY - rect.top,
      };
      const logical = projector.screenToLogical(point);
      if (!logical) return;

      hasMovedRef.current = true; // <-- BUG: unconditionally marks moved even if dx === 0 && dy === 0
```
2. `src/features/chart/overlays/plugins/FibonacciPlugin.tsx` (`handleStartDragHandle`, lines 107-135):
Identical logic missing initial clientX/clientY check, setting `hasMovedRef.current = true` on zero displacement.
3. `src/features/chart/overlays/plugins/StickerPlugin.tsx` (`handleStartDrag`, lines 114-137):
Identical logic missing initial clientX/clientY check, setting `hasMovedRef.current = true` on zero displacement.

---

## 2. Logic Chain

1. In browser environments (notably Linux X11/Wayland, Chrome on Windows, touchpad tap-to-click, and high-DPI displays), user interaction commonly emits a `mousemove` event at the exact `(clientX, clientY)` coordinates where `mousedown` was initiated.
2. In `TrendlinePlugin.tsx` and `FibonacciPlugin.tsx`, the implementer recognized this possibility for line/body dragging and guarded it by recording `dragStartPointRef.current` and evaluating `if (dx === 0 && dy === 0) return;`.
3. However, for handle dragging (`handleStartDragHandle`) in both plugins, and pin/header dragging (`handleStartDrag`) in `StickerPlugin.tsx`, no initial `dragStartPointRef` is recorded and no zero-displacement check exists.
4. Consequently, when a `mousemove` event fires with zero displacement at the handle or pin location, `projector.screenToLogical(point)` returns the current anchor coordinates.
5. Because `logical` is non-null, the handler executes `hasMovedRef.current = true` and saves `dragAnchorsRef.current` (or `dragAnchorRef.current`).
6. On `mouseup`, `handleMouseUp` checks `if (hasMovedRef.current && dragAnchorsRef.current)`. Because `hasMovedRef.current` was set to `true`, it invokes `onUpdate({ anchors: dragAnchorsRef.current })`.
7. As observed in Observation 1.2, this invokes `onUpdate` with anchors that are 100% identical to the pre-existing anchors.
8. Each spurious `onUpdate` triggers `annotationStore.updateAnnotation`, updates `updatedAt: nowSec`, triggers a store state broadcast causing full chart overlay re-renders, writes to IndexedDB via `repository.saveAnnotations`, and recalculates `computeWorkspaceContentHash`, marking the workspace dirty (`isDirty = true`).
9. Therefore, while pure clicks (zero `mousemove` events) are now safeguarded, zero-displacement drag events (`mousemove` at same clientX/clientY) remain vulnerable to spurious commits on handles and sticker pins.

---

## 3. Caveats

- **Pure Clicks are 100% Fixed**: When no `mousemove` event is dispatched between `mousedown` and `mouseup`, all 3 plugins (handles, lines, bands, pins, headers) cleanly suppress `onUpdate` (0 calls across 50 rapid clicks).
- **Textarea Debouncing & Lifecycle Flushes are 100% Solid**: All permutations of keystroke debouncing (250ms), immediate blur flush, direct unmount flush, and clean unmounts operate with zero defects or duplicate calls.
- **Out of Bounds Dragging is 100% Solid**: Out of bounds coordinates returning `null` from `screenToLogical` do not trigger spurious updates.
- **Blast Radius Scoping**: The remaining vulnerability is strictly confined to zero-displacement `mousemove` events on control handles (Trendline handles 0 & 1, Fibonacci handles 0 & 1) and Sticker pin/header grips.

---

## 4. Conclusion

- **Verdict**: **REJECT**
- **Action Required**: Harden handle and pin drag handlers against zero-displacement `mousemove` events, mirroring the `dx === 0 && dy === 0` safeguard already present in line and body dragging.
- **Recommended Remediation**:
  1. In `TrendlinePlugin.tsx` (`handleStartDragHandle`):
     - Record `dragStartPointRef.current = { x: e.clientX, y: e.clientY };` on `mousedown`.
     - In `handleMouseMove`: `if (moveEvent.clientX === dragStartPointRef.current?.x && moveEvent.clientY === dragStartPointRef.current?.y) return;`
  2. In `FibonacciPlugin.tsx` (`handleStartDragHandle`):
     - Record `dragStartPointRef.current = { x: e.clientX, y: e.clientY };` on `mousedown`.
     - In `handleMouseMove`: `if (moveEvent.clientX === dragStartPointRef.current?.x && moveEvent.clientY === dragStartPointRef.current?.y) return;`
  3. In `StickerPlugin.tsx` (`handleStartDrag`):
     - Record `dragStartPointRef.current = { x: e.clientX, y: e.clientY };` on `mousedown`.
     - In `handleMouseMove`: `if (moveEvent.clientX === dragStartPointRef.current?.x && moveEvent.clientY === dragStartPointRef.current?.y) return;`

---

## 5. Verification Method

To independently reproduce and verify this finding:

1. **Run the Stress Test Suite**:
   ```bash
   npx vitest run src/test/empirical-overlay-stress.test.ts
   ```
   *Observation*:
   ```
   stdout | ... > Trendline handle with zero-displacement mousemove triggers spurious onUpdate (defect)
   EMPIRICAL FINDING: Trendline handle zero-displacement onUpdate calls: 1

   stdout | ... > Fibonacci handle with zero-displacement mousemove triggers spurious onUpdate (defect)
   EMPIRICAL FINDING: Fibonacci handle zero-displacement onUpdate calls: 1

   stdout | ... > Sticker pin with zero-displacement mousemove triggers spurious onUpdate (defect)
   EMPIRICAL FINDING: Sticker pin zero-displacement onUpdate calls: 1
   ```

2. **Run the Baseline Empirical Drag & Debounce Suite**:
   ```bash
   npx vitest run src/test/empirical-overlay-drag-debounce.test.ts
   ```
   *Expected Output*: 10 passed (10).

3. **Invalidation Conditions**:
   This rejection is invalidated if:
   - Handle and pin `handleMouseMove` handlers ignore `mousemove` events when `moveEvent.clientX === dragStartPoint.x && moveEvent.clientY === dragStartPoint.y`.
   - Zero-displacement drag tests on handles and pins result in `onUpdate` call count == 0.
