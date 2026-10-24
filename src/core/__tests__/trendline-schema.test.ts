import { describe, expect, it } from 'vitest';
import {
  ChartAnnotationSchema,
  TrendlinePayloadSchema,
} from '../schemas/annotation';

describe('Trendline Headless Schema & 2-Anchor Structure (TC-M3-03)', () => {
  it('validates default trendline payload and custom styling', () => {
    const defaultPayload = TrendlinePayloadSchema.parse({});
    expect(defaultPayload).toEqual({
      color: '#38bdf8',
      lineWidth: 2,
      lineStyle: 'solid',
      extendRight: false,
      showLabel: true,
    });

    const customPayload = TrendlinePayloadSchema.parse({
      color: '#10b981',
      lineWidth: 3,
      lineStyle: 'dashed',
      extendRight: true,
      showLabel: false,
    });
    expect(customPayload.color).toBe('#10b981');
    expect(customPayload.lineStyle).toBe('dashed');
    expect(customPayload.extendRight).toBe(true);
  });

  it('validates a complete 2-anchor trendline annotation entity', () => {
    const trendline = ChartAnnotationSchema.parse({
      id: 'ann-trend-1',
      ticker: 'nvda',
      type: 'trendline',
      anchors: [
        { timestamp: 1729728000, price: 125.5 },
        { timestamp: 1729738800, price: 132.8 },
      ],
      payload: {
        color: '#f59e0b',
        lineWidth: 2,
        lineStyle: 'solid',
        extendRight: true,
      },
      createdAt: 1729728000,
      updatedAt: 1729728000,
    });

    expect(trendline.ticker).toBe('NVDA');
    expect(trendline.type).toBe('trendline');
    expect(trendline.anchors.length).toBe(2);
    expect(trendline.anchors[0]?.price).toBe(125.5);
    expect(trendline.anchors[1]?.price).toBe(132.8);
    expect(trendline.payload['color']).toBe('#f59e0b');
    expect(trendline.payload['extendRight']).toBe(true);
  });
});
