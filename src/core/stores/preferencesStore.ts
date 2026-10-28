import { createStore, type StoreApi } from 'zustand/vanilla';
import type { StorageRepository } from '../repositories/StorageRepository';
import {
  DEFAULT_USER_PREFERENCES,
  UserPreferencesSchema,
  type UserPreferences,
} from '../schemas/preferences';

export interface PreferencesState {
  preferences: UserPreferences;
  isHydrated: boolean;
  hydrate: () => Promise<UserPreferences>;
  updatePreferences: (
    patch: Partial<UserPreferences>
  ) => Promise<UserPreferences>;
  resetPreferences: () => Promise<UserPreferences>;
}

export type PreferencesStore = StoreApi<PreferencesState>;

/**
 * Headless Zustand store factory for user session and workspace preferences.
 * Persists changes through the injected StorageRepository port.
 */
export function createPreferencesStore(
  repository?: StorageRepository,
  initialOverrides?: Partial<UserPreferences>
): PreferencesStore {
  const initialPreferences = UserPreferencesSchema.parse({
    ...DEFAULT_USER_PREFERENCES,
    ...initialOverrides,
  });

  return createStore<PreferencesState>((set, get) => ({
    preferences: initialPreferences,
    isHydrated: false,

    hydrate: async () => {
      const stored = await repository?.getPreferences?.();
      const next = stored
        ? UserPreferencesSchema.parse({
            ...get().preferences,
            ...stored,
          })
        : UserPreferencesSchema.parse(get().preferences);

      set({
        preferences: next,
        isHydrated: true,
      });

      return next;
    },

    updatePreferences: async (patch: Partial<UserPreferences>) => {
      const next = UserPreferencesSchema.parse({
        ...get().preferences,
        ...patch,
      });

      set({ preferences: next });
      await repository?.savePreferences?.(next);
      return next;
    },

    resetPreferences: async () => {
      const next = UserPreferencesSchema.parse(DEFAULT_USER_PREFERENCES);
      set({ preferences: next });
      await repository?.savePreferences?.(next);
      return next;
    },
  }));
}
