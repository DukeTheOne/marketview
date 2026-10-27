import { describe, expect, it } from 'vitest';
import {
  ChartAnnotationSchema,
  ChartAnnotationTypeSchema,
  FIBONACCI_DEFAULT_LEVELS,
  FibonacciPayloadSchema,
} from '../schemas/annotation';

describe('FibonacciPayloadSchema & ChartAnnotationSchema (fibonacci)', () => {
  it('includes fibonacci in ChartAnnotationTypeSchema', () => {
    expect(ChartAnnotationTypeSchema.parse('fibonacci')).toBe('fibonacci');
  });

  it('populates default Fibonacci levels and styling when parsing empty object', () => {
    const parsed = FibonacciPayloadSchema.parse({});
    expect(parsed).toEqual({
      color: '#a855f7',
      levels: [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1],
      extendRight: false,
      showPrices: true,
      fillBackground: true,
    });
    expect(parsed.levels).toEqual([...FIBONACCI_DEFAULT_LEVELS]);
  });

  it('accepts custom levels within [0, 2] and custom visual flags', () => {
    const custom = FibonacciPayloadSchema.parse({
      color: '#38bdf8',
      levels: [0, 0.382, 0.5, 0.618, 1, 1.618],
      extendRight: true,
      showPrices: false,
      fillBackground: false,
    });

    expect(custom.color).toBe('#38bdf8');
    expect(custom.levels).toEqual([0, 0.382, 0.5, 0.618, 1, 1.618]);
    expect(custom.extendRight).toBe(true);
    expect(custom.showPrices).toBe(false);
    expect(custom.fillBackground).toBe(false);
  });

  it('rejects out-of-range Fibonacci ratios (< 0 or > 2)', () => {
    expect(() =>
      FibonacciPayloadSchema.parse({
        levels: [-0.236, 0, 1],
      }),
    ).toThrow();

    expect(() =>
      FibonacciPayloadSchema.parse({
        levels: [0, 1, 2.618],
      }),
    ).toThrow();
  });

  it('validates a complete fibonacci ChartAnnotation entity with logical anchors', () => {
    const annotation = ChartAnnotationSchema.parse({
      id: 'fib-nvda-1',
      ticker: 'NVDA',
      type: 'fibonacci',
      anchors: [
        { timestamp: 1710000000, price: 105.5 },
        { timestamp: 1710086400, price: 135.0 },
      ],
      payload: FibonacciPayloadSchema.parse({}),
      createdAt: 1710086400000,
      updatedAt: 1710086400000,
    });

    expect(annotation.type).toBe('fibonacci');
    expect(annotation.anchors).toHaveLength(2);
    expect(annotation.anchors[0]?.price).toBe(105.5);
    expect(annotation.anchors[1]?.price).toBe(135.0);
  });
});
