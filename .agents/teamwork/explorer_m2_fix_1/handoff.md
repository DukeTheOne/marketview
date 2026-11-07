# Handoff Report: Explorer M2 Fix 1 — TrendlinePlugin Drag Buffering & Spurious Update Elimination

- **Agent**: `explorer_m2_fix_1`
- **Archetype**: explorer (investigation, synthesis)
- **Parent**: `orchestrator_m15` (`a9a9c8ed-8a35-4f8f-8dd8-9119837c3c50`)
- **Working Directory**: `/home/duke/Project/marketview/.agents/teamwork/explorer_m2_fix_1`
- **Target File**: `/home/duke/Project/marketview/src/features/chart/overlays/plugins/TrendlinePlugin.tsx`
- **Timestamp**: 2026-11-07T18:47:00Z
- **Type**: Hard handoff (complete investigation and concrete fix proposal)

---

## 1. Observation

### 1.1 Test Failure Reproduction
Executing `npx vitest run src/test/empirical-overlay-drag-debounce.test.ts`:
```
 FAIL  src/test/empirical-overlay-drag-debounce.test.ts > Empirical Adversarial Test: Overlay Drag Buffering & Typing Debounce > TrendlinePlugin Drag Buffering > empirically tests whether clicking without mouse movement triggers spurious onUpdate on trendline
AssertionError: expected "spy" to not be called at all, but actually been called 1 times

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
            "price": 150,
            "timestamp": 1700002000,
          },
        ],
      },
    ]

Number of calls: 1 

 ❯ src/test/empirical-overlay-drag-debounce.test.ts:390:28
    388| 
    389|       console.log('EMPIRICAL OBSERVATION: Trendline click without drag called onUpdate:', onUpdate.mock.calls.length, 'times');
    390|       expect(onUpdate).not.toHaveBeenCalled();
       |                            ^
```
Test 1 (`buffers mousemove during handle drag and commits onUpdate exactly once on mouseup`) and Test 2 (`buffers mousemove during whole trendline line drag and commits onUpdate once on mouseup`) currently PASS. Test 3 (`empirically tests whether clicking without mouse movement triggers spurious onUpdate on trendline`) FAILS.

### 1.2 Verbatim Code Inspection of `TrendlinePlugin.tsx`

Located at `/home/duke/Project/marketview/src/features/chart/overlays/plugins/TrendlinePlugin.tsx`:

1. **State and Refs initialization (Lines 34–38)**:
   ```tsx
   const [dragAnchors, setDragAnchors] = useState<[LogicalAnchor, LogicalAnchor] | null>(null);
   const dragAnchorsRef = useRef<[LogicalAnchor, LogicalAnchor] | null>(null);
   const isDraggingHandleRef = useRef<number | null>(null);
   const isDraggingLineRef = useRef<boolean>(false);
   const dragStartPointRef = useRef<{ x: number; y: number } | null>(null);
   ```

2. **Handle Drag Handler (Lines 74–115)**:
   ```tsx
   const handleStartDragHandle = (index: number, e: ReactMouseEvent) => {
     e.stopPropagation();
     e.preventDefault();
     isDraggingHandleRef.current = index;
     dragAnchorsRef.current = [effectiveAnchor1, effectiveAnchor2]; // <-- Line 78: initialized on mousedown
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
       if (dragAnchorsRef.current) { // <-- Line 106: ALWAYS truthy because initialized on mousedown!
         onUpdate({ anchors: dragAnchorsRef.current }); // <-- Spurious store commit!
       }
       dragAnchorsRef.current = null;
       setDragAnchors(null);
     };

     window.addEventListener('mousemove', handleMouseMove);
     window.addEventListener('mouseup', handleMouseUp);
   };
   ```

3. **Line Drag Handler (Lines 117–157)**:
   ```tsx
   const handleStartDragLine = (e: ReactMouseEvent) => {
     e.stopPropagation();
     e.preventDefault();
     isDraggingLineRef.current = true;
     dragStartPointRef.current = { x: e.clientX, y: e.clientY };
     dragAnchorsRef.current = [effectiveAnchor1, effectiveAnchor2]; // <-- Line 122: initialized on mousedown
     onSelect();

     const initialP1 = { ...p1 };
     const initialP2 = { ...p2 };

     const handleMouseMove = (moveEvent: MouseEvent) => {
       if (!isDraggingLineRef.current || !dragStartPointRef.current) return;
       const dx = moveEvent.clientX - dragStartPointRef.current.x;
       const dy = moveEvent.clientY - dragStartPointRef.current.y;

       const newL1 = projector.screenToLogical({ x: initialP1.x + dx, y: initialP1.y + dy });
       const newL2 = projector.screenToLogical({ x: initialP2.x + dx, y: initialP2.y + dy });

       if (newL1 && newL2) {
         const nextAnchors: [LogicalAnchor, LogicalAnchor] = [newL1, newL2];
         dragAnchorsRef.current = nextAnchors;
         setDragAnchors(nextAnchors);
       }
     };

     const handleMouseUp = () => {
       isDraggingLineRef.current = false;
       dragStartPointRef.current = null;
       window.removeEventListener('mousemove', handleMouseMove);
       window.removeEventListener('mouseup', handleMouseUp);
       if (dragAnchorsRef.current) { // <-- Line 148: ALWAYS truthy!
         onUpdate({ anchors: dragAnchorsRef.current }); // <-- Spurious store commit!
       }
       dragAnchorsRef.current = null;
       setDragAnchors(null);
     };

     window.addEventListener('mousemove', handleMouseMove);
     window.addEventListener('mouseup', handleMouseUp);
   };
   ```

### 1.3 Synthetic Event Differences in Test Suite
In `src/test/empirical-overlay-drag-debounce.test.ts`:
- Handle Drag test (Lines 218–222):
  ```tsx
  handle1Props.onMouseDown({
    stopPropagation: vi.fn(),
    preventDefault: vi.fn(),
  });
  ```
  `e.clientX` and `e.clientY` are `undefined` on `handle1Props.onMouseDown`.
- Line Drag test (Lines 300–305):
  `clientX: 150, clientY: 250` are provided.
- Click without drag test (Lines 377–382):
  `clientX: 150, clientY: 250` are provided, but NO window `mousemove` event is dispatched.

---

## 2. Logic Chain

1. **Premise**: In DOM mouse interactions, a simple click consists of `mousedown` followed by `mouseup` without intervening `mousemove` translation.
2. **Observation**: In both `handleStartDragHandle` (line 78) and `handleStartDragLine` (line 122), `dragAnchorsRef.current` is eagerly assigned `[effectiveAnchor1, effectiveAnchor2]` at the moment of `mousedown`.
3. **Observation**: If the user releases the mouse button without moving, `handleMouseUp` runs.
4. **Observation**: `handleMouseUp` inspects `if (dragAnchorsRef.current)` (lines 106, 148). Because `dragAnchorsRef.current` was populated during `mousedown`, this condition evaluates to `true`.
5. **Observation**: `onUpdate({ anchors: dragAnchorsRef.current })` is executed with the un-modified initial anchors.
6. **Impact**:
   - `onUpdateAnnotation` calls `annotationStore.updateAnnotation(id, { anchors })`.
   - `updatedAt` is updated to `Date.now() / 1000`.
   - `saveAnnotations` executes an IndexedDB write transaction.
   - `computeWorkspaceContentHash()` changes, marking `isDirty = true` for cloud sync.
   - All store subscribers re-render.
7. **Resolution Strategy**:
   - Maintain a boolean `hasMovedRef` initialized to `false` at the component level (`useRef<boolean>(false)`).
   - In both `handleStartDragHandle` and `handleStartDragLine`:
     - On `mousedown`: reset `hasMovedRef.current = false;` and `dragAnchorsRef.current = null;`.
     - In `handleMouseMove`: only after successfully computing valid non-null logical anchor projections, set `hasMovedRef.current = true;` and `dragAnchorsRef.current = nextAnchors;`.
     - For line drag: ignore zero-displacement movements (`if (dx === 0 && dy === 0) return;`).
     - In `handleMouseUp`: guard the commit with `if (hasMovedRef.current && dragAnchorsRef.current) { onUpdate({ anchors: dragAnchorsRef.current }); }`, then reset `hasMovedRef.current = false; dragAnchorsRef.current = null; setDragAnchors(null);`.
8. **Result**:
   - Pure click without movement: `hasMovedRef.current` is `false`, `dragAnchorsRef.current` is `null`. Neither condition matches; `onUpdate` is NOT called.
   - Movement: `hasMovedRef.current` is `true`, `dragAnchorsRef.current` holds the latest 60fps projected anchors. On `mouseup`, `onUpdate` is called exactly once.

---

## 3. Recommended Code Proposal for Worker Implementation

### Proposed Change 1: Add `hasMovedRef` to component
**File**: `src/features/chart/overlays/plugins/TrendlinePlugin.tsx`  
**Location**: Lines 34–39

```tsx
<<<< BEFORE (Lines 34–38)
  const [dragAnchors, setDragAnchors] = useState<[LogicalAnchor, LogicalAnchor] | null>(null);
  const dragAnchorsRef = useRef<[LogicalAnchor, LogicalAnchor] | null>(null);
  const isDraggingHandleRef = useRef<number | null>(null);
  const isDraggingLineRef = useRef<boolean>(false);
  const dragStartPointRef = useRef<{ x: number; y: number } | null>(null);
====
>>>> AFTER
  const [dragAnchors, setDragAnchors] = useState<[LogicalAnchor, LogicalAnchor] | null>(null);
  const dragAnchorsRef = useRef<[LogicalAnchor, LogicalAnchor] | null>(null);
  const isDraggingHandleRef = useRef<number | null>(null);
  const isDraggingLineRef = useRef<boolean>(false);
  const dragStartPointRef = useRef<{ x: number; y: number } | null>(null);
  const hasMovedRef = useRef<boolean>(false);
====
```

### Proposed Change 2: Update `handleStartDragHandle`
**File**: `src/features/chart/overlays/plugins/TrendlinePlugin.tsx`  
**Location**: Lines 74–115

```tsx
<<<< BEFORE (Lines 74–112)
  const handleStartDragHandle = (index: number, e: ReactMouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    isDraggingHandleRef.current = index;
    dragAnchorsRef.current = [effectiveAnchor1, effectiveAnchor2];
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
      if (dragAnchorsRef.current) {
        onUpdate({ anchors: dragAnchorsRef.current });
      }
      dragAnchorsRef.current = null;
      setDragAnchors(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };
====
>>>> AFTER
  const handleStartDragHandle = (index: number, e: ReactMouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    isDraggingHandleRef.current = index;
    hasMovedRef.current = false;
    dragAnchorsRef.current = null;
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

      hasMovedRef.current = true;
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
      if (hasMovedRef.current && dragAnchorsRef.current) {
        onUpdate({ anchors: dragAnchorsRef.current });
      }
      hasMovedRef.current = false;
      dragAnchorsRef.current = null;
      setDragAnchors(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };
====
```

### Proposed Change 3: Update `handleStartDragLine`
**File**: `src/features/chart/overlays/plugins/TrendlinePlugin.tsx`  
**Location**: Lines 117–157

```tsx
<<<< BEFORE (Lines 117–154)
  const handleStartDragLine = (e: ReactMouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    isDraggingLineRef.current = true;
    dragStartPointRef.current = { x: e.clientX, y: e.clientY };
    dragAnchorsRef.current = [effectiveAnchor1, effectiveAnchor2];
    onSelect();

    const initialP1 = { ...p1 };
    const initialP2 = { ...p2 };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingLineRef.current || !dragStartPointRef.current) return;
      const dx = moveEvent.clientX - dragStartPointRef.current.x;
      const dy = moveEvent.clientY - dragStartPointRef.current.y;

      const newL1 = projector.screenToLogical({ x: initialP1.x + dx, y: initialP1.y + dy });
      const newL2 = projector.screenToLogical({ x: initialP2.x + dx, y: initialP2.y + dy });

      if (newL1 && newL2) {
        const nextAnchors: [LogicalAnchor, LogicalAnchor] = [newL1, newL2];
        dragAnchorsRef.current = nextAnchors;
        setDragAnchors(nextAnchors);
      }
    };

    const handleMouseUp = () => {
      isDraggingLineRef.current = false;
      dragStartPointRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (dragAnchorsRef.current) {
        onUpdate({ anchors: dragAnchorsRef.current });
      }
      dragAnchorsRef.current = null;
      setDragAnchors(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };
====
>>>> AFTER
  const handleStartDragLine = (e: ReactMouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    isDraggingLineRef.current = true;
    dragStartPointRef.current = { x: e.clientX, y: e.clientY };
    hasMovedRef.current = false;
    dragAnchorsRef.current = null;
    onSelect();

    const initialP1 = { ...p1 };
    const initialP2 = { ...p2 };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingLineRef.current || !dragStartPointRef.current) return;
      const dx = moveEvent.clientX - dragStartPointRef.current.x;
      const dy = moveEvent.clientY - dragStartPointRef.current.y;

      if (dx === 0 && dy === 0) return;

      const newL1 = projector.screenToLogical({ x: initialP1.x + dx, y: initialP1.y + dy });
      const newL2 = projector.screenToLogical({ x: initialP2.x + dx, y: initialP2.y + dy });

      if (newL1 && newL2) {
        hasMovedRef.current = true;
        const nextAnchors: [LogicalAnchor, LogicalAnchor] = [newL1, newL2];
        dragAnchorsRef.current = nextAnchors;
        setDragAnchors(nextAnchors);
      }
    };

    const handleMouseUp = () => {
      isDraggingLineRef.current = false;
      dragStartPointRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (hasMovedRef.current && dragAnchorsRef.current) {
        onUpdate({ anchors: dragAnchorsRef.current });
      }
      hasMovedRef.current = false;
      dragAnchorsRef.current = null;
      setDragAnchors(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };
====
```

---

## 4. Caveats

1. **Synthetic Event Payload Quirks**: In unit/integration tests (specifically Vitest/React Act test harnesses like `empirical-overlay-drag-debounce.test.ts`), `handle1Props.onMouseDown` is invoked with `{ stopPropagation, preventDefault }` but without `clientX` or `clientY`. Any drag-start logic that expects `e.clientX` or `e.clientY` to exist for anchor handles will encounter `undefined`. The proposed design handles this safely because:
   - Handle dragging computes displacement relative to `chartHost.getBoundingClientRect()` using `moveEvent.clientX` (which is always present on `mousemove`).
   - Line dragging receives `e.clientX` / `e.clientY` on mousedown (tested in Test 2 and Test 3).
2. **Read-only role constraint**: In accordance with the Explorer archetype, no source files were modified during this investigation. The proposed code edits are structured for drop-in application by `worker_m2` or a designated fix worker.
3. **Cross-plugin applicability**: While this report is specifically scoped to `TrendlinePlugin.tsx`, identical patterns apply directly to `FibonacciPlugin.tsx` and `StickerPlugin.tsx` to fix all 3 failing tests across the empirical suite.

---

## 5. Conclusion

- **Root Cause**: `dragAnchorsRef.current` was initialized eagerly on `mousedown` in `handleStartDragHandle` and `handleStartDragLine`, and `handleMouseUp` committed `onUpdate({ anchors: dragAnchorsRef.current })` without verifying whether any mouse movement or anchor translation had occurred.
- **Fix Design**:
  1. Add `hasMovedRef` boolean ref (`useRef<boolean>(false)`).
  2. Set `hasMovedRef.current = false` and `dragAnchorsRef.current = null` on `mousedown`.
  3. Only set `hasMovedRef.current = true` and `dragAnchorsRef.current = nextAnchors` after valid logical coordinates are projected during `mousemove`.
  4. Ignore `dx === 0 && dy === 0` in line drag.
  5. In `handleMouseUp`, commit `onUpdate` strictly when `hasMovedRef.current && dragAnchorsRef.current` are truthy.
- **Outcome**: Tests 1, 2, and 3 for `TrendlinePlugin` in `src/test/empirical-overlay-drag-debounce.test.ts` will pass cleanly without regressions to 60fps drag preview or single-commit persistence.

---

## 6. Verification Method

Once the worker applies the proposed changes to `TrendlinePlugin.tsx`:

1. **Verify Trendline Drag Tests**:
   ```bash
   npx vitest run src/test/empirical-overlay-drag-debounce.test.ts -t "TrendlinePlugin Drag Buffering"
   ```
   *Expected Result*: All 3 tests pass:
   - `buffers mousemove during handle drag and commits onUpdate exactly once on mouseup` (PASS)
   - `buffers mousemove during whole trendline line drag and commits onUpdate once on mouseup` (PASS)
   - `empirically tests whether clicking without mouse movement triggers spurious onUpdate on trendline` (PASS)

2. **Verify Typecheck**:
   ```bash
   npm run typecheck
   ```
   *Expected Result*: Exits 0 with 0 errors.

3. **Verify Existing Overlay Suite**:
   ```bash
   npx vitest run src/features/chart/overlays/__tests__/overlay-alerts-and-drag.test.ts
   ```
   *Expected Result*: All 11 tests pass.
