import { useRef, type MouseEvent as ReactMouseEvent } from 'react';
import {
  ArrowRight,
  DollarSign,
  Layers,
  Percent,
  Trash2,
} from 'lucide-react';
import {
  FIBONACCI_DEFAULT_LEVELS,
  FibonacciPayloadSchema,
  type FibonacciPayload,
  type LogicalAnchor,
} from '../../../../core/schemas/annotation';
import { overlayPluginRegistry } from '../registry';
import type {
  ChartOverlayPlugin,
  OverlayAnnotationRenderProps,
  OverlayDraftRenderProps,
} from '../types';

const COLOR_PRESETS = [
  { label: 'Purple', value: '#a855f7' },
  { label: 'Sky', value: '#38bdf8' },
  { label: 'Emerald', value: '#10b981' },
  { label: 'Amber', value: '#f59e0b' },
  { label: 'Rose', value: '#f43f5e' },
];

export interface FibonacciComputedLevel {
  ratio: number;
  label: string;
  price: number;
}

/**
 * Pure helper to compute Fibonacci retracement price levels from two anchor prices.
 */
export function calculateFibonacciLevels(
  startPrice: number,
  endPrice: number,
  ratios: readonly number[] = FIBONACCI_DEFAULT_LEVELS,
): FibonacciComputedLevel[] {
  const delta = endPrice - startPrice;
  return ratios.map((ratio) => ({
    ratio,
    label: `${(ratio * 100).toFixed(1)}%`,
    price: startPrice + delta * ratio,
  }));
}

function FibonacciAnnotationComponent({
  annotation,
  payload,
  isSelected,
  projector,
  onSelect,
  onUpdate,
  onDelete,
}: OverlayAnnotationRenderProps<FibonacciPayload>) {
  const isDraggingHandleRef = useRef<number | null>(null);
  const isDraggingBodyRef = useRef<boolean>(false);
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

  const minX = Math.min(p1.x, p2.x);
  const maxX = payload.extendRight
    ? Math.max(p1.x, p2.x, 2400)
    : Math.max(p1.x, p2.x);
  const midX = (p1.x + p2.x) / 2;
  const topY = Math.min(p1.y, p2.y);

  const computedLevels = calculateFibonacciLevels(
    anchor1.price,
    anchor2.price,
    payload.levels,
  );

  const projectedLevels = computedLevels.map((lvl) => {
    const screenPt = projector.logicalToScreen({
      timestamp: anchor1.timestamp,
      price: lvl.price,
    });
    const y = screenPt ? screenPt.y : p1.y + (p2.y - p1.y) * lvl.ratio;
    return {
      ...lvl,
      y,
    };
  });

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

  const handleStartDragBody = (e: ReactMouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    isDraggingBodyRef.current = true;
    dragStartPointRef.current = { x: e.clientX, y: e.clientY };
    onSelect();

    const initialP1 = { ...p1 };
    const initialP2 = { ...p2 };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingBodyRef.current || !dragStartPointRef.current) return;
      const dx = moveEvent.clientX - dragStartPointRef.current.x;
      const dy = moveEvent.clientY - dragStartPointRef.current.y;

      const newL1 = projector.screenToLogical({
        x: initialP1.x + dx,
        y: initialP1.y + dy,
      });
      const newL2 = projector.screenToLogical({
        x: initialP2.x + dx,
        y: initialP2.y + dy,
      });

      if (newL1 && newL2) {
        onUpdate({ anchors: [newL1, newL2] });
      }
    };

    const handleMouseUp = () => {
      isDraggingBodyRef.current = false;
      dragStartPointRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div className="pointer-events-none absolute inset-0">
      <svg className="absolute inset-0 h-full w-full overflow-visible">
        {/* Alternating Translucent Zone Fills */}
        {payload.fillBackground &&
          projectedLevels.slice(0, -1).map((lvl, idx) => {
            const nextLvl = projectedLevels[idx + 1];
            if (!nextLvl) return null;
            const bandY = Math.min(lvl.y, nextLvl.y);
            const bandHeight = Math.max(Math.abs(nextLvl.y - lvl.y), 1);
            const bandWidth = Math.max(maxX - minX, 2);
            const fillOpacity = idx % 2 === 0 ? 0.12 : 0.05;

            return (
              <rect
                key={`band-${lvl.ratio}-${nextLvl.ratio}`}
                x={minX}
                y={bandY}
                width={bandWidth}
                height={bandHeight}
                fill={payload.color}
                fillOpacity={fillOpacity}
                className="pointer-events-auto cursor-grab active:cursor-grabbing"
                onMouseDown={handleStartDragBody}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect();
                }}
              />
            );
          })}

        {/* Diagonal Dashed Anchor Connector Line */}
        <line
          x1={p1.x}
          y1={p1.y}
          x2={p2.x}
          y2={p2.y}
          stroke={payload.color}
          strokeWidth={1.5}
          strokeDasharray="4 4"
          strokeOpacity={0.75}
        />

        {/* Wide Invisible Hitbox along Diagonal Connector */}
        <line
          x1={p1.x}
          y1={p1.y}
          x2={p2.x}
          y2={p2.y}
          stroke="transparent"
          strokeWidth={16}
          className="pointer-events-auto cursor-grab active:cursor-grabbing"
          onMouseDown={handleStartDragBody}
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
        />

        {/* Horizontal Fibonacci Level Lines */}
        {projectedLevels.map((lvl) => {
          const isBoundary = lvl.ratio === 0 || lvl.ratio === 1;
          const isGolden = Math.abs(lvl.ratio - 0.618) < 0.001 || Math.abs(lvl.ratio - 0.5) < 0.001;

          return (
            <g key={`level-${lvl.ratio}`}>
              <line
                x1={minX}
                y1={lvl.y}
                x2={maxX}
                y2={lvl.y}
                stroke="transparent"
                strokeWidth={10}
                className="pointer-events-auto cursor-grab active:cursor-grabbing"
                onMouseDown={handleStartDragBody}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect();
                }}
              />
              <line
                x1={minX}
                y1={lvl.y}
                x2={maxX}
                y2={lvl.y}
                stroke={payload.color}
                strokeWidth={isBoundary ? 2 : isGolden ? 1.5 : 1}
                strokeOpacity={isBoundary ? 0.95 : 0.8}
                strokeDasharray={isBoundary ? undefined : '2 2'}
              />
              {isSelected && (
                <line
                  x1={minX}
                  y1={lvl.y}
                  x2={maxX}
                  y2={lvl.y}
                  stroke={payload.color}
                  strokeWidth={4}
                  strokeOpacity={0.2}
                />
              )}
            </g>
          );
        })}
      </svg>

      {/* Level Labels */}
      {projectedLevels.map((lvl) => (
        <div
          key={`label-${lvl.ratio}`}
          style={{
            left: `${minX + 6}px`,
            top: `${lvl.y - 16}px`,
            color: payload.color,
          }}
          className="pointer-events-none absolute select-none rounded bg-slate-950/80 px-1.5 py-0.5 font-mono text-[10px] leading-none shadow-sm backdrop-blur-xs"
        >
          {payload.showPrices
            ? `${lvl.label} ($${lvl.price.toFixed(2)})`
            : lvl.label}
        </div>
      ))}

      {/* Anchor 1 Control Point Handle */}
      <div
        style={{ left: `${p1.x}px`, top: `${p1.y}px` }}
        onMouseDown={(e) => handleStartDragHandle(0, e)}
        title="Drag start anchor (0.0%)"
        className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 flex h-4 w-4 cursor-grab items-center justify-center rounded-full border-2 border-white shadow-md active:cursor-grabbing hover:scale-125 transition-transform"
      >
        <div
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: payload.color }}
        />
      </div>

      {/* Anchor 2 Control Point Handle */}
      <div
        style={{ left: `${p2.x}px`, top: `${p2.y}px` }}
        onMouseDown={(e) => handleStartDragHandle(1, e)}
        title="Drag end anchor (100.0%)"
        className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 flex h-4 w-4 cursor-grab items-center justify-center rounded-full border-2 border-white shadow-md active:cursor-grabbing hover:scale-125 transition-transform"
      >
        <div
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: payload.color }}
        />
      </div>

      {/* Floating Formatting Toolbar on Selection */}
      {isSelected && (
        <div
          style={{ left: `${midX}px`, top: `${Math.max(topY - 42, 12)}px` }}
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
                payload.color === c.value
                  ? 'ring-2 ring-white scale-110'
                  : 'opacity-60 hover:opacity-100'
              }`}
              style={{ backgroundColor: c.value }}
            />
          ))}

          <div className="mx-1 h-3.5 w-px bg-slate-800" />

          {/* Toggle Zone Fill */}
          <button
            type="button"
            title="Toggle background zone fill"
            onClick={() =>
              onUpdate({ payload: { fillBackground: !payload.fillBackground } })
            }
            className={`rounded p-1 text-slate-300 hover:bg-slate-800 ${
              payload.fillBackground ? 'text-purple-400 bg-slate-800' : ''
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
          </button>

          {/* Toggle Price Readouts */}
          <button
            type="button"
            title="Toggle level price labels"
            onClick={() =>
              onUpdate({ payload: { showPrices: !payload.showPrices } })
            }
            className={`rounded p-1 text-slate-300 hover:bg-slate-800 ${
              payload.showPrices ? 'text-purple-400 bg-slate-800' : ''
            }`}
          >
            <DollarSign className="h-3.5 w-3.5" />
          </button>

          {/* Extend Right Toggle */}
          <button
            type="button"
            title="Extend Fibonacci levels to the right"
            onClick={() =>
              onUpdate({ payload: { extendRight: !payload.extendRight } })
            }
            className={`rounded p-1 text-slate-300 hover:bg-slate-800 ${
              payload.extendRight ? 'text-purple-400 bg-slate-800' : ''
            }`}
          >
            <ArrowRight className="h-3.5 w-3.5" />
          </button>

          <div className="mx-1 h-3.5 w-px bg-slate-800" />

          {/* Delete Button */}
          <button
            type="button"
            title="Delete Fibonacci retracement"
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

export const fibonacciPlugin: ChartOverlayPlugin<FibonacciPayload> = {
  type: 'fibonacci',
  label: 'Fib Retracement',
  requiredAnchors: 2,
  payloadSchema: FibonacciPayloadSchema,

  createDefaultPayload(): FibonacciPayload {
    return {
      color: '#a855f7',
      levels: [...FIBONACCI_DEFAULT_LEVELS],
      extendRight: false,
      showPrices: true,
      fillBackground: true,
    };
  },

  renderAnnotation(props) {
    return <FibonacciAnnotationComponent key={props.annotation.id} {...props} />;
  },

  renderDraftPreview({
    anchors,
    currentMousePoint,
    projector,
  }: OverlayDraftRenderProps) {
    if (anchors.length === 0 || !currentMousePoint) return null;
    const startAnchor = anchors[0];
    if (!startAnchor) return null;

    const p1 = projector.logicalToScreen(startAnchor);
    if (!p1) return null;

    const endLogical = projector.screenToLogical(currentMousePoint);
    const minX = Math.min(p1.x, currentMousePoint.x);
    const maxX = Math.max(p1.x, currentMousePoint.x);

    const draftLevels = FIBONACCI_DEFAULT_LEVELS.map((ratio) => {
      const y = p1.y + (currentMousePoint.y - p1.y) * ratio;
      const price = endLogical
        ? startAnchor.price + (endLogical.price - startAnchor.price) * ratio
        : null;
      return {
        ratio,
        y,
        label: `${(ratio * 100).toFixed(1)}%`,
        price,
      };
    });

    return (
      <div className="pointer-events-none absolute inset-0">
        <svg className="h-full w-full overflow-visible">
          {draftLevels.slice(0, -1).map((lvl, idx) => {
            const nextLvl = draftLevels[idx + 1];
            if (!nextLvl) return null;
            const bandY = Math.min(lvl.y, nextLvl.y);
            const bandHeight = Math.max(Math.abs(nextLvl.y - lvl.y), 1);
            return (
              <rect
                key={`draft-band-${lvl.ratio}`}
                x={minX}
                y={bandY}
                width={Math.max(maxX - minX, 2)}
                height={bandHeight}
                fill="#a855f7"
                fillOpacity={idx % 2 === 0 ? 0.1 : 0.04}
              />
            );
          })}

          <line
            x1={p1.x}
            y1={p1.y}
            x2={currentMousePoint.x}
            y2={currentMousePoint.y}
            stroke="#a855f7"
            strokeWidth={1.5}
            strokeDasharray="4 4"
          />

          {draftLevels.map((lvl) => (
            <line
              key={`draft-line-${lvl.ratio}`}
              x1={minX}
              y1={lvl.y}
              x2={maxX}
              y2={lvl.y}
              stroke="#a855f7"
              strokeWidth={lvl.ratio === 0 || lvl.ratio === 1 ? 1.5 : 1}
              strokeOpacity={0.75}
              strokeDasharray={lvl.ratio === 0 || lvl.ratio === 1 ? undefined : '2 2'}
            />
          ))}
        </svg>

        {draftLevels.map((lvl) => (
          <div
            key={`draft-label-${lvl.ratio}`}
            style={{ left: `${minX + 6}px`, top: `${lvl.y - 14}px` }}
            className="absolute select-none font-mono text-[9px] text-purple-300"
          >
            {lvl.price !== null
              ? `${lvl.label} ($${lvl.price.toFixed(2)})`
              : lvl.label}
          </div>
        ))}

        <div
          style={{ left: `${p1.x}px`, top: `${p1.y}px` }}
          className="absolute -translate-x-1/2 -translate-y-1/2 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-purple-500 ring-2 ring-white"
        />
        <div
          style={{ left: `${currentMousePoint.x}px`, top: `${currentMousePoint.y}px` }}
          className="absolute -translate-x-1/2 -translate-y-1/2 flex h-3 w-3 items-center justify-center rounded-full border border-purple-400 bg-purple-400/30"
        />
        <div
          style={{
            left: `${currentMousePoint.x + 12}px`,
            top: `${currentMousePoint.y - 12}px`,
          }}
          className="absolute select-none rounded bg-slate-900/90 px-1.5 py-0.5 font-mono text-[10px] text-purple-300 shadow ring-1 ring-slate-800"
        >
          <Percent className="inline mr-1 h-3 w-3" />
          Click to anchor Fib levels
        </div>
      </div>
    );
  },
};

// Register Fibonacci retracement plugin into global registry
overlayPluginRegistry.register(fibonacciPlugin);
