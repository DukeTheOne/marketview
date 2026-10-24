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

/**
 * Open-Closed plugin contract for chart customizations (stickers, trendlines, markers).
 * Any new tool implements this interface and registers in registry.ts without modifying ChartContainer.
 */
export interface ChartOverlayPlugin<TPayload> {
  readonly type: ChartAnnotationType;
  readonly label: string;
  readonly requiredAnchors: number;
  readonly payloadSchema: ZodType<TPayload, any, any>;
  createDefaultPayload(anchors: LogicalAnchor[]): TPayload;
  renderAnnotation(props: OverlayAnnotationRenderProps<TPayload>): ReactNode;
  renderDraftPreview?(props: OverlayDraftRenderProps): ReactNode;
}
