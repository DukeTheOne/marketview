import { ArrowDownCircle, ArrowUpCircle, Tag, Trash2 } from 'lucide-react';
import {
  TradeMarkerPayloadSchema,
  type LogicalAnchor,
  type TradeMarkerPayload,
} from '../../../../core/schemas/annotation';
import { overlayPluginRegistry } from '../registry';
import type { ChartOverlayPlugin, OverlayAnnotationRenderProps, OverlayDraftRenderProps } from '../types';

function TradeMarkerComponent({
  annotation,
  payload,
  isSelected,
  projector,
  onSelect,
  onDelete,
}: OverlayAnnotationRenderProps<TradeMarkerPayload>) {
  const anchor = annotation.anchors[0];
  if (!anchor) return null;

  const screenPos = projector.logicalToScreen(anchor);
  if (!screenPos) return null;

  const isBuy = payload.side === 'BUY' || payload.side === 'COVER';

  return (
    <div
      className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-transform hover:scale-110"
      style={{ left: `${screenPos.x}px`, top: `${screenPos.y}px` }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      {/* Anchor Dot */}
      <div
        className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-2 w-2 rounded-full ring-2 ring-white ${
          isBuy ? 'bg-emerald-400' : 'bg-rose-400'
        }`}
      />

      {/* Execution Flag Badge */}
      <div
        className={`relative flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold shadow-2xl backdrop-blur-md border ${
          isBuy
            ? 'border-emerald-500/60 bg-emerald-950/90 text-emerald-300'
            : 'border-rose-500/60 bg-rose-950/90 text-rose-300'
        } ${isSelected ? 'ring-2 ring-white' : ''}`}
        style={{
          transform: isBuy ? 'translateY(18px)' : 'translateY(-36px)',
        }}
      >
        {isBuy ? (
          <ArrowUpCircle className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
        ) : (
          <ArrowDownCircle className="h-3.5 w-3.5 shrink-0 text-rose-400" />
        )}
        <span className="font-mono text-[11px] font-bold">
          {payload.side} {payload.quantity} @ ${payload.price.toFixed(2)}
        </span>
        {payload.setupTag && (
          <span className="hidden items-center gap-0.5 rounded bg-slate-900/60 px-1 py-0.2 font-mono text-[9px] text-slate-300 sm:inline-flex">
            <Tag className="h-2.5 w-2.5 text-slate-400" />
            {payload.setupTag}
          </span>
        )}
        {isSelected && (
          <button
            type="button"
            title="Delete trade marker"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="ml-1 rounded p-0.5 text-slate-400 hover:text-rose-400"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

export const tradeMarkerPlugin: ChartOverlayPlugin<TradeMarkerPayload> = {
  type: 'trade_marker',
  label: 'Trade Marker',
  requiredAnchors: 1,
  payloadSchema: TradeMarkerPayloadSchema,

  createDefaultPayload(anchors: LogicalAnchor[]): TradeMarkerPayload {
    const anchorPrice = anchors[0]?.price ?? 100;
    return {
      side: 'BUY',
      price: anchorPrice,
      quantity: 100,
      setupTag: 'Breakout',
      notes: 'Chart execution',
    };
  },

  renderAnnotation(props) {
    return <TradeMarkerComponent key={props.annotation.id} {...props} />;
  },

  renderDraftPreview({ currentMousePoint }: OverlayDraftRenderProps) {
    if (!currentMousePoint) return null;
    return (
      <div
        className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-400 bg-emerald-500/20 p-2 text-emerald-300 shadow-md backdrop-blur-sm"
        style={{ left: `${currentMousePoint.x}px`, top: `${currentMousePoint.y}px` }}
      >
        <ArrowUpCircle className="h-4 w-4 animate-bounce text-emerald-400" />
      </div>
    );
  },
};

overlayPluginRegistry.register(tradeMarkerPlugin);
