import { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Award,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Tag,
} from 'lucide-react';
import {
  calculateTradeRealizedPnL,
  type JournalSummary,
  type TradeEntry,
} from '../../core/schemas/trade';

export interface JournalAnalyticsCardProps {
  trades: TradeEntry[];
  summary: JournalSummary;
}

export interface EquityCurvePoint {
  index: number;
  label: string;
  cumulativePnL: number;
  tradePnL: number;
  ticker: string;
}

export interface SetupTagBreakdown {
  tag: string;
  count: number;
  wins: number;
  winRate: number;
  netPnL: number;
}

export function JournalAnalyticsCard({
  trades,
  summary,
}: JournalAnalyticsCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const {
    equityPoints,
    expectancy,
    bestTradePnL,
    worstTradePnL,
    tagBreakdown,
    closedCount,
  } = useMemo(() => {
    const closedWithPnL = trades
      .filter((t) => t.status === 'CLOSED')
      .map((t) => ({
        trade: t,
        pnl: calculateTradeRealizedPnL(t),
        sortTime: t.exitTimestamp ?? t.entryTimestamp,
      }))
      .filter(
        (
          item
        ): item is { trade: TradeEntry; pnl: number; sortTime: number } =>
          item.pnl !== null
      )
      .sort((a, b) => a.sortTime - b.sortTime);

    const points: EquityCurvePoint[] = [
      {
        index: 0,
        label: 'Start',
        cumulativePnL: 0,
        tradePnL: 0,
        ticker: '',
      },
    ];

    let runningPnL = 0;
    let bestPnL = 0;
    let worstPnL = 0;

    closedWithPnL.forEach((item, idx) => {
      runningPnL = Math.round((runningPnL + item.pnl) * 100) / 100;
      if (item.pnl > bestPnL) {
        bestPnL = item.pnl;
      }
      if (item.pnl < worstPnL) {
        worstPnL = item.pnl;
      }
      points.push({
        index: idx + 1,
        label: `#${idx + 1} ${item.trade.ticker}`,
        cumulativePnL: runningPnL,
        tradePnL: item.pnl,
        ticker: item.trade.ticker,
      });
    });

    const winRate =
      summary.closedTrades > 0 ? summary.winRatePercent / 100 : 0;
    const rawExpectancy =
      summary.closedTrades > 0
        ? winRate * summary.averageWin - (1 - winRate) * summary.averageLoss
        : 0;
    const computedExpectancy = Math.round(rawExpectancy * 100) / 100;

    const tagMap = new Map<
      string,
      { count: number; wins: number; netPnL: number }
    >();

    for (const { trade, pnl } of closedWithPnL) {
      const tags =
        trade.setupTags.length > 0 ? trade.setupTags : ['Untagged'];
      for (const rawTag of tags) {
        const normalizedTag = rawTag.trim() || 'Untagged';
        const current = tagMap.get(normalizedTag) ?? {
          count: 0,
          wins: 0,
          netPnL: 0,
        };
        current.count += 1;
        if (pnl > 0) {
          current.wins += 1;
        }
        current.netPnL = Math.round((current.netPnL + pnl) * 100) / 100;
        tagMap.set(normalizedTag, current);
      }
    }

    const breakdown: SetupTagBreakdown[] = Array.from(tagMap.entries())
      .map(([tag, stats]) => ({
        tag,
        count: stats.count,
        wins: stats.wins,
        winRate:
          stats.count > 0
            ? Math.round((stats.wins / stats.count) * 100 * 10) / 10
            : 0,
        netPnL: stats.netPnL,
      }))
      .sort((a, b) => b.netPnL - a.netPnL);

    return {
      equityPoints: points,
      expectancy: computedExpectancy,
      bestTradePnL: bestPnL,
      worstTradePnL: worstPnL,
      tagBreakdown: breakdown,
      closedCount: closedWithPnL.length,
    };
  }, [trades, summary]);

  const svgWidth = 320;
  const svgHeight = 110;
  const padX = 14;
  const padY = 16;
  const plotW = svgWidth - padX * 2;
  const plotH = svgHeight - padY * 2;

  const finalPoint = equityPoints[equityPoints.length - 1];
  const finalCumulativePnL = finalPoint ? finalPoint.cumulativePnL : 0;
  const isCurvePositive = finalCumulativePnL >= 0;

  const allValues = equityPoints.map((p) => p.cumulativePnL);
  const minVal = Math.min(0, ...allValues);
  const maxVal = Math.max(0, ...allValues);
  const valSpan = maxVal - minVal;

  const toX = (idx: number): number => {
    const totalSteps = Math.max(1, equityPoints.length - 1);
    return padX + (idx / totalSteps) * plotW;
  };

  const toY = (val: number): number => {
    if (valSpan === 0) {
      return svgHeight / 2;
    }
    return padY + plotH - ((val - minVal) / valSpan) * plotH;
  };

  const zeroY = toY(0);

  const polylinePoints = equityPoints
    .map(
      (pt, idx) =>
        `${toX(idx).toFixed(1)},${toY(pt.cumulativePnL).toFixed(1)}`
    )
    .join(' ');

  const lastX = toX(equityPoints.length - 1);
  const firstX = toX(0);
  const areaPath =
    equityPoints.length > 1
      ? `M ${firstX.toFixed(1)} ${zeroY.toFixed(1)} ` +
        equityPoints
          .map(
            (pt, idx) =>
              `L ${toX(idx).toFixed(1)} ${toY(pt.cumulativePnL).toFixed(1)}`
          )
          .join(' ') +
        ` L ${lastX.toFixed(1)} ${zeroY.toFixed(1)} Z`
      : '';

  const hoveredPoint =
    hoveredIndex !== null ? equityPoints[hoveredIndex] : undefined;

  const formatSignedCurrency = (amount: number): string => {
    const sign = amount > 0 ? '+' : amount < 0 ? '-' : '';
    return `${sign}$${Math.abs(amount).toFixed(2)}`;
  };

  return (
    <div className="border-b border-slate-800 bg-slate-950/75 px-4 py-2.5">
      {/* Header / Collapsible Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
            Edge Analytics &amp; Setup Attribution
          </span>
          <span className="rounded bg-slate-800/90 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
            {closedCount} closed {closedCount === 1 ? 'trade' : 'trades'}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium text-slate-400 transition hover:bg-slate-800 hover:text-white"
        >
          <span>{isExpanded ? 'Hide Analytics' : 'Show Analytics'}</span>
          {isExpanded ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {isExpanded && (
        <div className="mt-2.5 grid grid-cols-1 gap-3 lg:grid-cols-12">
          {/* Left Column: Mini SVG Cumulative P&L Equity Curve */}
          <div className="flex flex-col justify-between rounded-lg border border-slate-800/90 bg-slate-900/70 p-3 lg:col-span-5">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-300">
                <Activity className="h-3.5 w-3.5 text-emerald-400" />
                Cumulative Realized Equity Curve
              </span>
              {hoveredPoint ? (
                <span className="font-mono text-[11px] text-slate-200">
                  {hoveredPoint.label}:{' '}
                  <strong
                    className={
                      hoveredPoint.cumulativePnL >= 0
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    }
                  >
                    {formatSignedCurrency(hoveredPoint.cumulativePnL)}
                  </strong>
                </span>
              ) : (
                <span
                  className={`font-mono text-xs font-bold ${
                    isCurvePositive ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {formatSignedCurrency(finalCumulativePnL)}
                </span>
              )}
            </div>

            {closedCount < 1 ? (
              <div className="flex h-[110px] items-center justify-center rounded border border-dashed border-slate-800 bg-slate-950/50 px-4 text-center text-[11px] text-slate-500">
                Close at least 1 position to render your chronological P&amp;L
                equity curve.
              </div>
            ) : (
              <div className="relative rounded border border-slate-800/60 bg-slate-950/60 p-1">
                <svg
                  viewBox="0 0 320 110"
                  className="h-[110px] w-full overflow-visible"
                  role="img"
                  aria-label="Cumulative Realized P&L Equity Curve"
                >
                  <defs>
                    <linearGradient
                      id="equityCurveEmeraldGrad"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor="#10b981"
                        stopOpacity="0.35"
                      />
                      <stop
                        offset="100%"
                        stopColor="#10b981"
                        stopOpacity="0.02"
                      />
                    </linearGradient>
                    <linearGradient
                      id="equityCurveRoseGrad"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor="#f43f5e"
                        stopOpacity="0.05"
                      />
                      <stop
                        offset="100%"
                        stopColor="#f43f5e"
                        stopOpacity="0.35"
                      />
                    </linearGradient>
                  </defs>

                  {/* Dashed Zero Baseline */}
                  <line
                    x1={padX}
                    y1={zeroY}
                    x2={svgWidth - padX}
                    y2={zeroY}
                    stroke="#475569"
                    strokeWidth="1"
                    strokeDasharray="3 3"
                  />

                  {/* Gradient Area Fill */}
                  {areaPath && (
                    <path
                      d={areaPath}
                      fill={
                        isCurvePositive
                          ? 'url(#equityCurveEmeraldGrad)'
                          : 'url(#equityCurveRoseGrad)'
                      }
                    />
                  )}

                  {/* Equity Curve Polyline */}
                  <polyline
                    fill="none"
                    stroke={isCurvePositive ? '#10b981' : '#f43f5e'}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={polylinePoints}
                  />

                  {/* Interactive Point Dots */}
                  {equityPoints.map((pt, idx) => {
                    const cx = toX(idx);
                    const cy = toY(pt.cumulativePnL);
                    const isHovered = hoveredIndex === idx;
                    const dotPositive = pt.cumulativePnL >= 0;

                    return (
                      <g key={pt.index}>
                        <circle
                          cx={cx}
                          cy={cy}
                          r={isHovered ? 4.5 : 3}
                          fill={dotPositive ? '#10b981' : '#f43f5e'}
                          stroke="#0f172a"
                          strokeWidth="1.5"
                          className="cursor-pointer transition-all"
                          onMouseEnter={() => setHoveredIndex(idx)}
                          onMouseLeave={() => setHoveredIndex(null)}
                        >
                          <title>
                            {`${pt.label} | Trade: ${formatSignedCurrency(
                              pt.tradePnL
                            )} | Cumulative: ${formatSignedCurrency(
                              pt.cumulativePnL
                            )}`}
                          </title>
                        </circle>
                      </g>
                    );
                  })}
                </svg>
              </div>
            )}
          </div>

          {/* Middle Column: Key Edge Metrics Row / Stack */}
          <div className="grid grid-cols-3 gap-2.5 lg:col-span-3 lg:grid-cols-1">
            <div className="flex flex-col justify-center rounded-lg border border-slate-800/90 bg-slate-900/70 px-3 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Expectancy / Trade
              </span>
              <span
                className={`mt-0.5 font-mono text-sm font-bold ${
                  expectancy >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {formatSignedCurrency(expectancy)}
                <span className="ml-1 text-[10px] font-normal text-slate-400">
                  /trade
                </span>
              </span>
            </div>

            <div className="flex flex-col justify-center rounded-lg border border-slate-800/90 bg-slate-900/70 px-3 py-2">
              <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                <Award className="h-3 w-3 text-emerald-400" />
                Best Win
              </span>
              <span className="mt-0.5 font-mono text-sm font-bold text-emerald-400">
                {bestTradePnL > 0 ? `+$${bestTradePnL.toFixed(2)}` : '$0.00'}
              </span>
            </div>

            <div className="flex flex-col justify-center rounded-lg border border-slate-800/90 bg-slate-900/70 px-3 py-2">
              <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                <AlertTriangle className="h-3 w-3 text-rose-400" />
                Worst Loss
              </span>
              <span className="mt-0.5 font-mono text-sm font-bold text-rose-400">
                {worstTradePnL < 0
                  ? `-$${Math.abs(worstTradePnL).toFixed(2)}`
                  : '$0.00'}
              </span>
            </div>
          </div>

          {/* Right Column: Setup Tag Attribution List */}
          <div className="flex flex-col justify-between rounded-lg border border-slate-800/90 bg-slate-900/70 p-3 lg:col-span-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-300">
                <Tag className="h-3.5 w-3.5 text-sky-400" />
                Setup Tag Performance Breakdown
              </span>
              <span className="text-[10px] text-slate-400">
                Win Rate &amp; Net P&amp;L
              </span>
            </div>

            {tagBreakdown.length === 0 ? (
              <div className="flex h-[100px] items-center justify-center rounded border border-dashed border-slate-800 bg-slate-950/50 px-3 text-center text-[11px] text-slate-500">
                Tag your trade executions (e.g. Breakout, Retest) and close
                positions to rank setup performance.
              </div>
            ) : (
              <div className="max-h-[115px] space-y-2 overflow-y-auto pr-1">
                {tagBreakdown.map((item) => {
                  const isTagPositive = item.netPnL >= 0;
                  return (
                    <div key={item.tag} className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-slate-200">
                            {item.tag}
                          </span>
                          <span className="rounded bg-slate-800 px-1.5 py-0.2 font-mono text-[10px] text-slate-400">
                            {item.count} {item.count === 1 ? 'trade' : 'trades'}{' '}
                            · {item.winRate}% W
                          </span>
                        </div>
                        <span
                          className={`font-mono font-bold ${
                            isTagPositive ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {formatSignedCurrency(item.netPnL)}
                        </span>
                      </div>

                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                        <div
                          className={`h-full rounded-full transition-all ${
                            isTagPositive ? 'bg-emerald-500' : 'bg-rose-500'
                          }`}
                          style={{
                            width: `${Math.min(
                              100,
                              Math.max(4, item.winRate)
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
