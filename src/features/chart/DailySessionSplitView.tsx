import React, { useMemo, useRef, useState } from 'react';
import {
  extractLatestTradingDaySession,
  type OHLCVCandle,
  type TickerQuote,
} from '../../core/schemas/market';

export interface DailySessionSplitViewProps {
  ticker: string;
  dailyCandles: OHLCVCandle[];
  intradayCandles?: OHLCVCandle[];
  quote?: TickerQuote;
  isLoading?: boolean;
  onBackToHistoricalChart?: () => void;
}

/**
 * Formats a Unix timestamp (seconds UTC) into HH:MM UTC time string.
 */
function formatTimeUtc(timestampSec: number): string {
  const d = new Date(timestampSec * 1000);
  const hours = String(d.getUTCHours()).padStart(2, '0');
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hours}:${minutes} UTC`;
}

/**
 * Formats a Unix timestamp (seconds UTC) into YYYY-MM-DD date string.
 */
function formatDateUtc(timestampSec: number): string {
  const d = new Date(timestampSec * 1000);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function DailySessionSplitView({
  ticker,
  dailyCandles,
  intradayCandles = [],
  quote,
  isLoading = false,
  onBackToHistoricalChart,
}: DailySessionSplitViewProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const session = useMemo(() => {
    return extractLatestTradingDaySession(ticker, dailyCandles, intradayCandles, quote);
  }, [ticker, dailyCandles, intradayCandles, quote]);

  // Loading state with zero candles
  if (isLoading && (!dailyCandles || dailyCandles.length === 0)) {
    return (
      <div
        data-testid="daily-1d-loading-state"
        className="flex flex-1 items-center justify-center bg-slate-950 p-6 text-slate-400"
      >
        <div className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900 px-5 py-3">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          <span className="font-mono text-sm">Syncing latest trading day for {ticker}...</span>
        </div>
      </div>
    );
  }

  // Fallback empty state if no candles exist
  if (!session) {
    return (
      <div
        data-testid="daily-1d-empty-state"
        className="flex flex-1 flex-col items-center justify-center gap-4 bg-slate-950 p-6 text-slate-400"
      >
        <span className="font-mono text-sm">No trading session data available for {ticker}</span>
        {onBackToHistoricalChart && (
          <button
            type="button"
            data-testid="daily-1d-back-btn"
            onClick={onBackToHistoricalChart}
            className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 font-mono text-xs text-slate-200 transition-colors hover:bg-slate-700"
          >
            ← Back to Historical Chart
          </button>
        )}
      </div>
    );
  }

  const isPositive = session.change >= 0;
  const isSessionGreen = session.close >= session.previousClose;
  const strokeColor = isSessionGreen ? '#10b981' : '#f43f5e';
  const fillGradientId = `grad-1d-${ticker}-${isSessionGreen ? 'green' : 'red'}`;

  // Geometry calculation for the SVG chart
  const bars = session.bars;
  const barCount = bars.length;

  const minPrice = Math.min(...bars.map((b) => b.low), session.previousClose, session.open);
  const maxPrice = Math.max(...bars.map((b) => b.high), session.previousClose, session.open);
  const rawPadding = (maxPrice - minPrice) * 0.12;
  const padding = Math.max(0.4, rawPadding);
  const domainMin = Math.max(0, minPrice - padding);
  const domainMax = maxPrice + padding;
  const domainSpan = domainMax - domainMin || 1;

  const chartWidth = 900;
  const chartHeight = 420;
  const padLeft = 40;
  const padRight = 40;
  const padTop = 30;
  const padBottom = 40;
  const usableWidth = chartWidth - padLeft - padRight;
  const usableHeight = chartHeight - padTop - padBottom;

  const getX = (idx: number) => {
    if (barCount <= 1) return padLeft + usableWidth / 2;
    return padLeft + (idx / (barCount - 1)) * usableWidth;
  };

  const getY = (val: number) => {
    return padTop + usableHeight - ((val - domainMin) / domainSpan) * usableHeight;
  };

  const linePoints = bars.map((b, i) => `${getX(i).toFixed(1)},${getY(b.close).toFixed(1)}`).join(' ');
  const areaPoints = `${getX(0).toFixed(1)},${(padTop + usableHeight).toFixed(1)} ${linePoints} ${getX(
    barCount - 1
  ).toFixed(1)},${(padTop + usableHeight).toFixed(1)}`;

  const prevCloseY = getY(session.previousClose);
  const openY = getY(session.open);

  const activeHoverBar = hoverIndex !== null && hoverIndex >= 0 && hoverIndex < barCount ? bars[hoverIndex] : null;
  const activeHoverX = hoverIndex !== null ? getX(hoverIndex) : null;
  const activeHoverY = activeHoverBar ? getY(activeHoverBar.close) : null;

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || barCount <= 1) return;
    const rect = svgRef.current.getBoundingClientRect();
    const cursorRelativeX = (e.clientX - rect.left) / rect.width;
    const virtualX = cursorRelativeX * chartWidth;
    const boundedX = Math.max(padLeft, Math.min(chartWidth - padRight, virtualX));
    const normalizedSpan = (boundedX - padLeft) / usableWidth;
    const closestIdx = Math.min(barCount - 1, Math.max(0, Math.round(normalizedSpan * (barCount - 1))));
    setHoverIndex(closestIdx);
  };

  return (
    <div className="flex flex-1 flex-col lg:flex-row h-full w-full overflow-hidden bg-slate-950 select-none">
      {/* Left Half: Dedicated Latest Trading Day (1D) Chart */}
      <section
        data-testid="daily-1d-chart-pane"
        className="flex w-full lg:w-1/2 flex-col border-b lg:border-b-0 lg:border-r border-slate-800/80 bg-slate-950 p-4 overflow-hidden"
      >
        {/* Top Session Header & Return Action */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/60 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-lg font-bold tracking-wider text-slate-100">
              {ticker}
            </span>
            <span className="rounded border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 font-mono text-xs font-semibold text-emerald-400">
              Latest Trading Day (1D)
            </span>
            <span className="font-mono text-xs text-slate-400">
              {formatDateUtc(session.sessionDateTimestamp)}
            </span>
          </div>

          {onBackToHistoricalChart && (
            <button
              type="button"
              data-testid="daily-1d-back-btn"
              onClick={onBackToHistoricalChart}
              title="Return to full historical candlestick chart"
              className="flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900/90 px-2.5 py-1 font-mono text-xs font-medium text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-800 hover:text-white"
            >
              <span>← Historical Chart</span>
            </button>
          )}
        </div>

        {/* Scannable Session Metrics Strip */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 py-3 border-b border-slate-800/40">
          <div className="flex flex-col">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Open</span>
            <span data-testid="daily-1d-open" className="font-mono text-sm font-semibold text-slate-200">
              ${session.open.toFixed(2)}
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Close</span>
            <span data-testid="daily-1d-close" className="font-mono text-sm font-semibold text-slate-100">
              ${session.close.toFixed(2)}
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">High</span>
            <span data-testid="daily-1d-high" className="font-mono text-sm font-semibold text-emerald-400">
              ${session.high.toFixed(2)}
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Low</span>
            <span data-testid="daily-1d-low" className="font-mono text-sm font-semibold text-rose-400">
              ${session.low.toFixed(2)}
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Prev Close</span>
            <span data-testid="daily-1d-prev-close" className="font-mono text-sm font-semibold text-slate-300">
              ${session.previousClose.toFixed(2)}
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Change</span>
            <span
              data-testid="daily-1d-change"
              className={`font-mono text-sm font-bold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}
            >
              {session.change >= 0 ? '+' : ''}
              {session.change.toFixed(2)} ({session.changePercent >= 0 ? '+' : ''}
              {session.changePercent.toFixed(2)}%)
            </span>
          </div>
        </div>

        {/* Intraday Price Curve for the Latest Trading Session */}
        <div className="relative flex-1 min-h-[300px] w-full mt-2">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            preserveAspectRatio="none"
            className="h-full w-full cursor-crosshair overflow-visible"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoverIndex(null)}
          >
            <defs>
              <linearGradient id={fillGradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={strokeColor} stopOpacity="0.25" />
                <stop offset="90%" stopColor={strokeColor} stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Baseline grid */}
            <line
              x1={padLeft}
              y1={padTop}
              x2={chartWidth - padRight}
              y2={padTop}
              stroke="#1e293b"
              strokeDasharray="2,4"
            />
            <line
              x1={padLeft}
              y1={padTop + usableHeight / 2}
              x2={chartWidth - padRight}
              y2={padTop + usableHeight / 2}
              stroke="#1e293b"
              strokeDasharray="2,4"
            />
            <line
              x1={padLeft}
              y1={padTop + usableHeight}
              x2={chartWidth - padRight}
              y2={padTop + usableHeight}
              stroke="#1e293b"
            />

            {/* Previous Close Reference Baseline */}
            {prevCloseY >= padTop && prevCloseY <= padTop + usableHeight && (
              <g>
                <line
                  x1={padLeft}
                  y1={prevCloseY}
                  x2={chartWidth - padRight}
                  y2={prevCloseY}
                  stroke="#64748b"
                  strokeWidth="1.2"
                  strokeDasharray="4,4"
                />
                <text
                  x={chartWidth - padRight - 6}
                  y={prevCloseY - 4}
                  fill="#94a3b8"
                  textAnchor="end"
                  fontSize="10"
                  fontFamily="monospace"
                >
                  Prev Close ${session.previousClose.toFixed(2)}
                </text>
              </g>
            )}

            {/* Session Open Reference Baseline */}
            {openY >= padTop && openY <= padTop + usableHeight && Math.abs(openY - prevCloseY) > 12 && (
              <g>
                <line
                  x1={padLeft}
                  y1={openY}
                  x2={chartWidth - padRight}
                  y2={openY}
                  stroke="#475569"
                  strokeWidth="1"
                  strokeDasharray="2,2"
                />
                <text
                  x={padLeft + 6}
                  y={openY - 4}
                  fill="#64748b"
                  fontSize="10"
                  fontFamily="monospace"
                >
                  Open ${session.open.toFixed(2)}
                </text>
              </g>
            )}

            {/* Gradient Fill & Continuous Price Line */}
            <polygon points={areaPoints} fill={`url(#${fillGradientId})`} />
            <polyline
              points={linePoints}
              fill="none"
              stroke={strokeColor}
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Hover Crosshair & Anchor */}
            {activeHoverX !== null && activeHoverY !== null && activeHoverBar && (
              <g>
                <line
                  x1={activeHoverX}
                  y1={padTop}
                  x2={activeHoverX}
                  y2={padTop + usableHeight}
                  stroke="#94a3b8"
                  strokeWidth="1"
                  strokeDasharray="2,2"
                />
                <circle
                  cx={activeHoverX}
                  cy={activeHoverY}
                  r="4.5"
                  fill={strokeColor}
                  stroke="#020617"
                  strokeWidth="2"
                />
              </g>
            )}
          </svg>

          {/* Hover Readout Tooltip */}
          {activeHoverBar && activeHoverX !== null && activeHoverY !== null && (
            <div
              className="pointer-events-none absolute z-20 flex flex-col gap-0.5 rounded border border-slate-700/80 bg-slate-900/95 px-2.5 py-1.5 font-mono text-xs shadow-xl backdrop-blur-sm"
              style={{
                left: `${Math.min(activeHoverX / chartWidth * 100, 75)}%`,
                top: '12px',
              }}
            >
              <div className="flex items-center justify-between gap-3 text-[11px] text-slate-400">
                <span>{formatTimeUtc(activeHoverBar.timestamp)}</span>
                <span className="text-slate-500">Vol: {activeHoverBar.volume.toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-100">${activeHoverBar.close.toFixed(2)}</span>
                <span
                  className={
                    activeHoverBar.close >= session.previousClose
                      ? 'text-emerald-400'
                      : 'text-rose-400'
                  }
                >
                  {activeHoverBar.close >= session.previousClose ? '+' : ''}
                  {(activeHoverBar.close - session.previousClose).toFixed(2)}
                </span>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Right Half: Reserved Daily Report Space (Clean blank container ready for future metrics) */}
      <aside
        data-testid="daily-1d-report-pane"
        className="flex w-full lg:w-1/2 flex-col bg-slate-950 p-6 overflow-y-auto"
      >
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
          <div className="flex items-center gap-2">
            <h2 className="font-mono text-sm font-semibold tracking-wide text-slate-200">
              Daily Report & Order Flow
            </h2>
            <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
              Reserved
            </span>
          </div>
        </div>

        {/* Intentionally blank placeholder container ready for future daily metrics */}
        <div
          data-testid="daily-1d-report-placeholder"
          className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-slate-800/70 bg-slate-900/20 p-8 text-center mt-6"
        >
          {/*
            TODO(opening-hours-live-update): Keep 1D view as static latest trading day snapshot for now;
            live opening-hours streaming to be added in a future slice.
          */}
          <div className="max-w-md space-y-2 text-slate-400">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-800/80 text-slate-300">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            </div>
            <p className="font-mono text-xs font-semibold text-slate-300">
              Daily Report Space
            </p>
            <p className="text-xs text-slate-500 leading-relaxed">
              This space is reserved for detailed session analysis: Open/Close auction breakdown,
              Put vs. Call volume distribution, and order flow metrics.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}
