import { useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react';
import type {
  ChartAnnotation,
  ChartAnnotationType,
  LogicalAnchor,
} from '../../../core/schemas/annotation';
import type { ChartOverlayHostContext, ScreenPoint } from '../types';
import { overlayPluginRegistry } from './registry';
// Ensure default plugins are registered
import './plugins/StickerPlugin';
import './plugins/TrendlinePlugin';
import './plugins/TradeMarkerPlugin';

export interface OverlayCanvasProps {
  hostContext: ChartOverlayHostContext;
  annotations: ChartAnnotation[];
  activeTool: ChartAnnotationType | null;
  selectedAnnotationId: string | null;
  onSelectTool: (tool: ChartAnnotationType | null) => void;
  onSelectAnnotation: (id: string | null) => void;
  onAddAnnotation: (input: {
    ticker: string;
    type: ChartAnnotationType;
    anchors: LogicalAnchor[];
    payload: Record<string, unknown>;
  }) => Promise<void>;
  onUpdateAnnotation: (
    id: string,
    updates: {
      anchors?: LogicalAnchor[];
      payload?: Record<string, unknown>;
    }
  ) => Promise<void>;
  onDeleteAnnotation: (id: string) => Promise<void>;
}

export function OverlayCanvas({
  hostContext,
  annotations,
  activeTool,
  selectedAnnotationId,
  onSelectTool,
  onSelectAnnotation,
  onAddAnnotation,
  onUpdateAnnotation,
  onDeleteAnnotation,
}: OverlayCanvasProps) {
  const [mousePoint, setMousePoint] = useState<ScreenPoint | null>(null);
  const [draftAnchors, setDraftAnchors] = useState<LogicalAnchor[]>([]);

  // Clear draft anchors whenever active tool changes or resets
  useEffect(() => {
    setDraftAnchors([]);
    setMousePoint(null);
  }, [activeTool]);

  const activePlugin = activeTool ? overlayPluginRegistry.get(activeTool) : null;
  const tickerAnnotations = annotations.filter(
    (a) => a.ticker === hostContext.ticker
  );

  const handleMouseMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!activeTool) {
      if (mousePoint !== null) setMousePoint(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePoint({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const handleCanvasClick = async (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!activeTool || !activePlugin) {
      onSelectAnnotation(null);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const clickPoint = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };

    const anchor = hostContext.projector.screenToLogical(clickPoint);
    if (!anchor) {
      return;
    }

    const nextAnchors = [...draftAnchors, anchor];

    if (nextAnchors.length < activePlugin.requiredAnchors) {
      // Waiting for additional anchors (e.g., 2nd point of trendline)
      setDraftAnchors(nextAnchors);
      return;
    }

    // Required anchors fulfilled; commit annotation
    const defaultPayload = activePlugin.createDefaultPayload(nextAnchors);
    await onAddAnnotation({
      ticker: hostContext.ticker,
      type: activeTool,
      anchors: nextAnchors,
      payload: defaultPayload,
    });

    setDraftAnchors([]);
    onSelectTool(null);
    setMousePoint(null);
  };

  // Status banner instructions based on active tool and draft anchor count
  const renderStatusBanner = () => {
    if (!activeTool) return null;

    if (activeTool === 'sticker') {
      return (
        <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-amber-500/40 bg-amber-950/85 px-4 py-1.5 text-xs font-medium text-amber-200 shadow-xl backdrop-blur-md">
          Click anywhere on a candle or chart area to anchor sticker note · Click Pointer to cancel
        </div>
      );
    }

    if (activeTool === 'trendline') {
      return (
        <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-sky-500/40 bg-sky-950/85 px-4 py-1.5 text-xs font-medium text-sky-200 shadow-xl backdrop-blur-md">
          {draftAnchors.length === 0
            ? 'Click chart to place first point of trendline · Click Pointer to cancel'
            : 'Click chart to place second point and finish trendline'}
        </div>
      );
    }

    return null;
  };

  return (
    <div
      className={`overlay-canvas-root absolute inset-0 z-15 ${
        activeTool ? 'pointer-events-auto cursor-crosshair' : 'pointer-events-none'
      }`}
      onMouseMove={handleMouseMove}
      onClick={handleCanvasClick}
    >
      {/* Active tool placement indicator banner */}
      {renderStatusBanner()}

      {/* Render existing annotations via their registered plugins */}
      {tickerAnnotations.map((annotation) => {
        const plugin = overlayPluginRegistry.get(annotation.type);
        if (!plugin) return null;

        return plugin.renderAnnotation({
          annotation,
          payload: annotation.payload,
          isSelected: annotation.id === selectedAnnotationId,
          projector: hostContext.projector,
          onSelect: () => onSelectAnnotation(annotation.id),
          onUpdate: (updates) => {
            void onUpdateAnnotation(annotation.id, updates);
          },
          onDelete: () => {
            void onDeleteAnnotation(annotation.id);
          },
        });
      })}

      {/* Draft placement preview (e.g. rubber-band line for trendline) */}
      {activePlugin?.renderDraftPreview?.({
        anchors: draftAnchors,
        currentMousePoint: mousePoint,
        projector: hostContext.projector,
      })}
    </div>
  );
}
