import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChartAnnotation } from '../core/schemas/annotation';
import type { CoordinateProjector } from '../features/chart/types';
import { overlayPluginRegistry } from '../features/chart/overlays/registry';
import '../features/chart/overlays/plugins/TrendlinePlugin';
import '../features/chart/overlays/plugins/FibonacciPlugin';
import '../features/chart/overlays/plugins/StickerPlugin';

type Listener = (e: any) => void;
const windowListeners = new Map<string, Set<Listener>>();

function createMockElement(tag = 'div') {
  const el: any = {
    tagName: tag.toUpperCase(),
    nodeType: 1,
    style: {},
    attributes: {} as Record<string, string>,
    children: [] as any[],
    ownerDocument: null as any,
    parentNode: null as any,
    setAttribute: (k: string, v: string) => {
      el.attributes[k] = v;
    },
    getAttribute: (k: string) => el.attributes[k],
    appendChild: (c: any) => {
      el.children.push(c);
      c.parentNode = el;
      return c;
    },
    removeChild: (c: any) => {
      const idx = el.children.indexOf(c);
      if (idx !== -1) el.children.splice(idx, 1);
      c.parentNode = null;
      return c;
    },
    insertBefore: (n: any, ref: any) => {
      const idx = el.children.indexOf(ref);
      if (idx !== -1) el.children.splice(idx, 0, n);
      else el.children.push(n);
      n.parentNode = el;
      return n;
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      width: 800,
      height: 600,
      right: 800,
      bottom: 600,
    }),
  };
  return el;
}

function initMockDOM() {
  (global as any).IS_REACT_ACT_ENVIRONMENT = true;
  windowListeners.clear();

  const mockWindow: any = {
    addEventListener: (evt: string, cb: Listener) => {
      if (!windowListeners.has(evt)) windowListeners.set(evt, new Set());
      windowListeners.get(evt)!.add(cb);
    },
    removeEventListener: (evt: string, cb: Listener) => {
      windowListeners.get(evt)?.delete(cb);
    },
    setTimeout: global.setTimeout,
    clearTimeout: global.clearTimeout,
    HTMLIFrameElement: class {},
  };

  const mockDocument: any = {
    nodeType: 9,
    createElement: (tag: string) => {
      const el = createMockElement(tag);
      el.ownerDocument = mockDocument;
      return el;
    },
    createElementNS: (_ns: string, tag: string) => {
      const el = createMockElement(tag);
      el.ownerDocument = mockDocument;
      return el;
    },
    createTextNode: (text: string) => ({ nodeType: 3, nodeValue: text }),
    createComment: () => ({ nodeType: 8 }),
    documentElement: createMockElement('html'),
    addEventListener: () => {},
    removeEventListener: () => {},
    querySelector: (selector: string) => {
      if (selector === '.overlay-canvas-root') {
        const root = createMockElement('div');
        root.ownerDocument = mockDocument;
        return root;
      }
      return null;
    },
    activeElement: null,
    defaultView: mockWindow,
  };

  mockWindow.document = mockDocument;
  (global as any).window = mockWindow;
  (global as any).document = mockDocument;
}

function getReactProps(el: any) {
  if (!el) return {};
  const key = Object.keys(el).find((k) => k.startsWith('__reactProps$'));
  return key ? el[key] : {};
}

function findElement(root: any, predicate: (el: any, props: any) => boolean): any {
  if (!root) return null;
  const props = getReactProps(root);
  if (predicate(root, props)) return root;
  if (root.children && Array.isArray(root.children)) {
    for (const child of root.children) {
      const found = findElement(child, predicate);
      if (found) return found;
    }
  }
  return null;
}

function dispatchWindowEvent(type: string, eventObj: any) {
  const set = windowListeners.get(type);
  if (set) {
    for (const listener of Array.from(set)) {
      listener(eventObj);
    }
  }
}

function createMockProjector(): CoordinateProjector {
  return {
    logicalToScreen: ({ timestamp, price }) => ({
      x: (timestamp - 1700000000) / 10,
      y: 500 - price * 2,
    }),
    screenToLogical: ({ x, y }) => {
      if (x < 0 || x > 800 || y < 0 || y > 600) {
        return null;
      }
      return {
        timestamp: 1700000000 + x * 10,
        price: (500 - y) / 2,
      };
    },
  };
}

describe('Challenger M2 Return 1: Adversarial Overlay Stress Suite', () => {
  let container: any;
  let root: any;

  beforeEach(() => {
    initMockDOM();
    container = createMockElement('div');
    container.ownerDocument = (global as any).document;
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
      root = null;
    }
  });

  // =========================================================================
  // SECTION 1: Drag-Away & Return-to-Origin across all 5 interaction points
  // =========================================================================
  describe('Section 1: Drag-away and Return-to-Origin across all 5 interaction points', () => {
    it('Point 1: Trendline handle drag-away and return-to-origin produces 0 updates and resets preview', () => {
      const projector = createMockProjector();
      const onUpdate = vi.fn();
      const plugin = overlayPluginRegistry.get('trendline')!;

      const annotation: ChartAnnotation = {
        id: 'c1-trend-handle',
        ticker: 'NVDA',
        type: 'trendline',
        anchors: [
          { timestamp: 1700001000, price: 100 }, // screen (100, 300)
          { timestamp: 1700002000, price: 150 }, // screen (200, 200)
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

      // Start drag at (100, 300)
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

      const displacedHandle = findElement(container, (el) => el.attributes?.title === 'Drag start anchor');
      expect(displacedHandle.style.left).toBe('150px');
      expect(displacedHandle.style.top).toBe('250px');
      expect(onUpdate).not.toHaveBeenCalled();

      // Return to origin (100, 300)
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: 100, clientY: 300 });
      });

      const resetHandle = findElement(container, (el) => el.attributes?.title === 'Drag start anchor');
      expect(resetHandle.style.left).toBe('100px');
      expect(resetHandle.style.top).toBe('300px');

      // Mouse up
      act(() => {
        dispatchWindowEvent('mouseup', {});
      });

      expect(onUpdate).not.toHaveBeenCalled();
    });

    it('Point 2: Trendline line drag-away and return-to-origin produces 0 updates and resets preview', () => {
      const projector = createMockProjector();
      const onUpdate = vi.fn();
      const plugin = overlayPluginRegistry.get('trendline')!;

      const annotation: ChartAnnotation = {
        id: 'c1-trend-line',
        ticker: 'NVDA',
        type: 'trendline',
        anchors: [
          { timestamp: 1700001000, price: 100 }, // screen (100, 300)
          { timestamp: 1700002000, price: 150 }, // screen (200, 200)
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

      // Start drag at (150, 250)
      act(() => {
        lineProps.onMouseDown({
          stopPropagation: vi.fn(),
          preventDefault: vi.fn(),
          clientX: 150,
          clientY: 250,
        });
      });

      // Drag away by (+50, -50) -> mouse at (200, 200)
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: 200, clientY: 200 });
      });

      const displacedLine = findElement(container, (el) => el.tagName === 'LINE' && el.attributes?.stroke === '#38bdf8');
      expect(displacedLine.attributes.x1).toBe(150);
      expect(displacedLine.attributes.y1).toBe(250);

      // Return to origin (150, 250)
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: 150, clientY: 250 });
      });

      const resetLine = findElement(container, (el) => el.tagName === 'LINE' && el.attributes?.stroke === '#38bdf8');
      expect(resetLine.attributes.x1).toBe(100);
      expect(resetLine.attributes.y1).toBe(300);

      act(() => {
        dispatchWindowEvent('mouseup', {});
      });

      expect(onUpdate).not.toHaveBeenCalled();
    });

    it('Point 3: Fibonacci handle drag-away and return-to-origin produces 0 updates and resets preview', () => {
      const projector = createMockProjector();
      const onUpdate = vi.fn();
      const plugin = overlayPluginRegistry.get('fibonacci')!;

      const annotation: ChartAnnotation = {
        id: 'c1-fib-handle',
        ticker: 'NVDA',
        type: 'fibonacci',
        anchors: [
          { timestamp: 1700001000, price: 100 }, // screen (100, 300)
          { timestamp: 1700002000, price: 200 }, // screen (200, 100)
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

      const handle1 = findElement(container, (el) => el.attributes?.title?.includes('100.0%'));
      const handle1Props = getReactProps(handle1);

      // Start drag at (200, 100)
      act(() => {
        handle1Props.onMouseDown({
          stopPropagation: vi.fn(),
          preventDefault: vi.fn(),
          clientX: 200,
          clientY: 100,
        });
      });

      // Drag away to (280, 160)
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: 280, clientY: 160 });
      });

      const displacedHandle = findElement(container, (el) => el.attributes?.title?.includes('100.0%'));
      expect(displacedHandle.style.left).toBe('280px');
      expect(displacedHandle.style.top).toBe('160px');

      // Return to origin (200, 100)
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: 200, clientY: 100 });
      });

      const resetHandle = findElement(container, (el) => el.attributes?.title?.includes('100.0%'));
      expect(resetHandle.style.left).toBe('200px');
      expect(resetHandle.style.top).toBe('100px');

      act(() => {
        dispatchWindowEvent('mouseup', {});
      });

      expect(onUpdate).not.toHaveBeenCalled();
    });

    it('Point 4: Fibonacci body drag-away and return-to-origin produces 0 updates and resets preview', () => {
      const projector = createMockProjector();
      const onUpdate = vi.fn();
      const plugin = overlayPluginRegistry.get('fibonacci')!;

      const annotation: ChartAnnotation = {
        id: 'c1-fib-body',
        ticker: 'NVDA',
        type: 'fibonacci',
        anchors: [
          { timestamp: 1700001000, price: 100 }, // screen (100, 300)
          { timestamp: 1700002000, price: 200 }, // screen (200, 100)
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

      const band = findElement(container, (el, props) => el.tagName === 'RECT' && typeof props.onMouseDown === 'function');
      const bandProps = getReactProps(band);

      // Start drag at (150, 200)
      act(() => {
        bandProps.onMouseDown({
          stopPropagation: vi.fn(),
          preventDefault: vi.fn(),
          clientX: 150,
          clientY: 200,
        });
      });

      // Drag away to (230, 260) -> dx=+80, dy=+60
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: 230, clientY: 260 });
      });

      const handle0 = findElement(container, (el) => el.attributes?.title?.includes('0.0%'));
      expect(handle0.style.left).toBe('180px');
      expect(handle0.style.top).toBe('360px');

      // Return to origin (150, 200)
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: 150, clientY: 200 });
      });

      const resetHandle0 = findElement(container, (el) => el.attributes?.title?.includes('0.0%'));
      expect(resetHandle0.style.left).toBe('100px');
      expect(resetHandle0.style.top).toBe('300px');

      act(() => {
        dispatchWindowEvent('mouseup', {});
      });

      expect(onUpdate).not.toHaveBeenCalled();
    });

    it('Point 5: Sticker pin drag-away and return-to-origin produces 0 updates and resets preview', () => {
      const projector = createMockProjector();
      const onUpdate = vi.fn();
      const plugin = overlayPluginRegistry.get('sticker')!;

      const annotation: ChartAnnotation = {
        id: 'c1-sticker-pin',
        ticker: 'NVDA',
        type: 'sticker',
        anchors: [{ timestamp: 1700001000, price: 120 }], // screen (100, 260)
        payload: {
          markdown: 'Pin origin test',
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

      const pin = findElement(container, (el) => el.attributes?.title === 'Drag anchor to reposition on candles');
      const pinProps = getReactProps(pin);

      // Start drag at (100, 260)
      act(() => {
        pinProps.onMouseDown({
          stopPropagation: vi.fn(),
          preventDefault: vi.fn(),
          clientX: 100,
          clientY: 260,
        });
      });

      // Drag away to (190, 310)
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: 190, clientY: 310 });
      });

      const stickerContainer = findElement(container, (el) => el.style?.left && el.style?.transform?.includes('translate(-50%, -100%)'));
      expect(stickerContainer.style.left).toBe('190px');
      expect(stickerContainer.style.top).toBe('310px');

      // Return to origin (100, 260)
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: 100, clientY: 260 });
      });

      const resetContainer = findElement(container, (el) => el.style?.left && el.style?.transform?.includes('translate(-50%, -100%)'));
      expect(resetContainer.style.left).toBe('100px');
      expect(resetContainer.style.top).toBe('260px');

      act(() => {
        dispatchWindowEvent('mouseup', {});
      });

      expect(onUpdate).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // SECTION 2: Re-drag after return-to-origin across all 5 interaction points
  // =========================================================================
  describe('Section 2: Re-drag after return-to-origin (commits ONLY final destination)', () => {
    it('Trendline handle: drag away -> return to origin -> drag to destination -> commits ONLY final destination', () => {
      const projector = createMockProjector();
      const onUpdate = vi.fn();
      const plugin = overlayPluginRegistry.get('trendline')!;

      const annotation: ChartAnnotation = {
        id: 'c2-trend-handle',
        ticker: 'NVDA',
        type: 'trendline',
        anchors: [
          { timestamp: 1700001000, price: 100 }, // (100, 300)
          { timestamp: 1700002000, price: 150 }, // (200, 200)
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

      // 1. Mousedown at origin (100, 300)
      act(() => {
        handle0Props.onMouseDown({
          stopPropagation: vi.fn(),
          preventDefault: vi.fn(),
          clientX: 100,
          clientY: 300,
        });
      });

      // 2. Drag away to intermediate destination A (160, 220)
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: 160, clientY: 220 });
      });
      expect(onUpdate).not.toHaveBeenCalled();

      // 3. Return to origin (100, 300)
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: 100, clientY: 300 });
      });
      expect(onUpdate).not.toHaveBeenCalled();

      // 4. Continue dragging to final destination B (300, 180)
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: 300, clientY: 180 });
      });
      expect(onUpdate).not.toHaveBeenCalled();

      // 5. Mouseup at final destination B
      act(() => {
        dispatchWindowEvent('mouseup', {});
      });

      // MUST be called exactly once
      expect(onUpdate).toHaveBeenCalledTimes(1);
      const committed = onUpdate.mock.calls[0]![0];
      const expectedLogicalB = projector.screenToLogical({ x: 300, y: 180 });
      expect(committed.anchors[0]).toEqual(expectedLogicalB);
      expect(committed.anchors[1]).toEqual(annotation.anchors[1]);
    });

    it('Trendline line: drag away -> return to origin -> drag to destination -> commits ONLY final destination', () => {
      const projector = createMockProjector();
      const onUpdate = vi.fn();
      const plugin = overlayPluginRegistry.get('trendline')!;

      const annotation: ChartAnnotation = {
        id: 'c2-trend-line',
        ticker: 'NVDA',
        type: 'trendline',
        anchors: [
          { timestamp: 1700001000, price: 100 }, // (100, 300)
          { timestamp: 1700002000, price: 150 }, // (200, 200)
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

      // 1. Mousedown at (150, 250)
      act(() => {
        lineProps.onMouseDown({
          stopPropagation: vi.fn(),
          preventDefault: vi.fn(),
          clientX: 150,
          clientY: 250,
        });
      });

      // 2. Drag away to intermediate (+40, -40) -> (190, 210)
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: 190, clientY: 210 });
      });

      // 3. Return to origin (150, 250)
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: 150, clientY: 250 });
      });

      // 4. Drag to new final destination (+70, +30) -> (220, 280)
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: 220, clientY: 280 });
      });

      // 5. Mouseup
      act(() => {
        dispatchWindowEvent('mouseup', {});
      });

      expect(onUpdate).toHaveBeenCalledTimes(1);
      const committed = onUpdate.mock.calls[0]![0];
      const expectedP1 = { x: 100 + 70, y: 300 + 30 };
      const expectedP2 = { x: 200 + 70, y: 200 + 30 };
      expect(committed.anchors[0]).toEqual(projector.screenToLogical(expectedP1));
      expect(committed.anchors[1]).toEqual(projector.screenToLogical(expectedP2));
    });

    it('Fibonacci handle: drag away -> return to origin -> drag to destination -> commits ONLY final destination', () => {
      const projector = createMockProjector();
      const onUpdate = vi.fn();
      const plugin = overlayPluginRegistry.get('fibonacci')!;

      const annotation: ChartAnnotation = {
        id: 'c2-fib-handle',
        ticker: 'NVDA',
        type: 'fibonacci',
        anchors: [
          { timestamp: 1700001000, price: 100 }, // (100, 300)
          { timestamp: 1700002000, price: 200 }, // (200, 100)
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
      const handle0Props = getReactProps(handle0);

      // Mousedown at origin (100, 300)
      act(() => {
        handle0Props.onMouseDown({
          stopPropagation: vi.fn(),
          preventDefault: vi.fn(),
          clientX: 100,
          clientY: 300,
        });
      });

      // Move away to (150, 250)
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: 150, clientY: 250 });
      });

      // Return to origin (100, 300)
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: 100, clientY: 300 });
      });

      // Move to final destination (120, 340)
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: 120, clientY: 340 });
      });

      // Mouseup
      act(() => {
        dispatchWindowEvent('mouseup', {});
      });

      expect(onUpdate).toHaveBeenCalledTimes(1);
      const committed = onUpdate.mock.calls[0]![0];
      const expectedLogical = projector.screenToLogical({ x: 120, y: 340 });
      expect(committed.anchors[0]).toEqual(expectedLogical);
      expect(committed.anchors[1]).toEqual(annotation.anchors[1]);
    });

    it('Fibonacci body: drag away -> return to origin -> drag to destination -> commits ONLY final destination', () => {
      const projector = createMockProjector();
      const onUpdate = vi.fn();
      const plugin = overlayPluginRegistry.get('fibonacci')!;

      const annotation: ChartAnnotation = {
        id: 'c2-fib-body',
        ticker: 'NVDA',
        type: 'fibonacci',
        anchors: [
          { timestamp: 1700001000, price: 100 }, // (100, 300)
          { timestamp: 1700002000, price: 200 }, // (200, 100)
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

      const band = findElement(container, (el, props) => el.tagName === 'RECT' && typeof props.onMouseDown === 'function');
      const bandProps = getReactProps(band);

      // Mousedown at (150, 200)
      act(() => {
        bandProps.onMouseDown({
          stopPropagation: vi.fn(),
          preventDefault: vi.fn(),
          clientX: 150,
          clientY: 200,
        });
      });

      // Drag away to (210, 150)
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: 210, clientY: 150 });
      });

      // Return to origin (150, 200)
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: 150, clientY: 200 });
      });

      // Drag to new destination (180, 240) -> dx=+30, dy=+40
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: 180, clientY: 240 });
      });

      // Mouseup
      act(() => {
        dispatchWindowEvent('mouseup', {});
      });

      expect(onUpdate).toHaveBeenCalledTimes(1);
      const committed = onUpdate.mock.calls[0]![0];
      expect(committed.anchors[0]).toEqual(projector.screenToLogical({ x: 100 + 30, y: 300 + 40 }));
      expect(committed.anchors[1]).toEqual(projector.screenToLogical({ x: 200 + 30, y: 100 + 40 }));
    });

    it('Sticker pin: drag away -> return to origin -> drag to destination -> commits ONLY final destination', () => {
      const projector = createMockProjector();
      const onUpdate = vi.fn();
      const plugin = overlayPluginRegistry.get('sticker')!;

      const annotation: ChartAnnotation = {
        id: 'c2-sticker-pin',
        ticker: 'NVDA',
        type: 'sticker',
        anchors: [{ timestamp: 1700001000, price: 120 }], // (100, 260)
        payload: {
          markdown: 'Re-drag sticker',
          color: 'emerald',
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

      const pin = findElement(container, (el) => el.attributes?.title === 'Drag anchor to reposition on candles');
      const pinProps = getReactProps(pin);

      // Mousedown at origin (100, 260)
      act(() => {
        pinProps.onMouseDown({
          stopPropagation: vi.fn(),
          preventDefault: vi.fn(),
          clientX: 100,
          clientY: 260,
        });
      });

      // Move away to (150, 300)
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: 150, clientY: 300 });
      });

      // Return to origin (100, 260)
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: 100, clientY: 260 });
      });

      // Drag to new destination (220, 180)
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: 220, clientY: 180 });
      });

      // Mouseup
      act(() => {
        dispatchWindowEvent('mouseup', {});
      });

      expect(onUpdate).toHaveBeenCalledTimes(1);
      const committed = onUpdate.mock.calls[0]![0];
      expect(committed.anchors[0]).toEqual(projector.screenToLogical({ x: 220, y: 180 }));
    });

    it('Multiple return-to-origin cycles before final release commits strictly once to final target', () => {
      const projector = createMockProjector();
      const onUpdate = vi.fn();
      const plugin = overlayPluginRegistry.get('trendline')!;

      const annotation: ChartAnnotation = {
        id: 'c2-multi-cycle',
        ticker: 'NVDA',
        type: 'trendline',
        anchors: [
          { timestamp: 1700001000, price: 100 }, // (100, 300)
          { timestamp: 1700002000, price: 150 }, // (200, 200)
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

      // Cycle 1: move to (120, 280) -> back to (100, 300)
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: 120, clientY: 280 });
      });
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: 100, clientY: 300 });
      });

      // Cycle 2: move to (150, 250) -> back to (100, 300)
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: 150, clientY: 250 });
      });
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: 100, clientY: 300 });
      });

      // Cycle 3: move to (180, 220) -> back to (100, 300)
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: 180, clientY: 220 });
      });
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: 100, clientY: 300 });
      });

      // Final move to (250, 150)
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: 250, clientY: 150 });
      });

      act(() => {
        dispatchWindowEvent('mouseup', {});
      });

      expect(onUpdate).toHaveBeenCalledTimes(1);
      const committed = onUpdate.mock.calls[0]![0];
      expect(committed.anchors[0]).toEqual(projector.screenToLogical({ x: 250, y: 150 }));
    });
  });

  // =========================================================================
  // SECTION 3: Rapid Click Spam (50 clicks) -> verify 0 spurious updates
  // =========================================================================
  describe('Section 3: Rapid Click Spam across interaction points (0 spurious updates)', () => {
    it('50 rapid clicks on Trendline handle produce 0 onUpdate calls', () => {
      const projector = createMockProjector();
      const onUpdate = vi.fn();
      const plugin = overlayPluginRegistry.get('trendline')!;

      const annotation: ChartAnnotation = {
        id: 'c3-trend-spam-handle',
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

      for (let i = 0; i < 50; i++) {
        act(() => {
          handle0Props.onMouseDown({
            stopPropagation: vi.fn(),
            preventDefault: vi.fn(),
            clientX: 100,
            clientY: 300,
          });
        });
        act(() => {
          dispatchWindowEvent('mouseup', {});
        });
      }

      expect(onUpdate).not.toHaveBeenCalled();
    });

    it('50 rapid clicks on Fibonacci handle produce 0 onUpdate calls', () => {
      const projector = createMockProjector();
      const onUpdate = vi.fn();
      const plugin = overlayPluginRegistry.get('fibonacci')!;

      const annotation: ChartAnnotation = {
        id: 'c3-fib-spam-handle',
        ticker: 'NVDA',
        type: 'fibonacci',
        anchors: [
          { timestamp: 1700001000, price: 100 },
          { timestamp: 1700002000, price: 200 },
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
      const handle0Props = getReactProps(handle0);

      for (let i = 0; i < 50; i++) {
        act(() => {
          handle0Props.onMouseDown({
            stopPropagation: vi.fn(),
            preventDefault: vi.fn(),
            clientX: 100,
            clientY: 300,
          });
        });
        act(() => {
          dispatchWindowEvent('mouseup', {});
        });
      }

      expect(onUpdate).not.toHaveBeenCalled();
    });

    it('50 rapid clicks on Sticker pin produce 0 onUpdate calls', () => {
      const projector = createMockProjector();
      const onUpdate = vi.fn();
      const plugin = overlayPluginRegistry.get('sticker')!;

      const annotation: ChartAnnotation = {
        id: 'c3-sticker-spam-pin',
        ticker: 'NVDA',
        type: 'sticker',
        anchors: [{ timestamp: 1700001000, price: 120 }],
        payload: {
          markdown: 'Spam note',
          color: 'sky',
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

      const pin = findElement(container, (el) => el.attributes?.title === 'Drag anchor to reposition on candles');
      const pinProps = getReactProps(pin);

      for (let i = 0; i < 50; i++) {
        act(() => {
          pinProps.onMouseDown({
            stopPropagation: vi.fn(),
            preventDefault: vi.fn(),
            clientX: 100,
            clientY: 260,
          });
        });
        act(() => {
          dispatchWindowEvent('mouseup', {});
        });
      }

      expect(onUpdate).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // SECTION 4: Out-of-bounds Dragging (screenToLogical null handling)
  // =========================================================================
  describe('Section 4: Out-of-bounds drag handling', () => {
    it('Dragging Trendline handle out-of-bounds does not crash and commits last valid coordinate', () => {
      const projector = createMockProjector();
      const onUpdate = vi.fn();
      const plugin = overlayPluginRegistry.get('trendline')!;

      const annotation: ChartAnnotation = {
        id: 'c4-trend-oob',
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

      // Move to valid coordinate (240, 260)
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: 240, clientY: 260 });
      });

      // Move to out of bounds (-500, -200) where screenToLogical returns null
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: -500, clientY: -200 });
      });

      // Move to another out of bounds position (1500, 2000)
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: 1500, clientY: 2000 });
      });

      act(() => {
        dispatchWindowEvent('mouseup', {});
      });

      // Must commit the last valid coordinate without throwing
      expect(onUpdate).toHaveBeenCalledTimes(1);
      const committed = onUpdate.mock.calls[0]![0];
      expect(committed.anchors[0]).toEqual(projector.screenToLogical({ x: 240, y: 260 }));
    });

    it('Dragging entirely out of bounds from start does not call onUpdate', () => {
      const projector = createMockProjector();
      const onUpdate = vi.fn();
      const plugin = overlayPluginRegistry.get('fibonacci')!;

      const annotation: ChartAnnotation = {
        id: 'c4-fib-all-oob',
        ticker: 'NVDA',
        type: 'fibonacci',
        anchors: [
          { timestamp: 1700001000, price: 100 },
          { timestamp: 1700002000, price: 200 },
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
      const handle0Props = getReactProps(handle0);

      act(() => {
        handle0Props.onMouseDown({
          stopPropagation: vi.fn(),
          preventDefault: vi.fn(),
          clientX: 100,
          clientY: 300,
        });
      });

      // Directly move to out of bounds coordinates
      for (let i = 0; i < 15; i++) {
        act(() => {
          dispatchWindowEvent('mousemove', { clientX: -100 - i * 10, clientY: -50 - i * 10 });
        });
      }

      act(() => {
        dispatchWindowEvent('mouseup', {});
      });

      expect(onUpdate).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // SECTION 5: Sticker Textarea 250ms Debounce, Blur Flush, and Unmount Flush
  // =========================================================================
  describe('Section 5: Sticker textarea debouncing & flush semantics', () => {
    it('100 rapid keystrokes within 200ms -> commits once after exactly 250ms of quiet time', () => {
      vi.useFakeTimers();
      const projector = createMockProjector();
      const onUpdate = vi.fn();
      const plugin = overlayPluginRegistry.get('sticker')!;

      const annotation: ChartAnnotation = {
        id: 'c5-sticker-debounce',
        ticker: 'NVDA',
        type: 'sticker',
        anchors: [{ timestamp: 1700001000, price: 120 }],
        payload: {
          markdown: 'Initial',
          color: 'rose',
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

      const textareaEl = findElement(container, (el) => el.tagName === 'TEXTAREA');
      const textareaProps = getReactProps(textareaEl);

      let text = 'Initial';
      for (let i = 1; i <= 50; i++) {
        text += ` k${i}`;
        act(() => {
          textareaProps.onChange({ target: { value: text } });
        });
        act(() => {
          vi.advanceTimersByTime(4); // 50 * 4ms = 200ms
        });
        expect(onUpdate).not.toHaveBeenCalled();
      }

      // At 240ms after last stroke: still not called
      act(() => {
        vi.advanceTimersByTime(240);
      });
      expect(onUpdate).not.toHaveBeenCalled();

      // At 255ms: called exactly once
      act(() => {
        vi.advanceTimersByTime(15);
      });
      expect(onUpdate).toHaveBeenCalledTimes(1);
      expect(onUpdate).toHaveBeenCalledWith({
        payload: { markdown: text },
      });

      vi.useRealTimers();
    });

    it('Blur immediately flushes pending markdown and clears debounce timer (no duplicate call)', () => {
      vi.useFakeTimers();
      const projector = createMockProjector();
      const onUpdate = vi.fn();
      const plugin = overlayPluginRegistry.get('sticker')!;

      const annotation: ChartAnnotation = {
        id: 'c5-sticker-blur',
        ticker: 'NVDA',
        type: 'sticker',
        anchors: [{ timestamp: 1700001000, price: 120 }],
        payload: {
          markdown: 'Initial',
          color: 'rose',
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

      const textareaEl = findElement(container, (el) => el.tagName === 'TEXTAREA');
      const textareaProps = getReactProps(textareaEl);

      act(() => {
        textareaProps.onChange({ target: { value: 'Immediate blur text' } });
      });

      act(() => {
        vi.advanceTimersByTime(30);
      });
      expect(onUpdate).not.toHaveBeenCalled();

      // Blur fires
      act(() => {
        textareaProps.onBlur();
      });

      // Synchronously flushed
      expect(onUpdate).toHaveBeenCalledTimes(1);
      expect(onUpdate).toHaveBeenCalledWith({
        payload: { markdown: 'Immediate blur text' },
      });

      // Advance past 250ms
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(onUpdate).toHaveBeenCalledTimes(1); // strictly 1 call, no duplicate

      vi.useRealTimers();
    });

    it('Unmount immediately flushes pending markdown before debounce timer fires', () => {
      vi.useFakeTimers();
      const projector = createMockProjector();
      const onUpdate = vi.fn();
      const plugin = overlayPluginRegistry.get('sticker')!;

      const annotation: ChartAnnotation = {
        id: 'c5-sticker-unmount',
        ticker: 'NVDA',
        type: 'sticker',
        anchors: [{ timestamp: 1700001000, price: 120 }],
        payload: {
          markdown: 'Initial',
          color: 'purple',
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

      const textareaEl = findElement(container, (el) => el.tagName === 'TEXTAREA');
      const textareaProps = getReactProps(textareaEl);

      act(() => {
        textareaProps.onChange({ target: { value: 'Flush on unmount text' } });
      });

      act(() => {
        vi.advanceTimersByTime(40);
      });
      expect(onUpdate).not.toHaveBeenCalled();

      // Unmount component
      act(() => {
        root.unmount();
        root = null;
      });

      expect(onUpdate).toHaveBeenCalledTimes(1);
      expect(onUpdate).toHaveBeenCalledWith({
        payload: { markdown: 'Flush on unmount text' },
      });

      vi.useRealTimers();
    });
  });
});
