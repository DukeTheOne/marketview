# Handoff Report: Explorer M2 Return 2 (FibonacciPlugin Remediation Strategy)

- **Agent**: `explorer_m2_return_2`
- **Archetype / Roles**: explorer (investigation, synthesis)
- **Parent**: `orchestrator_m15` (`a9a9c8ed-8a35-4f8f-8dd8-9119837c3c50`)
- **Working Directory**: `/home/duke/Project/marketview/.agents/teamwork/explorer_m2_return_2`
- **Target File**: `src/features/chart/overlays/plugins/FibonacciPlugin.tsx`
- **Date**: 2026-11-07T19:24:00Z
- **Status**: Complete

---

## 1. Observation

### 1.1 Verbatim Code Inspection of `FibonacciPlugin.tsx`

Direct inspection of `/home/duke/Project/marketview/src/features/chart/overlays/plugins/FibonacciPlugin.tsx` reveals the current implementation across lines 107–235:

#### Handle Dragging (`handleStartDragHandle`, lines 107–182):
```tsx
107:   const handleStartDragHandle = (index: number, e: ReactMouseEvent) => {
108:     e.stopPropagation();
109:     e.preventDefault();
110:     isDraggingHandleRef.current = index;
111:     if (e.clientX !== undefined && e.clientY !== undefined) {
112:       dragStartPointRef.current = { x: e.clientX, y: e.clientY };
113:     } else {
114:       dragStartPointRef.current = null;
115:     }
116:     hasMovedRef.current = false;
117:     dragAnchorsRef.current = null;
118:     onSelect();
119: 
120:     const handleMouseMove = (moveEvent: MouseEvent) => {
121:       if (isDraggingHandleRef.current === null) return;
122:       if (
123:         dragStartPointRef.current &&
124:         moveEvent.clientX === dragStartPointRef.current.x &&
125:         moveEvent.clientY === dragStartPointRef.current.y
126:       ) {
127:         return;
128:       }
129: 
130:       const chartHost = document.querySelector('.overlay-canvas-root');
131:       if (!chartHost) return;
132:       const rect = chartHost.getBoundingClientRect();
133:       const point = {
134:         x: moveEvent.clientX - rect.left,
135:         y: moveEvent.clientY - rect.top,
136:       };
137:       const logical = projector.screenToLogical(point);
138:       if (!logical) return;
139: 
140:       const currentAnchor = isDraggingHandleRef.current === 0 ? effectiveAnchor1 : effectiveAnchor2;
141:       const isDisplaced =
142:         logical.timestamp !== currentAnchor.timestamp ||
143:         logical.price !== currentAnchor.price;
144: 
145:       if (!isDisplaced && !hasMovedRef.current) {
146:         return;
147:       }
148: 
149:       hasMovedRef.current = isDisplaced;
150:       const currentAnchors = dragAnchorsRef.current ?? [effectiveAnchor1, effectiveAnchor2];
151:       const nextAnchors: [LogicalAnchor, LogicalAnchor] = [
152:         isDraggingHandleRef.current === 0 ? logical : currentAnchors[0],
153:         isDraggingHandleRef.current === 1 ? logical : currentAnchors[1],
154:       ];
155:       dragAnchorsRef.current = nextAnchors;
156:       setDragAnchors(nextAnchors);
157:     };
158: 
159:     const handleMouseUp = () => {
160:       isDraggingHandleRef.current = null;
161:       dragStartPointRef.current = null;
162:       window.removeEventListener('mousemove', handleMouseMove);
163:       window.removeEventListener('mouseup', handleMouseUp);
164:       if (hasMovedRef.current && dragAnchorsRef.current) {
165:         const [a1, a2] = dragAnchorsRef.current;
166:         const isUnchanged =
167:           a1.timestamp === annotation.anchors[0]?.timestamp &&
168:           a1.price === annotation.anchors[0]?.price &&
169:           a2.timestamp === annotation.anchors[1]?.timestamp &&
170:           a2.price === annotation.anchors[1]?.price;
171:         if (!isUnchanged) {
172:           onUpdate({ anchors: dragAnchorsRef.current });
173:         }
174:       }
175:       hasMovedRef.current = false;
176:       dragAnchorsRef.current = null;
177:       setDragAnchors(null);
178:     };
179: 
180:     window.addEventListener('mousemove', handleMouseMove);
181:     window.addEventListener('mouseup', handleMouseUp);
182:   };
```

#### Body Dragging (`handleStartDragBody`, lines 184–235):
```tsx
184:   const handleStartDragBody = (e: ReactMouseEvent) => {
185:     e.stopPropagation();
186:     e.preventDefault();
187:     isDraggingBodyRef.current = true;
188:     dragStartPointRef.current = { x: e.clientX, y: e.clientY };
189:     hasMovedRef.current = false;
190:     dragAnchorsRef.current = null;
191:     onSelect();
192: 
193:     const initialP1 = { ...p1 };
194:     const initialP2 = { ...p2 };
195: 
196:     const handleMouseMove = (moveEvent: MouseEvent) => {
197:       if (!isDraggingBodyRef.current || !dragStartPointRef.current) return;
198:       const dx = moveEvent.clientX - dragStartPointRef.current.x;
199:       const dy = moveEvent.clientY - dragStartPointRef.current.y;
200: 
201:       if (dx === 0 && dy === 0) return;
202: 
203:       const newL1 = projector.screenToLogical({
204:         x: initialP1.x + dx,
205:         y: initialP1.y + dy,
206:       });
207:       const newL2 = projector.screenToLogical({
208:         x: initialP2.x + dx,
209:         y: initialP2.y + dy,
210:       });
211: 
212:       if (newL1 && newL2) {
213:         hasMovedRef.current = true;
214:         const nextAnchors: [LogicalAnchor, LogicalAnchor] = [newL1, newL2];
215:         dragAnchorsRef.current = nextAnchors;
216:         setDragAnchors(nextAnchors);
217:       }
218:     };
219: 
220:     const handleMouseUp = () => {
221:       isDraggingBodyRef.current = false;
222:       dragStartPointRef.current = null;
223:       window.removeEventListener('mousemove', handleMouseMove);
224:       window.removeEventListener('mouseup', handleMouseUp);
225:       if (hasMovedRef.current && dragAnchorsRef.current) {
226:         onUpdate({ anchors: dragAnchorsRef.current });
227:       }
228:       hasMovedRef.current = false;
229:       dragAnchorsRef.current = null;
230:       setDragAnchors(null);
231:     };
232: 
233:     window.addEventListener('mousemove', handleMouseMove);
234:     window.addEventListener('mouseup', handleMouseUp);
235:   };
```

### 1.2 Reviewer Finding & Dead Ends Analysis
1. **`reviewer_m2_final_1/handoff.md` Finding C**:
   - Handle dragging: Screen check at lines 122–128 executes early return without checking `if (hasMovedRef.current)`. Stale displaced coordinates remain in `dragAnchorsRef.current` and visual state. On `mouseup`, `isUnchanged` is false, committing the corrupt intermediate coordinates.
   - Body dragging: Line 201 (`dx === 0 && dy === 0`) returns early without checking/resetting `hasMovedRef.current` or `dragAnchorsRef.current`. Furthermore, `handleMouseUp` at lines 225–227 blindly calls `onUpdate({ anchors: dragAnchorsRef.current })` without any equality comparison against `annotation.anchors`.
2. **`DEAD_ENDS.md` Entries**:
   - *Iteration 3*: Mousedown initializing `dragAnchorsRef` triggered spurious `onUpdate` on stationary clicks.
   - *Iteration 4*: `hasMovedRef` on handle/pin dragging without screen-space zero displacement checks allowed synthetic `dx=0, dy=0` events to commit `onUpdate`.
   - *Iteration 5*: Screen-space zero displacement checks returning early without resetting `hasMovedRef.current` caused drag-away and return-to-origin to retain `hasMovedRef=true` and stale intermediate coordinates in `dragAnchorsRef.current`, committing corrupted state on mouseup.

---

## 2. Logic Chain

1. **Handle Dragging Failure Mode**:
   - User initiates drag on handle 0 (`dragStartPointRef.current = { x: 100, y: 300 }`).
   - Move away to `(150, 350)`: `hasMovedRef.current = true`, `dragAnchorsRef.current` contains displaced coordinates, `dragAnchors` local state updates visual preview.
   - Move cursor back to `(100, 300)`:
     - Lines 122–128 trigger: `moveEvent.clientX === dragStartPointRef.current.x && moveEvent.clientY === dragStartPointRef.current.y`.
     - It executes `return;`.
     - `hasMovedRef.current` remains `true`.
     - `dragAnchorsRef.current` remains `[displacedL1, effectiveAnchor2]`.
     - Visual state `dragAnchors` remains frozen in displaced position.
   - User releases mouse (`mouseup`):
     - Line 164 evaluates `if (hasMovedRef.current && dragAnchorsRef.current)`. Both are truthy.
     - `isUnchanged` evaluates `a1` against `annotation.anchors[0]`. Because `a1` is the stale displaced coordinate from the intermediate frame, `isUnchanged` is `false`.
     - Line 172 calls `onUpdate({ anchors: dragAnchorsRef.current })`.
     - **Defect confirmed**: Store is corrupted with intermediate coordinates despite mouse releasing at exact origin.

2. **Handle Dragging Logical Return Failure Mode**:
   - If mouse returns to a point where `logical` equals `annotation.anchors[index]` (e.g. subpixel snapping or neighbor pixel), lines 140–156 currently do:
     ```tsx
     const currentAnchor = isDraggingHandleRef.current === 0 ? effectiveAnchor1 : effectiveAnchor2;
     const isDisplaced = logical.timestamp !== currentAnchor.timestamp || logical.price !== currentAnchor.price;
     ```
     If `isDisplaced` is false, line 145 checks `if (!isDisplaced && !hasMovedRef.current) return;`.
     If `hasMovedRef.current` was true, it continues into line 149 `hasMovedRef.current = false;`, but line 155 still leaves `dragAnchorsRef.current` holding non-null anchors and sets `setDragAnchors(nextAnchors)`. It fails to reset `dragAnchorsRef.current = null` and `setDragAnchors(null)`.

3. **Body Dragging Failure Mode**:
   - User initiates body drag (`dragStartPointRef.current = { x: 120, y: 200 }`).
   - Move away to `(170, 250)`: `hasMovedRef.current = true`, `dragAnchorsRef.current = [newL1, newL2]`.
   - Move cursor back to `(120, 200)`:
     - Line 201 triggers: `dx === 0 && dy === 0`.
     - It executes `return;`.
     - `hasMovedRef.current` remains `true`.
     - `dragAnchorsRef.current` remains `[displacedL1, displacedL2]`.
   - User releases mouse (`mouseup`):
     - Line 225 checks `if (hasMovedRef.current && dragAnchorsRef.current)`.
     - Line 226 unconditionally calls `onUpdate({ anchors: dragAnchorsRef.current })`. No equality check exists.
     - **Defect confirmed**: Stale displaced anchors committed to store.

4. **Remediation Invariants to Satisfy**:
   - **Stationary pointer / Zero-displacement from rest**: `hasMovedRef.current` starts `false`, zero displacement returns early without state update or store call (avoids Dead Ends 3 & 4).
   - **Drag-away and return to origin (Screen space)**: If `hasMovedRef.current` is `true`, reset `hasMovedRef.current = false`, `dragAnchorsRef.current = null`, `setDragAnchors(null)`, and return early (avoids Dead End 5).
   - **Drag-away and return to origin (Logical space)**: If projected coordinates equal canonical `annotation.anchors`, reset `hasMovedRef.current = false`, `dragAnchorsRef.current = null`, `setDragAnchors(null)`, and return early.
   - **Mouseup defense-in-depth**: Both handle and body drag `handleMouseUp` verify that anchors differ from `annotation.anchors` before dispatching `onUpdate`.

---

## 3. Caveats

- **No Caveats**: The problem is strictly localized within `FibonacciPlugin.tsx` event handlers (`handleStartDragHandle` and `handleStartDragBody`).
- The coordinate projector and SVG rendering math are fully functional and require no changes.
- Floating toolbar actions (color, zone fill, price labels, extend right, delete) and draft preview rendering are unaffected.

---

## 4. Conclusion & Precise Remediation Strategy

### 4.1 Handle Dragging Remediation Plan (`handleStartDragHandle`)

Replace lines 120–157 with:
```tsx
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (isDraggingHandleRef.current === null) return;

      // 1. Screen-space return-to-origin check
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

      const chartHost = document.querySelector('.overlay-canvas-root');
      if (!chartHost) return;
      const rect = chartHost.getBoundingClientRect();
      const point = {
        x: moveEvent.clientX - rect.left,
        y: moveEvent.clientY - rect.top,
      };
      const logical = projector.screenToLogical(point);
      if (!logical) return;

      const anchor0 = annotation.anchors[0];
      const anchor1 = annotation.anchors[1];
      if (!anchor0 || !anchor1) return;

      // 2. Logical-space return-to-origin check against canonical initial anchor
      const initialAnchor = isDraggingHandleRef.current === 0 ? anchor0 : anchor1;
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

      // 3. Active displacement: buffer 60fps local drag state
      hasMovedRef.current = true;
      const nextAnchors: [LogicalAnchor, LogicalAnchor] = [
        isDraggingHandleRef.current === 0 ? logical : anchor0,
        isDraggingHandleRef.current === 1 ? logical : anchor1,
      ];
      dragAnchorsRef.current = nextAnchors;
      setDragAnchors(nextAnchors);
    };
```

And in `handleMouseUp` (lines 159–178), retain the defense-in-depth comparison:
```tsx
    const handleMouseUp = () => {
      isDraggingHandleRef.current = null;
      dragStartPointRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (hasMovedRef.current && dragAnchorsRef.current) {
        const [a1, a2] = dragAnchorsRef.current;
        const isUnchanged =
          a1.timestamp === annotation.anchors[0]?.timestamp &&
          a1.price === annotation.anchors[0]?.price &&
          a2.timestamp === annotation.anchors[1]?.timestamp &&
          a2.price === annotation.anchors[1]?.price;
        if (!isUnchanged) {
          onUpdate({ anchors: dragAnchorsRef.current });
        }
      }
      hasMovedRef.current = false;
      dragAnchorsRef.current = null;
      setDragAnchors(null);
    };
```

### 4.2 Body Dragging Remediation Plan (`handleStartDragBody`)

Replace lines 184–235 with:
```tsx
  const handleStartDragBody = (e: ReactMouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    isDraggingBodyRef.current = true;
    if (e.clientX !== undefined && e.clientY !== undefined) {
      dragStartPointRef.current = { x: e.clientX, y: e.clientY };
    } else {
      dragStartPointRef.current = null;
    }
    hasMovedRef.current = false;
    dragAnchorsRef.current = null;
    onSelect();

    const initialP1 = { ...p1 };
    const initialP2 = { ...p2 };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingBodyRef.current || !dragStartPointRef.current) return;
      const dx = moveEvent.clientX - dragStartPointRef.current.x;
      const dy = moveEvent.clientY - dragStartPointRef.current.y;

      // 1. Screen-space zero displacement / return-to-origin check
      if (dx === 0 && dy === 0) {
        if (hasMovedRef.current) {
          hasMovedRef.current = false;
          dragAnchorsRef.current = null;
          setDragAnchors(null);
        }
        return;
      }

      const newL1 = projector.screenToLogical({
        x: initialP1.x + dx,
        y: initialP1.y + dy,
      });
      const newL2 = projector.screenToLogical({
        x: initialP2.x + dx,
        y: initialP2.y + dy,
      });

      if (newL1 && newL2) {
        const anchor0 = annotation.anchors[0];
        const anchor1 = annotation.anchors[1];
        const isUnchanged =
          anchor0 !== undefined &&
          anchor1 !== undefined &&
          newL1.timestamp === anchor0.timestamp &&
          newL1.price === anchor0.price &&
          newL2.timestamp === anchor1.timestamp &&
          newL2.price === anchor1.price;

        // 2. Logical-space return-to-origin check
        if (isUnchanged) {
          if (hasMovedRef.current) {
            hasMovedRef.current = false;
            dragAnchorsRef.current = null;
            setDragAnchors(null);
          }
          return;
        }

        // 3. Active displacement: buffer 60fps local drag state
        hasMovedRef.current = true;
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
      // Defense-in-depth equality check before onUpdate commit
      if (hasMovedRef.current && dragAnchorsRef.current) {
        const [a1, a2] = dragAnchorsRef.current;
        const isUnchanged =
          a1.timestamp === annotation.anchors[0]?.timestamp &&
          a1.price === annotation.anchors[0]?.price &&
          a2.timestamp === annotation.anchors[1]?.timestamp &&
          a2.price === annotation.anchors[1]?.price;
        if (!isUnchanged) {
          onUpdate({ anchors: dragAnchorsRef.current });
        }
      }
      hasMovedRef.current = false;
      dragAnchorsRef.current = null;
      setDragAnchors(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };
```

---

## 5. Verification Method

### 5.1 Automated Test Plan

Add two new empirical test cases in `src/test/empirical-overlay-stress.test.ts`:

1. **Fibonacci handle dragged away and returned to origin**:
   ```ts
   it('Fibonacci handle dragged away and returned to origin does NOT call onUpdate', () => {
     // 1. Render Fibonacci annotation with anchors [A1, A2]
     // 2. Mousedown on handle 0 at (100, 300)
     // 3. Mousemove to (150, 350) -> hasMovedRef becomes true, preview displaced
     // 4. Mousemove back to (100, 300) -> returns to origin, resets hasMovedRef & dragAnchors
     // 5. Mouseup
     // 6. Assert expect(onUpdate).not.toHaveBeenCalled()
   });
   ```

2. **Fibonacci body dragged away and returned to origin**:
   ```ts
   it('Fibonacci body dragged away and returned to origin does NOT call onUpdate', () => {
     // 1. Render Fibonacci annotation with anchors [A1, A2]
     // 2. Mousedown on body band at (120, 200)
     // 3. Mousemove to (180, 260) (dx=60, dy=60) -> hasMovedRef becomes true
     // 4. Mousemove back to (120, 200) (dx=0, dy=0) -> resets hasMovedRef & dragAnchors
     // 5. Mouseup
     // 6. Assert expect(onUpdate).not.toHaveBeenCalled()
   });
   ```

3. **Verify Normal Drag-Commit**:
   - Verify that when the cursor is NOT returned to origin, `onUpdate` is called exactly once with the displaced anchors on `mouseup`.

### 5.2 Verification Commands
```bash
npm run typecheck
npx vitest run src/test/empirical-overlay-stress.test.ts src/test/empirical-overlay-drag-debounce.test.ts
npm run test
```

### 5.3 Invalidation Conditions
The remediation is considered INVALID if:
1. Dragging a Fibonacci handle or body away from origin and releasing the cursor at the exact start coordinates invokes `onUpdate`.
2. The visual preview remains displaced after the cursor returns to the start coordinate.
3. Rapid clicking without moving invokes `onUpdate`.
4. Normal dragging fails to update the annotation on `mouseup`.
