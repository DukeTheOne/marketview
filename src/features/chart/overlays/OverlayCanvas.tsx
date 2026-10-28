import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import type { PriceAlert } from '../../../core/schemas/alert';
import type {
  ChartAnnotation,
  ChartAnnotationType,
  LogicalAnchor,
} from '../../../core/schemas/annotation';
import type { ChartOverlayHostContext, ScreenPoint } from '../types';
import { PriceAlertLinesLayer } from './PriceAlertLinesLayer';
import { overlayPluginRegistry } from './registry';
// Ensure default plugins are registered
import './plugins/StickerPlugin';
import './plugins/TrendlinePlugin';
import './plugins/TradeMarkerPlugin';
import './plugins/FibonacciPlugin';

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
  alerts?: PriceAlert[];
  referenceTimestamp?: number;
  onDismissAlert?: (id: string) => void;
  onDeleteAlert?: (id: string) => void;
}

/**
 * Pure helper to immutably replace a single anchor at `anchorIndex`
 * with `nextAnchor` logical coordinates ({ timestamp, price }).
 */
export function applyDraggedAnchorUpdate(
  anchors: LogicalAnchor[],
  anchorIndex: number,
  nextAnchor: LogicalAnchor
): LogicalAnchor[] {
  if (anchorIndex < 0 || anchorIndex >= anchors.length) {
    return [...anchors];
  }
  return anchors.map((anchor, idx) =>
    idx === anchorIndex
      ? { timestamp: nextAnchor.timestamp, price: nextAnchor.price }
      : anchor
  );
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
  alerts,
  referenceTimestamp,
  onDismissAlert,
  onDeleteAlert,
}: OverlayCanvasProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [mousePoint, setMousePoint] = useState<ScreenPoint | null>(null);
  const [draftAnchors, setDraftAnchors] = useState<LogicalAnchor[]>([]);
  const [draggingAnchor, setDraggingAnchor] = useState<{
    annotationId: string;
    anchorIndex: number;
  } | null>(null);
  const [draggedAnchorPreview, setDraggedAnchorPreview] = useState<{
    annotationId: string;
    anchorIndex: number;
    anchor: LogicalAnchor;
  } | null>(null);

  const draggedAnchorPreviewRef = useRef(draggedAnchorPreview);
  draggedAnchorPreviewRef.current = draggedAnchorPreview;

  const tickerAnnotations = annotations.filter(
    (a) => a.ticker === hostContext.ticker
  );
  const tickerAnnotationsRef = useRef(tickerAnnotations);
  tickerAnnotationsRef.current = tickerAnnotations;

  const onUpdateAnnotationRef = useRef(onUpdateAnnotation);
  onUpdateAnnotationRef.current = onUpdateAnnotation;

  // Clear draft anchors and dragging state whenever active tool changes or resets
  useEffect(() => {
    setDraftAnchors([]);
    setMousePoint(null);
    setDraggingAnchor(null);
    setDraggedAnchorPreview(null);
    draggedAnchorPreviewRef.current = null;
  }, [activeTool]);

  const activePlugin = activeTool ? overlayPluginRegistry.get(activeTool) : null;
  const selectedAnnotation = selectedAnnotationId
    ? tickerAnnotations.find((a) => a.id === selectedAnnotationId) ?? null
    : null;

  const commitDrag = () => {
    const preview = draggedAnchorPreviewRef.current;
    if (preview) {
      const targetAnnotation = tickerAnnotationsRef.current.find(
        (a) => a.id === preview.annotationId
      );
      if (targetAnnotation) {
        const updatedAnchors = applyDraggedAnchorUpdate(
          targetAnnotation.anchors,
          preview.anchorIndex,
          preview.anchor
        );
        void onUpdateAnnotationRef.current(preview.annotationId, {
          anchors: updatedAnchors,
        });
      }
    }
    draggedAnchorPreviewRef.current = null;
    setDraggedAnchorPreview(null);
    setDraggingAnchor(null);
  };

  // Safe window event binding during dragging to prevent sticky drag leaks outside canvas
  useEffect(() => {
    if (!draggingAnchor || typeof window === 'undefined') {
      return;
    }

    const handleWindowMouseMove = (e: MouseEvent) => {
      const container = rootRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const currentPoint: ScreenPoint = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
      const nextLogical = hostContext.projector.screenToLogical(currentPoint);
      if (!nextLogical) {
        return;
      }
      const preview = {
        annotationId: draggingAnchor.annotationId,
        anchorIndex: draggingAnchor.anchorIndex,
        anchor: nextLogical,
      };
      draggedAnchorPreviewRef.current = preview;
      setDraggedAnchorPreview(preview);
    };

    const handleWindowMouseUp = () => {
      commitDrag();
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [draggingAnchor, hostContext.projector]);

  const handleMouseMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (draggingAnchor) {
      const rect = e.currentTarget.getBoundingClientRect();
      const currentPoint: ScreenPoint = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
      const nextLogical = hostContext.projector.screenToLogical(currentPoint);
      if (!nextLogical) {
        return;
      }
      const preview = {
        annotationId: draggingAnchor.annotationId,
        anchorIndex: draggingAnchor.anchorIndex,
        anchor: nextLogical,
      };
      draggedAnchorPreviewRef.current = preview;
      setDraggedAnchorPreview(preview);
      return;
    }

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

  const handleMouseUp = () => {
    if (draggingAnchor) {
      commitDrag();
    }
  };

  const handleCanvasClick = async (e: ReactMouseEvent<HTMLDivElement>) => {
    if (draggingAnchor) {
      commitDrag();
      return;
    }

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

    if (activeTool === 'fibonacci') {
      return (
        <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-purple-500/40 bg-purple-950/85 px-4 py-1.5 text-xs font-medium text-purple-200 shadow-xl backdrop-blur-md">
          {draftAnchors.length === 0
            ? 'Click chart to place first anchor of Fibonacci retracement · Click Pointer to cancel'
            : 'Click chart to place second anchor and finish Fibonacci retracement'}
        </div>
      );
    }

    return null;
  };

  return (
    <div
      ref={rootRef}
      className={`overlay-canvas-root absolute inset-0 z-15 ${
        activeTool || draggingAnchor
          ? 'pointer-events-auto cursor-crosshair'
          : 'pointer-events-none'
      }`}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onClick={handleCanvasClick}
    >
      {/* Active tool placement indicator banner */}
      {renderStatusBanner()}

      {/* Target price alert horizontal lines */}
      {alerts && alerts.length > 0 && (
        <PriceAlertLinesLayer
          ticker={hostContext.ticker}
          alerts={alerts}
          projector={hostContext.projector}
          referenceTimestamp={referenceTimestamp}
          onDismissAlert={onDismissAlert}
          onDeleteAlert={onDeleteAlert}
        />
      )}

      {/* Render existing annotations via their registered plugins */}
      {tickerAnnotations.map((annotation) => {
        const plugin = overlayPluginRegistry.get(annotation.type);
        if (!plugin) return null;

        const effectiveAnnotation =
          draggedAnchorPreview &&
          draggedAnchorPreview.annotationId === annotation.id
            ? {
                ...annotation,
                anchors: applyDraggedAnchorUpdate(
                  annotation.anchors,
                  draggedAnchorPreview.anchorIndex,
                  draggedAnchorPreview.anchor
                ),
              }
            : annotation;

        return plugin.renderAnnotation({
          annotation: effectiveAnnotation,
          payload: effectiveAnnotation.payload,
          isSelected: effectiveAnnotation.id === selectedAnnotationId,
          projector: hostContext.projector,
          onSelect: () => onSelectAnnotation(effectiveAnnotation.id),
          onUpdate: (updates) => {
            void onUpdateAnnotation(effectiveAnnotation.id, updates);
          },
          onDelete: () => {
            void onDeleteAnnotation(effectiveAnnotation.id);
          },
        });
      })}

      {/* Interactive drag-to-edit anchor handles for selected annotation */}
      {selectedAnnotation &&
        !activeTool &&
        (draggedAnchorPreview &&
        draggedAnchorPreview.annotationId === selectedAnnotation.id
          ? applyDraggedAnchorUpdate(
              selectedAnnotation.anchors,
              draggedAnchorPreview.anchorIndex,
              draggedAnchorPreview.anchor
            )
          : selectedAnnotation.anchors
        ).map((anchor, idx) => {
          const screenPoint = hostContext.projector.logicalToScreen(anchor);
          if (!screenPoint) return null;

          return (
            <button
              key={`anchor-handle-${selectedAnnotation.id}-${idx}`}
              type="button"
              data-testid={`anchor-handle-${selectedAnnotation.id}-${idx}`}
              aria-label={`Drag anchor ${idx + 1} of ${selectedAnnotation.type}`}
              title={`Drag anchor #${idx + 1} ($${anchor.price.toFixed(2)})`}
              style={{
                left: `${screenPoint.x}px`,
                top: `${screenPoint.y}px`,
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
                setDraggingAnchor({
                  annotationId: selectedAnnotation.id,
                  anchorIndex: idx,
                });
              }}
              onClick={(e) => {
                e.stopPropagation();
              }}
              className="pointer-events-auto absolute z-30 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-white bg-sky-500 shadow-md ring-2 ring-sky-500/40 transition-transform hover:scale-125 active:cursor-grabbing"
            />
          );
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
