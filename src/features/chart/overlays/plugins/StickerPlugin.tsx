import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import {
  ChevronDown,
  ChevronUp,
  GripHorizontal,
  StickyNote,
  Trash2,
} from 'lucide-react';
import {
  StickerPayloadSchema,
  type StickerColor,
  type StickerPayload,
} from '../../../../core/schemas/annotation';
import { overlayPluginRegistry } from '../registry';
import type { ChartOverlayPlugin, OverlayAnnotationRenderProps } from '../types';

const COLOR_THEMES: Record<
  StickerColor,
  {
    border: string;
    bg: string;
    pin: string;
    badge: string;
    accent: string;
  }
> = {
  amber: {
    border: 'border-amber-500/50',
    bg: 'bg-amber-950/80',
    pin: 'bg-amber-400 text-slate-950 ring-amber-400/40',
    badge: 'bg-amber-500/20 text-amber-300',
    accent: 'focus:border-amber-400',
  },
  emerald: {
    border: 'border-emerald-500/50',
    bg: 'bg-emerald-950/80',
    pin: 'bg-emerald-400 text-slate-950 ring-emerald-400/40',
    badge: 'bg-emerald-500/20 text-emerald-300',
    accent: 'focus:border-emerald-400',
  },
  rose: {
    border: 'border-rose-500/50',
    bg: 'bg-rose-950/80',
    pin: 'bg-rose-400 text-slate-950 ring-rose-400/40',
    badge: 'bg-rose-500/20 text-rose-300',
    accent: 'focus:border-rose-400',
  },
  sky: {
    border: 'border-sky-500/50',
    bg: 'bg-sky-950/80',
    pin: 'bg-sky-400 text-slate-950 ring-sky-400/40',
    badge: 'bg-sky-500/20 text-sky-300',
    accent: 'focus:border-sky-400',
  },
  purple: {
    border: 'border-purple-500/50',
    bg: 'bg-purple-950/80',
    pin: 'bg-purple-400 text-slate-950 ring-purple-400/40',
    badge: 'bg-purple-500/20 text-purple-300',
    accent: 'focus:border-purple-400',
  },
};

function StickerAnnotationComponent({
  annotation,
  payload,
  isSelected,
  projector,
  onSelect,
  onUpdate,
  onDelete,
}: OverlayAnnotationRenderProps<StickerPayload>) {
  const primaryAnchor = annotation.anchors[0];
  const screenPos = primaryAnchor ? projector.logicalToScreen(primaryAnchor) : null;
  const isDraggingRef = useRef(false);
  const [localText, setLocalText] = useState(payload.markdown);

  useEffect(() => {
    setLocalText(payload.markdown);
  }, [payload.markdown]);

  if (!screenPos || !primaryAnchor) {
    return null;
  }

  const theme = COLOR_THEMES[payload.color] ?? COLOR_THEMES.amber;

  const handleStartDrag = (e: ReactMouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    isDraggingRef.current = true;
    onSelect();

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const chartHost = document.querySelector('.overlay-canvas-root');
      if (!chartHost) return;
      const rect = chartHost.getBoundingClientRect();
      const point = {
        x: moveEvent.clientX - rect.left,
        y: moveEvent.clientY - rect.top,
      };
      const logical = projector.screenToLogical(point);
      if (logical) {
        onUpdate({ anchors: [logical] });
      }
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div
      className="pointer-events-auto absolute"
      style={{
        left: `${screenPos.x}px`,
        top: `${screenPos.y}px`,
        transform: 'translate(-50%, -100%)',
        marginBottom: '8px',
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      {/* Anchor Target Pin Indicator */}
      <div
        onMouseDown={handleStartDrag}
        title="Drag anchor to reposition on candles"
        className={`absolute bottom-[-16px] left-1/2 -translate-x-1/2 flex h-5 w-5 cursor-grab items-center justify-center rounded-full ring-4 shadow-lg active:cursor-grabbing transition-transform hover:scale-110 ${theme.pin}`}
      >
        <div className="h-1.5 w-1.5 rounded-full bg-slate-950" />
      </div>

      {/* Note Card Content */}
      <div
        className={`w-64 rounded-lg border backdrop-blur-md shadow-2xl transition-all ${
          theme.border
        } ${theme.bg} ${isSelected ? 'ring-2 ring-emerald-400' : ''}`}
      >
        {/* Card Header Bar */}
        <div className="flex items-center justify-between border-b border-slate-800/80 px-2.5 py-1.5 text-xs">
          <div className="flex items-center gap-1.5">
            <span
              onMouseDown={handleStartDrag}
              title="Drag to reposition note anchor"
              className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-200"
            >
              <GripHorizontal className="h-3.5 w-3.5" />
            </span>
            <span className="font-mono text-[11px] font-semibold text-slate-200">
              ${primaryAnchor.price.toFixed(2)}
            </span>
          </div>

          <div className="flex items-center gap-1">
            {/* Color Switchers */}
            {(['amber', 'emerald', 'rose', 'sky', 'purple'] as StickerColor[]).map(
              (c) => (
                <button
                  key={c}
                  type="button"
                  title={`Color: ${c}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdate({ payload: { color: c } });
                  }}
                  className={`h-2.5 w-2.5 rounded-full transition ${
                    c === payload.color
                      ? 'ring-2 ring-white scale-110'
                      : 'opacity-60 hover:opacity-100'
                  } ${
                    c === 'amber'
                      ? 'bg-amber-400'
                      : c === 'emerald'
                      ? 'bg-emerald-400'
                      : c === 'rose'
                      ? 'bg-rose-400'
                      : c === 'sky'
                      ? 'bg-sky-400'
                      : 'bg-purple-400'
                  }`}
                />
              )
            )}

            <button
              type="button"
              title={payload.isExpanded ? 'Collapse note' : 'Expand note'}
              onClick={(e) => {
                e.stopPropagation();
                onUpdate({ payload: { isExpanded: !payload.isExpanded } });
              }}
              className="ml-1 rounded p-0.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
            >
              {payload.isExpanded ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </button>

            <button
              type="button"
              title="Delete sticker"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="rounded p-0.5 text-slate-400 hover:bg-rose-500/20 hover:text-rose-400"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* Card Body */}
        {payload.isExpanded ? (
          <div className="p-2">
            <textarea
              value={localText}
              onChange={(e) => {
                setLocalText(e.target.value);
                onUpdate({ payload: { markdown: e.target.value } });
              }}
              placeholder="Write chart thesis or level analysis..."
              rows={3}
              className={`w-full resize-none rounded border border-slate-800 bg-slate-950/80 p-2 font-sans text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none ${theme.accent}`}
            />
          </div>
        ) : (
          <div
            onClick={() => onUpdate({ payload: { isExpanded: true } })}
            className="cursor-pointer truncate px-2.5 py-1 font-sans text-xs text-slate-300 hover:text-white"
          >
            {payload.markdown || 'Note (click to expand)'}
          </div>
        )}
      </div>
    </div>
  );
}

export const stickerPlugin: ChartOverlayPlugin<StickerPayload> = {
  type: 'sticker',
  label: 'Sticker Note',
  requiredAnchors: 1,
  payloadSchema: StickerPayloadSchema,

  createDefaultPayload(): StickerPayload {
    return {
      markdown: 'Resistance retest / Key level',
      color: 'amber',
      isExpanded: true,
    };
  },

  renderAnnotation(props) {
    return <StickerAnnotationComponent key={props.annotation.id} {...props} />;
  },

  renderDraftPreview({ currentMousePoint }) {
    if (!currentMousePoint) return null;
    return (
      <div
        className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-400 bg-amber-500/20 p-2 text-amber-300 shadow-md backdrop-blur-sm"
        style={{ left: `${currentMousePoint.x}px`, top: `${currentMousePoint.y}px` }}
      >
        <StickyNote className="h-4 w-4 animate-bounce" />
      </div>
    );
  },
};

// Register plugin once into the global registry
overlayPluginRegistry.register(stickerPlugin);
