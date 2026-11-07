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
    screenToLogical: ({ x, y }) => ({
      timestamp: 1700000000 + x * 10,
      price: (500 - y) / 2,
    }),
  };
}

describe('Empirical Adversarial Test: Overlay Drag Buffering & Typing Debounce', () => {
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

  describe('TrendlinePlugin Drag Buffering', () => {
    it('buffers mousemove during handle drag and commits onUpdate exactly once on mouseup', () => {
      const projector = createMockProjector();
      const onUpdate = vi.fn();
      const onSelect = vi.fn();
      const plugin = overlayPluginRegistry.get('trendline')!;

      const annotation: ChartAnnotation = {
        id: 'trend-1',
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
      expect(handle1).toBeDefined();
      const handle1Props = getReactProps(handle1);

      // 1. Mouse down on handle 1
      act(() => {
        handle1Props.onMouseDown({
          stopPropagation: vi.fn(),
          preventDefault: vi.fn(),
        });
      });

      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onUpdate).not.toHaveBeenCalled();

      // 2. Simulate 100 rapid mousemove events across 100 pixels
      for (let px = 1; px <= 100; px++) {
        act(() => {
          dispatchWindowEvent('mousemove', {
            clientX: 100 + px,
            clientY: 300 - px,
          });
        });
        expect(onUpdate).not.toHaveBeenCalled();
      }

      // 3. Mouse up to commit
      act(() => {
        dispatchWindowEvent('mouseup', {});
      });

      // onUpdate MUST be called exactly once
      expect(onUpdate).toHaveBeenCalledTimes(1);
      const updateCall = onUpdate.mock.calls[0]![0];
      expect(updateCall.anchors).toBeDefined();
      expect(updateCall.anchors.length).toBe(2);

      const expectedLogical = projector.screenToLogical({ x: 200, y: 200 });
      expect(updateCall.anchors[0].timestamp).toBe(expectedLogical?.timestamp);
      expect(updateCall.anchors[0].price).toBe(expectedLogical?.price);
      expect(updateCall.anchors[1]).toEqual(annotation.anchors[1]);
    });

    it('buffers mousemove during whole trendline line drag and commits onUpdate once on mouseup', () => {
      const projector = createMockProjector();
      const onUpdate = vi.fn();
      const onSelect = vi.fn();
      const plugin = overlayPluginRegistry.get('trendline')!;

      const annotation: ChartAnnotation = {
        id: 'trend-2',
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
      expect(lineHitbox).toBeDefined();
      const lineProps = getReactProps(lineHitbox);

      // 1. Mouse down on line
      act(() => {
        lineProps.onMouseDown({
          stopPropagation: vi.fn(),
          preventDefault: vi.fn(),
          clientX: 150,
          clientY: 250,
        });
      });

      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onUpdate).not.toHaveBeenCalled();

      // 2. Rapid mousemove 100 steps
      for (let px = 1; px <= 100; px++) {
        act(() => {
          dispatchWindowEvent('mousemove', {
            clientX: 150 + px,
            clientY: 250 - px,
          });
        });
        expect(onUpdate).not.toHaveBeenCalled();
      }

      // 3. Mouse up
      act(() => {
        dispatchWindowEvent('mouseup', {});
      });

      expect(onUpdate).toHaveBeenCalledTimes(1);
      const updateCall = onUpdate.mock.calls[0]![0];
      expect(updateCall.anchors).toBeDefined();
      expect(updateCall.anchors.length).toBe(2);
    });

    it('empirically tests whether clicking without mouse movement triggers spurious onUpdate on trendline', () => {
      const projector = createMockProjector();
      const onUpdate = vi.fn();
      const onSelect = vi.fn();
      const plugin = overlayPluginRegistry.get('trendline')!;

      const annotation: ChartAnnotation = {
        id: 'trend-3',
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

      // Pure click: mousedown + mouseup with zero mouse movements
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

      console.log('EMPIRICAL OBSERVATION: Trendline click without drag called onUpdate:', onUpdate.mock.calls.length, 'times');
      expect(onUpdate).not.toHaveBeenCalled();
    });
  });

  describe('FibonacciPlugin Drag Buffering', () => {
    it('buffers mousemove during zone drag and commits once on mouseup', () => {
      const projector = createMockProjector();
      const onUpdate = vi.fn();
      const onSelect = vi.fn();
      const plugin = overlayPluginRegistry.get('fibonacci')!;

      const annotation: ChartAnnotation = {
        id: 'fib-1',
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
            onSelect,
            onUpdate,
            onDelete: vi.fn(),
          })
        );
      });

      const bandRect = findElement(container, (el, props) => el.tagName === 'RECT' && typeof props.onMouseDown === 'function');
      expect(bandRect).toBeDefined();
      const bandProps = getReactProps(bandRect);

      // 1. Mouse down on band
      act(() => {
        bandProps.onMouseDown({
          stopPropagation: vi.fn(),
          preventDefault: vi.fn(),
          clientX: 120,
          clientY: 200,
        });
      });

      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onUpdate).not.toHaveBeenCalled();

      // 2. Rapid mousemove 100 steps
      for (let px = 1; px <= 100; px++) {
        act(() => {
          dispatchWindowEvent('mousemove', {
            clientX: 120 + px,
            clientY: 200 - px,
          });
        });
        expect(onUpdate).not.toHaveBeenCalled();
      }

      // 3. Mouse up
      act(() => {
        dispatchWindowEvent('mouseup', {});
      });

      expect(onUpdate).toHaveBeenCalledTimes(1);
    });

    it('empirically tests whether clicking without mouse movement triggers spurious onUpdate on Fibonacci', () => {
      const projector = createMockProjector();
      const onUpdate = vi.fn();
      const onSelect = vi.fn();
      const plugin = overlayPluginRegistry.get('fibonacci')!;

      const annotation: ChartAnnotation = {
        id: 'fib-click',
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
            onSelect,
            onUpdate,
            onDelete: vi.fn(),
          })
        );
      });

      const bandRect = findElement(container, (el, props) => el.tagName === 'RECT' && typeof props.onMouseDown === 'function');
      const bandProps = getReactProps(bandRect);

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

      console.log('EMPIRICAL OBSERVATION: Fibonacci click without drag called onUpdate:', onUpdate.mock.calls.length, 'times');
      expect(onUpdate).not.toHaveBeenCalled();
    });
  });

  describe('StickerPlugin Drag Buffering & Debounced Keystrokes', () => {
    it('buffers mousemove during pin drag and commits exactly once on mouseup', () => {
      const projector = createMockProjector();
      const onUpdate = vi.fn();
      const onSelect = vi.fn();
      const plugin = overlayPluginRegistry.get('sticker')!;

      const annotation: ChartAnnotation = {
        id: 'sticker-1',
        ticker: 'NVDA',
        type: 'sticker',
        anchors: [{ timestamp: 1700001000, price: 120 }],
        payload: {
          markdown: 'Support zone',
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
            onSelect,
            onUpdate,
            onDelete: vi.fn(),
          })
        );
      });

      const pin = findElement(container, (el) => el.attributes?.title === 'Drag anchor to reposition on candles');
      expect(pin).toBeDefined();
      const pinProps = getReactProps(pin);

      act(() => {
        pinProps.onMouseDown({
          stopPropagation: vi.fn(),
          preventDefault: vi.fn(),
        });
      });

      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onUpdate).not.toHaveBeenCalled();

      // 100 rapid mousemove events
      for (let px = 1; px <= 100; px++) {
        act(() => {
          dispatchWindowEvent('mousemove', {
            clientX: 100 + px,
            clientY: 200 - px,
          });
        });
        expect(onUpdate).not.toHaveBeenCalled();
      }

      act(() => {
        dispatchWindowEvent('mouseup', {});
      });

      expect(onUpdate).toHaveBeenCalledTimes(1);
      const updateCall = onUpdate.mock.calls[0]![0];
      expect(updateCall.anchors).toBeDefined();
      expect(updateCall.anchors.length).toBe(1);
    });

    it('empirically tests whether clicking sticker pin without movement triggers spurious onUpdate', () => {
      const projector = createMockProjector();
      const onUpdate = vi.fn();
      const onSelect = vi.fn();
      const plugin = overlayPluginRegistry.get('sticker')!;

      const annotation: ChartAnnotation = {
        id: 'sticker-click',
        ticker: 'NVDA',
        type: 'sticker',
        anchors: [{ timestamp: 1700001000, price: 120 }],
        payload: {
          markdown: 'Support zone',
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
            onSelect,
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

      act(() => {
        dispatchWindowEvent('mouseup', {});
      });

      console.log('EMPIRICAL OBSERVATION: Sticker pin click without drag called onUpdate:', onUpdate.mock.calls.length, 'times');
      expect(onUpdate).not.toHaveBeenCalled();
    });

    it('debounces 20 rapid keystrokes within 200ms and commits onUpdate once after 250ms of inactivity', () => {
      vi.useFakeTimers();
      const projector = createMockProjector();
      const onUpdate = vi.fn();
      const plugin = overlayPluginRegistry.get('sticker')!;

      const annotation: ChartAnnotation = {
        id: 'sticker-typing',
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
      expect(textareaEl).toBeDefined();
      const textareaProps = getReactProps(textareaEl);

      // Simulate 20 rapid keystrokes within 200ms (10ms apart)
      let currentText = 'Initial';
      for (let i = 1; i <= 20; i++) {
        currentText += ` char${i}`;
        act(() => {
          textareaProps.onChange({ target: { value: currentText } });
        });
        act(() => {
          vi.advanceTimersByTime(10);
        });
        // During rapid typing, onUpdate MUST NOT be called
        expect(onUpdate).not.toHaveBeenCalled();
      }

      // 10ms already elapsed in iteration 20. Advance by 230ms (total 240ms < 250ms debounce)
      act(() => {
        vi.advanceTimersByTime(230);
      });
      expect(onUpdate).not.toHaveBeenCalled();

      // Advance remaining 20ms to cross 250ms threshold (total 260ms)
      act(() => {
        vi.advanceTimersByTime(20);
      });

      // onUpdate MUST be called exactly once with the final text
      expect(onUpdate).toHaveBeenCalledTimes(1);
      expect(onUpdate).toHaveBeenCalledWith({
        payload: { markdown: currentText },
      });

      vi.useRealTimers();
    });

    it('flushes pending text synchronously on blur event before 250ms debounce expires', () => {
      vi.useFakeTimers();
      const projector = createMockProjector();
      const onUpdate = vi.fn();
      const plugin = overlayPluginRegistry.get('sticker')!;

      const annotation: ChartAnnotation = {
        id: 'sticker-blur',
        ticker: 'NVDA',
        type: 'sticker',
        anchors: [{ timestamp: 1700001000, price: 120 }],
        payload: {
          markdown: 'Initial',
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

      const textareaEl = findElement(container, (el) => el.tagName === 'TEXTAREA');
      const textareaProps = getReactProps(textareaEl);

      // Type some text
      act(() => {
        textareaProps.onChange({ target: { value: 'Urgent breakout thesis' } });
      });
      expect(onUpdate).not.toHaveBeenCalled();

      // Only 50ms pass (far short of 250ms debounce)
      act(() => {
        vi.advanceTimersByTime(50);
      });
      expect(onUpdate).not.toHaveBeenCalled();

      // Fire blur event
      act(() => {
        textareaProps.onBlur();
      });

      // MUST flush synchronously
      expect(onUpdate).toHaveBeenCalledTimes(1);
      expect(onUpdate).toHaveBeenCalledWith({
        payload: { markdown: 'Urgent breakout thesis' },
      });

      // Advance time beyond 250ms to ensure no second/duplicate flush occurs
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(onUpdate).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it('flushes pending text on unmount before 250ms debounce expires', () => {
      vi.useFakeTimers();
      const projector = createMockProjector();
      const onUpdate = vi.fn();
      const plugin = overlayPluginRegistry.get('sticker')!;

      const annotation: ChartAnnotation = {
        id: 'sticker-unmount',
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

      // Type some text
      act(() => {
        textareaProps.onChange({ target: { value: 'Unmounting note text' } });
      });
      expect(onUpdate).not.toHaveBeenCalled();

      // Advance only 30ms
      act(() => {
        vi.advanceTimersByTime(30);
      });
      expect(onUpdate).not.toHaveBeenCalled();

      // Unmount the component
      act(() => {
        root.unmount();
      });

      // MUST flush on unmount
      expect(onUpdate).toHaveBeenCalledTimes(1);
      expect(onUpdate).toHaveBeenCalledWith({
        payload: { markdown: 'Unmounting note text' },
      });

      vi.useRealTimers();
    });
  });
});
