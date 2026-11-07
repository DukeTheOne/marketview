# Handoff Report: Explorer M2 Fix 2 — FibonacciPlugin Drag Defect Analysis & Fix Strategy

- **Agent**: `explorer_m2_fix_2`
- **Role**: Explorer (Read-only investigation & architectural synthesis)
- **Target Component**: `src/features/chart/overlays/plugins/FibonacciPlugin.tsx`
- **Target Test Suite**: `src/test/empirical-overlay-drag-debounce.test.ts` (Tests 4 & 5)
- **Parent**: `orchestrator_m15` (`a9a9c8ed-8a35-4f8f-8dd8-9119837c3c50`)
- **Timestamp**: 2026-11-07T18:48:00Z

---

## 1. Observation

### 1.1 Empirical Vitest Execution & Verbatim Failure
Executing `npx vitest run src/test/empirical-overlay-drag-debounce.test.ts` produces the following failure in the Fibonacci test block:

```text
 ❯ src/test/empirical-overlay-drag-debounce.test.ts (10 tests | 3 failed) 348ms
   ✓ Empirical Adversarial Test: Overlay Drag Buffering & Typing Debounce > TrendlinePlugin Drag Buffering > buffers mousemove during handle drag and commits onUpdate exactly once on mouseup 136ms
   ✓ Empirical Adversarial Test: Overlay Drag Buffering & Typing Debounce > TrendlinePlugin Drag Buffering > buffers mousemove during whole trendline line drag and commits onUpdate once on mouseup 34ms
   × Empirical Adversarial Test: Overlay Drag Buffering & Typing Debounce > TrendlinePlugin Drag Buffering > empirically tests whether clicking without mouse movement triggers spurious onUpdate on trendline 12ms
   ✓ Empirical Adversarial Test: Overlay Drag Buffering & Typing Debounce > FibonacciPlugin Drag Buffering > buffers mousemove during zone drag and commits once on mouseup 66ms
   × Empirical Adversarial Test: Overlay Drag Buffering & Typing Debounce > FibonacciPlugin Drag Buffering > empirically tests whether clicking without mouse movement triggers spurious onUpdate on Fibonacci 3ms
     → expected "spy" to not be called at all, but actually been called 1 times

Received: 

  1st spy call:

    Array [
      Object {
        "anchors": Array [
          Object {
            "price": 100,
            "timestamp": 1700001000,
          },
          Object {
            "price": 200,
            "timestamp": 1700002000,
          },
        ],
      },
    ]


Number of calls: 1

 ❯ src/test/empirical-overlay-drag-debounce.test.ts:526:28
    524| 
    525|       console.log('EMPIRICAL OBSERVATION: Fibonacci click without drag…
    526|       expect(onUpdate).not.toHaveBeenCalled();
       |                            ^
    527|     });
```

### 1.2 Verbatim Code Inspection of `src/features/chart/overlays/plugins/FibonacciPlugin.tsx`

#### State & Ref Declarations (Lines 61–65):
```typescript
  const [dragAnchors, setDragAnchors] = useState<[LogicalAnchor, LogicalAnchor] | null>(null);
  const dragAnchorsRef = useRef<[LogicalAnchor, LogicalAnchor] | null>(null);
  const isDraggingHandleRef = useRef<number | null>(null);
  const isDraggingBodyRef = useRef<boolean>(false);
  const dragStartPointRef = useRef<{ x: number; y: number } | null>(null);
```

#### Handle Drag Handler `handleStartDragHandle` (Lines 106–147):
```typescript
  const handleStartDragHandle = (index: number, e: ReactMouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    isDraggingHandleRef.current = index;
    dragAnchorsRef.current = [effectiveAnchor1, effectiveAnchor2]; // <-- Populated on mousedown
    onSelect();

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
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (dragAnchorsRef.current) {                               // <-- Evaluates to TRUE on pure click!
        onUpdate({ anchors: dragAnchorsRef.current });            // <-- Spurious store commit!
      }
      dragAnchorsRef.current = null;
      setDragAnchors(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };
```

#### Zone Body Drag Handler `handleStartDragBody` (Lines 149–195):
```typescript
  const handleStartDragBody = (e: ReactMouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    isDraggingBodyRef.current = true;
    dragStartPointRef.current = { x: e.clientX, y: e.clientY };
    dragAnchorsRef.current = [effectiveAnchor1, effectiveAnchor2]; // <-- Populated on mousedown
    onSelect();

    const initialP1 = { ...p1 };
    const initialP2 = { ...p2 };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingBodyRef.current || !dragStartPointRef.current) return;
      const dx = moveEvent.clientX - dragStartPointRef.current.x;
      const dy = moveEvent.clientY - dragStartPointRef.current.y;

      const newL1 = projector.screenToLogical({
        x: initialP1.x + dx,
        y: initialP1.y + dy,
      });
      const newL2 = projector.screenToLogical({
        x: initialP2.x + dx,
        y: initialP2.y + dy,
      });

      if (newL1 && newL2) {
        const nextAnchors: [LogicalAnchor, LogicalAnchor] = [newL1, newL2];
        dragAnchorsRef.current = nextAnchors;
        setDragAnchors(nextAnchors);
      }
    };

    const handleMouseUp = () => {
      isDraggingBodyRef.current = false;
      dragStartPointRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (dragAnchorsRef.current) {                               // <-- Evaluates to TRUE on pure click!
        onUpdate({ anchors: dragAnchorsRef.current });            // <-- Spurious store commit!
      }
      dragAnchorsRef.current = null;
      setDragAnchors(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };
```

#### Interactive Elements Bound to Handlers:
- **Anchor 1 Handle** (Line 324): `<div onMouseDown={(e) => handleStartDragHandle(0, e)} ... title="Drag start anchor (0.0%)" />`
- **Anchor 2 Handle** (Line 337): `<div onMouseDown={(e) => handleStartDragHandle(1, e)} ... title="Drag end anchor (100.0%)" />`
- **Translucent Bands** (Line 220): `<rect onMouseDown={handleStartDragBody} onClick={...} ... />`
- **Diagonal Dashed Connector Line Hitbox** (Line 250): `<line onMouseDown={handleStartDragBody} onClick={...} ... />`
- **Horizontal Fibonacci Level Lines Hitbox** (Line 272): `<line onMouseDown={handleStartDragBody} onClick={...} ... />`

---

## 2. Logic Chain

1. **User Interaction Model**: A click in the DOM consists of `mousedown` followed by `mouseup` at the same (or subpixel) coordinates without mouse movement.
2. **Current Execution Flow on Pure Click**:
   - User clicks any interactive element of Fibonacci (band `<rect>`, connector `<line>`, level `<line>`, or anchor control point `<div>`).
   - `mousedown` invokes either `handleStartDragHandle` or `handleStartDragBody`.
   - Both handlers execute `dragAnchorsRef.current = [effectiveAnchor1, effectiveAnchor2]` (lines 110, 154).
   - Both handlers attach `mousemove` and `mouseup` event listeners to `window`.
   - The user immediately releases the mouse button. No `mousemove` event is dispatched.
   - `handleMouseUp` executes on `window`.
   - Line 138 / 186 executes `if (dragAnchorsRef.current) { onUpdate({ anchors: dragAnchorsRef.current }); }`.
   - Because `dragAnchorsRef.current` was assigned the 2-element array at `mousedown`, `if (dragAnchorsRef.current)` evaluates to `true`.
   - `onUpdate` is called with identical coordinates `[{ price: 100, timestamp: 1700001000 }, { price: 200, timestamp: 1700002000 }]`.
3. **Downstream Blast Radius in Store & Storage Layer**:
   - `onUpdate` invokes `annotationStore.updateAnnotation(id, updates)`.
   - `updateAnnotation` executes:
     1. `updatedAt: Math.floor(Date.now() / 1000)` (modifies domain entity metadata).
     2. `set({ annotations: next })` (triggers store subscriber broadcasts across all UI components).
     3. `await repository.saveAnnotations(next)` (initiates an IndexedDB `readwrite` transaction to disk).
     4. `computeWorkspaceContentHash()` recalculation (detects changed `updatedAt`).
     5. Marks workspace dirty (`isDirty = true`), triggering unwanted background cloud sync uploads.
4. **Architectural Contradiction**:
   - The entire purpose of Milestone 15 (§1.1.1 & R1) is to eliminate high-frequency store mutations and redundant IndexedDB writes. A selection click should simply select the annotation (`onSelect()`), NOT trigger an asynchronous database write or mark the workspace dirty.
5. **Why `?? [effectiveAnchor1, effectiveAnchor2]` Already Exists in Code**:
   - Line 125 of `handleStartDragHandle` already contains:
     ```typescript
     const currentAnchors = dragAnchorsRef.current ?? [effectiveAnchor1, effectiveAnchor2];
     ```
   - This proves `dragAnchorsRef.current` does not even need to be assigned on `mousedown`! If `dragAnchorsRef.current` begins as `null`, the fallback handles the first `mousemove` seamlessly.

---

## 3. Caveats

- **Scope Boundary**: This analysis specifically investigates `FibonacciPlugin.tsx` and its interaction patterns. Parallel issues exist in `TrendlinePlugin.tsx` and `StickerPlugin.tsx`, which have matching structures and should receive equivalent safeguards from their respective implementers.
- **Read-Only Explorer Invariant**: In accordance with the Explorer archetype instructions, no source files were edited in `src/`. All proposals are documented in this report for implementation by the designated worker.
- **Synthesized Test Coverage**: Both handle drag and body drag interaction surfaces were investigated. Test 4 in `src/test/empirical-overlay-drag-debounce.test.ts` targets body drag; Test 1 targets trendline handle drag. The proposed fix guarantees that BOTH handle drag and body drag are immune to click-without-drag spurious commits.

---

## 4. Conclusion & Recommended Fix Strategy

### 4.1 Recommended Design Pattern
The safest, most idiomatic fix implements a **three-tier safeguard**:

1. **Explicit Movement Tracking (`hasMovedRef`)**:
   Add `const hasMovedRef = useRef<boolean>(false);`.
   Reset `hasMovedRef.current = false;` in `handleStartDragHandle` and `handleStartDragBody`.
   Set `hasMovedRef.current = true;` inside `handleMouseMove` ONLY after a successful projection coordinate is obtained.
2. **Delayed Ref Assignment (`dragAnchorsRef.current = null`)**:
   Do NOT assign `[effectiveAnchor1, effectiveAnchor2]` on `mousedown`. Leave `dragAnchorsRef.current = null`.
   Assign `dragAnchorsRef.current = nextAnchors` only inside `handleMouseMove` when movement occurs.
3. **Zero-Delta Displacement Guard (`dx === 0 && dy === 0`)**:
   In `handleStartDragBody`, verify `if (dx === 0 && dy === 0) return;` so OS/browser synthetic zero-pixel `mousemove` events are ignored.
4. **Strict Mouseup Guard**:
   In `handleMouseUp`:
   ```typescript
   if (hasMovedRef.current && dragAnchorsRef.current) {
     onUpdate({ anchors: dragAnchorsRef.current });
   }
   hasMovedRef.current = false;
   dragAnchorsRef.current = null;
   setDragAnchors(null);
   ```

### 4.2 Concrete Code Changes (Diff / Before & After)

#### Change 1: Add `hasMovedRef` to `FibonacciAnnotationComponent`
**Target File**: `src/features/chart/overlays/plugins/FibonacciPlugin.tsx`  
**Location**: Line 65

```diff
  const isDraggingHandleRef = useRef<number | null>(null);
  const isDraggingBodyRef = useRef<boolean>(false);
  const dragStartPointRef = useRef<{ x: number; y: number } | null>(null);
+ const hasMovedRef = useRef<boolean>(false);
```

#### Change 2: Update `handleStartDragHandle`
**Target File**: `src/features/chart/overlays/plugins/FibonacciPlugin.tsx`  
**Location**: Lines 106–147

```diff
   const handleStartDragHandle = (index: number, e: ReactMouseEvent) => {
     e.stopPropagation();
     e.preventDefault();
+    hasMovedRef.current = false;
     isDraggingHandleRef.current = index;
-    dragAnchorsRef.current = [effectiveAnchor1, effectiveAnchor2];
+    dragAnchorsRef.current = null;
     onSelect();
 
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
 
+      hasMovedRef.current = true;
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
       window.removeEventListener('mousemove', handleMouseMove);
       window.removeEventListener('mouseup', handleMouseUp);
-      if (dragAnchorsRef.current) {
+      if (hasMovedRef.current && dragAnchorsRef.current) {
         onUpdate({ anchors: dragAnchorsRef.current });
       }
+      hasMovedRef.current = false;
       dragAnchorsRef.current = null;
       setDragAnchors(null);
     };
 
     window.addEventListener('mousemove', handleMouseMove);
     window.addEventListener('mouseup', handleMouseUp);
   };
```

#### Change 3: Update `handleStartDragBody`
**Target File**: `src/features/chart/overlays/plugins/FibonacciPlugin.tsx`  
**Location**: Lines 149–195

```diff
   const handleStartDragBody = (e: ReactMouseEvent) => {
     e.stopPropagation();
     e.preventDefault();
+    hasMovedRef.current = false;
     isDraggingBodyRef.current = true;
     dragStartPointRef.current = { x: e.clientX, y: e.clientY };
-    dragAnchorsRef.current = [effectiveAnchor1, effectiveAnchor2];
+    dragAnchorsRef.current = null;
     onSelect();
 
     const initialP1 = { ...p1 };
     const initialP2 = { ...p2 };
 
     const handleMouseMove = (moveEvent: MouseEvent) => {
       if (!isDraggingBodyRef.current || !dragStartPointRef.current) return;
       const dx = moveEvent.clientX - dragStartPointRef.current.x;
       const dy = moveEvent.clientY - dragStartPointRef.current.y;
+      if (dx === 0 && dy === 0) return;
 
       const newL1 = projector.screenToLogical({
         x: initialP1.x + dx,
         y: initialP1.y + dy,
       });
       const newL2 = projector.screenToLogical({
         x: initialP2.x + dx,
         y: initialP2.y + dy,
       });
 
       if (newL1 && newL2) {
+        hasMovedRef.current = true;
         const nextAnchors: [LogicalAnchor, LogicalAnchor] = [newL1, newL2];
         dragAnchorsRef.current = nextAnchors;
         setDragAnchors(nextAnchors);
       }
     };
 
     const handleMouseUp = () => {
       isDraggingBodyRef.current = false;
       dragStartPointRef.current = null;
       window.removeEventListener('mousemove', handleMouseMove);
       window.removeEventListener('mouseup', handleMouseUp);
-      if (dragAnchorsRef.current) {
+      if (hasMovedRef.current && dragAnchorsRef.current) {
         onUpdate({ anchors: dragAnchorsRef.current });
       }
+      hasMovedRef.current = false;
       dragAnchorsRef.current = null;
       setDragAnchors(null);
     };
 
     window.addEventListener('mousemove', handleMouseMove);
     window.addEventListener('mouseup', handleMouseUp);
   };
```

---

## 5. Verification Method

### 5.1 Verification Commands
Once the worker applies the proposed changes:

1. **Targeted Empirical Vitest Run**:
   ```bash
   npx vitest run src/test/empirical-overlay-drag-debounce.test.ts
   ```
   **Expected Result**:
   - `FibonacciPlugin Drag Buffering > buffers mousemove during zone drag and commits once on mouseup` **PASSES** (60fps preview maintained, exactly 1 `onUpdate` on mouseup).
   - `FibonacciPlugin Drag Buffering > empirically tests whether clicking without mouse movement triggers spurious onUpdate on Fibonacci` **PASSES** (`onUpdate` called 0 times).

2. **Dedicated Fibonacci Unit Test Suite**:
   ```bash
   npx vitest run src/features/chart/overlays/__tests__/fibonacci-plugin.test.ts
   ```
   **Expected Result**: All 9 unit tests pass.

3. **Full Project Typecheck & Test Suite**:
   ```bash
   npm run typecheck
   npm run test
   ```
   **Expected Result**: Exit code 0, 0 TypeScript errors, 100% unit tests passing.

### 5.2 Invalidation Conditions
The fix is considered invalid if any of the following occur:
- Simple click on any Fibonacci band or handle control point calls `onUpdate`.
- Dragging Fibonacci levels stops updating visual preview in real time (loss of 60fps local buffering).
- Releasing mouse after an actual drag fails to call `onUpdate` with the translated anchors.
- TypeScript compiler reports type mismatch or uninitialized ref errors.
