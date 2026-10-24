import { useRef, type MouseEvent as ReactMouseEvent } from 'react';
import {
  ArrowRight,
  Minus,
  MoreHorizontal,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import {
  TrendlinePayloadSchema,
  type LogicalAnchor,
  type TrendlinePayload,
} from '../../../../core/schemas/annotation';
import { overlayPluginRegistry } from '../registry';
import type { ChartOverlayPlugin, OverlayAnnotationRenderProps, OverlayDraftRenderProps } from '../types';

const COLOR_PRESETS = [
  { label: 'Sky', value: '#38bdf8' },
  { label: 'Emerald', value: '#10b981' },
  { label: 'Amber', value: '#f59e0b' },
  { label: 'Rose', value: '#f43f5e' },
  { label: 'Purple', value: '#a855f7' },
];

function TrendlineAnnotationComponent({
  annotation,
  payload,
  isSelected,
  projector,
  onSelect,
  onUpdate,
  onDelete,
}: OverlayAnnotationRenderProps<TrendlinePayload>) {
  const isDraggingHandleRef = useRef<number | null>(null);
  const isDraggingLineRef = useRef<boolean>(false);
  const dragStartPointRef = useRef<{ x: number; y: number } | null>(null);

  const anchor1 = annotation.anchors[0];
  const anchor2 = annotation.anchors[1];

  if (!anchor1 || !anchor2) {
    return null;
  }

  const p1 = projector.logicalToScreen(anchor1);
  const p2 = projector.logicalToScreen(anchor2);

  if (!p1 || !p2) {
    return null;
  }

  // Calculate ray extension if enabled
  let lineX2 = p2.x;
  let lineY2 = p2.y;

  if (payload.extendRight && p2.x !== p1.x) {
    const targetX = Math.max(p2.x, 3000);
    const slope = (p2.y - p1.y) / (p2.x - p1.x);
    lineX2 = targetX;
    lineY2 = p1.y + slope * (targetX - p1.x);
  }

  // Midpoint for metric badge
  const midX = (p1.x + p2.x) / 2;
  const midY = (p1.y + p2.y) / 2;

  // Price delta & percentage
  const deltaPrice = anchor2.price - anchor1.price;
  const deltaPct = ((anchor2.price - anchor1.price) / anchor1.price) * 100;
  const isPositive = deltaPrice >= 0;

  const handleStartDragHandle = (index: number, e: ReactMouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    isDraggingHandleRef.current = index;
    onSelect();

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (isDraggingHandleRef.current === null) return;
      const chartHost = document.querySelector('.overlay-canvas-root');
      if (!chartHost) return;
      const rect = chartHost.getBoundingClientRect();
      const point = {
        x: moveEvent.clientX - rect.left,
        y: moveEvent.clientY - rect.top,
      };
      const logical = projector.screenToLogical(point);
      if (!logical) return;

      const nextAnchors: [LogicalAnchor, LogicalAnchor] = [
        isDraggingHandleRef.current === 0 ? logical : anchor1,
        isDraggingHandleRef.current === 1 ? logical : anchor2,
      ];
      onUpdate({ anchors: nextAnchors });
    };

    const handleMouseUp = () => {
      isDraggingHandleRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleStartDragLine = (e: ReactMouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    isDraggingLineRef.current = true;
    dragStartPointRef.current = { x: e.clientX, y: e.clientY };
    onSelect();

    const initialP1 = { ...p1 };
    const initialP2 = { ...p2 };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingLineRef.current || !dragStartPointRef.current) return;
      const dx = moveEvent.clientX - dragStartPointRef.current.x;
      const dy = moveEvent.clientY - dragStartPointRef.current.y;

      const newL1 = projector.screenToLogical({ x: initialP1.x + dx, y: initialP1.y + dy });
      const newL2 = projector.screenToLogical({ x: initialP2.x + dx, y: initialP2.y + dy });

      if (newL1 && newL2) {
        onUpdate({ anchors: [newL1, newL2] });
      }
    };

    const handleMouseUp = () => {
      isDraggingLineRef.current = false;
      dragStartPointRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div className="pointer-events-none absolute inset-0">
      {/* SVG Canvas for Vector Trendline */}
      <svg className="absolute inset-0 h-full w-full overflow-visible">
        {/* Wide Invisible Hitbox for Easy Selection & Dragging */}
        <line
          x1={p1.x}
          y1={p1.y}
          x2={lineX2}
          y2={lineY2}
          stroke="transparent"
          strokeWidth={18}
          className="pointer-events-auto cursor-grab active:cursor-grabbing"
          onMouseDown={handleStartDragLine}
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
        />

        {/* Visible Projected Line */}
        <line
          x1={p1.x}
          y1={p1.y}
          x2={lineX2}
          y2={lineY2}
          stroke={payload.color}
          strokeWidth={payload.lineWidth}
          strokeDasharray={payload.lineStyle === 'dashed' ? '6 4' : undefined}
          strokeLinecap="round"
          className="transition-colors"
        />

        {/* Selected Glowing Outline */}
        {isSelected && (
          <line
            x1={p1.x}
            y1={p1.y}
            x2={lineX2}
            y2={lineY2}
            stroke={payload.color}
            strokeWidth={payload.lineWidth + 4}
            strokeOpacity={0.25}
            strokeLinecap="round"
          />
        )}
      </svg>

      {/* Anchor 1 Control Point Handle */}
      <div
        style={{ left: `${p1.x}px`, top: `${p1.y}px` }}
        onMouseDown={(e) => handleStartDragHandle(0, e)}
        title="Drag start anchor"
        className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 flex h-4 w-4 cursor-grab items-center justify-center rounded-full border-2 border-white shadow-md active:cursor-grabbing hover:scale-125 transition-transform"
        style-custom={{ backgroundColor: payload.color }}
      >
        <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: payload.color }} />
      </div>

      {/* Anchor 2 Control Point Handle */}
      <div
        style={{ left: `${p2.x}px`, top: `${p2.y}px` }}
        onMouseDown={(e) => handleStartDragHandle(1, e)}
        title="Drag end anchor"
        className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 flex h-4 w-4 cursor-grab items-center justify-center rounded-full border-2 border-white shadow-md active:cursor-grabbing hover:scale-125 transition-transform"
      >
        <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: payload.color }} />
      </div>

      {/* Midpoint Metric Readout Pill */}
      {payload.showLabel && (
        <div
          style={{ left: `${midX}px`, top: `${midY}px` }}
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 select-none rounded-md border border-slate-800/80 bg-slate-900/90 px-2 py-0.5 font-mono text-[10px] text-slate-200 shadow-lg backdrop-blur-sm"
        >
          <span className={isPositive ? 'text-emerald-400' : 'text-rose-400'}>
            {isPositive ? '+' : ''}${deltaPrice.toFixed(2)} ({isPositive ? '+' : ''}{deltaPct.toFixed(2)}%)
          </span>
        </div>
      )}

      {/* Floating Formatting Toolbar on Selection */}
      {isSelected && (
        <div
          style={{ left: `${midX}px`, top: `${midY - 40}px` }}
          className="pointer-events-auto absolute -translate-x-1/2 flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900/95 p-1 shadow-2xl backdrop-blur-md z-30"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Color Switchers */}
          {COLOR_PRESETS.map((c) => (
            <button
              key={c.value}
              type="button"
              title={`Color: ${c.label}`}
              onClick={() => onUpdate({ payload: { color: c.value } })}
              className={`h-3 w-3 rounded-full transition ${
                payload.color === c.value ? 'ring-2 ring-white scale-110' : 'opacity-60 hover:opacity-100'
              }`}
              style={{ backgroundColor: c.value }}
            />
          ))}

          <div className="mx-1 h-3.5 w-px bg-slate-800" />

          {/* Line Style Toggle */}
          <button
            type="button"
            title="Toggle dashed / solid line"
            onClick={() =>
              onUpdate({
                payload: {
                  lineStyle: payload.lineStyle === 'solid' ? 'dashed' : 'solid',
                },
              })
            }
            className={`rounded p-1 text-slate-300 hover:bg-slate-800 ${
              payload.lineStyle === 'dashed' ? 'text-sky-400 bg-slate-800' : ''
            }`}
          >
            {payload.lineStyle === 'solid' ? (
              <Minus className="h-3.5 w-3.5" />
            ) : (
              <MoreHorizontal className="h-3.5 w-3.5" />
            )}
          </button>

          {/* Extend Ray Toggle */}
          <button
            type="button"
            title="Extend ray to the right"
            onClick={() => onUpdate({ payload: { extendRight: !payload.extendRight } })}
            className={`rounded p-1 text-slate-300 hover:bg-slate-800 ${
              payload.extendRight ? 'text-sky-400 bg-slate-800' : ''
            }`}
          >
            <ArrowRight className="h-3.5 w-3.5" />
          </button>

          <div className="mx-1 h-3.5 w-px bg-slate-800" />

          {/* Delete Button */}
          <button
            type="button"
            title="Delete trendline"
            onClick={onDelete}
            className="rounded p-1 text-slate-400 hover:bg-rose-500/20 hover:text-rose-400"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

export const trendlinePlugin: ChartOverlayPlugin<TrendlinePayload> = {
  type: 'trendline',
  label: 'Trendline',
  requiredAnchors: 2,
  payloadSchema: TrendlinePayloadSchema,

  createDefaultPayload(): TrendlinePayload {
    return {
      color: '#38bdf8',
      lineWidth: 2,
      lineStyle: 'solid',
      extendRight: false,
      showLabel: true,
    };
  },

  renderAnnotation(props) {
    return <TrendlineAnnotationComponent key={props.annotation.id} {...props} />;
  },

  renderDraftPreview({ anchors, currentMousePoint, projector }: OverlayDraftRenderProps) {
    if (anchors.length === 0 || !currentMousePoint) return null;
    const startAnchor = anchors[0];
    if (!startAnchor) return null;

    const p1 = projector.logicalToScreen(startAnchor);
    if (!p1) return null;

    return (
      <div className="pointer-events-none absolute inset-0">
        <svg className="h-full w-full overflow-visible">
          <line
            x1={p1.x}
            y1={p1.y}
            x2={currentMousePoint.x}
            y2={currentMousePoint.y}
            stroke="#38bdf8"
            strokeWidth={2}
            strokeDasharray="4 4"
          />
        </svg>
        <div
          style={{ left: `${p1.x}px`, top: `${p1.y}px` }}
          className="absolute -translate-x-1/2 -translate-y-1/2 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-sky-400 ring-2 ring-white"
        />
        <div
          style={{ left: `${currentMousePoint.x}px`, top: `${currentMousePoint.y}px` }}
          className="absolute -translate-x-1/2 -translate-y-1/2 flex h-3 w-3 items-center justify-center rounded-full border border-sky-400 bg-sky-400/30"
        />
        <div
          style={{ left: `${currentMousePoint.x + 12}px`, top: `${currentMousePoint.y - 12}px` }}
          className="absolute select-none rounded bg-slate-900/90 px-1.5 py-0.5 font-mono text-[10px] text-sky-300 shadow ring-1 ring-slate-800"
        >
          <TrendingUp className="inline mr-1 h-3 w-3" />
          Click to finish trendline
        </div>
      </div>
    );
  },
};

// Register trendline plugin once into global registry
overlayPluginRegistry.register(trendlinePlugin);
