# Handoff Report: Explorer M2 Return 1 — Trendline Drag-Away & Return Remediation

- **Agent**: `explorer_m2_return_1`
- **Archetype / Roles**: explorer, investigator, synthesizer
- **Parent**: `orchestrator_m15` (`a9a9c8ed-8a35-4f8f-8dd8-9119837c3c50`)
- **Working Directory**: `/home/duke/Project/marketview/.agents/teamwork/explorer_m2_return_1`
- **Timestamp**: 2026-11-07T19:26:00Z
- **Target File Analyzed**: `/home/duke/Project/marketview/src/features/chart/overlays/plugins/TrendlinePlugin.tsx`

---

## 1. Observation

### 1.1 Existing Code in `TrendlinePlugin.tsx`
Direct inspection of `src/features/chart/overlays/plugins/TrendlinePlugin.tsx` reveals the current drag implementation:

#### Handle Dragging (`handleStartDragHandle`, lines 75–149)
```tsx
75:   const handleStartDragHandle = (index: number, e: ReactMouseEvent) => {
76:     e.stopPropagation();
77:     e.preventDefault();
78:     isDraggingHandleRef.current = index;
79:     dragStartPointRef.current =
80:       e.clientX !== undefined && e.clientY !== undefined
81:         ? { x: e.clientX, y: e.clientY }
82:         : null;
83:     hasMovedRef.current = false;
84:     dragAnchorsRef.current = null;
85:     onSelect();
86: 
87:     const handleMouseMove = (moveEvent: MouseEvent) => {
88:       if (isDraggingHandleRef.current === null) return;
89:       if (
90:         dragStartPointRef.current &&
91:         moveEvent.clientX === dragStartPointRef.current.x &&
92:         moveEvent.clientY === dragStartPointRef.current.y
93:       ) {
94:         return;
95:       }
96: 
97:       const chartHost = document.querySelector('.overlay-canvas-root');
98:       if (!chartHost) return;
99:       const rect = chartHost.getBoundingClientRect();
100:       const point = {
101:         x: moveEvent.clientX - rect.left,
102:         y: moveEvent.clientY - rect.top,
103:       };
104:       const logical = projector.screenToLogical(point);
105:       if (!logical) return;
106: 
107:       const currentAnchor = isDraggingHandleRef.current === 0 ? effectiveAnchor1 : effectiveAnchor2;
108:       const isAnchorUnchanged =
109:         logical.timestamp === currentAnchor.timestamp &&
110:         logical.price === currentAnchor.price;
111: 
112:       if (isAnchorUnchanged && !hasMovedRef.current) {
113:         return;
114:       }
115: 
116:       hasMovedRef.current = !isAnchorUnchanged;
117:       const currentAnchors = dragAnchorsRef.current ?? [effectiveAnchor1, effectiveAnchor2];
118:       const nextAnchors: [LogicalAnchor, LogicalAnchor] = [
119:         isDraggingHandleRef.current === 0 ? logical : currentAnchors[0],
120:         isDraggingHandleRef.current === 1 ? logical : currentAnchors[1],
121:       ];
122:       dragAnchorsRef.current = nextAnchors;
123:       setDragAnchors(nextAnchors);
124:     };
125: 
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

#### Line Dragging (`handleStartDragLine`, lines 151–196)
```tsx
151:   const handleStartDragLine = (e: ReactMouseEvent) => {
152:     e.stopPropagation();
153:     e.preventDefault();
154:     isDraggingLineRef.current = true;
155:     dragStartPointRef.current = { x: e.clientX, y: e.clientY };
156:     hasMovedRef.current = false;
157:     dragAnchorsRef.current = null;
158:     onSelect();
159: 
160:     const initialP1 = { ...p1 };
161:     const initialP2 = { ...p2 };
162: 
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

### 1.2 Observed Dead Ends History (`DEAD_ENDS.md`)
In `/home/duke/Project/marketview/.agents/teamwork/orchestrator_m15/DEAD_ENDS.md`:
- **Iteration 3**: Initializing `dragAnchorsRef` on `mousedown` triggered spurious `onUpdate` with identical coordinates upon click without drag.
- **Iteration 4**: Using `hasMovedRef` on handle dragging without a screen-space zero-displacement check allowed synthetic mousemove events (`dx=0, dy=0`) to set `hasMovedRef=true`, committing `onUpdate`.
- **Iteration 5**: Screen-space zero displacement checks (`moveEvent.clientX === dragStartPointRef.current.x && moveEvent.clientY === dragStartPointRef.current.y` and `dx === 0 && dy === 0`) returning early with bare `return;` without resetting `hasMovedRef.current`. When a user dragged away and returned to origin, the early return left `hasMovedRef=true` and stale displaced coordinates in `dragAnchorsRef`, which were committed on `mouseup`.

---

## 2. Logic Chain

### 2.1 Trace of the Defect in Handle Dragging
1. **User drags away**: User clicks handle 0 at screen coordinate $(x_0, y_0)$ (stored in `dragStartPointRef.current`). The pointer moves to $(x_1, y_1)$. Lines 116–123 set `hasMovedRef.current = true`, `dragAnchorsRef.current = [newAnchor, anchor1]`, and `setDragAnchors([newAnchor, anchor1])`.
2. **User moves back to starting point**: Pointer returns to $(x_0, y_0)$. Line 89 matches: `moveEvent.clientX === dragStartPointRef.current.x && moveEvent.clientY === dragStartPointRef.current.y`.
3. **The Early Return Trap**: Line 94 executes `return;`. Because it returns immediately:
   - `hasMovedRef.current` remains `true`.
   - `dragAnchorsRef.current` still holds `[newAnchor, anchor1]` from step 1.
   - The visual canvas (`dragAnchors`) continues to display the displaced handle.
4. **User releases mouse**: `handleMouseUp` (line 126) fires.
   - `if (hasMovedRef.current && dragAnchorsRef.current)` evaluates to `true`.
   - `[a1, a2]` are the displaced coordinates from step 1, so `isUnchanged` is `false`.
   - `onUpdate({ anchors: dragAnchorsRef.current })` is dispatched!
5. **Secondary flaw in Guard 2**: Line 107 compares `logical` against `currentAnchor = isDraggingHandleRef.current === 0 ? effectiveAnchor1 : effectiveAnchor2`. Because `effectiveAnchor1` is derived from `dragAnchors ? dragAnchors[0] : annotation.anchors[0]`, once `dragAnchors` is non-null, comparing against `effectiveAnchor1` compares against the displaced coordinate, not the persistent original anchor `annotation.anchors[index]`.

### 2.2 Trace of the Defect in Line Dragging
1. **User drags away**: User clicks the line at $(x_0, y_0)$. Pointer moves to $(x_1, y_1)$ where $dx = 15, dy = 10$. Lines 174–177 set `hasMovedRef.current = true`, `dragAnchorsRef.current = [newL1, newL2]`, and `setDragAnchors([newL1, newL2])`.
2. **User moves back to starting point**: Pointer returns to $(x_0, y_0)$ where $dx = 0, dy = 0$.
3. **The Early Return Trap**: Line 168 executes `if (dx === 0 && dy === 0) return;`.
   - `hasMovedRef.current` remains `true`.
   - `dragAnchorsRef.current` retains `[newL1, newL2]`.
   - The line visual remains rendered at displaced $(dx=15, dy=10)$.
4. **User releases mouse**: `handleMouseUp` (lines 186–188) checks `if (hasMovedRef.current && dragAnchorsRef.current)` and unconditionally executes `onUpdate({ anchors: dragAnchorsRef.current })` without any equality comparison! The line is permanently committed at the displaced position.

### 2.3 Principles of Airtight Remediation
To completely eliminate this defect without falling into any prior dead ends:
1. **Screen-Space Return (Guard 1)**: When cursor is back at `dragStartPointRef.current` (for handle) or $dx=0, dy=0$ (for line):
   - If `hasMovedRef.current` is true, immediately reset:
     `hasMovedRef.current = false;`
     `dragAnchorsRef.current = null;`
     `setDragAnchors(null);`
   - Return early. This ensures the visual preview immediately snaps back to original anchors and `hasMovedRef` is disarmed.
2. **Logical-Space Return (Guard 2)**: When cursor is not at exact pixel origin (e.g. 1px off or subpixel variance) but `projector.screenToLogical` yields coordinates equal to the baseline `annotation.anchors`:
   - For handle: compare against `annotation.anchors[index]` directly.
   - For line: compare `newL1` against `annotation.anchors[0]` and `newL2` against `annotation.anchors[1]`.
   - If equal, reset `hasMovedRef.current = false`, `dragAnchorsRef.current = null`, `setDragAnchors(null)`, and return early.
3. **Re-drag After Return**: If the user returns to origin (resetting state to `null`) and then drags away *again* before mouseup:
   - Next move has displacement from origin.
   - Guard 1 and Guard 2 do not match.
   - `hasMovedRef.current` becomes `true`.
   - `dragAnchorsRef.current` and `setDragAnchors` receive the newly displaced coordinates.
   - Mouseup commits the *new* target position, exactly as expected.
4. **Defense-in-Depth in `handleMouseUp`**:
   - In both handle and line `handleMouseUp`, compare `[a1, a2]` from `dragAnchorsRef.current` against `annotation.anchors[0]` and `annotation.anchors[1]`.
   - Call `onUpdate` strictly when `!isUnchanged`.
   - Unconditionally clear `hasMovedRef.current = false`, `dragAnchorsRef.current = null`, `setDragAnchors(null)`.

---

## 3. Caveats

- **Projector boundary limits**: When moving cursor outside chart bounds, `projector.screenToLogical` returns `null`. Existing tests verify that dragging into bounds and then out of bounds retains the last valid coordinate. The proposed changes preserve this behavior because `if (!logical) return;` and `if (newL1 && newL2)` are maintained.
- **Strictly read-only**: As an explorer subagent, source modifications must be performed by the designated implementer worker agent.

---

## 4. Conclusion & Precise Remediation Strategy

### 4.1 Proposed Code Modifications for `TrendlinePlugin.tsx`

#### A. Handle Dragging (`handleStartDragHandle`)
Replace lines 75–149 of `src/features/chart/overlays/plugins/TrendlinePlugin.tsx` with:

```tsx
  const handleStartDragHandle = (index: number, e: ReactMouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const anchor0 = annotation.anchors[0];
    const anchor1 = annotation.anchors[1];
    if (!anchor0 || !anchor1) return;

    const initialAnchor = index === 0 ? anchor0 : anchor1;

    isDraggingHandleRef.current = index;
    dragStartPointRef.current =
      e.clientX !== undefined && e.clientY !== undefined
        ? { x: e.clientX, y: e.clientY }
        : null;
    hasMovedRef.current = false;
    dragAnchorsRef.current = null;
    onSelect();

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (isDraggingHandleRef.current === null) return;

      // Guard 1: Screen-space zero displacement (cursor back at drag start)
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

      // Guard 2: Logical anchor displacement (cursor back at initial anchor candle/price)
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

      hasMovedRef.current = true;
      const nextAnchors: [LogicalAnchor, LogicalAnchor] = [
        index === 0 ? logical : anchor0,
        index === 1 ? logical : anchor1,
      ];
      dragAnchorsRef.current = nextAnchors;
      setDragAnchors(nextAnchors);
    };

    const handleMouseUp = () => {
      isDraggingHandleRef.current = null;
      dragStartPointRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);

      // Defense-in-depth: only commit onUpdate if moved and coordinates differ from annotation.anchors
      if (hasMovedRef.current && dragAnchorsRef.current) {
        const [a1, a2] = dragAnchorsRef.current;
        const isUnchanged =
          a1.timestamp === anchor0.timestamp &&
          a1.price === anchor0.price &&
          a2.timestamp === anchor1.timestamp &&
          a2.price === anchor1.price;
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

#### B. Line Dragging (`handleStartDragLine`)
Replace lines 151–196 of `src/features/chart/overlays/plugins/TrendlinePlugin.tsx` with:

```tsx
  const handleStartDragLine = (e: ReactMouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const anchor0 = annotation.anchors[0];
    const anchor1 = annotation.anchors[1];
    if (!anchor0 || !anchor1) return;

    const initialP1 = projector.logicalToScreen(anchor0) ?? { ...p1 };
    const initialP2 = projector.logicalToScreen(anchor1) ?? { ...p2 };

    isDraggingLineRef.current = true;
    dragStartPointRef.current = { x: e.clientX, y: e.clientY };
    hasMovedRef.current = false;
    dragAnchorsRef.current = null;
    onSelect();

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingLineRef.current || !dragStartPointRef.current) return;
      const dx = moveEvent.clientX - dragStartPointRef.current.x;
      const dy = moveEvent.clientY - dragStartPointRef.current.y;

      // Guard 1: Screen-space zero displacement (cursor back at drag start)
      if (dx === 0 && dy === 0) {
        if (hasMovedRef.current) {
          hasMovedRef.current = false;
          dragAnchorsRef.current = null;
          setDragAnchors(null);
        }
        return;
      }

      const newL1 = projector.screenToLogical({ x: initialP1.x + dx, y: initialP1.y + dy });
      const newL2 = projector.screenToLogical({ x: initialP2.x + dx, y: initialP2.y + dy });

      if (newL1 && newL2) {
        // Guard 2: Logical anchor displacement (both anchors unchanged from original)
        const isUnchanged =
          newL1.timestamp === anchor0.timestamp &&
          newL1.price === anchor0.price &&
          newL2.timestamp === anchor1.timestamp &&
          newL2.price === anchor1.price;

        if (isUnchanged) {
          if (hasMovedRef.current) {
            hasMovedRef.current = false;
            dragAnchorsRef.current = null;
            setDragAnchors(null);
          }
          return;
        }

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

      // Defense-in-depth: only commit onUpdate if moved and coordinates differ from annotation.anchors
      if (hasMovedRef.current && dragAnchorsRef.current) {
        const [a1, a2] = dragAnchorsRef.current;
        const isUnchanged =
          a1.timestamp === anchor0.timestamp &&
          a1.price === anchor0.price &&
          a2.timestamp === anchor1.timestamp &&
          a2.price === anchor1.price;
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

### 5.1 Automated Test Execution Commands
The implementer must run:
1. `npm run typecheck` (`tsc --noEmit`) to ensure clean compilation under strict types.
2. `npx vitest run src/test/empirical-overlay-stress.test.ts src/test/empirical-overlay-drag-debounce.test.ts` to verify existing and new drag tests pass without regressions.
3. `npm run test` (`vitest run`) to verify all 436+ tests pass.

### 5.2 Required Test Cases to Add to `src/test/empirical-overlay-stress.test.ts`
Add a dedicated test block in `src/test/empirical-overlay-stress.test.ts` covering:

```tsx
    it('Trendline handle drag away and return to exact origin does NOT call onUpdate', () => {
      const projector = createMockProjector();
      const onUpdate = vi.fn();
      const plugin = overlayPluginRegistry.get('trendline')!;

      const annotation: ChartAnnotation = {
        id: 'trend-handle-return',
        ticker: 'NVDA',
        type: 'trendline',
        anchors: [
          { timestamp: 1700001000, price: 100 }, // screen x=100, y=300
          { timestamp: 1700002000, price: 150 }, // screen x=200, y=200
        ],
        payload: {
          color: '#38bdf8',
          lineWidth: 2,
          lineStyle: 'solid',
          extendRight: false,
          showLabel: true,
        },
        createdAt: 1700000000,
        updatedAt: 1700000000,
      };

      act(() => {
        root.render(
          plugin.renderAnnotation({
            annotation,
            payload: annotation.payload,
            isSelected: true,
            projector,
            onSelect: vi.fn(),
            onUpdate,
            onDelete: vi.fn(),
          })
        );
      });

      const handle0 = findElement(container, (el) => el.attributes?.title === 'Drag start anchor');
      const handle0Props = getReactProps(handle0);

      act(() => {
        handle0Props.onMouseDown({
          stopPropagation: vi.fn(),
          preventDefault: vi.fn(),
          clientX: 100,
          clientY: 300,
        });
      });

      // Drag away to (150, 250)
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: 150, clientY: 250 });
      });

      // Drag back to exact origin (100, 300)
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: 100, clientY: 300 });
      });

      // Release mouse
      act(() => {
        dispatchWindowEvent('mouseup', {});
      });

      expect(onUpdate).not.toHaveBeenCalled();
    });

    it('Trendline line drag away and return to exact origin does NOT call onUpdate', () => {
      const projector = createMockProjector();
      const onUpdate = vi.fn();
      const plugin = overlayPluginRegistry.get('trendline')!;

      const annotation: ChartAnnotation = {
        id: 'trend-line-return',
        ticker: 'NVDA',
        type: 'trendline',
        anchors: [
          { timestamp: 1700001000, price: 100 },
          { timestamp: 1700002000, price: 150 },
        ],
        payload: {
          color: '#38bdf8',
          lineWidth: 2,
          lineStyle: 'solid',
          extendRight: false,
          showLabel: true,
        },
        createdAt: 1700000000,
        updatedAt: 1700000000,
      };

      act(() => {
        root.render(
          plugin.renderAnnotation({
            annotation,
            payload: annotation.payload,
            isSelected: false,
            projector,
            onSelect: vi.fn(),
            onUpdate,
            onDelete: vi.fn(),
          })
        );
      });

      const lineHitbox = findElement(container, (el, props) => el.tagName === 'LINE' && typeof props.onMouseDown === 'function');
      const lineProps = getReactProps(lineHitbox);

      act(() => {
        lineProps.onMouseDown({
          stopPropagation: vi.fn(),
          preventDefault: vi.fn(),
          clientX: 150,
          clientY: 250,
        });
      });

      // Drag away to (200, 300)
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: 200, clientY: 300 });
      });

      // Drag back to exact origin (150, 250)
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: 150, clientY: 250 });
      });

      // Release mouse
      act(() => {
        dispatchWindowEvent('mouseup', {});
      });

      expect(onUpdate).not.toHaveBeenCalled();
    });

    it('Trendline handle drag away, return to origin, then drag to final target commits ONLY final target', () => {
      const projector = createMockProjector();
      const onUpdate = vi.fn();
      const plugin = overlayPluginRegistry.get('trendline')!;

      const annotation: ChartAnnotation = {
        id: 'trend-handle-re-drag',
        ticker: 'NVDA',
        type: 'trendline',
        anchors: [
          { timestamp: 1700001000, price: 100 }, // screen x=100, y=300
          { timestamp: 1700002000, price: 150 }, // screen x=200, y=200
        ],
        payload: {
          color: '#38bdf8',
          lineWidth: 2,
          lineStyle: 'solid',
          extendRight: false,
          showLabel: true,
        },
        createdAt: 1700000000,
        updatedAt: 1700000000,
      };

      act(() => {
        root.render(
          plugin.renderAnnotation({
            annotation,
            payload: annotation.payload,
            isSelected: true,
            projector,
            onSelect: vi.fn(),
            onUpdate,
            onDelete: vi.fn(),
          })
        );
      });

      const handle0 = findElement(container, (el) => el.attributes?.title === 'Drag start anchor');
      const handle0Props = getReactProps(handle0);

      act(() => {
        handle0Props.onMouseDown({
          stopPropagation: vi.fn(),
          preventDefault: vi.fn(),
          clientX: 100,
          clientY: 300,
        });
      });

      // 1. Move away
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: 180, clientY: 220 });
      });

      // 2. Move back to origin
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: 100, clientY: 300 });
      });

      // 3. Move to new final target (120, 280)
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: 120, clientY: 280 });
      });

      // 4. Mouse up
      act(() => {
        dispatchWindowEvent('mouseup', {});
      });

      expect(onUpdate).toHaveBeenCalledTimes(1);
      const updateCall = onUpdate.mock.calls[0]![0];
      const expectedLogical = projector.screenToLogical({ x: 120, y: 280 });
      expect(updateCall.anchors[0]).toEqual(expectedLogical);
      expect(updateCall.anchors[1]).toEqual(annotation.anchors[1]);
    });
```

### 5.3 Invalidation Conditions
The remediation is considered failed if:
1. Releasing mouse at $(x_0, y_0)$ after dragging away results in any call to `onUpdate`.
2. Releasing mouse at $(x_0, y_0)$ after dragging away leaves `dragAnchors` visual state non-null or displaced.
3. Dragging away after returning to origin fails to commit the final position.
4. Any TypeScript or Vitest tests fail.
