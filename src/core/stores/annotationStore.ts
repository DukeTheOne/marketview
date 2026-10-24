import { createStore, type StoreApi } from 'zustand/vanilla';
import type { StorageRepository } from '../repositories/StorageRepository';
import {
  ChartAnnotationSchema,
  type ChartAnnotation,
  type ChartAnnotationType,
  type LogicalAnchor,
} from '../schemas/annotation';
import { TickerSymbolSchema } from '../schemas/market';

export interface AnnotationState {
  annotations: ChartAnnotation[];
  activeTool: ChartAnnotationType | null;
  selectedAnnotationId: string | null;
  isHydrated: boolean;

  hydrate: (ticker?: string) => Promise<ChartAnnotation[]>;
  setActiveTool: (tool: ChartAnnotationType | null) => void;
  selectAnnotation: (id: string | null) => void;
  addAnnotation: (input: {
    ticker: string;
    type: ChartAnnotationType;
    anchors: LogicalAnchor[];
    payload: Record<string, unknown>;
  }) => Promise<ChartAnnotation>;
  updateAnnotation: (
    id: string,
    updates: {
      anchors?: LogicalAnchor[];
      payload?: Record<string, unknown>;
    }
  ) => Promise<void>;
  deleteAnnotation: (id: string) => Promise<void>;
  getAnnotationsForTicker: (ticker: string) => ChartAnnotation[];
}

export type AnnotationStore = StoreApi<AnnotationState>;

/**
 * Headless Zustand store factory for chart annotations persisted through StorageRepository.
 */
export function createAnnotationStore(
  repository: StorageRepository,
  nowSecProvider: () => number = () => Math.floor(Date.now() / 1000)
): AnnotationStore {
  return createStore<AnnotationState>((set, get) => ({
    annotations: [],
    activeTool: null,
    selectedAnnotationId: null,
    isHydrated: false,

    hydrate: async (ticker?: string) => {
      const all = await repository.getAnnotations(ticker);
      set({ annotations: all, isHydrated: true });
      return all;
    },

    setActiveTool: (tool: ChartAnnotationType | null) => {
      set({ activeTool: tool });
      if (tool !== null) {
        set({ selectedAnnotationId: null });
      }
    },

    selectAnnotation: (id: string | null) => {
      set({ selectedAnnotationId: id });
    },

    addAnnotation: async (input) => {
      const nowSec = nowSecProvider();
      const ticker = TickerSymbolSchema.parse(input.ticker);
      const id = `ann-${nowSec}-${Math.random().toString(36).slice(2, 7)}`;

      const newAnnotation = ChartAnnotationSchema.parse({
        id,
        ticker,
        type: input.type,
        anchors: input.anchors,
        payload: input.payload,
        createdAt: nowSec,
        updatedAt: nowSec,
      });

      const next = [...get().annotations, newAnnotation];
      await repository.saveAnnotations(next);
      set({
        annotations: next,
        selectedAnnotationId: newAnnotation.id,
      });
      return newAnnotation;
    },

    updateAnnotation: async (id, updates) => {
      const nowSec = nowSecProvider();
      const current = get().annotations;
      const target = current.find((a) => a.id === id);
      if (!target) {
        return;
      }

      const next = current.map((a) => {
        if (a.id !== id) {
          return a;
        }
        return ChartAnnotationSchema.parse({
          ...a,
          anchors: updates.anchors ?? a.anchors,
          payload: updates.payload
            ? { ...a.payload, ...updates.payload }
            : a.payload,
          updatedAt: nowSec,
        });
      });

      await repository.saveAnnotations(next);
      set({ annotations: next });
    },

    deleteAnnotation: async (id) => {
      const next = get().annotations.filter((a) => a.id !== id);
      await repository.saveAnnotations(next);
      set((state) => ({
        annotations: next,
        selectedAnnotationId:
          state.selectedAnnotationId === id ? null : state.selectedAnnotationId,
      }));
    },

    getAnnotationsForTicker: (rawTicker: string) => {
      const ticker = TickerSymbolSchema.parse(rawTicker);
      return get().annotations.filter((a) => a.ticker === ticker);
    },
  }));
}
