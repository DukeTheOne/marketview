import type { LogicalAnchor } from '../../core/schemas/annotation';

export interface ScreenPoint {
  x: number;
  y: number;
}

/**
 * Projects logical (timestamp, price) coordinates to ephemeral viewport (x, y) pixels
 * and vice versa. Used by the OverlayCanvas and ChartOverlayPlugin implementations.
 */
export interface CoordinateProjector {
  logicalToScreen(anchor: LogicalAnchor): ScreenPoint | null;
  screenToLogical(point: ScreenPoint): LogicalAnchor | null;
}

export interface ChartOverlayHostContext {
  ticker: string;
  projector: CoordinateProjector;
  viewportRevision: number;
  width: number;
  height: number;
}
