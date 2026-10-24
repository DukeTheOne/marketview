import { MousePointer, BookmarkCheck, StickyNote, TrendingUp } from 'lucide-react';
import type { ChartAnnotationType } from '../../../core/schemas/annotation';

export interface ChartToolbarProps {
  activeTool: ChartAnnotationType | null;
  annotationCount: number;
  onSelectTool: (tool: ChartAnnotationType | null) => void;
}

export function ChartToolbar({
  activeTool,
  annotationCount,
  onSelectTool,
}: ChartToolbarProps) {
  return (
    <div className="pointer-events-auto absolute top-4 right-4 z-20 flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/90 p-1 backdrop-blur-md shadow-xl">
      <button
        type="button"
        title="Pointer (Select / Drag / Pan Chart)"
        onClick={() => onSelectTool(null)}
        className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition ${
          activeTool === null
            ? 'bg-slate-800 text-emerald-400 shadow-sm ring-1 ring-emerald-500/30'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <MousePointer className="h-3.5 w-3.5" />
        <span>Pointer</span>
      </button>

      <button
        type="button"
        title="Sticker Note (Click chart candle to pin note)"
        onClick={() => onSelectTool(activeTool === 'sticker' ? null : 'sticker')}
        className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition ${
          activeTool === 'sticker'
            ? 'bg-amber-500 text-slate-950 shadow-sm font-semibold'
            : 'text-slate-400 hover:text-amber-300'
        }`}
      >
        <StickyNote className="h-3.5 w-3.5" />
        <span>Sticker</span>
      </button>

      <button
        type="button"
        title="Trendline (Click twice on candles to draw interactive line)"
        onClick={() => onSelectTool(activeTool === 'trendline' ? null : 'trendline')}
        className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition ${
          activeTool === 'trendline'
            ? 'bg-sky-500 text-slate-950 shadow-sm font-semibold'
            : 'text-slate-400 hover:text-sky-300'
        }`}
      >
        <TrendingUp className="h-3.5 w-3.5" />
        <span>Trendline</span>
      </button>

      <button
        type="button"
        title="Trade Marker (Click candle to place Buy/Sell execution marker)"
        onClick={() => onSelectTool(activeTool === 'trade_marker' ? null : 'trade_marker')}
        className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition ${
          activeTool === 'trade_marker'
            ? 'bg-emerald-500 text-slate-950 shadow-sm font-semibold'
            : 'text-slate-400 hover:text-emerald-300'
        }`}
      >
        <BookmarkCheck className="h-3.5 w-3.5" />
        <span>Trade Marker</span>
      </button>

      {annotationCount > 0 && (
        <div className="ml-1 flex items-center border-l border-slate-800 pl-2 pr-1">
          <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
            {annotationCount} {annotationCount === 1 ? 'item' : 'items'}
          </span>
        </div>
      )}
    </div>
  );
}
