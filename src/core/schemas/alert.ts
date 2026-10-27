import { z } from 'zod';
import { TickerSymbolSchema } from './market';

/**
 * Directional price crossing condition for a price alert.
 */
export const AlertConditionSchema = z.enum(['CROSSING_UP', 'CROSSING_DOWN']);
export type AlertCondition = z.infer<typeof AlertConditionSchema>;

/**
 * Lifecycle status of a price alert.
 */
export const AlertStatusSchema = z.enum(['ACTIVE', 'TRIGGERED', 'DISMISSED']);
export type AlertStatus = z.infer<typeof AlertStatusSchema>;

/**
 * Validated price alert domain entity.
 */
export const PriceAlertSchema = z.object({
  id: z.string().min(1),
  ticker: TickerSymbolSchema,
  targetPrice: z.number().finite().positive(),
  condition: AlertConditionSchema,
  status: AlertStatusSchema.default('ACTIVE'),
  note: z.string().default(''),
  createdAt: z.number().int().positive(),
  triggeredAt: z.number().int().positive().optional(),
});
export type PriceAlert = z.infer<typeof PriceAlertSchema>;

/**
 * Pure helper evaluating whether an active price alert should trigger at `currentPrice`.
 */
export function shouldTriggerAlert(
  alert: PriceAlert,
  currentPrice: number
): boolean {
  if (alert.status !== 'ACTIVE') {
    return false;
  }
  if (alert.condition === 'CROSSING_UP') {
    return currentPrice >= alert.targetPrice;
  }
  return currentPrice <= alert.targetPrice;
}
