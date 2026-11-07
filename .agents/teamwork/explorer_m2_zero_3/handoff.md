# Handoff Report: Explorer M2 Zero 3 (StickerPlugin Zero-Displacement Guard)

- **Agent**: `explorer_m2_zero_3`
- **Archetype / Roles**: EXPLORER (investigation, synthesis)
- **Parent**: `orchestrator_m15` (`a9a9c8ed-8a35-4f8f-8dd8-9119837c3c50`)
- **Working Directory**: `/home/duke/Project/marketview/.agents/teamwork/explorer_m2_zero_3`
- **Date / Timestamp**: 2026-11-07T19:08:00Z
- **Target File**: `src/features/chart/overlays/plugins/StickerPlugin.tsx`

---

## 1. Observation

### 1.1 Verbatim Code Inspection of `StickerPlugin.tsx`
In `src/features/chart/overlays/plugins/StickerPlugin.tsx`, the drag interaction is handled by `handleStartDrag` (lines 114–153):
```tsx
74:  const [dragAnchor, setDragAnchor] = useState<LogicalAnchor | null>(null);
75:  const dragAnchorRef = useRef<LogicalAnchor | null>(null);
76:  const hasMovedRef = useRef<boolean>(false);
77:  const primaryAnchor = dragAnchor ?? annotation.anchors[0];
...
114:  const handleStartDrag = (e: ReactMouseEvent) => {
115:    e.stopPropagation();
116:    e.preventDefault();
117:    isDraggingRef.current = true;
118:    hasMovedRef.current = false;
119:    dragAnchorRef.current = null;
120:    onSelect();
121:
122:    const handleMouseMove = (moveEvent: MouseEvent) => {
123:      if (!isDraggingRef.current) return;
124:      const chartHost = document.querySelector('.overlay-canvas-root');
125:      if (!chartHost) return;
126:      const rect = chartHost.getBoundingClientRect();
127:      const point = {
128:        x: moveEvent.clientX - rect.left,
129:        y: moveEvent.clientY - rect.top,
130:      };
131:      const logical = projector.screenToLogical(point);
132:      if (logical) {
133:        hasMovedRef.current = true;
134:        dragAnchorRef.current = logical;
135:        setDragAnchor(logical);
136:      }
137:    };
138:
139:    const handleMouseUp = () => {
140:      isDraggingRef.current = false;
141:      window.removeEventListener('mousemove', handleMouseMove);
142:      window.removeEventListener('mouseup', handleMouseUp);
143:      if (hasMovedRef.current && dragAnchorRef.current) {
144:        onUpdate({ anchors: [dragAnchorRef.current] });
145:      }
146:      hasMovedRef.current = false;
147:      dragAnchorRef.current = null;
148:      setDragAnchor(null);
149:    };
150:
151:    window.addEventListener('mousemove', handleMouseMove);
152:    window.addEventListener('mouseup', handleMouseUp);
153:  };
```

### 1.2 Identified Defect Mechanism
1. **Unconditional `hasMovedRef.current = true`**:
   At line 132–136, when `screenToLogical(point)` returns a valid logical coordinate, `hasMovedRef.current` is unconditionally set to `true`, and `dragAnchorRef.current` is set to `logical`.
2. **Spurious Update on Zero Displacement**:
   If a `mousemove` event occurs at the exact initial coordinates (`moveEvent.clientX === dragStartPoint.x && moveEvent.clientY === dragStartPoint.y`), `screenToLogical` succeeds and returns the current anchor coordinates.
   On `mouseup` (line 143), `hasMovedRef.current` is `true`, invoking `onUpdate({ anchors: [dragAnchorRef.current] })`. This commits an update with anchors 100% identical to the pre-existing anchor, bumping `updatedAt`, triggering IndexedDB writes, and recalculating workspace content hashes.
3. **Synthetic Event Callers Lacking `clientX`/`clientY`**:
   In synthetic test suites (such as `empirical-overlay-drag-debounce.test.ts`), callers trigger `onMouseDown` with synthetic events that omit `clientX` and `clientY` (e.g. `pinProps.onMouseDown({ stopPropagation: vi.fn(), preventDefault: vi.fn() })`). An implementation that exclusively relies on `dragStartPointRef.current` would fail to guard against zero displacement when `dragStartPointRef.current` is `null`.

### 1.3 Baseline Test Status
Running existing tests confirms:
- `npx vitest run src/test/empirical-overlay-drag-debounce.test.ts`: **10 passed (10)** cleanly.
- `npx vitest run src/test/empirical-overlay-stress.test.ts`: **18 passed (18)**, where test #5 explicitly captured the defect:
  `EMPIRICAL FINDING: Sticker pin zero-displacement onUpdate calls: 1`.

---

## 2. Logic Chain

1. **Root Cause**: `handleStartDrag` lacks both a screen-space displacement check against the initial `(clientX, clientY)` and a logical displacement check against the initial `LogicalAnchor`.
2. **Dual-Guard Architecture**:
   - **Guard 1 (Screen Coordinates)**: Track the initial screen coordinate in `dragStartPointRef.current = { x: e.clientX, y: e.clientY }` whenever `typeof e.clientX === 'number' && typeof e.clientY === 'number'`. In `handleMouseMove`, if `dragStartPointRef.current` is present and matches `moveEvent.clientX` and `moveEvent.clientY`, return immediately without touching DOM or projector.
   - **Guard 2 (Logical Coordinates)**: Capture `const initialAnchor = primaryAnchor;` at drag start. If `dragStartPointRef.current` was null (due to synthetic callers omitting screen coordinates) or sub-pixel jitter occurred within the same candle snap window, check whether `logical.timestamp === initialAnchor.timestamp && logical.price === initialAnchor.price`. If identical, do not mark moved!
3. **Return-to-Origin Resilience**:
   If a user drags the sticker away to position B (`hasMovedRef.current = true`), but then brings the mouse back to the initial anchor position A before releasing the mouse button:
   - When `logical` matches `initialAnchor`, resetting `hasMovedRef.current = false; dragAnchorRef.current = null; setDragAnchor(null);` returns the preview back to the original anchor and prevents committing a spurious update upon `mouseup`.
4. **Debouncing & Flushes Isolation**:
   Textarea 250ms debouncing and flushes on blur/unmount are managed completely independently through `pendingMarkdownRef` and `debounceTimerRef`. `handleStartDrag` only affects the sticker anchor positioning (`onUpdate({ anchors })`) and has zero interaction with markdown payload state.
5. **Clean State Reset**:
   In `handleMouseUp`, resetting `dragStartPointRef.current = null;` ensures no stale coordinates carry over to subsequent interactions.

---

## 3. Caveats

- **Test Suite Assertion Update**: In `src/test/empirical-overlay-stress.test.ts` (lines 500–504), the test was originally written by Challenger M2 Verif 1 with `expect(onUpdate.mock.calls.length).toBe(1)` to assert the presence of the defect. Once the fix is applied, that assertion must be updated to `expect(onUpdate).not.toHaveBeenCalled();` (matching the pattern used for line and body drag tests in the same file).
- **Read-Only Scope**: In strict accordance with the explorer archetype rules, no source files were directly modified in this investigation. The exact diff is provided below for worker implementation.

---

## 4. Conclusion & Proposed Code Diff

### 4.1 Summary of Changes
1. Declare `dragStartPointRef = useRef<{ x: number; y: number } | null>(null);` in `StickerAnnotationComponent`.
2. In `handleStartDrag`, store `dragStartPointRef.current` if `e.clientX` and `e.clientY` are numeric; capture `const initialAnchor = primaryAnchor`.
3. In `handleMouseMove`, return early if screen coordinates match `dragStartPointRef.current`.
4. In `handleMouseMove`, after `projector.screenToLogical`, if `logical.timestamp === initialAnchor.timestamp && logical.price === initialAnchor.price`, reset moved state and return early.
5. In `handleMouseUp`, clear `dragStartPointRef.current = null`.

### 4.2 Exact Unified Patch for `src/features/chart/overlays/plugins/StickerPlugin.tsx`

```patch
--- a/src/features/chart/overlays/plugins/StickerPlugin.tsx
+++ b/src/features/chart/overlays/plugins/StickerPlugin.tsx
@@ -73,6 +73,7 @@ function StickerAnnotationComponent({
 }: OverlayAnnotationRenderProps<StickerPayload>) {
   const [dragAnchor, setDragAnchor] = useState<LogicalAnchor | null>(null);
   const dragAnchorRef = useRef<LogicalAnchor | null>(null);
+  const dragStartPointRef = useRef<{ x: number; y: number } | null>(null);
   const hasMovedRef = useRef<boolean>(false);
   const primaryAnchor = dragAnchor ?? annotation.anchors[0];
   const screenPos = primaryAnchor ? projector.logicalToScreen(primaryAnchor) : null;
@@ -118,10 +119,25 @@ function StickerAnnotationComponent({
     isDraggingRef.current = true;
     hasMovedRef.current = false;
     dragAnchorRef.current = null;
+    dragStartPointRef.current =
+      typeof e.clientX === 'number' && typeof e.clientY === 'number'
+        ? { x: e.clientX, y: e.clientY }
+        : null;
+    const initialAnchor = primaryAnchor;
     onSelect();
 
     const handleMouseMove = (moveEvent: MouseEvent) => {
       if (!isDraggingRef.current) return;
+
+      // Guard 1: Screen-space zero displacement (same clientX / clientY)
+      if (
+        dragStartPointRef.current !== null &&
+        moveEvent.clientX === dragStartPointRef.current.x &&
+        moveEvent.clientY === dragStartPointRef.current.y
+      ) {
+        return;
+      }
+
       const chartHost = document.querySelector('.overlay-canvas-root');
       if (!chartHost) return;
       const rect = chartHost.getBoundingClientRect();
@@ -130,17 +146,31 @@ function StickerAnnotationComponent({
         y: moveEvent.clientY - rect.top,
       };
       const logical = projector.screenToLogical(point);
-      if (logical) {
-        hasMovedRef.current = true;
-        dragAnchorRef.current = logical;
-        setDragAnchor(logical);
+      if (!logical) return;
+
+      // Guard 2: Logical anchor displacement (same candle timestamp & price level)
+      if (
+        logical.timestamp === initialAnchor.timestamp &&
+        logical.price === initialAnchor.price
+      ) {
+        if (hasMovedRef.current) {
+          hasMovedRef.current = false;
+          dragAnchorRef.current = null;
+          setDragAnchor(null);
+        }
+        return;
       }
+
+      hasMovedRef.current = true;
+      dragAnchorRef.current = logical;
+      setDragAnchor(logical);
     };
 
     const handleMouseUp = () => {
       isDraggingRef.current = false;
+      dragStartPointRef.current = null;
       window.removeEventListener('mousemove', handleMouseMove);
       window.removeEventListener('mouseup', handleMouseUp);
       if (hasMovedRef.current && dragAnchorRef.current) {
```

### 4.3 Corresponding Update for `src/test/empirical-overlay-stress.test.ts`
When the fix is implemented, lines 500–504 in `src/test/empirical-overlay-stress.test.ts` should be updated as follows:

```patch
--- a/src/test/empirical-overlay-stress.test.ts
+++ b/src/test/empirical-overlay-stress.test.ts
@@ -500,6 +500,5 @@ describe('Empirical Adversarial Stress Suite: Overlay Drag & Debounce Edge Cases
-      // EMPIRICAL FINDING: Sticker pin zero-displacement triggers spurious onUpdate
-      console.log('EMPIRICAL FINDING: Sticker pin zero-displacement onUpdate calls:', onUpdate.mock.calls.length);
-      expect(onUpdate.mock.calls.length).toBe(1);
-      expect(onUpdate.mock.calls[0]![0].anchors).toEqual(annotation.anchors);
+      console.log('Zero-displacement Sticker pin onUpdate calls:', onUpdate.mock.calls.length);
+      expect(onUpdate).not.toHaveBeenCalled();
     });
```

---

## 5. Verification Method

To independently verify this strategy once applied by the worker:

1. **Run Typecheck**:
   ```bash
   npm run typecheck
   ```
   *Expected*: Exit code 0, 0 TypeScript errors.

2. **Run Drag Buffering and Keystroke Debounce Suite**:
   ```bash
   npx vitest run src/test/empirical-overlay-drag-debounce.test.ts
   ```
   *Expected*: All 10 tests pass cleanly (verifies drag buffering, click without drag, 250ms debouncing, blur flush, and unmount flush).

3. **Run Adversarial Stress Suite**:
   ```bash
   npx vitest run src/test/empirical-overlay-stress.test.ts
   ```
   *Expected*: All 18 tests pass cleanly, confirming `Zero-displacement Sticker pin onUpdate calls: 0`.

4. **Run Full Test Suite**:
   ```bash
   npm run test
   ```
   *Expected*: All 35+ test files pass with 0 failures.

5. **Invalidation Conditions**:
   This remediation is invalidated if:
   - A zero-displacement `mousemove` event at `dragStartPoint` triggers `hasMovedRef.current = true`.
   - A synthetic drag caller omitting `clientX`/`clientY` triggers `onUpdate` on mouseup when the logical coordinates have not changed.
   - Textarea debouncing latency deviates from 250ms or fails to flush immediately on blur or unmount.
