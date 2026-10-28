import type {
  ChartIndicatorsSummary,
  IndicatorId,
} from '../../core/indicators/technicalIndicators';

export interface IndicatorToolbarProps {
  activeIndicators: IndicatorId[];
  onToggleIndicator: (id: IndicatorId) => void;
  summary: ChartIndicatorsSummary;
}

interface OverlayToggleConfig {
  id: IndicatorId;
  label: string;
  dotClass: string;
  activeClass: string;
  formatValue: (summary: ChartIndicatorsSummary) => string | null;
}

const OVERLAY_TOGGLES: OverlayToggleConfig[] = [
  {
    id: 'SMA_20',
    label: 'SMA 20',
    dotClass: 'bg-sky-400',
    activeClass: 'border-sky-500/50 bg-sky-500/15 text-sky-200',
    formatValue: (s) => (s.sma20 !== null ? s.sma20.toFixed(2) : null),
  },
  {
    id: 'EMA_50',
    label: 'EMA 50',
    dotClass: 'bg-amber-400',
    activeClass: 'border-amber-500/50 bg-amber-500/15 text-amber-200',
    formatValue: (s) => (s.ema50 !== null ? s.ema50.toFixed(2) : null),
  },
  {
    id: 'BB_20',
    label: 'BB 20',
    dotClass: 'bg-indigo-400',
    activeClass: 'border-indigo-500/50 bg-indigo-500/15 text-indigo-200',
    formatValue: (s) =>
      s.bb20 !== null
        ? `${s.bb20.lower.toFixed(2)}–${s.bb20.upper.toFixed(2)}`
        : null,
  },
  {
    id: 'VWAP',
    label: 'VWAP',
    dotClass: 'bg-purple-400',
    activeClass: 'border-purple-500/50 bg-purple-500/15 text-purple-200',
    formatValue: (s) => (s.vwap !== null ? s.vwap.toFixed(2) : null),
  },
  {
    id: 'VOLUME',
    label: 'VOL',
    dotClass: 'bg-emerald-400',
    activeClass: 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200',
    formatValue: () => null,
  },
];

export function IndicatorToolbar({
  activeIndicators,
  onToggleIndicator,
  summary,
}: IndicatorToolbarProps) {
  const rsi = summary.rsi14;
  const isOverbought = rsi !== null && rsi >= 70;
  const isOversold = rsi !== null && rsi <= 30;

  const rsiBadgeClass = isOverbought
    ? 'border-rose-500/50 bg-rose-500/15 text-rose-300'
    : isOversold
      ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
      : 'border-slate-800 bg-slate-900/80 text-slate-300';

  return (
    <div
      data-testid="indicator-toolbar"
      className="pointer-events-auto absolute top-14 left-4 z-10 flex flex-wrap items-center gap-1.5"
    >
      {OVERLAY_TOGGLES.map((item) => {
        const isActive = activeIndicators.includes(item.id);
        const readout = item.formatValue(summary);

        return (
          <button
            key={item.id}
            type="button"
            data-testid={`indicator-toggle-${item.id}`}
            aria-pressed={isActive}
            onClick={() => onToggleIndicator(item.id)}
            className={`flex items-center gap-1.5 rounded border px-2 py-1 font-mono text-[11px] transition-colors backdrop-blur-sm ${
              isActive
                ? item.activeClass
                : 'border-slate-800/80 bg-slate-900/70 text-slate-400 hover:border-slate-700 hover:text-slate-300'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isActive ? item.dotClass : 'bg-slate-600'
              }`}
            />
            <span className="font-semibold">{item.label}</span>
            {isActive && readout !== null && (
              <span className="text-[10px] opacity-90">{readout}</span>
            )}
          </button>
        );
      })}

      {/* Live RSI(14) Readout Badge */}
      <div
        data-testid="indicator-rsi-badge"
        className={`flex items-center gap-1.5 rounded border px-2 py-1 font-mono text-[11px] backdrop-blur-sm ${rsiBadgeClass}`}
      >
        <span className="font-semibold">RSI(14)</span>
        <span>{rsi !== null ? rsi.toFixed(2) : '—'}</span>
        {isOverbought && (
          <span className="rounded bg-rose-500/20 px-1 py-0.2 text-[9px] font-bold uppercase text-rose-300">
            OB
          </span>
        )}
        {isOversold && (
          <span className="rounded bg-emerald-500/20 px-1 py-0.2 text-[9px] font-bold uppercase text-emerald-300">
            OS
          </span>
        )}
      </div>
    </div>
  );
}
