# Handoff Report: Explorer M2 Return 3 (Sticker & Tests)

- **Agent**: `explorer_m2_return_3`
- **Archetype / Roles**: explorer, investigation, test specification
- **Parent**: `orchestrator_m15` (`a9a9c8ed-8a35-4f8f-8dd8-9119837c3c50`)
- **Working Directory**: `/home/duke/Project/marketview/.agents/teamwork/explorer_m2_return_3`
- **Timestamp**: 2026-11-07T19:23:00Z
- **Status**: COMPLETE

---

## 1. Observation

### 1.1 Scope of Investigation
This investigation covers:
1. Drag-away and return-to-origin defect analysis and exact remediation strategy for `src/features/chart/overlays/plugins/StickerPlugin.tsx`.
2. Specification of 5 empirical stress test cases in `src/test/empirical-overlay-stress.test.ts` across all 5 interaction targets:
   - Trendline handle
   - Trendline line
   - Fibonacci handle
   - Fibonacci body
   - Sticker pin
3. Verification against `DEAD_ENDS.md` to prevent previously failed regressions.

### 1.2 Verbatim Code Inspection of StickerPlugin.tsx
In `src/features/chart/overlays/plugins/StickerPlugin.tsx`, lines 115–188:
```tsx
115:   const handleStartDrag = (e: ReactMouseEvent) => {
116:     e.stopPropagation();
117:     e.preventDefault();
118:     isDraggingRef.current = true;
119:     hasMovedRef.current = false;
120:     dragAnchorRef.current = null;
121:     dragStartPointRef.current =
122:       typeof e.clientX === 'number' && typeof e.clientY === 'number'
123:         ? { x: e.clientX, y: e.clientY }
124:         : null;
125:     const initialAnchor = primaryAnchor;
126:     onSelect();
127: 
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
139: 
140:       const chartHost = document.querySelector('.overlay-canvas-root');
141:       if (!chartHost) return;
142:       const rect = chartHost.getBoundingClientRect();
143:       const point = {
144:         x: moveEvent.clientX - rect.left,
145:         y: moveEvent.clientY - rect.top,
146:       };
147:       const logical = projector.screenToLogical(point);
148:       if (!logical) return;
149: 
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
185: 
186:     window.addEventListener('mousemove', handleMouseMove);
187:     window.addEventListener('mouseup', handleMouseUp);
188:   };
```

### 1.3 Verbatim DEAD_ENDS.md Entry (Iteration 5)
In `.agents/teamwork/orchestrator_m15/DEAD_ENDS.md`, line 7:
> `Iteration 5: Screen-space zero displacement checks (moveEvent.clientX === dragStartPointRef.current.x && moveEvent.clientY === dragStartPointRef.current.y and dx === 0 && dy === 0) returning early without resetting hasMovedRef.current | When user drags away and returns to exact origin, early return prevents reaching Guard 2 and leaves hasMovedRef=true and stale displaced coordinates in dragAnchorsRef; commits stale displaced coordinates on mouseup | TrendlinePlugin.tsx, FibonacciPlugin.tsx, StickerPlugin.tsx`

### 1.4 Test Suite Status
Executing:
`npx vitest run src/test/empirical-overlay-stress.test.ts`
Result: 18 passed tests in 87ms. Existing tests cover stationary zero-displacement and click-spam, but currently lack tests verifying "drag away and return to origin".

---

## 2. Logic Chain

1. **Defect in Guard 1 Pre-emption**:
   - In `StickerPlugin.tsx`, when a user clicks on the pin/grip, `hasMovedRef.current` is initialized to `false` (line 119) and `dragStartPointRef.current` records `{ x, y }` (lines 121–124).
   - When the user drags away to `(x + 50, y - 40)`, Guard 1 passes. A new logical anchor is derived. `hasMovedRef.current` becomes `true`, `dragAnchorRef.current` stores the displaced coordinate, and `setDragAnchor(logical)` updates the preview state (lines 163–165).
   - When the user moves the mouse back to the initial coordinate `(x, y)`:
     Guard 1 (line 132) matches: `moveEvent.clientX === dragStartPointRef.current.x && moveEvent.clientY === dragStartPointRef.current.y`.
     Because Guard 1 executes a bare `return;` (line 137), Guard 2 (line 151) is never reached!
   - Consequently:
     - `hasMovedRef.current` remains `true`.
     - `dragAnchorRef.current` remains set to the displaced coordinate from the preceding frame.
     - Visual preview `dragAnchor` remains displaced.
   - On `handleMouseUp`:
     - Line 173 evaluates `hasMovedRef.current && dragAnchorRef.current` as `true`.
     - Line 174 compares `dragAnchorRef.current` against `annotation.anchors[0]`. Since `dragAnchorRef.current` holds the intermediate displaced coordinate, `isUnchanged` is `false`.
     - Line 178 executes `onUpdate({ anchors: [dragAnchorRef.current] })`, writing corrupt displaced coordinates to the persistent store even though the user returned the cursor to the origin before releasing.

2. **Remediation in Guard 1**:
   When Guard 1 detects zero displacement (`moveEvent.clientX === dragStartPointRef.current.x && moveEvent.clientY === dragStartPointRef.current.y`):
   ```tsx
   if (
     dragStartPointRef.current !== null &&
     moveEvent.clientX === dragStartPointRef.current.x &&
     moveEvent.clientY === dragStartPointRef.current.y
   ) {
     if (hasMovedRef.current) {
       hasMovedRef.current = false;
       dragAnchorRef.current = null;
       setDragAnchor(null);
     }
     return;
   }
   ```
   If the user was dragging and returned to the origin, this immediately clears `hasMovedRef.current`, clears `dragAnchorRef.current`, and resets visual state `setDragAnchor(null)`.

3. **Remediation in Guard 2 & Initial Anchor Definition**:
   Define `initialAnchor` strictly against `annotation.anchors[0] ?? primaryAnchor`.
   In Guard 2:
   ```tsx
   if (
     logical.timestamp === initialAnchor.timestamp &&
     logical.price === initialAnchor.price
   ) {
     if (hasMovedRef.current) {
       hasMovedRef.current = false;
       dragAnchorRef.current = null;
       setDragAnchor(null);
     }
     return;
   }
   ```
   This handles synthetic events where `dragStartPointRef.current === null` or sub-pixel coordinate shifts that snap to the original candle timestamp and price level.

4. **Remediation in `handleMouseUp` (Defense in Depth)**:
   ```tsx
   if (hasMovedRef.current && dragAnchorRef.current) {
     const baseAnchor = annotation.anchors[0];
     const isUnchanged =
       baseAnchor !== undefined &&
       dragAnchorRef.current.timestamp === baseAnchor.timestamp &&
       dragAnchorRef.current.price === baseAnchor.price;
     if (!isUnchanged) {
       onUpdate({ anchors: [dragAnchorRef.current] });
     }
   }
   hasMovedRef.current = false;
   dragAnchorRef.current = null;
   setDragAnchor(null);
   ```
   Comparing against `annotation.anchors[0]` prevents any accidental commit if `dragAnchorRef.current` matches the stored baseline anchor.

5. **Empirical Verification via 5 New Stress Tests**:
   Adding a dedicated test suite `Edge Case 5: Drag-away and return-to-origin suppression and preview reset` in `src/test/empirical-overlay-stress.test.ts` will verify that:
   - For Trendline handle, Trendline line, Fibonacci handle, Fibonacci body, and Sticker pin:
     - Dragging away moves visual preview without calling `onUpdate`.
     - Moving back to the starting point resets the visual preview to original coordinates.
     - Releasing the mouse (`mouseup`) strictly does NOT call `onUpdate` (`expect(onUpdate).not.toHaveBeenCalled()`).

---

## 3. Caveats

- **Network Mode**: Investigation was conducted entirely within the local repository; no external dependencies or networks were queried.
- **Read-Only Invariant**: In accordance with the Explorer archetype rules, no changes have been committed directly to `src/features/chart/overlays/plugins/StickerPlugin.tsx` or `src/test/empirical-overlay-stress.test.ts`. Full implementations are provided below for the implementer worker.

---

## 4. Conclusion & Proposed Remediation

### 4.1 Proposed Code Patch for `src/features/chart/overlays/plugins/StickerPlugin.tsx`

Target lines: 125–184

#### Before:
```tsx
    const initialAnchor = primaryAnchor;
    onSelect();

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;

      // Guard 1: Screen-space zero displacement (same clientX / clientY)
      if (
        dragStartPointRef.current !== null &&
        moveEvent.clientX === dragStartPointRef.current.x &&
        moveEvent.clientY === dragStartPointRef.current.y
      ) {
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

      // Guard 2: Logical anchor displacement (same candle timestamp & price level)
      if (
        logical.timestamp === initialAnchor.timestamp &&
        logical.price === initialAnchor.price
      ) {
        if (hasMovedRef.current) {
          hasMovedRef.current = false;
          dragAnchorRef.current = null;
          setDragAnchor(null);
        }
        return;
      }

      hasMovedRef.current = true;
      dragAnchorRef.current = logical;
      setDragAnchor(logical);
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      dragStartPointRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (hasMovedRef.current && dragAnchorRef.current) {
        const isUnchanged =
          dragAnchorRef.current.timestamp === annotation.anchors[0]?.timestamp &&
          dragAnchorRef.current.price === annotation.anchors[0]?.price;
        if (!isUnchanged) {
          onUpdate({ anchors: [dragAnchorRef.current] });
        }
      }
      hasMovedRef.current = false;
      dragAnchorRef.current = null;
      setDragAnchor(null);
    };
```

#### After:
```tsx
    const initialAnchor = annotation.anchors[0] ?? primaryAnchor;
    onSelect();

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;

      // Guard 1: Screen-space zero displacement (same clientX / clientY)
      if (
        dragStartPointRef.current !== null &&
        moveEvent.clientX === dragStartPointRef.current.x &&
        moveEvent.clientY === dragStartPointRef.current.y
      ) {
        if (hasMovedRef.current) {
          hasMovedRef.current = false;
          dragAnchorRef.current = null;
          setDragAnchor(null);
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

      // Guard 2: Logical anchor displacement (same candle timestamp & price level)
      if (
        logical.timestamp === initialAnchor.timestamp &&
        logical.price === initialAnchor.price
      ) {
        if (hasMovedRef.current) {
          hasMovedRef.current = false;
          dragAnchorRef.current = null;
          setDragAnchor(null);
        }
        return;
      }

      hasMovedRef.current = true;
      dragAnchorRef.current = logical;
      setDragAnchor(logical);
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      dragStartPointRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (hasMovedRef.current && dragAnchorRef.current) {
        const baseAnchor = annotation.anchors[0];
        const isUnchanged =
          baseAnchor !== undefined &&
          dragAnchorRef.current.timestamp === baseAnchor.timestamp &&
          dragAnchorRef.current.price === baseAnchor.price;
        if (!isUnchanged) {
          onUpdate({ anchors: [dragAnchorRef.current] });
        }
      }
      hasMovedRef.current = false;
      dragAnchorRef.current = null;
      setDragAnchor(null);
    };
```

---

### 4.2 Proposed 5 New Stress Tests for `src/test/empirical-overlay-stress.test.ts`

Append the following describe block right before the final closing `});` of `describe('Empirical Adversarial Stress Suite: Overlay Drag & Debounce Edge Cases', ...)` at line 1297:

```ts
  // =========================================================================
  // Edge Case 5: Drag-away and return-to-origin suppression and preview reset
  // =========================================================================
  describe('Edge Case 5: Drag-away and return-to-origin suppression and preview reset', () => {
    it('Trendline handle drag-away and return-to-origin does NOT call onUpdate and resets handle position', () => {
      const projector = createMockProjector();
      const onUpdate = vi.fn();
      const plugin = overlayPluginRegistry.get('trendline')!;

      const annotation: ChartAnnotation = {
        id: 'trend-return-handle',
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
      expect(handle0).toBeDefined();
      const handle0Props = getReactProps(handle0);

      // 1. Mouse down on handle 0 at initial screen position (100, 300)
      act(() => {
        handle0Props.onMouseDown({
          stopPropagation: vi.fn(),
          preventDefault: vi.fn(),
          clientX: 100,
          clientY: 300,
        });
      });

      // 2. Drag away to (180, 220)
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: 180, clientY: 220 });
      });

      // Drag preview should be active (handle displaced to 180px, 220px)
      const handle0Displaced = findElement(container, (el) => el.attributes?.title === 'Drag start anchor');
      expect(handle0Displaced.style.left).toBe('180px');
      expect(handle0Displaced.style.top).toBe('220px');
      expect(onUpdate).not.toHaveBeenCalled();

      // 3. Drag back to exact origin (100, 300)
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: 100, clientY: 300 });
      });

      // Drag preview should be reset back to (100px, 300px)
      const handle0Reset = findElement(container, (el) => el.attributes?.title === 'Drag start anchor');
      expect(handle0Reset.style.left).toBe('100px');
      expect(handle0Reset.style.top).toBe('300px');

      // 4. Mouse up
      act(() => {
        dispatchWindowEvent('mouseup', {});
      });

      // onUpdate MUST NOT be called!
      expect(onUpdate).not.toHaveBeenCalled();
    });

    it('Trendline line drag-away and return-to-origin does NOT call onUpdate and resets line position', () => {
      const projector = createMockProjector();
      const onUpdate = vi.fn();
      const plugin = overlayPluginRegistry.get('trendline')!;

      const annotation: ChartAnnotation = {
        id: 'trend-return-line',
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
            isSelected: false,
            projector,
            onSelect: vi.fn(),
            onUpdate,
            onDelete: vi.fn(),
          })
        );
      });

      const lineHitbox = findElement(
        container,
        (el, props) => el.tagName === 'LINE' && typeof props.onMouseDown === 'function'
      );
      expect(lineHitbox).toBeDefined();
      const lineProps = getReactProps(lineHitbox);

      // 1. Mouse down at (150, 250)
      act(() => {
        lineProps.onMouseDown({
          stopPropagation: vi.fn(),
          preventDefault: vi.fn(),
          clientX: 150,
          clientY: 250,
        });
      });

      // 2. Drag line away by (+60, -40) -> mouse at (210, 210)
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: 210, clientY: 210 });
      });

      // Drag preview should be displaced: line x1=160, y1=260, x2=260, y2=160
      const visibleLineDisplaced = findElement(
        container,
        (el) => el.tagName === 'LINE' && el.attributes?.stroke === '#38bdf8'
      );
      expect(visibleLineDisplaced.attributes.x1).toBe(160);
      expect(visibleLineDisplaced.attributes.y1).toBe(260);
      expect(onUpdate).not.toHaveBeenCalled();

      // 3. Move back to exact origin (150, 250) -> dx=0, dy=0
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: 150, clientY: 250 });
      });

      // Drag preview should be reset: line x1=100, y1=300, x2=200, y2=200
      const visibleLineReset = findElement(
        container,
        (el) => el.tagName === 'LINE' && el.attributes?.stroke === '#38bdf8'
      );
      expect(visibleLineReset.attributes.x1).toBe(100);
      expect(visibleLineReset.attributes.y1).toBe(300);

      // 4. Mouse up
      act(() => {
        dispatchWindowEvent('mouseup', {});
      });

      // onUpdate MUST NOT be called!
      expect(onUpdate).not.toHaveBeenCalled();
    });

    it('Fibonacci handle drag-away and return-to-origin does NOT call onUpdate and resets handle position', () => {
      const projector = createMockProjector();
      const onUpdate = vi.fn();
      const plugin = overlayPluginRegistry.get('fibonacci')!;

      const annotation: ChartAnnotation = {
        id: 'fib-return-handle',
        ticker: 'NVDA',
        type: 'fibonacci',
        anchors: [
          { timestamp: 1700001000, price: 100 }, // screen x=100, y=300
          { timestamp: 1700002000, price: 200 }, // screen x=200, y=100
        ],
        payload: {
          color: '#a855f7',
          levels: [0, 0.5, 1],
          showPrices: true,
          fillBackground: true,
          extendRight: false,
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

      const handle0 = findElement(container, (el) => el.attributes?.title?.includes('0.0%'));
      expect(handle0).toBeDefined();
      const handle0Props = getReactProps(handle0);

      // 1. Mouse down on handle 0 (100, 300)
      act(() => {
        handle0Props.onMouseDown({
          stopPropagation: vi.fn(),
          preventDefault: vi.fn(),
          clientX: 100,
          clientY: 300,
        });
      });

      // 2. Drag handle away to (160, 240)
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: 160, clientY: 240 });
      });

      // Handle preview should be displaced
      const handle0Displaced = findElement(container, (el) => el.attributes?.title?.includes('0.0%'));
      expect(handle0Displaced.style.left).toBe('160px');
      expect(handle0Displaced.style.top).toBe('240px');
      expect(onUpdate).not.toHaveBeenCalled();

      // 3. Drag back to exact origin (100, 300)
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: 100, clientY: 300 });
      });

      // Handle preview should be reset
      const handle0Reset = findElement(container, (el) => el.attributes?.title?.includes('0.0%'));
      expect(handle0Reset.style.left).toBe('100px');
      expect(handle0Reset.style.top).toBe('300px');

      // 4. Mouse up
      act(() => {
        dispatchWindowEvent('mouseup', {});
      });

      // onUpdate MUST NOT be called!
      expect(onUpdate).not.toHaveBeenCalled();
    });

    it('Fibonacci body drag-away and return-to-origin does NOT call onUpdate and resets body position', () => {
      const projector = createMockProjector();
      const onUpdate = vi.fn();
      const plugin = overlayPluginRegistry.get('fibonacci')!;

      const annotation: ChartAnnotation = {
        id: 'fib-return-body',
        ticker: 'NVDA',
        type: 'fibonacci',
        anchors: [
          { timestamp: 1700001000, price: 100 }, // screen x=100, y=300
          { timestamp: 1700002000, price: 200 }, // screen x=200, y=100
        ],
        payload: {
          color: '#a855f7',
          levels: [0, 0.5, 1],
          showPrices: true,
          fillBackground: true,
          extendRight: false,
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

      const bandRect = findElement(
        container,
        (el, props) => el.tagName === 'RECT' && typeof props.onMouseDown === 'function'
      );
      expect(bandRect).toBeDefined();
      const bandProps = getReactProps(bandRect);

      // 1. Mouse down at (150, 200)
      act(() => {
        bandProps.onMouseDown({
          stopPropagation: vi.fn(),
          preventDefault: vi.fn(),
          clientX: 150,
          clientY: 200,
        });
      });

      // 2. Drag body by (+70, -50) -> mouse at (220, 150)
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: 220, clientY: 150 });
      });

      // Handles should reflect displaced body (+70, -50):
      // Handle 0: (100+70, 300-50) = (170, 250)
      const handle0Displaced = findElement(container, (el) => el.attributes?.title?.includes('0.0%'));
      expect(handle0Displaced.style.left).toBe('170px');
      expect(handle0Displaced.style.top).toBe('250px');
      expect(onUpdate).not.toHaveBeenCalled();

      // 3. Move back to exact origin (150, 200) -> dx=0, dy=0
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: 150, clientY: 200 });
      });

      // Handles should be reset to original coordinates:
      const handle0Reset = findElement(container, (el) => el.attributes?.title?.includes('0.0%'));
      expect(handle0Reset.style.left).toBe('100px');
      expect(handle0Reset.style.top).toBe('300px');

      const handle1Reset = findElement(container, (el) => el.attributes?.title?.includes('100.0%'));
      expect(handle1Reset.style.left).toBe('200px');
      expect(handle1Reset.style.top).toBe('100px');

      // 4. Mouse up
      act(() => {
        dispatchWindowEvent('mouseup', {});
      });

      // onUpdate MUST NOT be called!
      expect(onUpdate).not.toHaveBeenCalled();
    });

    it('Sticker pin drag-away and return-to-origin does NOT call onUpdate and resets sticker position', () => {
      const projector = createMockProjector();
      const onUpdate = vi.fn();
      const plugin = overlayPluginRegistry.get('sticker')!;

      const annotation: ChartAnnotation = {
        id: 'sticker-return-pin',
        ticker: 'NVDA',
        type: 'sticker',
        anchors: [{ timestamp: 1700001000, price: 120 }], // screen x=100, y=260
        payload: {
          markdown: 'Return to origin test',
          color: 'amber',
          isExpanded: true,
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

      const pin = findElement(
        container,
        (el) => el.attributes?.title === 'Drag anchor to reposition on candles'
      );
      expect(pin).toBeDefined();
      const pinProps = getReactProps(pin);

      // 1. Mouse down on pin at (100, 260)
      act(() => {
        pinProps.onMouseDown({
          stopPropagation: vi.fn(),
          preventDefault: vi.fn(),
          clientX: 100,
          clientY: 260,
        });
      });

      // 2. Drag pin away to (180, 200)
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: 180, clientY: 200 });
      });

      // Outer sticker container should be displaced to (180px, 200px)
      const stickerContainerDisplaced = findElement(
        container,
        (el) => el.style?.left && el.style?.transform?.includes('translate(-50%, -100%)')
      );
      expect(stickerContainerDisplaced.style.left).toBe('180px');
      expect(stickerContainerDisplaced.style.top).toBe('200px');
      expect(onUpdate).not.toHaveBeenCalled();

      // 3. Move cursor back to exact origin (100, 260)
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: 100, clientY: 260 });
      });

      // Outer sticker container should revert back to (100px, 260px)
      const stickerContainerReset = findElement(
        container,
        (el) => el.style?.left && el.style?.transform?.includes('translate(-50%, -100%)')
      );
      expect(stickerContainerReset.style.left).toBe('100px');
      expect(stickerContainerReset.style.top).toBe('260px');

      // 4. Mouse up
      act(() => {
        dispatchWindowEvent('mouseup', {});
      });

      // onUpdate MUST NOT be called!
      expect(onUpdate).not.toHaveBeenCalled();
    });
  });
```

---

## 5. Verification Method

### 5.1 Verification Commands
1. **Typecheck Verification**:
   ```bash
   npm run typecheck
   ```
   *Expected outcome*: Exits with code 0, zero diagnostic errors.

2. **Empirical Stress Suite Run**:
   ```bash
   npx vitest run src/test/empirical-overlay-stress.test.ts
   ```
   *Expected outcome*: 23 tests pass (18 existing + 5 newly added), 0 failures.

3. **Full Test Suite Run**:
   ```bash
   npm run test
   ```
   *Expected outcome*: All test suites pass cleanly across core and features.

### 5.2 Invalidation Conditions
- If any of the 5 test cases triggers `onUpdate` when dragging away and returning to origin, the remediation is invalid.
- If returning to origin leaves `dragAnchor` or `dragAnchors` frozen at the displaced coordinate rather than reverting to the original anchor position, the remediation is invalid.
- If stationary mouse clicks or click-spam trigger spurious `onUpdate` calls, the remediation is invalid (violating DEAD_ENDS.md Iteration 3 & 4).
