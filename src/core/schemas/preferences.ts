import { z } from 'zod';
import { IndicatorIdSchema } from '../indicators/technicalIndicators';
import { TickerSymbolSchema, TimeframeSchema } from './market';

export const ProviderModeSchema = z.enum(['yahoo', 'finnhub', 'demo']);
export type ProviderMode = z.infer<typeof ProviderModeSchema>;

export const LivePollIntervalSchema = z.union([
  z.literal(0),
  z.literal(5),
  z.literal(15),
  z.literal(30),
]);
export type LivePollInterval = z.infer<typeof LivePollIntervalSchema>;

export const UserPreferencesSchema = z.object({
  activeTicker: TickerSymbolSchema.default('AAPL'),
  activeTimeframe: TimeframeSchema.default('1D'),
  activeWatchlistId: z.string().min(1).default('wl-default'),
  providerMode: ProviderModeSchema.default('yahoo'),
  finnhubApiKey: z.string().default(''),
  pollIntervalSec: LivePollIntervalSchema.default(15),
  activeIndicators: z.array(IndicatorIdSchema).default(['SMA_20', 'VOLUME']),
  isSidebarCollapsed: z.boolean().default(false),
});

export type UserPreferences = z.infer<typeof UserPreferencesSchema>;

export const DEFAULT_USER_PREFERENCES: UserPreferences =
  UserPreferencesSchema.parse({});
