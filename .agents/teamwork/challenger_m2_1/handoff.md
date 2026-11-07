# Handoff Report: Challenger M2-1 (Overlay Drag & Typing Adversarial Challenger)

**Challenger**: `challenger_m2_1`  
**Role**: critic, specialist  
**Parent**: `orchestrator_m15` (`a9a9c8ed-8a35-4f8f-8dd8-9119837c3c50`)  
**Target Worker**: `worker_m2`  
**Timestamp**: 2026-11-07T18:37:30Z  
**Verdict**: **REJECT**

---

## Challenge Summary

**Overall risk assessment**: **HIGH**

While `worker_m2` has successfully implemented 60fps drag buffering (zero store updates during rapid `mousemove`) and robust 250ms keystroke debouncing (with guaranteed immediate flush on both `onBlur` and component unmount), an adversarial stress-test discovered a **critical behavioral defect**:

> **Clicking any overlay element (trendline body/handle, Fibonacci zone/handle, or sticker pin/grip) without moving the mouse triggers a spurious `onUpdate` commit.**

This defect causes every simple selection click to trigger:
1. An unnecessary Zustand store mutation (`set({ annotations: next })`)
2. Updating `updatedAt` to the current Unix timestamp
3. An asynchronous IndexedDB `readwrite` transaction (`repository.saveAnnotations(next)`)
4. Full application re-rendering across all store subscribers
5. Recomputation of `computeWorkspaceContentHash()`
6. Invalidation of cloud sync (`isDirty = true`)

This explicitly violates task requirement 1.4:
> *"Verify click without mouse movement does not trigger spurious updates."*

---

## 1. Observation

### 1.1 Empirical Test Execution Results
An automated empirical stress harness was constructed at `/home/duke/Project/marketview/src/test/empirical-overlay-drag-debounce.test.ts`.

Executing `npx vitest run src/test/empirical-overlay-drag-debounce.test.ts`:

```
 ❯ src/test/empirical-overlay-drag-debounce.test.ts (10 tests | 3 failed) 345ms
   ✓ Empirical Adversarial Test > TrendlinePlugin Drag Buffering > buffers mousemove during handle drag and commits onUpdate exactly once on mouseup (137ms)
   ✓ Empirical Adversarial Test > TrendlinePlugin Drag Buffering > buffers mousemove during whole trendline line drag and commits onUpdate once on mouseup (33ms)
   × Empirical Adversarial Test > TrendlinePlugin Drag Buffering > empirically tests whether clicking without mouse movement triggers spurious onUpdate on trendline (11ms)
     → expected "spy" to not be called at all, but actually been called 1 times
   ✓ Empirical Adversarial Test > FibonacciPlugin Drag Buffering > buffers mousemove during zone drag and commits once on mouseup (62ms)
   × Empirical Adversarial Test > FibonacciPlugin Drag Buffering > empirically tests whether clicking without mouse movement triggers spurious onUpdate on Fibonacci (3ms)
     → expected "spy" to not be called at all, but actually been called 1 times
   ✓ Empirical Adversarial Test > StickerPlugin Drag Buffering & Debounced Keystrokes > buffers mousemove during pin drag and commits exactly once on mouseup (76ms)
   × Empirical Adversarial Test > StickerPlugin Drag Buffering & Debounced Keystrokes > empirically tests whether clicking sticker pin without movement triggers spurious onUpdate (2ms)
     → expected "spy" to not be called at all, but actually been called 1 times
   ✓ Empirical Adversarial Test > StickerPlugin Drag Buffering & Debounced Keystrokes > debounces 20 rapid keystrokes within 200ms and commits onUpdate once after 250ms of inactivity (13ms)
   ✓ Empirical Adversarial Test > StickerPlugin Drag Buffering & Debounced Keystrokes > flushes pending text synchronously on blur event before 250ms debounce expires (3ms)
   ✓ Empirical Adversarial Test > StickerPlugin Drag Buffering & Debounced Keystrokes > flushes pending text on unmount before 250ms debounce expires (2ms)

Test Files  1 failed (1)
     Tests  3 failed | 7 passed (10)
```

### 1.2 Verbatim Code Inspection & Root Cause

1. **`src/features/chart/overlays/plugins/TrendlinePlugin.tsx` (Lines 74–115 & 117–155)**:
   ```typescript
   // Handle Drag
   const handleStartDragHandle = (index: number, e: ReactMouseEvent) => {
     ...
     isDraggingHandleRef.current = index;
     dragAnchorsRef.current = [effectiveAnchor1, effectiveAnchor2]; // <-- Initialized on mousedown
     onSelect();

     const handleMouseUp = () => {
       isDraggingHandleRef.current = null;
       window.removeEventListener('mousemove', handleMouseMove);
       window.removeEventListener('mouseup', handleMouseUp);
       if (dragAnchorsRef.current) {                               // <-- Always truthy!
         onUpdate({ anchors: dragAnchorsRef.current });            // <-- Spurious update on click!
       }
       dragAnchorsRef.current = null;
       setDragAnchors(null);
     };
   ```
   ```typescript
   // Line Drag
   const handleStartDragLine = (e: ReactMouseEvent) => {
     ...
     isDraggingLineRef.current = true;
     dragStartPointRef.current = { x: e.clientX, y: e.clientY };
     dragAnchorsRef.current = [effectiveAnchor1, effectiveAnchor2]; // <-- Initialized on mousedown
     onSelect();

     const handleMouseUp = () => {
       isDraggingLineRef.current = false;
       dragStartPointRef.current = null;
       window.removeEventListener('mousemove', handleMouseMove);
       window.removeEventListener('mouseup', handleMouseUp);
       if (dragAnchorsRef.current) {                               // <-- Always truthy!
         onUpdate({ anchors: dragAnchorsRef.current });            // <-- Spurious update on click!
       }
       dragAnchorsRef.current = null;
       setDragAnchors(null);
     };
   ```

2. **`src/features/chart/overlays/plugins/FibonacciPlugin.tsx` (Lines 106–145 & 149–193)**:
   - `handleStartDragHandle` initializes `dragAnchorsRef.current = [effectiveAnchor1, effectiveAnchor2]`. On `mouseup`, it unconditionally invokes `onUpdate({ anchors: dragAnchorsRef.current })`.
   - `handleStartDragBody` initializes `dragAnchorsRef.current = [effectiveAnchor1, effectiveAnchor2]`. On `mouseup`, it unconditionally invokes `onUpdate({ anchors: dragAnchorsRef.current })`.

3. **`src/features/chart/overlays/plugins/StickerPlugin.tsx` (Lines 113–148)**:
   - `handleStartDrag` initializes `dragAnchorRef.current = primaryAnchor`. On `mouseup`, it unconditionally invokes `onUpdate({ anchors: [dragAnchorRef.current] })`.

---

## 2. Logic Chain

1. **Premise**: In DOM event handling, a mouse click is composed of `mousedown` followed by `mouseup` without intervening `mousemove` translation.
2. **Observation**: When `onMouseDown` fires on any interactive element (e.g. `<line onMouseDown={handleStartDragLine} onClick={...} />`), `handleStartDragLine` assigns `dragAnchorsRef.current = [effectiveAnchor1, effectiveAnchor2]`.
3. **Observation**: When `onMouseUp` fires, `handleMouseUp` checks `if (dragAnchorsRef.current)`. Because it was populated on `mousedown`, this condition evaluates to `true` even when `mousemove` never fired.
4. **Observation**: Consequently, `onUpdate({ anchors: dragAnchorsRef.current })` is executed.
5. **Impact**: `onUpdateAnnotation` calls `annotationStore.updateAnnotation(id, { anchors })`. This increments `updatedAt`, executes `repository.saveAnnotations` (IndexedDB write), triggers all store subscribers, recalculates `computeWorkspaceContentHash()`, and sets `isDirty = true`.
6. **Contradiction**: Milestone 15's mission is to eliminate unneeded store updates and IndexedDB thrashing. A pure selection click should select the annotation (`onSelect()`), NOT write back an unchanged copy of itself to the database.

---

## 3. Challenges

### [High] Challenge 1: Spurious Database Write and Workspace Dirty Flag on Pure Click Selection

- **Assumption challenged**: `if (dragAnchorsRef.current)` guards against committing un-dragged operations.
- **Attack scenario**: User clicks on a trendline, Fibonacci retracement, or sticker to select it or view its properties. User does not move the mouse.
- **Blast radius**:
  - Unnecessary IndexedDB disk I/O on every click.
  - Workspace `updatedAt` timestamps update even when nothing changed.
  - Workspace is falsely marked dirty, triggering unnecessary cloud sync uploads.
  - Full `<App />` and `<ChartContainer />` re-renders on simple selection.
- **Mitigation**:
  Track whether any movement actually occurred before committing on `mouseup`.
  
  **Recommended Fix Pattern**:
  Introduce a `hasMovedRef` boolean ref:
  ```typescript
  const hasMovedRef = useRef<boolean>(false);
  ```
  In `handleStartDrag...`:
  ```typescript
  hasMovedRef.current = false;
  ```
  In `handleMouseMove`:
  ```typescript
  hasMovedRef.current = true;
  ...
  ```
  In `handleMouseUp`:
  ```typescript
  if (hasMovedRef.current && dragAnchorsRef.current) {
    onUpdate({ anchors: dragAnchorsRef.current });
  }
  hasMovedRef.current = false;
  ```
  Apply this pattern across:
  - `TrendlinePlugin.tsx` (`handleStartDragHandle` and `handleStartDragLine`)
  - `FibonacciPlugin.tsx` (`handleStartDragHandle` and `handleStartDragBody`)
  - `StickerPlugin.tsx` (`handleStartDrag`)

---

## 4. Stress Test Results Summary

| Component | Scenario | Expected Behavior | Actual Behavior | Result |
| :--- | :--- | :--- | :--- | :--- |
| `TrendlinePlugin` | 100 rapid `mousemove` events across 100px | 0 `onUpdate` calls during move | 0 calls during move | **PASS** |
| `TrendlinePlugin` | `mouseup` after dragging handle | Exactly 1 `onUpdate` call with target anchors | 1 call with correct target coordinates | **PASS** |
| `TrendlinePlugin` | `mouseup` after dragging line | Exactly 1 `onUpdate` call with translated anchors | 1 call with correct translated coordinates | **PASS** |
| `TrendlinePlugin` | Pure click on line without movement | 0 `onUpdate` calls (no spurious store writes) | 1 spurious `onUpdate` call | **FAIL** |
| `FibonacciPlugin` | 100 rapid `mousemove` events across 100px | 0 `onUpdate` calls during move | 0 calls during move | **PASS** |
| `FibonacciPlugin` | `mouseup` after dragging band | Exactly 1 `onUpdate` call | 1 call with translated coordinates | **PASS** |
| `FibonacciPlugin` | Pure click on band without movement | 0 `onUpdate` calls (no spurious store writes) | 1 spurious `onUpdate` call | **FAIL** |
| `StickerPlugin` | 100 rapid `mousemove` events across 100px | 0 `onUpdate` calls during move | 0 calls during move | **PASS** |
| `StickerPlugin` | `mouseup` after dragging pin | Exactly 1 `onUpdate` call with target anchor | 1 call with target anchor | **PASS** |
| `StickerPlugin` | Pure click on pin without movement | 0 `onUpdate` calls (no spurious store writes) | 1 spurious `onUpdate` call | **FAIL** |
| `StickerPlugin` | 20 rapid keystrokes within 200ms | 0 `onUpdate` calls until 250ms of inactivity | 0 calls during typing; 1 call at t=250ms | **PASS** |
| `StickerPlugin` | Blur event at t=50ms before 250ms expiry | Synchronous flush to `onUpdate`, no duplicate | 1 synchronous call; 0 subsequent calls | **PASS** |
| `StickerPlugin` | Unmount at t=30ms before 250ms expiry | Synchronous flush to `onUpdate`, zero data loss | 1 synchronous call on unmount | **PASS** |

---

## 5. Caveats

- **No Caveats**: The review and adversarial challenge was conducted strictly against the assigned overlay drag buffering and typing debouncing components (`TrendlinePlugin.tsx`, `FibonacciPlugin.tsx`, `StickerPlugin.tsx`). In accordance with agent constraints, implementation code was NOT modified by the challenger.

---

## 6. Conclusion & Verdict

**Verdict**: **REJECT**

`worker_m2` successfully designed and implemented the 60fps local drag buffering and the 250ms typing debounce with blur/unmount flushes. However, because `dragAnchorsRef.current` / `dragAnchorRef.current` are initialized on `mousedown` without tracking `hasMoved`, every selection click without movement triggers an unnecessary `onUpdate` call, causing database writes and dirty hash re-computations.

Once `worker_m2` guards `onUpdate` with a `hasMovedRef` (or equivalent change check) across `TrendlinePlugin`, `FibonacciPlugin`, and `StickerPlugin`, all 10 tests in `src/test/empirical-overlay-drag-debounce.test.ts` will pass.

---

## 7. Verification Method

To verify the failure and subsequent fix:

1. **Run the Empirical Test Suite**:
   ```bash
   npx vitest run src/test/empirical-overlay-drag-debounce.test.ts
   ```
   *Current Result*: 3 tests fail with `expected "spy" to not be called at all, but actually been called 1 times`.
   *Target Result after Worker Fix*: All 10 tests pass (10/10).

2. **Run Full Test Suite & Typecheck**:
   ```bash
   npm run typecheck
   npm run test
   ```
