import { createStore, type StoreApi } from 'zustand/vanilla';
import type { StorageRepository } from '../repositories/StorageRepository';
import {
  PriceAlertSchema,
  shouldTriggerAlert,
  type AlertCondition,
  type PriceAlert,
} from '../schemas/alert';
import { TickerSymbolSchema, type TickerQuote } from '../schemas/market';

export interface AlertStoreState {
  alerts: PriceAlert[];
  lastTriggeredAlertIds: string[];
  isHydrated: boolean;

  hydrate: () => Promise<PriceAlert[]>;
  addAlert: (input: {
    ticker: string;
    targetPrice: number;
    condition: AlertCondition;
    note?: string;
  }) => PriceAlert;
  removeAlert: (id: string) => void;
  dismissAlert: (id: string) => void;
  rearmAlert: (id: string) => void;
  clearTriggeredBanner: () => void;
  evaluateQuote: (quote: TickerQuote) => PriceAlert[];
  getAlertsForTicker: (ticker: string) => PriceAlert[];
}

export type AlertStore = StoreApi<AlertStoreState>;

function isStorageRepository(
  candidate: PriceAlert[] | StorageRepository | undefined
): candidate is StorageRepository {
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    !Array.isArray(candidate) &&
    typeof candidate.getAlerts === 'function' &&
    typeof candidate.saveAlerts === 'function'
  );
}

/**
 * Headless Zustand store factory for price alert lifecycle, quote evaluation,
 * and optional asynchronous persistence via StorageRepository.
 */
export function createAlertStore(
  initialAlertsOrRepo?: PriceAlert[] | StorageRepository,
  maybeRepo?: StorageRepository
): AlertStore {
  const initialAlerts: PriceAlert[] = Array.isArray(initialAlertsOrRepo)
    ? initialAlertsOrRepo
    : [];
  const repository: StorageRepository | undefined = isStorageRepository(
    initialAlertsOrRepo
  )
    ? initialAlertsOrRepo
    : maybeRepo;

  const validatedInitial = initialAlerts.map((alert) =>
    PriceAlertSchema.parse(alert)
  );

  return createStore<AlertStoreState>((set, get) => ({
    alerts: validatedInitial,
    lastTriggeredAlertIds: [],
    isHydrated: false,

    hydrate: async () => {
      if (!repository) {
        set({ isHydrated: true });
        return get().alerts;
      }

      const persistedRaw = await repository.getAlerts();
      const persisted = persistedRaw.map((alert) =>
        PriceAlertSchema.parse(alert)
      );
      set({
        alerts: persisted,
        isHydrated: true,
      });
      return persisted;
    },

    addAlert: (input) => {
      const nowSec = Math.max(1, Math.floor(Date.now() / 1000));
      const ticker = TickerSymbolSchema.parse(input.ticker);
      const id = `alert-${nowSec}-${Math.random().toString(36).slice(2, 7)}`;

      const newAlert = PriceAlertSchema.parse({
        id,
        ticker,
        targetPrice: input.targetPrice,
        condition: input.condition,
        status: 'ACTIVE',
        note: input.note ?? '',
        createdAt: nowSec,
      });

      set((state) => ({
        alerts: [newAlert, ...state.alerts],
      }));

      if (repository) {
        void repository.saveAlerts(get().alerts);
      }

      return newAlert;
    },

    removeAlert: (id) => {
      set((state) => ({
        alerts: state.alerts.filter((a) => a.id !== id),
        lastTriggeredAlertIds: state.lastTriggeredAlertIds.filter(
          (triggeredId) => triggeredId !== id
        ),
      }));

      if (repository) {
        void repository.saveAlerts(get().alerts);
      }
    },

    dismissAlert: (id) => {
      set((state) => ({
        alerts: state.alerts.map((a) =>
          a.id === id
            ? PriceAlertSchema.parse({
                ...a,
                status: 'DISMISSED',
              })
            : a
        ),
        lastTriggeredAlertIds: state.lastTriggeredAlertIds.filter(
          (triggeredId) => triggeredId !== id
        ),
      }));

      if (repository) {
        void repository.saveAlerts(get().alerts);
      }
    },

    rearmAlert: (id) => {
      set((state) => ({
        alerts: state.alerts.map((a) =>
          a.id === id
            ? PriceAlertSchema.parse({
                ...a,
                status: 'ACTIVE',
                triggeredAt: undefined,
              })
            : a
        ),
        lastTriggeredAlertIds: state.lastTriggeredAlertIds.filter(
          (triggeredId) => triggeredId !== id
        ),
      }));

      if (repository) {
        void repository.saveAlerts(get().alerts);
      }
    },

    clearTriggeredBanner: () => {
      set({ lastTriggeredAlertIds: [] });
    },

    evaluateQuote: (quote) => {
      const ticker = TickerSymbolSchema.parse(quote.ticker);
      const newlyTriggered: PriceAlert[] = [];

      const nextAlerts = get().alerts.map((alert) => {
        if (alert.ticker !== ticker || !shouldTriggerAlert(alert, quote.price)) {
          return alert;
        }
        const triggered = PriceAlertSchema.parse({
          ...alert,
          status: 'TRIGGERED',
          triggeredAt: quote.timestamp,
        });
        newlyTriggered.push(triggered);
        return triggered;
      });

      if (newlyTriggered.length > 0) {
        const newIds = newlyTriggered.map((a) => a.id);
        set((state) => ({
          alerts: nextAlerts,
          lastTriggeredAlertIds: [...state.lastTriggeredAlertIds, ...newIds],
        }));

        if (repository) {
          void repository.saveAlerts(get().alerts);
        }
      }

      return newlyTriggered;
    },

    getAlertsForTicker: (rawTicker) => {
      const ticker = TickerSymbolSchema.parse(rawTicker);
      return get().alerts.filter((a) => a.ticker === ticker);
    },
  }));
}
