# Handoff Report: Explorer M2 Zero 1 — Trendline Zero-Displacement Fix Strategy

- **Agent**: `explorer_m2_zero_1`
- **Archetype / Roles**: EXPLORER (investigator, synthesizer)
- **Parent**: `orchestrator_m15` (`a9a9c8ed-8a35-4f8f-8dd8-9119837c3c50`)
- **Working Directory**: `/home/duke/Project/marketview/.agents/teamwork/explorer_m2_zero_1`
- **Date / Timestamp**: 2026-11-08T03:05:00Z
- **Target Component**: `src/features/chart/overlays/plugins/TrendlinePlugin.tsx`

---

## 1. Observation

### 1.1 Line Drag vs. Handle Drag Asymmetry in `TrendlinePlugin.tsx`
Direct inspection of `/home/duke/Project/marketview/src/features/chart/overlays/plugins/TrendlinePlugin.tsx` revealed an asymmetry between line dragging and handle dragging:

In `handleStartDragLine` (lines 121–149):
```ts
125:     dragStartPointRef.current = { x: e.clientX, y: e.clientY };
...
133:     const handleMouseMove = (moveEvent: MouseEvent) => {
134:       if (!isDraggingLineRef.current || !dragStartPointRef.current) return;
135:       const dx = moveEvent.clientX - dragStartPointRef.current.x;
136:       const dy = moveEvent.clientY - dragStartPointRef.current.y;
137: 
138:       if (dx === 0 && dy === 0) return;
```
Line dragging records `dragStartPointRef.current` and explicitly aborts when `dx === 0 && dy === 0`.

In contrast, in `handleStartDragHandle` (lines 75–103):
```ts
75:   const handleStartDragHandle = (index: number, e: ReactMouseEvent) => {
76:     e.stopPropagation();
77:     e.preventDefault();
78:     isDraggingHandleRef.current = index;
79:     hasMovedRef.current = false;
80:     dragAnchorsRef.current = null;
81:     onSelect();
82: 
83:     const handleMouseMove = (moveEvent: MouseEvent) => {
84:       if (isDraggingHandleRef.current === null) return;
85:       const chartHost = document.querySelector('.overlay-canvas-root');
86:       if (!chartHost) return;
87:       const rect = chartHost.getBoundingClientRect();
88:       const point = {
89:         x: moveEvent.clientX - rect.left,
90:         y: moveEvent.clientY - rect.top,
91:       };
92:       const logical = projector.screenToLogical(point);
93:       if (!logical) return;
94: 
95:       hasMovedRef.current = true;
96:       const currentAnchors = dragAnchorsRef.current ?? [effectiveAnchor1, effectiveAnchor2];
97:       const nextAnchors: [LogicalAnchor, LogicalAnchor] = [
98:         isDraggingHandleRef.current === 0 ? logical : currentAnchors[0],
99:         isDraggingHandleRef.current === 1 ? logical : currentAnchors[1],
100:       ];
101:       dragAnchorsRef.current = nextAnchors;
102:       setDragAnchors(nextAnchors);
103:     };
```
Observations in `handleStartDragHandle`:
1. `dragStartPointRef.current` is not recorded on `onMouseDown`.
2. `handleMouseMove` does not compare `moveEvent.clientX/Y` with initial mouse coordinates.
3. If a zero-displacement `mousemove` occurs (e.g., Linux X11/Wayland, Chrome trackpad tap), `projector.screenToLogical(point)` executes and returns a non-null `logical` equal to the anchor being dragged.
4. Line 95 unconditionally assigns `hasMovedRef.current = true;`.
5. Line 101 populates `dragAnchorsRef.current = nextAnchors;` with coordinates identical to the existing anchors.
6. On `handleMouseUp` (lines 105–115):
```ts
109:       if (hasMovedRef.current && dragAnchorsRef.current) {
110:         onUpdate({ anchors: dragAnchorsRef.current });
111:       }
```
`hasMovedRef.current` evaluates to `true` and `dragAnchorsRef.current` is non-null, triggering `onUpdate` with unchanged anchors.

### 1.2 Synthetic Event Callers Without `clientX`/`clientY`
In `/home/duke/Project/marketview/src/test/empirical-overlay-drag-debounce.test.ts` (lines 216–222):
```ts
216:       // 1. Mouse down on handle 1
217:       act(() => {
218:         handle1Props.onMouseDown({
219:           stopPropagation: vi.fn(),
220:           preventDefault: vi.fn(),
221:         });
222:       });
```
Notice that synthetic tests or custom UI triggers may dispatch `onMouseDown` without `clientX` or `clientY`.
If an implementation only relies on `dragStartPointRef.current = { x: e.clientX, y: e.clientY }`, `dragStartPointRef.current` will be `null` or contain `undefined`. An unchecked access would fail to guard against zero-displacement events.

### 1.3 Adversarial Defect Demonstration Test
In `/home/duke/Project/marketview/src/test/empirical-overlay-stress.test.ts` (lines 315–379):
```ts
315:     it('Trendline handle with zero-displacement mousemove triggers spurious onUpdate (defect)', () => {
...
365:       // Mousemove at same position (100, 300)
366:       act(() => {
367:         dispatchWindowEvent('mousemove', { clientX: 100, clientY: 300 });
368:       });
369: 
370:       act(() => {
371:         dispatchWindowEvent('mouseup', {});
372:       });
373: 
374:       // EMPIRICAL FINDING: Because handle drag lacks dx===0 && dy===0 check, onUpdate IS called!
375:       console.log('EMPIRICAL FINDING: Trendline handle zero-displacement onUpdate calls:', onUpdate.mock.calls.length);
376:       expect(onUpdate.mock.calls.length).toBe(1);
377:       // The committed anchors are identical to the original annotation anchors
378:       expect(onUpdate.mock.calls[0]![0].anchors).toEqual(annotation.anchors);
379:     });
```
This test currently asserts `expect(onUpdate.mock.calls.length).toBe(1)` because Challenger M2 Verif 1 wrote it as empirical proof of the defect. When the fix is implemented, this test must be updated to assert `expect(onUpdate).not.toHaveBeenCalled();`.

---

## 2. Logic Chain

1. **User Interaction & Browser Event Semantics**:
   - High-precision pointing devices, trackpads, touch screens, and desktop environments (X11/Wayland/Windows) frequently emit a `mousemove` event at `(clientX, clientY)` immediately upon `mousedown` before any physical finger or mouse translation occurs.
2. **Handle Dragging Failure Mode**:
   - Because `handleStartDragHandle` lacks an initial mouse position check, that zero-displacement `mousemove` causes `screenToLogical` to project the unchanged screen point into the identical `logical` anchor.
   - `hasMovedRef.current` is set to `true`, and `dragAnchorsRef.current` is populated with `[logical, otherAnchor]`.
   - On `mouseup`, `hasMovedRef.current && dragAnchorsRef.current` is satisfied, calling `onUpdate({ anchors })`.
   - Each spurious `onUpdate` triggers `annotationStore.updateAnnotation`, updates `updatedAt`, notifies all subscribers, initiates an IndexedDB write transaction, recomputes `computeWorkspaceContentHash`, and marks the workspace dirty (`isDirty = true`).
3. **Requirement for Multi-Tier Defense**:
   - *Tier 1 (Screen Space)*: If `e.clientX` and `e.clientY` are provided on `onMouseDown`, store them in `dragStartPointRef.current`. In `handleMouseMove`, if `moveEvent.clientX === dragStartPointRef.current.x && moveEvent.clientY === dragStartPointRef.current.y`, return immediately. This provides an instant $O(1)$ fast path avoiding DOM bounding-rect queries and coordinate projection math.
   - *Tier 2 (Synthetic & Sub-Pixel Tolerance in Logical Space)*: If `e.clientX` was undefined on `onMouseDown` (synthetic event), `dragStartPointRef.current` is `null`. In this case, `logical` is calculated. We inspect whether `logical.timestamp === currentAnchor.timestamp && logical.price === currentAnchor.price`. If `!hasMovedRef.current`, the handle has not moved: return immediately without marking moved.
   - *Tier 3 (Reversion Tracking)*: If a user dragged away (`hasMovedRef.current = true`) and subsequently moved the cursor back to the exact starting anchor, `nextAnchors` is updated so the handle snaps back visually, and `hasMovedRef.current` is set back to `false`.
   - *Tier 4 (Commit-Time Invariance)*: In `handleMouseUp`, evaluate whether `dragAnchorsRef.current` differs from `annotation.anchors`. If anchors are identical, suppress `onUpdate`.
   - *Tier 5 (State Reset)*: On `handleMouseUp`, reset `dragStartPointRef.current = null;`, `isDraggingHandleRef.current = null;`, `hasMovedRef.current = false;`, and `dragAnchorsRef.current = null;`.

---

## 3. Caveats

1. **Scope Boundaries**:
   - This analysis specifically addresses `TrendlinePlugin.tsx` (handle 0 and handle 1).
   - Peer explorers `explorer_m2_zero_2` and `explorer_m2_zero_3` are concurrently addressing `FibonacciPlugin.tsx` and `StickerPlugin.tsx`.
2. **Stress Test Assertion Updates**:
   - In `src/test/empirical-overlay-stress.test.ts`, line 315 (`Trendline handle with zero-displacement mousemove triggers spurious onUpdate (defect)`) was intentionally written with `expect(onUpdate.mock.calls.length).toBe(1)` to demonstrate the failure.
   - Once the fix is applied, that test's expectation must be updated to `expect(onUpdate).not.toHaveBeenCalled();` (or `toBe(0)`). Leaving `toBe(1)` in the test would cause Vitest to fail when the fix succeeds.
3. **No Direct Code Modifications**:
   - As an Explorer agent, no changes have been applied directly to `src/features/chart/overlays/plugins/TrendlinePlugin.tsx` or `src/test/empirical-overlay-stress.test.ts`. This report provides the exact, production-ready patch for the Worker agent.

---

## 4. Conclusion & Concrete Implementation Proposal

### 4.1 Exact Code Diff for `TrendlinePlugin.tsx`

```patch
--- a/src/features/chart/overlays/plugins/TrendlinePlugin.tsx
+++ b/src/features/chart/overlays/plugins/TrendlinePlugin.tsx
@@ -75,20 +75,34 @@ function TrendlineAnnotationComponent({
   const handleStartDragHandle = (index: number, e: ReactMouseEvent) => {
     e.stopPropagation();
     e.preventDefault();
     isDraggingHandleRef.current = index;
+    dragStartPointRef.current =
+      e.clientX !== undefined && e.clientY !== undefined
+        ? { x: e.clientX, y: e.clientY }
+        : null;
     hasMovedRef.current = false;
     dragAnchorsRef.current = null;
     onSelect();
 
     const handleMouseMove = (moveEvent: MouseEvent) => {
       if (isDraggingHandleRef.current === null) return;
+      if (
+        dragStartPointRef.current &&
+        moveEvent.clientX === dragStartPointRef.current.x &&
+        moveEvent.clientY === dragStartPointRef.current.y
+      ) {
+        return;
+      }
+
       const chartHost = document.querySelector('.overlay-canvas-root');
       if (!chartHost) return;
       const rect = chartHost.getBoundingClientRect();
       const point = {
         x: moveEvent.clientX - rect.left,
         y: moveEvent.clientY - rect.top,
       };
       const logical = projector.screenToLogical(point);
       if (!logical) return;
 
+      const currentAnchor = isDraggingHandleRef.current === 0 ? effectiveAnchor1 : effectiveAnchor2;
+      const isAnchorUnchanged =
+        logical.timestamp === currentAnchor.timestamp &&
+        logical.price === currentAnchor.price;
+
+      if (isAnchorUnchanged && !hasMovedRef.current) {
+        return;
+      }
+
+      hasMovedRef.current = !isAnchorUnchanged;
       const currentAnchors = dragAnchorsRef.current ?? [effectiveAnchor1, effectiveAnchor2];
       const nextAnchors: [LogicalAnchor, LogicalAnchor] = [
         isDraggingHandleRef.current === 0 ? logical : currentAnchors[0],
         isDraggingHandleRef.current === 1 ? logical : currentAnchors[1],
       ];
       dragAnchorsRef.current = nextAnchors;
       setDragAnchors(nextAnchors);
     };
 
     const handleMouseUp = () => {
       isDraggingHandleRef.current = null;
+      dragStartPointRef.current = null;
       window.removeEventListener('mousemove', handleMouseMove);
       window.removeEventListener('mouseup', handleMouseUp);
       if (hasMovedRef.current && dragAnchorsRef.current) {
-        onUpdate({ anchors: dragAnchorsRef.current });
+        const [a1, a2] = dragAnchorsRef.current;
+        const isUnchanged =
+          a1.timestamp === annotation.anchors[0]?.timestamp &&
+          a1.price === annotation.anchors[0]?.price &&
+          a2.timestamp === annotation.anchors[1]?.timestamp &&
+          a2.price === annotation.anchors[1]?.price;
+        if (!isUnchanged) {
+          onUpdate({ anchors: dragAnchorsRef.current });
+        }
       }
       hasMovedRef.current = false;
       dragAnchorsRef.current = null;
       setDragAnchors(null);
     };
```

### 4.2 Exact Code Diff for `empirical-overlay-stress.test.ts` (Assertion Alignment)

```patch
--- a/src/test/empirical-overlay-stress.test.ts
+++ b/src/test/empirical-overlay-stress.test.ts
@@ -315,7 +315,7 @@ describe('Empirical Adversarial Stress Suite: Overlay Drag & Debounce Edge Cases
-    it('Trendline handle with zero-displacement mousemove triggers spurious onUpdate (defect)', () => {
+    it('Trendline handle with zero-displacement mousemove does NOT call onUpdate', () => {
       const projector = createMockProjector();
       const onUpdate = vi.fn();
       const plugin = overlayPluginRegistry.get('trendline')!;
@@ -374,8 +374,6 @@ describe('Empirical Adversarial Stress Suite: Overlay Drag & Debounce Edge Cases
-      // EMPIRICAL FINDING: Because handle drag lacks dx===0 && dy===0 check, onUpdate IS called!
-      console.log('EMPIRICAL FINDING: Trendline handle zero-displacement onUpdate calls:', onUpdate.mock.calls.length);
-      expect(onUpdate.mock.calls.length).toBe(1);
-      // The committed anchors are identical to the original annotation anchors
-      expect(onUpdate.mock.calls[0]![0].anchors).toEqual(annotation.anchors);
+      console.log('Zero-displacement Trendline handle onUpdate calls:', onUpdate.mock.calls.length);
+      expect(onUpdate).not.toHaveBeenCalled();
     });
```

---

## 5. Verification Method

### 5.1 Verification Commands
1. **Typecheck Verification**:
   ```bash
   npm run typecheck
   ```
   *Expected Result*: Exits with code 0 and zero TypeScript diagnostics.

2. **Run Empirical Overlay Tests**:
   ```bash
   npx vitest run src/test/empirical-overlay-drag-debounce.test.ts src/test/empirical-overlay-stress.test.ts
   ```
   *Expected Result*:
   - `empirical-overlay-drag-debounce.test.ts`: 10/10 passed.
   - `empirical-overlay-stress.test.ts`: 18/18 passed.
   - Console output for `Trendline handle with zero-displacement mousemove does NOT call onUpdate` reports:
     `Zero-displacement Trendline handle onUpdate calls: 0`

3. **Run Full Test Suite**:
   ```bash
   npm run test
   ```
   *Expected Result*: All tests pass cleanly across the entire workspace.

### 5.2 Invalidation Conditions
This strategy is invalidated if:
1. `handleStartDragHandle` commits an `onUpdate` when `mousemove` events share identical `clientX`/`clientY` with `onMouseDown`.
2. Synthetic callers omitting `clientX`/`clientY` trigger `hasMovedRef.current = true` on handle clicks.
3. Actual handle dragging (where mouse moves > 0px) fails to update `dragAnchors` or fails to commit final anchors on `mouseup`.
4. Dragging a handle out and returning to its original position leaves visual artifacts or commits redundant anchor updates.
