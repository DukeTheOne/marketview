import { z } from 'zod';
import { TickerSymbolSchema } from './market';

/**
 * Logical chart coordinate anchor.
 * Architectural Invariant: Screen (x, y) pixel coordinates are NEVER persisted.
 * Every chart overlay is anchored exclusively to logical (timestamp, price) coordinates.
 */
export const LogicalAnchorSchema = z.object({
  timestamp: z.number().int().positive(), // Unix seconds UTC
  price: z.number().finite().positive(),  // Logical price value
});
export type LogicalAnchor = z.infer<typeof LogicalAnchorSchema>;

/**
 * Discriminant union of chart overlay tool types.
 */
export const ChartAnnotationTypeSchema = z.enum([
  'sticker',
  'trendline',
  'trade_marker',
]);
export type ChartAnnotationType = z.infer<typeof ChartAnnotationTypeSchema>;

/**
 * Unified chart annotation entity persisted via StorageRepository and rendered via OverlayPluginRegistry.
 */
export const ChartAnnotationSchema = z.object({
  id: z.string().min(1),
  ticker: TickerSymbolSchema,
  type: ChartAnnotationTypeSchema,
  anchors: z.array(LogicalAnchorSchema).min(1),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
});
export type ChartAnnotation = z.infer<typeof ChartAnnotationSchema>;

/**
 * Sticker note payload schema
 */
export const StickerColorSchema = z.enum([
  'amber',
  'emerald',
  'rose',
  'sky',
  'purple',
]);
export type StickerColor = z.infer<typeof StickerColorSchema>;

export const StickerPayloadSchema = z.object({
  markdown: z.string().default('New note...'),
  color: StickerColorSchema.default('amber'),
  isExpanded: z.boolean().default(true),
});
export type StickerPayload = z.infer<typeof StickerPayloadSchema>;

/**
 * Trendline payload schema
 */
export const TrendlineStyleSchema = z.enum(['solid', 'dashed']);
export type TrendlineStyle = z.infer<typeof TrendlineStyleSchema>;

export const TrendlinePayloadSchema = z.object({
  color: z.string().default('#38bdf8'), // sky-400
  lineWidth: z.number().min(1).max(6).default(2),
  lineStyle: TrendlineStyleSchema.default('solid'),
  extendRight: z.boolean().default(false),
  showLabel: z.boolean().default(true),
});
export type TrendlinePayload = z.infer<typeof TrendlinePayloadSchema>;

/**
 * Trade marker payload schema
 */
export const TradeMarkerPayloadSchema = z.object({
  tradeId: z.string().optional(),
  side: z.enum(['BUY', 'SELL', 'SHORT', 'COVER']),
  price: z.number().positive(),
  quantity: z.number().int().positive().default(100),
  setupTag: z.string().default('Execution'),
  notes: z.string().default(''),
});
export type TradeMarkerPayload = z.infer<typeof TradeMarkerPayloadSchema>;



