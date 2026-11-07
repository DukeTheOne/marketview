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
      // Simulate viewport boundary: x between 0 and 800, y between 0 and 600
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

describe('Empirical Adversarial Stress Suite: Overlay Drag & Debounce Edge Cases', () => {
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
  // Edge Case 1: Zero-displacement drag events (mousemove at same clientX/clientY)
  // =========================================================================
  describe('Edge Case 1: Zero-displacement drag events', () => {
    it('Trendline line drag with zero-displacement mousemove does NOT call onUpdate', () => {
      const projector = createMockProjector();
      const onUpdate = vi.fn();
      const plugin = overlayPluginRegistry.get('trendline')!;

      const annotation: ChartAnnotation = {
        id: 'trend-zero-line',
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

      // Mouse down at (150, 250)
      act(() => {
        lineProps.onMouseDown({
          stopPropagation: vi.fn(),
          preventDefault: vi.fn(),
          clientX: 150,
          clientY: 250,
        });
      });

      // 10 zero-displacement mousemove events at exactly (150, 250)
      for (let i = 0; i < 10; i++) {
        act(() => {
          dispatchWindowEvent('mousemove', { clientX: 150, clientY: 250 });
        });
      }

      // Mouse up
      act(() => {
        dispatchWindowEvent('mouseup', {});
      });

      console.log('Zero-displacement Trendline line onUpdate calls:', onUpdate.mock.calls.length);
      expect(onUpdate).not.toHaveBeenCalled();
    });

    it('Fibonacci body drag with zero-displacement mousemove does NOT call onUpdate', () => {
      const projector = createMockProjector();
      const onUpdate = vi.fn();
      const plugin = overlayPluginRegistry.get('fibonacci')!;

      const annotation: ChartAnnotation = {
        id: 'fib-zero-body',
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
            isSelected: false,
            projector,
            onSelect: vi.fn(),
            onUpdate,
            onDelete: vi.fn(),
          })
        );
      });

      const bandRect = findElement(container, (el, props) => el.tagName === 'RECT' && typeof props.onMouseDown === 'function');
      const bandProps = getReactProps(bandRect);

      // Mouse down at (120, 200)
      act(() => {
        bandProps.onMouseDown({
          stopPropagation: vi.fn(),
          preventDefault: vi.fn(),
          clientX: 120,
          clientY: 200,
        });
      });

      // 10 zero-displacement mousemoves at (120, 200)
      for (let i = 0; i < 10; i++) {
        act(() => {
          dispatchWindowEvent('mousemove', { clientX: 120, clientY: 200 });
        });
      }

      // Mouse up
      act(() => {
        dispatchWindowEvent('mouseup', {});
      });

      console.log('Zero-displacement Fibonacci body onUpdate calls:', onUpdate.mock.calls.length);
      expect(onUpdate).not.toHaveBeenCalled();
    });

    it('Trendline handle with zero-displacement mousemove does NOT call onUpdate', () => {
      const projector = createMockProjector();
      const onUpdate = vi.fn();
      const plugin = overlayPluginRegistry.get('trendline')!;

      const annotation: ChartAnnotation = {
        id: 'trend-zero-handle',
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

      const handle1 = findElement(container, (el) => el.attributes?.title === 'Drag start anchor');
      const handle1Props = getReactProps(handle1);

      act(() => {
        handle1Props.onMouseDown({
          stopPropagation: vi.fn(),
          preventDefault: vi.fn(),
          clientX: 100,
          clientY: 300,
        });
      });

      // Mousemove at same position (100, 300)
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: 100, clientY: 300 });
      });

      act(() => {
        dispatchWindowEvent('mouseup', {});
      });

      console.log('Zero-displacement Trendline handle onUpdate calls:', onUpdate.mock.calls.length);
      expect(onUpdate).not.toHaveBeenCalled();
    });

    it('Fibonacci handle with zero-displacement mousemove does NOT call onUpdate', () => {
      const projector = createMockProjector();
      const onUpdate = vi.fn();
      const plugin = overlayPluginRegistry.get('fibonacci')!;

      const annotation: ChartAnnotation = {
        id: 'fib-zero-handle',
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
      const handle0Props = getReactProps(handle0);

      act(() => {
        handle0Props.onMouseDown({
          stopPropagation: vi.fn(),
          preventDefault: vi.fn(),
          clientX: 100,
          clientY: 300,
        });
      });

      // Mousemove at same position (100, 300)
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: 100, clientY: 300 });
      });

      act(() => {
        dispatchWindowEvent('mouseup', {});
      });

      console.log('Zero-displacement Fibonacci handle onUpdate calls:', onUpdate.mock.calls.length);
      expect(onUpdate).not.toHaveBeenCalled();
    });

    it('Sticker pin with zero-displacement mousemove does NOT call onUpdate', () => {
      const projector = createMockProjector();
      const onUpdate = vi.fn();
      const plugin = overlayPluginRegistry.get('sticker')!;

      const annotation: ChartAnnotation = {
        id: 'sticker-zero-pin',
        ticker: 'NVDA',
        type: 'sticker',
        anchors: [{ timestamp: 1700001000, price: 120 }], // screen x=100, y=260
        payload: {
          markdown: 'Pin test',
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

      act(() => {
        pinProps.onMouseDown({
          stopPropagation: vi.fn(),
          preventDefault: vi.fn(),
          clientX: 100,
          clientY: 260,
        });
      });

      // Mousemove at (100, 260)
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: 100, clientY: 260 });
      });

      act(() => {
        dispatchWindowEvent('mouseup', {});
      });

      console.log('Zero-displacement Sticker pin onUpdate calls:', onUpdate.mock.calls.length);
      expect(onUpdate).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Edge Case 2: Rapid click-spam without movement (multiple mousedown/mouseup cycles)
  // =========================================================================
  describe('Edge Case 2: Rapid click-spam without movement', () => {
    it('50 rapid clicks on Trendline line do NOT trigger onUpdate', () => {
      const projector = createMockProjector();
      const onUpdate = vi.fn();
      const onSelect = vi.fn();
      const plugin = overlayPluginRegistry.get('trendline')!;

      const annotation: ChartAnnotation = {
        id: 'trend-spam-line',
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
            onSelect,
            onUpdate,
            onDelete: vi.fn(),
          })
        );
      });

      const lineHitbox = findElement(container, (el, props) => el.tagName === 'LINE' && typeof props.onMouseDown === 'function');
      const lineProps = getReactProps(lineHitbox);

      for (let i = 0; i < 50; i++) {
        act(() => {
          lineProps.onMouseDown({
            stopPropagation: vi.fn(),
            preventDefault: vi.fn(),
            clientX: 150,
            clientY: 250,
          });
        });
        act(() => {
          dispatchWindowEvent('mouseup', {});
        });
      }

      expect(onSelect).toHaveBeenCalledTimes(50);
      expect(onUpdate).not.toHaveBeenCalled();
    });

    it('50 rapid clicks on Trendline handle do NOT trigger onUpdate', () => {
      const projector = createMockProjector();
      const onUpdate = vi.fn();
      const onSelect = vi.fn();
      const plugin = overlayPluginRegistry.get('trendline')!;

      const annotation: ChartAnnotation = {
        id: 'trend-spam-handle',
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
            onSelect,
            onUpdate,
            onDelete: vi.fn(),
          })
        );
      });

      const handle1 = findElement(container, (el) => el.attributes?.title === 'Drag start anchor');
      const handle1Props = getReactProps(handle1);

      for (let i = 0; i < 50; i++) {
        act(() => {
          handle1Props.onMouseDown({
            stopPropagation: vi.fn(),
            preventDefault: vi.fn(),
          });
        });
        act(() => {
          dispatchWindowEvent('mouseup', {});
        });
      }

      expect(onSelect).toHaveBeenCalledTimes(50);
      expect(onUpdate).not.toHaveBeenCalled();
    });

    it('50 rapid clicks on Fibonacci band and handles do NOT trigger onUpdate', () => {
      const projector = createMockProjector();
      const onUpdate = vi.fn();
      const onSelect = vi.fn();
      const plugin = overlayPluginRegistry.get('fibonacci')!;

      const annotation: ChartAnnotation = {
        id: 'fib-spam',
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
            onSelect,
            onUpdate,
            onDelete: vi.fn(),
          })
        );
      });

      const bandRect = findElement(container, (el, props) => el.tagName === 'RECT' && typeof props.onMouseDown === 'function');
      const bandProps = getReactProps(bandRect);
      const handle0 = findElement(container, (el) => el.attributes?.title?.includes('0.0%'));
      const handle0Props = getReactProps(handle0);

      for (let i = 0; i < 25; i++) {
        act(() => {
          bandProps.onMouseDown({
            stopPropagation: vi.fn(),
            preventDefault: vi.fn(),
            clientX: 120,
            clientY: 200,
          });
        });
        act(() => {
          dispatchWindowEvent('mouseup', {});
        });

        act(() => {
          handle0Props.onMouseDown({
            stopPropagation: vi.fn(),
            preventDefault: vi.fn(),
          });
        });
        act(() => {
          dispatchWindowEvent('mouseup', {});
        });
      }

      expect(onSelect).toHaveBeenCalledTimes(50);
      expect(onUpdate).not.toHaveBeenCalled();
    });

    it('50 rapid clicks on Sticker pin and header do NOT trigger onUpdate', () => {
      const projector = createMockProjector();
      const onUpdate = vi.fn();
      const onSelect = vi.fn();
      const plugin = overlayPluginRegistry.get('sticker')!;

      const annotation: ChartAnnotation = {
        id: 'sticker-spam',
        ticker: 'NVDA',
        type: 'sticker',
        anchors: [{ timestamp: 1700001000, price: 120 }],
        payload: {
          markdown: 'Spam test',
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
            onSelect,
            onUpdate,
            onDelete: vi.fn(),
          })
        );
      });

      const pin = findElement(container, (el) => el.attributes?.title === 'Drag anchor to reposition on candles');
      const pinProps = getReactProps(pin);
      const headerGrip = findElement(container, (el) => el.attributes?.title === 'Drag to reposition note anchor');
      const headerProps = getReactProps(headerGrip);

      for (let i = 0; i < 25; i++) {
        act(() => {
          pinProps.onMouseDown({
            stopPropagation: vi.fn(),
            preventDefault: vi.fn(),
          });
        });
        act(() => {
          dispatchWindowEvent('mouseup', {});
        });

        act(() => {
          headerProps.onMouseDown({
            stopPropagation: vi.fn(),
            preventDefault: vi.fn(),
          });
        });
        act(() => {
          dispatchWindowEvent('mouseup', {});
        });
      }

      expect(onSelect).toHaveBeenCalledTimes(50);
      expect(onUpdate).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Edge Case 3: Dragging outside viewport bounds where screenToLogical returns null
  // =========================================================================
  describe('Edge Case 3: Dragging outside viewport bounds (screenToLogical returns null)', () => {
    it('Dragging Trendline handle entirely out of bounds does NOT trigger onUpdate', () => {
      const projector = createMockProjector();
      const onUpdate = vi.fn();
      const plugin = overlayPluginRegistry.get('trendline')!;

      const annotation: ChartAnnotation = {
        id: 'trend-oob',
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
        });
      });

      // Dispatch mousemove events far outside chart bounds: x = -500, y = -300
      // screenToLogical returns null for all of them
      for (let i = 0; i < 20; i++) {
        act(() => {
          dispatchWindowEvent('mousemove', { clientX: -500 - i, clientY: -300 - i });
        });
      }

      act(() => {
        dispatchWindowEvent('mouseup', {});
      });

      // Because every logical conversion returned null, hasMovedRef remained false and dragAnchorsRef remained null
      expect(onUpdate).not.toHaveBeenCalled();
    });

    it('Dragging Trendline into bounds, then out of bounds, commits the last valid coordinate', () => {
      const projector = createMockProjector();
      const onUpdate = vi.fn();
      const plugin = overlayPluginRegistry.get('trendline')!;

      const annotation: ChartAnnotation = {
        id: 'trend-oob-valid',
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
        });
      });

      // Move to valid screen position (250, 350)
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: 250, clientY: 350 });
      });

      // Then move out of bounds (1200, 900) where screenToLogical returns null
      act(() => {
        dispatchWindowEvent('mousemove', { clientX: 1200, clientY: 900 });
      });

      act(() => {
        dispatchWindowEvent('mouseup', {});
      });

      // Exactly one commit with the last valid coordinates
      expect(onUpdate).toHaveBeenCalledTimes(1);
      const updateCall = onUpdate.mock.calls[0]![0];
      const expectedLogical = projector.screenToLogical({ x: 250, y: 350 });
      expect(updateCall.anchors[0]).toEqual(expectedLogical);
      expect(updateCall.anchors[1]).toEqual(annotation.anchors[1]);
    });

    it('Dragging Sticker pin entirely out of bounds does NOT trigger onUpdate', () => {
      const projector = createMockProjector();
      const onUpdate = vi.fn();
      const plugin = overlayPluginRegistry.get('sticker')!;

      const annotation: ChartAnnotation = {
        id: 'sticker-oob',
        ticker: 'NVDA',
        type: 'sticker',
        anchors: [{ timestamp: 1700001000, price: 120 }],
        payload: {
          markdown: 'OOB test',
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

      const pin = findElement(container, (el) => el.attributes?.title === 'Drag anchor to reposition on candles');
      const pinProps = getReactProps(pin);

      act(() => {
        pinProps.onMouseDown({
          stopPropagation: vi.fn(),
          preventDefault: vi.fn(),
        });
      });

      // Out of bounds
      for (let i = 0; i < 20; i++) {
        act(() => {
          dispatchWindowEvent('mousemove', { clientX: 9999, clientY: 9999 });
        });
      }

      act(() => {
        dispatchWindowEvent('mouseup', {});
      });

      expect(onUpdate).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Edge Case 4: Textarea typing with immediate blur vs debounce timeout vs component unmount
  // =========================================================================
  describe('Edge Case 4: Textarea typing debounce, blur, unmount permutations', () => {
    it('Focusing and blurring textarea without typing does NOT trigger onUpdate', () => {
      vi.useFakeTimers();
      const projector = createMockProjector();
      const onUpdate = vi.fn();
      const plugin = overlayPluginRegistry.get('sticker')!;

      const annotation: ChartAnnotation = {
        id: 'sticker-focus-blur-clean',
        ticker: 'NVDA',
        type: 'sticker',
        anchors: [{ timestamp: 1700001000, price: 120 }],
        payload: {
          markdown: 'Untouched text',
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

      // Focus, click around, then blur without any onChange
      act(() => {
        textareaProps.onBlur();
      });

      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(onUpdate).not.toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('Typing followed by immediate blur flushes once, and subsequent debounce timer does NOT trigger a duplicate call', () => {
      vi.useFakeTimers();
      const projector = createMockProjector();
      const onUpdate = vi.fn();
      const plugin = overlayPluginRegistry.get('sticker')!;

      const annotation: ChartAnnotation = {
        id: 'sticker-type-blur-timer',
        ticker: 'NVDA',
        type: 'sticker',
        anchors: [{ timestamp: 1700001000, price: 120 }],
        payload: {
          markdown: 'Initial',
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

      const textareaEl = findElement(container, (el) => el.tagName === 'TEXTAREA');
      const textareaProps = getReactProps(textareaEl);

      // 1. Type
      act(() => {
        textareaProps.onChange({ target: { value: 'Fast edit' } });
      });

      // 2. Immediate blur (0ms later)
      act(() => {
        textareaProps.onBlur();
      });

      // Committed immediately
      expect(onUpdate).toHaveBeenCalledTimes(1);
      expect(onUpdate).toHaveBeenCalledWith({ payload: { markdown: 'Fast edit' } });

      // 3. Wait 500ms (debounce timer expires)
      act(() => {
        vi.advanceTimersByTime(500);
      });

      // Still called exactly once, no duplicate
      expect(onUpdate).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it('Typing followed by debounce timeout flushes once, and subsequent blur does NOT trigger a duplicate call', () => {
      vi.useFakeTimers();
      const projector = createMockProjector();
      const onUpdate = vi.fn();
      const plugin = overlayPluginRegistry.get('sticker')!;

      const annotation: ChartAnnotation = {
        id: 'sticker-type-timer-blur',
        ticker: 'NVDA',
        type: 'sticker',
        anchors: [{ timestamp: 1700001000, price: 120 }],
        payload: {
          markdown: 'Initial',
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

      const textareaEl = findElement(container, (el) => el.tagName === 'TEXTAREA');
      const textareaProps = getReactProps(textareaEl);

      // 1. Type
      act(() => {
        textareaProps.onChange({ target: { value: 'Debounce edit' } });
      });

      // 2. Wait 300ms (debounce fires at 250ms)
      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(onUpdate).toHaveBeenCalledTimes(1);
      expect(onUpdate).toHaveBeenCalledWith({ payload: { markdown: 'Debounce edit' } });

      // 3. User now blurs
      act(() => {
        textareaProps.onBlur();
      });

      // Still called exactly once
      expect(onUpdate).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it('Typing followed by immediate blur, then unmount, calls onUpdate exactly once', () => {
      vi.useFakeTimers();
      const projector = createMockProjector();
      const onUpdate = vi.fn();
      const plugin = overlayPluginRegistry.get('sticker')!;

      const annotation: ChartAnnotation = {
        id: 'sticker-type-blur-unmount',
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

      // Type
      act(() => {
        textareaProps.onChange({ target: { value: 'Blur before unmount' } });
      });

      // Blur
      act(() => {
        textareaProps.onBlur();
      });

      expect(onUpdate).toHaveBeenCalledTimes(1);

      // Unmount
      act(() => {
        root.unmount();
        root = null;
      });

      // Still exactly 1
      expect(onUpdate).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it('Typing without blur or timeout, directly unmounting, calls onUpdate exactly once', () => {
      vi.useFakeTimers();
      const projector = createMockProjector();
      const onUpdate = vi.fn();
      const plugin = overlayPluginRegistry.get('sticker')!;

      const annotation: ChartAnnotation = {
        id: 'sticker-type-direct-unmount',
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

      // Type
      act(() => {
        textareaProps.onChange({ target: { value: 'Direct unmount text' } });
      });

      // Advance 50ms (well under 250ms)
      act(() => {
        vi.advanceTimersByTime(50);
      });
      expect(onUpdate).not.toHaveBeenCalled();

      // Unmount directly
      act(() => {
        root.unmount();
        root = null;
      });

      expect(onUpdate).toHaveBeenCalledTimes(1);
      expect(onUpdate).toHaveBeenCalledWith({ payload: { markdown: 'Direct unmount text' } });

      vi.useRealTimers();
    });

    it('Unmounting without ever typing does NOT call onUpdate', () => {
      vi.useFakeTimers();
      const projector = createMockProjector();
      const onUpdate = vi.fn();
      const plugin = overlayPluginRegistry.get('sticker')!;

      const annotation: ChartAnnotation = {
        id: 'sticker-clean-unmount',
        ticker: 'NVDA',
        type: 'sticker',
        anchors: [{ timestamp: 1700001000, price: 120 }],
        payload: {
          markdown: 'Never edited',
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

      act(() => {
        root.unmount();
        root = null;
      });

      expect(onUpdate).not.toHaveBeenCalled();
      vi.useRealTimers();
    });
  });

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
});
