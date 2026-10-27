import { describe, expect, it } from 'vitest';
import { FIBONACCI_DEFAULT_LEVELS } from '../../../../core/schemas/annotation';
import { overlayPluginRegistry } from '../registry';
import {
  calculateFibonacciLevels,
  fibonacciPlugin,
} from '../plugins/FibonacciPlugin';
// Ensure OverlayCanvas side-effect imports are executed
import '../OverlayCanvas';

describe('FibonacciPlugin & calculateFibonacciLevels', () => {
  describe('calculateFibonacciLevels', () => {
    it('computes correct price levels and labels for an uptrend', () => {
      const startPrice = 100;
      const endPrice = 200;
      const levels = calculateFibonacciLevels(startPrice, endPrice);

      expect(levels).toHaveLength(FIBONACCI_DEFAULT_LEVELS.length);

      // Verify each ratio, label, and calculated price
      const expected = [
        { ratio: 0, label: '0.0%', price: 100 },
        { ratio: 0.236, label: '23.6%', price: 123.6 },
        { ratio: 0.382, label: '38.2%', price: 138.2 },
        { ratio: 0.5, label: '50.0%', price: 150 },
        { ratio: 0.618, label: '61.8%', price: 161.8 },
        { ratio: 0.786, label: '78.6%', price: 178.6 },
        { ratio: 1, label: '100.0%', price: 200 },
      ];

      expected.forEach((exp, index) => {
        const level = levels[index];
        expect(level).toBeDefined();
        expect(level!.ratio).toBe(exp.ratio);
        expect(level!.label).toBe(exp.label);
        expect(level!.price).toBeCloseTo(exp.price, 4);
      });
    });

    it('computes correct price levels and labels for a downtrend', () => {
      const startPrice = 200;
      const endPrice = 100;
      const levels = calculateFibonacciLevels(startPrice, endPrice);

      expect(levels).toHaveLength(FIBONACCI_DEFAULT_LEVELS.length);

      const expected = [
        { ratio: 0, label: '0.0%', price: 200 },
        { ratio: 0.236, label: '23.6%', price: 176.4 },
        { ratio: 0.382, label: '38.2%', price: 161.8 },
        { ratio: 0.5, label: '50.0%', price: 150 },
        { ratio: 0.618, label: '61.8%', price: 138.2 },
        { ratio: 0.786, label: '78.6%', price: 121.4 },
        { ratio: 1, label: '100.0%', price: 100 },
      ];

      expected.forEach((exp, index) => {
        const level = levels[index];
        expect(level).toBeDefined();
        expect(level!.ratio).toBe(exp.ratio);
        expect(level!.label).toBe(exp.label);
        expect(level!.price).toBeCloseTo(exp.price, 4);
      });
    });

    it('supports custom Fibonacci ratios including extensions beyond 1.0', () => {
      const customRatios = [0, 0.5, 1, 1.618];
      const levels = calculateFibonacciLevels(50, 150, customRatios);

      expect(levels).toEqual([
        { ratio: 0, label: '0.0%', price: 50 },
        { ratio: 0.5, label: '50.0%', price: 100 },
        { ratio: 1, label: '100.0%', price: 150 },
        { ratio: 1.618, label: '161.8%', price: 211.8 },
      ]);
    });

    it('handles flat prices where startPrice === endPrice', () => {
      const levels = calculateFibonacciLevels(120, 120);
      levels.forEach((lvl) => {
        expect(lvl.price).toBe(120);
      });
    });
  });

  describe('Registry Self-Registration', () => {
    it('is registered in overlayPluginRegistry under type "fibonacci"', () => {
      const registered = overlayPluginRegistry.get('fibonacci');
      expect(registered).toBeDefined();
      expect(registered).toBe(fibonacciPlugin);
    });

    it('is included in getAll() list', () => {
      const allPlugins = overlayPluginRegistry.getAll();
      const fib = allPlugins.find((p) => p.type === 'fibonacci');
      expect(fib).toBeDefined();
      expect(fib?.label).toBe('Fib Retracement');
    });
  });

  describe('Plugin Metadata and Default Payload', () => {
    it('has requiredAnchors === 2 and correct type/label', () => {
      expect(fibonacciPlugin.type).toBe('fibonacci');
      expect(fibonacciPlugin.label).toBe('Fib Retracement');
      expect(fibonacciPlugin.requiredAnchors).toBe(2);
    });

    it('creates a valid default payload compliant with FibonacciPayloadSchema', () => {
      const defaultPayload = fibonacciPlugin.createDefaultPayload([]);
      expect(defaultPayload).toEqual({
        color: '#a855f7',
        levels: [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1],
        extendRight: false,
        showPrices: true,
        fillBackground: true,
      });

      const parsed = fibonacciPlugin.payloadSchema.safeParse(defaultPayload);
      expect(parsed.success).toBe(true);
    });

    it('renderDraftPreview returns null when anchors are empty or mouse point is null', () => {
      const dummyProjector = {
        logicalToScreen: () => null,
        screenToLogical: () => null,
      };

      expect(
        fibonacciPlugin.renderDraftPreview?.({
          anchors: [],
          currentMousePoint: { x: 100, y: 100 },
          projector: dummyProjector,
        }),
      ).toBeNull();

      expect(
        fibonacciPlugin.renderDraftPreview?.({
          anchors: [{ timestamp: 1710000000, price: 100 }],
          currentMousePoint: null,
          projector: dummyProjector,
        }),
      ).toBeNull();
    });
  });
});
