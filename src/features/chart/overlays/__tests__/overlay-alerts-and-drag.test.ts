import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { PriceAlert } from '../../../../core/schemas/alert';
import type { ChartAnnotation, LogicalAnchor } from '../../../../core/schemas/annotation';
import type { ChartOverlayHostContext, CoordinateProjector } from '../../types';
import {
  OverlayCanvas,
  applyDraggedAnchorUpdate,
} from '../OverlayCanvas';
import { PriceAlertLinesLayer } from '../PriceAlertLinesLayer';

function createDeterministicProjector(
  overrides?: Partial<CoordinateProjector>
): CoordinateProjector {
  return {
    logicalToScreen: ({ timestamp, price }) => ({
      x: Math.round((timestamp - 1711300000) / 100),
      y: Math.round(500 - price),
    }),
    screenToLogical: ({ x, y }) => ({
      timestamp: 1711300000 + x * 100,
      price: 500 - y,
    }),
    ...overrides,
  };
}

function createHostContext(
  ticker = 'NVDA',
  projector: CoordinateProjector = createDeterministicProjector()
): ChartOverlayHostContext {
  return {
    ticker,
    width: 960,
    height: 540,
    viewportRevision: 1,
    projector,
  };
}

const sampleAlerts: PriceAlert[] = [
  {
    id: 'alert-up-1',
    ticker: 'NVDA',
    condition: 'CROSSING_UP',
    targetPrice: 145.5,
    status: 'ACTIVE',
    createdAt: 1711350000,
    note: 'Breakout above resistance',
  },
  {
    id: 'alert-down-1',
    ticker: 'NVDA',
    condition: 'CROSSING_DOWN',
    targetPrice: 120.0,
    status: 'ACTIVE',
    createdAt: 1711351000,
    note: 'Key support retest',
  },
  {
    id: 'alert-trig-1',
    ticker: 'NVDA',
    condition: 'CROSSING_UP',
    targetPrice: 138.25,
    status: 'TRIGGERED',
    createdAt: 1711352000,
    triggeredAt: 1711360000,
    note: 'Target hit',
  },
  {
    id: 'alert-dismissed-1',
    ticker: 'NVDA',
    condition: 'CROSSING_DOWN',
    targetPrice: 110.0,
    status: 'DISMISSED',
    createdAt: 1711353000,
    note: '',
  },
  {
    id: 'alert-other-ticker',
    ticker: 'AAPL',
    condition: 'CROSSING_UP',
    targetPrice: 215.0,
    status: 'ACTIVE',
    createdAt: 1711354000,
    note: '',
  },
];

describe('PriceAlertLinesLayer & OverlayCanvas Alert Rendering', () => {
  it('renders ACTIVE CROSSING_UP, ACTIVE CROSSING_DOWN, and TRIGGERED lines for matching ticker while ignoring DISMISSED and other tickers', () => {
    const projector = createDeterministicProjector();
    const html = renderToStaticMarkup(
      createElement(PriceAlertLinesLayer, {
        ticker: 'NVDA',
        alerts: sampleAlerts,
        projector,
        referenceTimestamp: 1711380000,
        onDismissAlert: vi.fn(),
        onDeleteAlert: vi.fn(),
      })
    );

    // Matching ACTIVE CROSSING_UP alert
    expect(html).toContain('data-testid="price-alert-line-alert-up-1"');
    expect(html).toContain('border-emerald-500/70');
    expect(html).toContain('bg-emerald-950/90 text-emerald-300 border-emerald-500/40');
    expect(html).toContain('$145.50');
    expect(html).toContain('Breakout above resistance');
    expect(html).toContain('▲');

    // Matching ACTIVE CROSSING_DOWN alert
    expect(html).toContain('data-testid="price-alert-line-alert-down-1"');
    expect(html).toContain('border-amber-500/70');
    expect(html).toContain('bg-amber-950/90 text-amber-300 border-amber-500/40');
    expect(html).toContain('$120.00');
    expect(html).toContain('Key support retest');
    expect(html).toContain('▼');

    // Matching TRIGGERED alert with Dismiss button
    expect(html).toContain('data-testid="price-alert-line-alert-trig-1"');
    expect(html).toContain('border-rose-500/80');
    expect(html).toContain('bg-rose-950/95 text-rose-200 border-rose-500/50');
    expect(html).toContain('$138.25');
    expect(html).toContain('Target hit');
    expect(html).toContain('data-testid="dismiss-alert-alert-trig-1"');
    expect(html).toContain('data-testid="delete-alert-alert-trig-1"');

    // Dismissed alert and non-matching ticker alert must NOT render
    expect(html).not.toContain('price-alert-line-alert-dismissed-1');
    expect(html).not.toContain('$110.00');
    expect(html).not.toContain('price-alert-line-alert-other-ticker');
    expect(html).not.toContain('$215.00');
  });

  it('skips rendering alert lines when projector.logicalToScreen returns null', () => {
    const nullProjector = createDeterministicProjector({
      logicalToScreen: () => null,
    });

    const html = renderToStaticMarkup(
      createElement(PriceAlertLinesLayer, {
        ticker: 'NVDA',
        alerts: sampleAlerts,
        projector: nullProjector,
      })
    );

    expect(html).not.toContain('price-alert-line-alert-up-1');
    expect(html).not.toContain('price-alert-line-alert-down-1');
    expect(html).not.toContain('price-alert-line-alert-trig-1');
  });

  it('renders alert lines using priceToCoordinate even if logicalToScreen returns null (off-screen or weekend timestamps)', () => {
    const projectorWithDirectY = createDeterministicProjector({
      logicalToScreen: () => null,
      priceToCoordinate: (price: number) => Math.round(500 - price),
    });

    const html = renderToStaticMarkup(
      createElement(PriceAlertLinesLayer, {
        ticker: 'NVDA',
        alerts: sampleAlerts,
        projector: projectorWithDirectY,
      })
    );

    // Active NVDA alerts should render using direct y coordinate
    expect(html).toContain('data-testid="price-alert-line-alert-up-1"');
    expect(html).toContain('style="top:355px"');
    expect(html).toContain('data-testid="price-alert-line-alert-down-1"');
    expect(html).toContain('style="top:380px"');
    expect(html).toContain('data-testid="price-alert-line-alert-trig-1"');
    expect(html).toContain('style="top:362px"');
  });

  it('falls back to logicalToScreen if priceToCoordinate returns null', () => {
    const fallbackProjector = createDeterministicProjector({
      priceToCoordinate: () => null,
      logicalToScreen: ({ price }) => ({ x: 0, y: Math.round(600 - price) }),
    });

    const html = renderToStaticMarkup(
      createElement(PriceAlertLinesLayer, {
        ticker: 'NVDA',
        alerts: sampleAlerts,
        projector: fallbackProjector,
      })
    );

    expect(html).toContain('data-testid="price-alert-line-alert-up-1"');
    expect(html).toContain('style="top:455px"');
  });

  it('returns empty markup when no active or triggered alerts exist for the ticker', () => {
    const projector = createDeterministicProjector();
    const html = renderToStaticMarkup(
      createElement(PriceAlertLinesLayer, {
        ticker: 'MSFT',
        alerts: sampleAlerts,
        projector,
      })
    );

    expect(html).toBe('');
  });

  it('integrates PriceAlertLinesLayer inside OverlayCanvas when alerts are passed', () => {
    const hostContext = createHostContext('NVDA');
    const html = renderToStaticMarkup(
      createElement(OverlayCanvas, {
        hostContext,
        annotations: [],
        activeTool: null,
        selectedAnnotationId: null,
        onSelectTool: vi.fn(),
        onSelectAnnotation: vi.fn(),
        onAddAnnotation: vi.fn(),
        onUpdateAnnotation: vi.fn(),
        onDeleteAnnotation: vi.fn(),
        alerts: sampleAlerts,
        referenceTimestamp: 1711380000,
      })
    );

    expect(html).toContain('overlay-canvas-root');
    expect(html).toContain('data-testid="price-alert-lines-layer"');
    expect(html).toContain('data-testid="price-alert-line-alert-up-1"');
    expect(html).toContain('data-testid="price-alert-line-alert-down-1"');
    expect(html).toContain('data-testid="price-alert-line-alert-trig-1"');
  });
});

describe('OverlayCanvas Interactive Drag-to-Edit Anchor Handles', () => {
  const sampleAnnotations: ChartAnnotation[] = [
    {
      id: 'trend-1',
      ticker: 'NVDA',
      type: 'trendline',
      anchors: [
        { timestamp: 1711310000, price: 125.0 },
        { timestamp: 1711340000, price: 142.0 },
      ],
      payload: { color: '#38bdf8', lineWidth: 2, strokeWidth: 2, dashed: false, label: 'Uptrend' },
      createdAt: 1711350000,
      updatedAt: 1711350000,
    },
    {
      id: 'fib-1',
      ticker: 'NVDA',
      type: 'fibonacci',
      anchors: [
        { timestamp: 1711305000, price: 118.0 },
        { timestamp: 1711345000, price: 148.0 },
      ],
      payload: { color: '#a855f7', showPrices: true },
      createdAt: 1711351000,
      updatedAt: 1711351000,
    },
    {
      id: 'sticker-1',
      ticker: 'NVDA',
      type: 'sticker',
      anchors: [{ timestamp: 1711320000, price: 130.0 }],
      payload: { emoji: '🚀', text: 'Earnings gap', color: '#f59e0b' },
      createdAt: 1711352000,
      updatedAt: 1711352000,
    },
  ];

  it('renders 2 draggable anchor handles when a trendline annotation is selected and activeTool is null', () => {
    const hostContext = createHostContext('NVDA');
    const html = renderToStaticMarkup(
      createElement(OverlayCanvas, {
        hostContext,
        annotations: sampleAnnotations,
        activeTool: null,
        selectedAnnotationId: 'trend-1',
        onSelectTool: vi.fn(),
        onSelectAnnotation: vi.fn(),
        onAddAnnotation: vi.fn(),
        onUpdateAnnotation: vi.fn(),
        onDeleteAnnotation: vi.fn(),
      })
    );

    expect(html).toContain('data-testid="anchor-handle-trend-1-0"');
    expect(html).toContain('data-testid="anchor-handle-trend-1-1"');
    expect(html).not.toContain('data-testid="anchor-handle-fib-1-0"');
    expect(html).not.toContain('data-testid="anchor-handle-sticker-1-0"');
  });

  it('renders 2 draggable anchor handles when a Fibonacci retracement annotation is selected', () => {
    const hostContext = createHostContext('NVDA');
    const html = renderToStaticMarkup(
      createElement(OverlayCanvas, {
        hostContext,
        annotations: sampleAnnotations,
        activeTool: null,
        selectedAnnotationId: 'fib-1',
        onSelectTool: vi.fn(),
        onSelectAnnotation: vi.fn(),
        onAddAnnotation: vi.fn(),
        onUpdateAnnotation: vi.fn(),
        onDeleteAnnotation: vi.fn(),
      })
    );

    expect(html).toContain('data-testid="anchor-handle-fib-1-0"');
    expect(html).toContain('data-testid="anchor-handle-fib-1-1"');
    expect(html).not.toContain('data-testid="anchor-handle-trend-1-0"');
  });

  it('renders 1 draggable anchor handle when a sticker annotation is selected', () => {
    const hostContext = createHostContext('NVDA');
    const html = renderToStaticMarkup(
      createElement(OverlayCanvas, {
        hostContext,
        annotations: sampleAnnotations,
        activeTool: null,
        selectedAnnotationId: 'sticker-1',
        onSelectTool: vi.fn(),
        onSelectAnnotation: vi.fn(),
        onAddAnnotation: vi.fn(),
        onUpdateAnnotation: vi.fn(),
        onDeleteAnnotation: vi.fn(),
      })
    );

    expect(html).toContain('data-testid="anchor-handle-sticker-1-0"');
    expect(html).not.toContain('data-testid="anchor-handle-sticker-1-1"');
  });

  it('hides anchor drag handles when an active placement tool is selected', () => {
    const hostContext = createHostContext('NVDA');
    const html = renderToStaticMarkup(
      createElement(OverlayCanvas, {
        hostContext,
        annotations: sampleAnnotations,
        activeTool: 'trendline',
        selectedAnnotationId: 'trend-1',
        onSelectTool: vi.fn(),
        onSelectAnnotation: vi.fn(),
        onAddAnnotation: vi.fn(),
        onUpdateAnnotation: vi.fn(),
        onDeleteAnnotation: vi.fn(),
      })
    );

    expect(html).not.toContain('data-testid="anchor-handle-trend-1-0"');
    expect(html).not.toContain('data-testid="anchor-handle-trend-1-1"');
  });

  it('applyDraggedAnchorUpdate immutably updates only the targeted anchor index with logical coordinates', () => {
    const originalAnchors: LogicalAnchor[] = [
      { timestamp: 1711310000, price: 125.0 },
      { timestamp: 1711340000, price: 142.0 },
    ];
    const nextAnchor: LogicalAnchor = {
      timestamp: 1711355000,
      price: 151.75,
    };

    const updatedSecond = applyDraggedAnchorUpdate(originalAnchors, 1, nextAnchor);
    expect(updatedSecond).toEqual([
      { timestamp: 1711310000, price: 125.0 },
      { timestamp: 1711355000, price: 151.75 },
    ]);
    // Ensure original array and non-target anchor were not mutated
    expect(originalAnchors).toEqual([
      { timestamp: 1711310000, price: 125.0 },
      { timestamp: 1711340000, price: 142.0 },
    ]);
    expect(updatedSecond).not.toBe(originalAnchors);
    expect(updatedSecond[0]).toBe(originalAnchors[0]);

    const updatedFirst = applyDraggedAnchorUpdate(originalAnchors, 0, {
      timestamp: 1711300000,
      price: 119.25,
    });
    expect(updatedFirst).toEqual([
      { timestamp: 1711300000, price: 119.25 },
      { timestamp: 1711340000, price: 142.0 },
    ]);

    // Out-of-bounds index leaves anchors unchanged
    const outOfBounds = applyDraggedAnchorUpdate(originalAnchors, 5, nextAnchor);
    expect(outOfBounds).toEqual(originalAnchors);
    expect(outOfBounds).not.toBe(originalAnchors);

    // Negative index leaves anchors unchanged
    const negativeIndex = applyDraggedAnchorUpdate(originalAnchors, -1, nextAnchor);
    expect(negativeIndex).toEqual(originalAnchors);
    expect(negativeIndex).not.toBe(originalAnchors);

    // Empty array leaves anchors unchanged
    const emptyAnchors: LogicalAnchor[] = [];
    const emptyResult = applyDraggedAnchorUpdate(emptyAnchors, 0, nextAnchor);
    expect(emptyResult).toEqual([]);
    expect(emptyResult).not.toBe(emptyAnchors);
  });
});
