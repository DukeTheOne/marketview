# Vertical-Slice Specification: Milestone 2 — Chart Overlay Plugin Engine & Markdown Sticker Notes

## 1. Slice Scope & Architectural Invariants Check

### In-Scope Deliverables
1. **Headless Core Store (`src/core/stores/annotationStore.ts`)**:
   - Pure vanilla Zustand store managing `ChartAnnotation` entities (`type: 'sticker'`), active creation tool, and selected annotations.
   - Zero React/DOM imports; persisted via `StorageRepository`.
2. **Chart Overlay Plugin Architecture (`src/features/chart/overlays/`)**:
   - `types.ts`: `ChartOverlayPlugin<TPayload>`, `OverlayAnnotationRenderProps<TPayload>`, `OverlayDraftRenderProps`.
   - `registry.ts`: Extensible `OverlayPluginRegistry` with registration and lookup methods.
   - `OverlayCanvas.tsx`: Interactive SVG/HTML viewport layer mounted in `ChartContainer` via `renderOverlayLayer` that converts user mouse clicks/drags to logical `{ timestamp, price }` anchors and delegates rendering to registered plugins.
   - `ChartToolbar.tsx`: Chart customization toolbar to toggle tools (`Pointer`, `Sticker Note`) and clear/manage annotations.
3. **Sticker Note Plugin (`src/features/chart/overlays/plugins/StickerPlugin.tsx`)**:
   - `type: 'sticker'`, `requiredAnchors: 1` (`{ timestamp, price }`).
   - `StickerPayloadSchema`: markdown text, card color palette (`amber`, `emerald`, `rose`, `sky`, `purple`), expanded/collapsed toggle.
   - Interactive draggable pin, Markdown edit mode, color picker, and delete action.
4. **Automated Vitest & Static Verification**:
   - `src/core/__tests__/annotation-store.test.ts`: CRUD lifecycle, storage persistence, and symbol isolation.
   - `architecture-boundaries.test.ts`: Continued enforcement of zero DOM imports in `src/core/`.

### Architectural Invariants Verification
- [x] **Zero DOM/UI Imports in `src/core/`**: `annotationStore.ts` uses `zustand/vanilla` and `StorageRepository` port.
- [x] **Open-Closed Principle for Chart Customizations**: `ChartContainer.tsx` remains untouched; all overlay features plug into the existing `renderOverlayLayer` slot.
- [x] **Logical Coordinate Contract**: Stickers store only `{ timestamp: number, price: number }` (Unix UTC seconds + float price). Screen `(x, y)` pixels are projected on-the-fly via `CoordinateProjector.logicalToScreen`.

---

## 2. Headless Core Contracts (`src/core/`)

### 2.1 Sticker Payload Schema (`src/core/schemas/annotation.ts` extension / export)
```typescript
import { z } from 'zod';

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
```

### 2.2 Headless Annotation Store Factory (`src/core/stores/annotationStore.ts`)
```typescript
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { StorageRepository } from '../repositories/StorageRepository';
import {
  ChartAnnotationSchema,
  type ChartAnnotation,
  type ChartAnnotationType,
  type LogicalAnchor,
} from '../schemas/annotation';

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
```

---

## 3. UI & Chart Plugin Layer (`src/features/` & `src/ui/`)

### 3.1 Overlay Plugin Contract (`src/features/chart/overlays/types.ts`)
```typescript
import type { ReactNode } from 'react';
import type { ZodType } from 'zod';
import type {
  ChartAnnotation,
  ChartAnnotationType,
  LogicalAnchor,
} from '../../../core/schemas/annotation';
import type { CoordinateProjector, ScreenPoint } from '../types';

export interface OverlayAnnotationRenderProps<TPayload> {
  annotation: ChartAnnotation;
  payload: TPayload;
  isSelected: boolean;
  projector: CoordinateProjector;
  onSelect: () => void;
  onUpdate: (updates: {
    anchors?: LogicalAnchor[];
    payload?: Partial<TPayload>;
  }) => void;
  onDelete: () => void;
}

export interface OverlayDraftRenderProps {
  anchors: LogicalAnchor[];
  currentMousePoint: ScreenPoint | null;
  projector: CoordinateProjector;
}

export interface ChartOverlayPlugin<TPayload> {
  readonly type: ChartAnnotationType;
  readonly label: string;
  readonly requiredAnchors: number;
  readonly payloadSchema: ZodType<TPayload>;
  createDefaultPayload(anchors: LogicalAnchor[]): TPayload;
  renderAnnotation(props: OverlayAnnotationRenderProps<TPayload>): ReactNode;
  renderDraftPreview?(props: OverlayDraftRenderProps): ReactNode;
}
```

### 3.2 Overlay Canvas (`src/features/chart/overlays/OverlayCanvas.tsx`)
- Sits over the Lightweight Charts canvas with `pointer-events-none` container and `pointer-events-auto` on interactive pins/stickers.
- When `activeTool !== null`, changes cursor to crosshair, listens for chart surface clicks, converts click coordinates `{ x, y }` via `projector.screenToLogical({ x, y })`, and commits the new annotation.
- Re-projects all logical anchors on every `viewportRevision` (triggered automatically by pan, zoom, or container resize).

### 3.3 Sticker Plugin Component (`src/features/chart/overlays/plugins/StickerPlugin.tsx`)
- Renders a logical anchor pin pinned to `{ timestamp, price }`.
- Expandable Markdown note popup with color selection pills (`amber`, `emerald`, `rose`, `sky`, `purple`), live text editing, draggable reposition handle, and delete icon.

---

## 4. Ordered File Manifest

1. `[MODIFY] src/core/schemas/annotation.ts` — Add `StickerColorSchema` and `StickerPayloadSchema`.
2. `[NEW] src/core/stores/annotationStore.ts` — Headless Zustand store factory managing chart annotations and active overlay tool state.
3. `[MODIFY] src/core/index.ts` — Export annotation store types and factory.
4. `[NEW] src/core/__tests__/annotation-store.test.ts` — Unit tests for annotation store CRUD and `StorageRepository` persistence.
5. `[NEW] src/features/chart/overlays/types.ts` — `ChartOverlayPlugin`, `OverlayAnnotationRenderProps`, and `OverlayDraftRenderProps` interfaces.
6. `[NEW] src/features/chart/overlays/registry.ts` — Singleton registry holding active overlay plugins.
7. `[NEW] src/features/chart/overlays/plugins/StickerPlugin.tsx` — Implementation of `ChartOverlayPlugin<StickerPayload>`.
8. `[NEW] src/features/chart/overlays/ChartToolbar.tsx` — Floating chart toolbar to switch tools (`Pointer`, `Sticker Note`) and view annotation counts.
9. `[NEW] src/features/chart/overlays/OverlayCanvas.tsx` — Viewport overlay host converting screen clicks to logical coordinates and delegating to registered plugins.
10. `[MODIFY] src/App.tsx` — Wire `annotationStore` into `App`, mount `ChartToolbar`, and pass `OverlayCanvas` to `ChartContainer`'s `renderOverlayLayer` slot.

---

## 5. Verification & Test Matrix

| Check ID | Target | Verification Command | Acceptance Criteria |
| :--- | :--- | :--- | :--- |
| **TC-M2-01** | PostToolUse Hook & Types | `npm run typecheck` (`tsc --noEmit`) | Zero TypeScript errors across all new overlay plugins, stores, and components. |
| **TC-M2-02** | Core Isolation | `npx vitest run src/core/__tests__/architecture-boundaries.test.ts` | All files in `src/core/**` (including `annotationStore.ts`) pass zero-DOM/UI forbidden imports check. |
| **TC-M2-03** | Annotation Store CRUD | `npx vitest run src/core/__tests__/annotation-store.test.ts` | Creating, updating payload, updating anchors, deleting, and filtering annotations by ticker symbol persist accurately to `StorageRepository`. |
| **TC-M2-04** | Logical Coordinate Projection | Browser / Vitest check | When panning or zooming the chart, sticker note cards remain glued to their exact candle `{ timestamp, price }` anchor. |
| **TC-M2-05** | Production Build | `npm run build` | Clean Vite production bundle compilation with all plugins integrated. |
