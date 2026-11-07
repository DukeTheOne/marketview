# Handoff Report: Worker M2 Return (Remediation Implementer)

- **Agent**: `worker_m2_return`
- **Archetype / Roles**: implementer, qa, specialist
- **Parent**: `orchestrator_m15` (`a9a9c8ed-8a35-4f8f-8dd8-9119837c3c50`)
- **Working Directory**: `/home/duke/Project/marketview/.agents/teamwork/worker_m2_return`
- **Timestamp**: 2026-11-07T19:29:00Z
- **Type**: Hard

---

## 1. Observation

### 1.1 Target Files and Scope
Per dispatch instructions and explorer specifications (`explorer_m2_return_1/handoff.md`, `explorer_m2_return_2/handoff.md`, `explorer_m2_return_3/handoff.md`), the task required remediating the return-to-origin bug across:
- `src/features/chart/overlays/plugins/TrendlinePlugin.tsx` (handle & line dragging)
- `src/features/chart/overlays/plugins/FibonacciPlugin.tsx` (handle & body dragging)
- `src/features/chart/overlays/plugins/StickerPlugin.tsx` (pin dragging)
- `src/test/empirical-overlay-stress.test.ts` (adding 5 stress test cases under Edge Case 5)

### 1.2 Identified Pre-existing Flaw
Prior to remediation, `mousemove` event listeners in `TrendlinePlugin.tsx`, `FibonacciPlugin.tsx`, and `StickerPlugin.tsx` implemented Guard 1 (screen-space zero displacement) as:
```tsx
if (dragStartPointRef.current && moveEvent.clientX === dragStartPointRef.current.x && moveEvent.clientY === dragStartPointRef.current.y) {
  return;
}
```
and for line/body dragging:
```tsx
if (dx === 0 && dy === 0) return;
```
When a user dragged an anchor/body away (`hasMovedRef.current = true`, `dragAnchorsRef.current` populated with displaced coordinates) and then returned the cursor to the exact origin before releasing, the early return bypassed resetting `hasMovedRef.current` and left stale displaced coordinates in `dragAnchorsRef.current` and visual state. On `mouseup`, `onUpdate` was invoked with the intermediate displaced coordinates.

### 1.3 Executed Modifications

1. `src/features/chart/overlays/plugins/TrendlinePlugin.tsx`:
   - In `handleStartDragHandle`:
     - Guard 1 (screen-space): if `moveEvent.clientX === dragStartPointRef.current.x && moveEvent.clientY === dragStartPointRef.current.y`, if `hasMovedRef.current` is true, resets `hasMovedRef.current = false`, `dragAnchorsRef.current = null`, `setDragAnchors(null)`.
     - Guard 2 (logical-space): if `logical.timestamp === initialAnchor.timestamp && logical.price === initialAnchor.price`, resets `hasMovedRef.current = false`, `dragAnchorsRef.current = null`, `setDragAnchors(null)`.
     - `handleMouseUp`: compares `dragAnchorsRef.current` against `[anchor0, anchor1]` and commits `onUpdate` strictly if `hasMovedRef.current && !isUnchanged`.
   - In `handleStartDragLine`:
     - Guard 1 (screen-space): if `dx === 0 && dy === 0`, if `hasMovedRef.current` is true, resets `hasMovedRef.current = false`, `dragAnchorsRef.current = null`, `setDragAnchors(null)`.
     - Guard 2 (logical-space): if `newL1` and `newL2` match canonical `anchor0` and `anchor1`, resets `hasMovedRef.current = false`, `dragAnchorsRef.current = null`, `setDragAnchors(null)`.
     - `handleMouseUp`: defense-in-depth comparison against canonical `[anchor0, anchor1]` before dispatching `onUpdate`.

2. `src/features/chart/overlays/plugins/FibonacciPlugin.tsx`:
   - In `handleStartDragHandle`:
     - Guard 1 (screen-space): if cursor is at `dragStartPointRef.current`, resets `hasMovedRef.current = false`, `dragAnchorsRef.current = null`, `setDragAnchors(null)` if previously moved.
     - Guard 2 (logical-space): checks against canonical `initialAnchor` (`anchor0` or `anchor1`). Resets drag state if unchanged.
     - `handleMouseUp`: compares against `anchor0` and `anchor1` before dispatching `onUpdate`.
   - In `handleStartDragBody`:
     - Guard 1 (screen-space): if `dx === 0 && dy === 0`, resets `hasMovedRef.current = false`, `dragAnchorsRef.current = null`, `setDragAnchors(null)` if previously moved.
     - Guard 2 (logical-space): if projected `newL1` and `newL2` match `anchor0` and `anchor1`, resets drag state.
     - `handleMouseUp`: defense-in-depth comparison against canonical `[anchor0, anchor1]` before dispatching `onUpdate`.

3. `src/features/chart/overlays/plugins/StickerPlugin.tsx`:
   - In `handleStartDrag`:
     - Defines `initialAnchor = annotation.anchors[0] ?? primaryAnchor`.
     - Guard 1 (screen-space): if cursor is at `dragStartPointRef.current`, resets `hasMovedRef.current = false`, `dragAnchorRef.current = null`, `setDragAnchor(null)` if previously moved.
     - Guard 2 (logical-space): if projected logical anchor matches `initialAnchor`, resets drag state.
     - `handleMouseUp`: compares `dragAnchorRef.current` against `annotation.anchors[0]` and only commits if changed.

4. `src/test/empirical-overlay-stress.test.ts`:
   - Added test suite `Edge Case 5: Drag-away and return-to-origin suppression and preview reset` with 5 empirical tests:
     1. `Trendline handle drag-away and return-to-origin does NOT call onUpdate and resets handle position`
     2. `Trendline line drag-away and return-to-origin does NOT call onUpdate and resets line position`
     3. `Fibonacci handle drag-away and return-to-origin does NOT call onUpdate and resets handle position`
     4. `Fibonacci body drag-away and return-to-origin does NOT call onUpdate and resets body position`
     5. `Sticker pin drag-away and return-to-origin does NOT call onUpdate and resets sticker position`

### 1.4 Verification Outputs
- **Targeted Vitest Suite**:
  ```bash
  npx vitest run src/test/empirical-overlay-drag-debounce.test.ts src/test/empirical-overlay-stress.test.ts
  ```
  Output: `Test Files 2 passed (2)`, `Tests 33 passed (33)` (23 tests in `empirical-overlay-stress.test.ts`, 10 tests in `empirical-overlay-drag-debounce.test.ts`).
- **TypeScript Typecheck**:
  ```bash
  npm run typecheck
  ```
  Output: Exited with code 0 (`tsc --noEmit`).
- **Complete Test Suite**:
  ```bash
  npm run test
  ```
  Output: `Test Files 35 passed (35)`, `Tests 441 passed (441)`. Zero failures.
- **Production Build**:
  ```bash
  npm run build
  ```
  Output: Exited with code 0 (`tsc --noEmit && vite build`, built bundle in 2.53s).

---

## 2. Logic Chain

1. **Dead Ends Iteration 5 Root Cause**:
   - As documented in `DEAD_ENDS.md`, early returning from screen-space zero displacement checks without resetting `hasMovedRef.current` and clearing `dragAnchorsRef.current` caused the displaced coordinates from intermediate movement frames to persist in memory and preview state.
   - When the user released the mouse at $(x_0, y_0)$, `handleMouseUp` observed `hasMovedRef.current === true` and committed the intermediate displaced coordinates.

2. **Remediation Mechanism**:
   - By updating both Guard 1 (screen-space) and Guard 2 (logical-space) to check `if (hasMovedRef.current)` and actively reset:
     ```tsx
     hasMovedRef.current = false;
     dragAnchorsRef.current = null;
     setDragAnchors(null);
     ```
     the component ensures that returning the cursor to the origin immediately restores the visual preview to the resting position and disarms the drag commitment flag.
   - If the user returns to origin and subsequent mouse events move away again, the guards do not match, setting `hasMovedRef.current = true` with the fresh coordinates.
   - As defense-in-depth, `handleMouseUp` in all plugins compares coordinates against the canonical `annotation.anchors` array before firing `onUpdate`.

3. **Validation Through Empirical Testing**:
   - All 5 interaction targets (Trendline handle, Trendline line, Fibonacci handle, Fibonacci body, Sticker pin) were verified to:
     - Displace their visual preview while moving away.
     - Reset their visual preview to original resting coordinates upon returning to origin.
     - Dispatch zero `onUpdate` calls on `mouseup`.

---

## 3. Caveats

- **No Caveats**: The changes strictly touch the 4 designated files under exclusive write ownership. All architectural invariants (`src/core/` headless boundaries, logical coordinates) and existing test assertions remain intact with zero regressions.

---

## 4. Conclusion

- Return-to-origin remediation is completely implemented across `TrendlinePlugin.tsx`, `FibonacciPlugin.tsx`, and `StickerPlugin.tsx`.
- 5 comprehensive stress tests are added to `src/test/empirical-overlay-stress.test.ts`.
- All 441 tests pass cleanly across 35 test suites.
- Full typecheck (`npm run typecheck`) and production build (`npm run build`) pass with 0 errors.

---

## 5. Verification Method

To independently verify this implementation:

1. **Targeted Tests**:
   ```bash
   npx vitest run src/test/empirical-overlay-drag-debounce.test.ts src/test/empirical-overlay-stress.test.ts
   ```
   *Expected outcome*: 33 passed tests (23 stress tests including 5 Edge Case 5 tests, 10 drag-debounce tests).

2. **Full Typecheck**:
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
   *Expected outcome*: Clean bundle build in `dist/`.
