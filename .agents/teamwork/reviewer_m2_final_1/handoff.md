# Handoff Report: Reviewer M2 Final 1 — Zero-Displacement Remediation Audit

- **Agent**: `reviewer_m2_final_1`
- **Archetype / Roles**: reviewer, critic
- **Parent**: `orchestrator_m15` (`a9a9c8ed-8a35-4f8f-8dd8-9119837c3c50`)
- **Working Directory**: `/home/duke/Project/marketview/.agents/teamwork/reviewer_m2_final_1`
- **Timestamp**: 2026-11-07T19:16:30Z
- **Verdict**: **REQUEST_CHANGES**

---

## 1. Observation

### 1.1 Scope of Review
The review evaluated the zero-displacement defect remediation implemented in:
- `src/features/chart/overlays/plugins/TrendlinePlugin.tsx`
- `src/features/chart/overlays/plugins/FibonacciPlugin.tsx`
- `src/features/chart/overlays/plugins/StickerPlugin.tsx`
- `src/test/empirical-overlay-drag-debounce.test.ts`
- `src/test/empirical-overlay-stress.test.ts`
- `worker_m2_zero/handoff.md`

### 1.2 Build and Automated Test Verification
Direct execution of required tool commands:
1. `npm run typecheck` (`tsc --noEmit`):
   - Exit code: 0
   - Diagnostic errors: 0
2. `npx vitest run src/test/empirical-overlay-drag-debounce.test.ts src/test/empirical-overlay-stress.test.ts`:
   - 2 test files passed, 28 tests passed (10 in `drag-debounce`, 18 in `stress`), duration 7.32s.
   - Zero-displacement logs:
     - `Zero-displacement Trendline line onUpdate calls: 0`
     - `Zero-displacement Fibonacci body onUpdate calls: 0`
     - `Zero-displacement Trendline handle onUpdate calls: 0`
     - `Zero-displacement Fibonacci handle onUpdate calls: 0`
     - `Zero-displacement Sticker pin onUpdate calls: 0`
3. `npm run test`:
   - 35 test files passed, 436 tests passed, duration 14.40s.

### 1.3 Verbatim Code Inspection of Zero-Displacement Implementations

#### Finding A: StickerPlugin Pin Drag Shadowing & Stale Anchor Commit
In `src/features/chart/overlays/plugins/StickerPlugin.tsx`, lines 128–184:
```ts
128:     const handleMouseMove = (moveEvent: MouseEvent) => {
129:       if (!isDraggingRef.current) return;
130: 
131:       // Guard 1: Screen-space zero displacement (same clientX / clientY)
132:       if (
133:         dragStartPointRef.current !== null &&
134:         moveEvent.clientX === dragStartPointRef.current.x &&
135:         moveEvent.clientY === dragStartPointRef.current.y
136:       ) {
137:         return;
138:       }
...
150:       // Guard 2: Logical anchor displacement (same candle timestamp & price level)
151:       if (
152:         logical.timestamp === initialAnchor.timestamp &&
153:         logical.price === initialAnchor.price
154:       ) {
155:         if (hasMovedRef.current) {
156:           hasMovedRef.current = false;
157:           dragAnchorRef.current = null;
158:           setDragAnchor(null);
159:         }
160:         return;
161:       }
162: 
163:       hasMovedRef.current = true;
164:       dragAnchorRef.current = logical;
165:       setDragAnchor(logical);
166:     };
167: 
168:     const handleMouseUp = () => {
169:       isDraggingRef.current = false;
170:       dragStartPointRef.current = null;
171:       window.removeEventListener('mousemove', handleMouseMove);
172:       window.removeEventListener('mouseup', handleMouseUp);
173:       if (hasMovedRef.current && dragAnchorRef.current) {
174:         const isUnchanged =
175:           dragAnchorRef.current.timestamp === annotation.anchors[0]?.timestamp &&
176:           dragAnchorRef.current.price === annotation.anchors[0]?.price;
177:         if (!isUnchanged) {
178:           onUpdate({ anchors: [dragAnchorRef.current] });
179:         }
180:       }
181:       hasMovedRef.current = false;
182:       dragAnchorRef.current = null;
183:       setDragAnchor(null);
184:     };
```

#### Finding B: TrendlinePlugin Handle & Line Dragging
In `src/features/chart/overlays/plugins/TrendlinePlugin.tsx`:
Handle dragging (lines 87–96, 126–145):
```ts
87:     const handleMouseMove = (moveEvent: MouseEvent) => {
88:       if (isDraggingHandleRef.current === null) return;
89:       if (
90:         dragStartPointRef.current &&
91:         moveEvent.clientX === dragStartPointRef.current.x &&
92:         moveEvent.clientY === dragStartPointRef.current.y
93:       ) {
94:         return;
95:       }
...
126:     const handleMouseUp = () => {
127:       isDraggingHandleRef.current = null;
128:       dragStartPointRef.current = null;
129:       window.removeEventListener('mousemove', handleMouseMove);
130:       window.removeEventListener('mouseup', handleMouseUp);
131:       if (hasMovedRef.current && dragAnchorsRef.current) {
132:         const [a1, a2] = dragAnchorsRef.current;
133:         const isUnchanged =
134:           a1.timestamp === annotation.anchors[0]?.timestamp &&
135:           a1.price === annotation.anchors[0]?.price &&
136:           a2.timestamp === annotation.anchors[1]?.timestamp &&
137:           a2.price === annotation.anchors[1]?.price;
138:         if (!isUnchanged) {
139:           onUpdate({ anchors: dragAnchorsRef.current });
140:         }
141:       }
142:       hasMovedRef.current = false;
143:       dragAnchorsRef.current = null;
144:       setDragAnchors(null);
145:     };
```
Line dragging (lines 163–193):
```ts
163:     const handleMouseMove = (moveEvent: MouseEvent) => {
164:       if (!isDraggingLineRef.current || !dragStartPointRef.current) return;
165:       const dx = moveEvent.clientX - dragStartPointRef.current.x;
166:       const dy = moveEvent.clientY - dragStartPointRef.current.y;
167: 
168:       if (dx === 0 && dy === 0) return;
169: 
170:       const newL1 = projector.screenToLogical({ x: initialP1.x + dx, y: initialP1.y + dy });
171:       const newL2 = projector.screenToLogical({ x: initialP2.x + dx, y: initialP2.y + dy });
172: 
173:       if (newL1 && newL2) {
174:         hasMovedRef.current = true;
175:         const nextAnchors: [LogicalAnchor, LogicalAnchor] = [newL1, newL2];
176:         dragAnchorsRef.current = nextAnchors;
177:         setDragAnchors(nextAnchors);
178:       }
179:     };
180: 
181:     const handleMouseUp = () => {
182:       isDraggingLineRef.current = false;
183:       dragStartPointRef.current = null;
184:       window.removeEventListener('mousemove', handleMouseMove);
185:       window.removeEventListener('mouseup', handleMouseUp);
186:       if (hasMovedRef.current && dragAnchorsRef.current) {
187:         onUpdate({ anchors: dragAnchorsRef.current });
188:       }
189:       hasMovedRef.current = false;
190:       dragAnchorsRef.current = null;
191:       setDragAnchors(null);
192:     };
```

#### Finding C: FibonacciPlugin Handle & Body Dragging
In `src/features/chart/overlays/plugins/FibonacciPlugin.tsx`:
Handle dragging (lines 120–128) has the identical screen check:
```ts
120:     const handleMouseMove = (moveEvent: MouseEvent) => {
121:       if (isDraggingHandleRef.current === null) return;
122:       if (
123:         dragStartPointRef.current &&
124:         moveEvent.clientX === dragStartPointRef.current.x &&
125:         moveEvent.clientY === dragStartPointRef.current.y
126:       ) {
127:         return;
128:       }
```
Body dragging (lines 197–231) has the identical `dx === 0 && dy === 0` check and blind `onUpdate` commit without equality checks:
```ts
201:       if (dx === 0 && dy === 0) return;
...
225:       if (hasMovedRef.current && dragAnchorsRef.current) {
226:         onUpdate({ anchors: dragAnchorsRef.current });
227:       }
```

---

## 2. Logic Chain

1. **Requirement 4 Verification**:
   The orchestrator prompt explicitly mandated:
   *"Verify: 4. If a user drags away and returns to the exact starting point, `onUpdate` is properly suppressed."*
   Worker `worker_m2_zero` in `worker_m2_zero/handoff.md` Section 2 claimed:
   *"Guard 2 (Logical Coordinates): If synthetic callers lack screen coordinates or sub-pixel coordinate shifts map to the same candle/price, evaluate whether logical equals the original anchor. If unchanged and !hasMovedRef.current, return immediately. If returning to original position after dragging away, reset hasMovedRef.current = false."*

2. **The Flaw in Guard 1 Pre-emption**:
   In `StickerPlugin.tsx`, Guard 1 (`moveEvent.clientX === dragStartPointRef.current.x && moveEvent.clientY === dragStartPointRef.current.y`) executes at line 132 before Guard 2 (line 151).
   When a user drags away, `hasMovedRef.current` is set to `true`, and `dragAnchorRef.current` is populated with the displaced `logical` coordinate.
   When the user drags back to the **exact starting point** `(dragStartPointRef.current.x, dragStartPointRef.current.y)`:
   - Guard 1 triggers and executes `return;`.
   - Guard 2 is never reached.
   - `hasMovedRef.current` remains `true`.
   - `dragAnchorRef.current` retains the displaced coordinate from the prior mouse move.
   - On `mouseup`, `isUnchanged` is evaluated against `dragAnchorRef.current` (which is the stale displaced anchor). `isUnchanged` evaluates to `false`.
   - `onUpdate({ anchors: [dragAnchorRef.current] })` is dispatched! The application commits the intermediate displaced anchor even though the mouse was released at the starting point.

3. **Flaw Across Trendline and Fibonacci Plugins**:
   - In `TrendlinePlugin.tsx` and `FibonacciPlugin.tsx` handle dragging, lines 90–95 and 122–128 return immediately when the mouse returns to `dragStartPointRef.current`. `hasMovedRef.current` is not reset to `false`, `dragAnchorsRef.current` is not reset to `null`, and `dragAnchors` visual state remains frozen at the displaced coordinate. On `mouseup`, `onUpdate` is called with the stale displaced anchors.
   - In `TrendlinePlugin.tsx` line dragging (lines 168, 186) and `FibonacciPlugin.tsx` body dragging (lines 201, 225), when the mouse returns to `dx === 0 && dy === 0`, `handleMouseMove` returns early without resetting `hasMovedRef.current` or `dragAnchorsRef.current`. Furthermore, `handleMouseUp` performs NO equality comparison at all, unconditionally calling `onUpdate({ anchors: dragAnchorsRef.current })`.

4. **Failure of Verification Criterion 4**:
   Because all 5 interaction targets fail to suppress `onUpdate` and instead commit corrupt intermediate coordinates when returning to the exact starting point, Criterion 4 is failed.

5. **Assessment of Other Verification Criteria**:
   - Criterion 1 (stationary pointer movement from rest): Properly suppressed (Guard 1 catches initial mouse moves when `!hasMovedRef.current`).
   - Criterion 2 (in-flight 60fps drag buffering): Properly buffered in `dragAnchors` / `dragAnchor` without store calls during movement.
   - Criterion 3 (actual drag commit on `mouseup`): Commits `onUpdate` once on `mouseup` with updated coordinates.
   - Criterion 5 (Sticker debouncing & flushes): Fully operational (250ms debounce, immediate blur flush, unmount cleanup flush).
   - Criterion 6 (typecheck and tests): All pass with zero errors.

---

## 3. Caveats

- Tests in `src/test/empirical-overlay-stress.test.ts` pass because they only test zero displacement from rest (i.e. mouse down and stationary moves at the same coordinate without prior displacement). None of the test suites contained a test case for "drag away and return to origin".
- The implementation of 250ms text debouncing in `StickerPlugin.tsx` is completely solid, clean, and bug-free.
- The 60fps drag buffering during normal forward dragging is clean and respects the architectural boundaries.

---

## 4. Conclusion & Required Changes

### Verdict: **REQUEST_CHANGES**

### Critical Finding: Drag-Away and Return to Origin Commits Stale Displaced Anchors (All Plugins)
- **What**: When a user drags an overlay handle, line, body, or pin away from origin and then moves the cursor back to the exact starting point before releasing the mouse:
  1. `onUpdate` is NOT suppressed.
  2. The store is updated with stale displaced anchors from an intermediate frame.
  3. The visual preview remains stuck in a displaced position.
- **Where**:
  - `src/features/chart/overlays/plugins/TrendlinePlugin.tsx`: lines 89–95, 107–117, 168, 186–188
  - `src/features/chart/overlays/plugins/FibonacciPlugin.tsx`: lines 122–128, 140–150, 201, 225–227
  - `src/features/chart/overlays/plugins/StickerPlugin.tsx`: lines 132–138, 151–161
- **Why**: Screen-space checks (`moveEvent.clientX === dragStartPointRef.current.x && moveEvent.clientY === dragStartPointRef.current.y` and `dx === 0 && dy === 0`) execute bare `return;` without checking `if (hasMovedRef.current)`. In `StickerPlugin.tsx`, Guard 1 shadows Guard 2 for the exact starting point. In line/body drags, `handleMouseUp` lacks equality comparison against original anchors.
- **Remediation Specification**:
  1. **In Handle & Pin Dragging**:
     When returning to `dragStartPointRef.current` in screen space:
     ```ts
     if (
       dragStartPointRef.current &&
       moveEvent.clientX === dragStartPointRef.current.x &&
       moveEvent.clientY === dragStartPointRef.current.y
     ) {
       if (hasMovedRef.current) {
         hasMovedRef.current = false;
         dragAnchorsRef.current = null; // or dragAnchorRef.current = null
         setDragAnchors(null);          // or setDragAnchor(null)
       }
       return;
     }
     ```
  2. **In Handle Dragging (Logical Guard)**:
     Compare `logical` against the baseline `annotation.anchors[index]` (not `effectiveAnchor`, which is derived from `dragAnchors`). If `logical` matches the initial anchor, reset `hasMovedRef.current = false`, `dragAnchorsRef.current = null`, and `setDragAnchors(null)`.
  3. **In Line & Body Dragging**:
     When `dx === 0 && dy === 0`:
     ```ts
     if (dx === 0 && dy === 0) {
       if (hasMovedRef.current) {
         hasMovedRef.current = false;
         dragAnchorsRef.current = null;
         setDragAnchors(null);
       }
       return;
     }
     ```
     And in `handleMouseUp`, compare `dragAnchorsRef.current` against `annotation.anchors` as defense-in-depth before invoking `onUpdate`.
  4. **Empirical Test Coverage**:
     Add 5 test cases in `src/test/empirical-overlay-stress.test.ts` covering drag-away followed by return-to-origin for:
     - Trendline handle
     - Trendline line
     - Fibonacci handle
     - Fibonacci body
     - Sticker pin
     Asserting `expect(onUpdate).not.toHaveBeenCalled()`.

---

## 5. Verification Method

To verify the defect:
1. Trace the execution of `handleMouseMove` in `StickerPlugin.tsx`:
   - Start drag at (100, 260) -> `dragStartPointRef.current = { x: 100, y: 260 }`
   - Move to (150, 200) -> `hasMovedRef.current = true`, `dragAnchorRef.current = { timestamp: 1700001500, price: 150 }`
   - Move to (100, 260) -> hits line 132 `moveEvent.clientX === dragStartPointRef.current.x && moveEvent.clientY === dragStartPointRef.current.y` -> returns early.
   - Mouse up -> line 173 `if (hasMovedRef.current && dragAnchorRef.current)` -> `onUpdate` is called with `{ timestamp: 1700001500, price: 150 }`.
2. Observe the identical execution path in `TrendlinePlugin.tsx` and `FibonacciPlugin.tsx`.
3. Invalidation condition: After remediation, all 5 interaction targets must suppress `onUpdate` when the pointer returns to the starting position, reset local state and visual display, and pass the new test cases.
