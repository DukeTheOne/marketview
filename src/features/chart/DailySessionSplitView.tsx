import React, { useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import {
  buildTickerDetailedReport,
  extractLatestTradingDaySession,
  type OHLCVCandle,
  type TickerQuote,
} from '../../core/schemas/market';

export interface DailySessionSplitViewProps {
  ticker: string;
  dailyCandles: OHLCVCandle[];
  intradayCandles?: OHLCVCandle[];
  quote?: TickerQuote;
  quotesByTicker?: Record<string, TickerQuote>;
  isLoading?: boolean;
  showSplitPanel?: boolean;
  onToggleSplitPanel?: () => void;
  onBackToHistoricalChart?: () => void;
}

export interface StockDetailSplitPanelProps {
  ticker: string;
  dailyCandles: OHLCVCandle[];
  intradayCandles?: OHLCVCandle[];
  quote?: TickerQuote;
  quotesByTicker?: Record<string, TickerQuote>;
  onClose?: () => void;
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

/**
 * Unified Range Row combining low/high bounds and visual progress bar
 * without repeating numbers in separate cards.
 */
function UnifiedRangeRow({
  label,
  low,
  high,
  positionPercent,
  distanceFromHighPercent,
  testId,
  lowTestId,
  highTestId,
}: {
  label: string;
  low: number;
  high: number;
  positionPercent: number;
  distanceFromHighPercent: number;
  testId?: string;
  lowTestId?: string;
  highTestId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className="flex flex-col gap-1 rounded-lg border border-slate-800/80 bg-slate-900/60 p-2 sm:p-2.5"
    >
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-slate-400">{label}</span>
        <span className="font-mono text-[11px] text-slate-400">
          {distanceFromHighPercent <= 0 ? '' : '+'}
          {distanceFromHighPercent.toFixed(1)}% from High
        </span>
      </div>
      <div className="flex items-center gap-2.5 font-mono text-xs">
        <span
          data-testid={lowTestId}
          className="text-slate-400 font-semibold min-w-[55px]"
        >
          ${low.toFixed(2)}
        </span>
        <div className="relative h-2 flex-1 rounded-full bg-slate-800 overflow-hidden">
          <div
            className="absolute top-0 bottom-0 left-0 bg-emerald-500/30 rounded-full"
            style={{ width: `${positionPercent}%` }}
          />
          <div
            className="absolute top-0 bottom-0 w-1.5 -ml-0.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]"
            style={{ left: `${positionPercent}%` }}
          />
        </div>
        <span
          data-testid={highTestId}
          className="text-slate-200 font-semibold min-w-[55px] text-right"
        >
          ${high.toFixed(2)}
        </span>
      </div>
    </div>
  );
}

/**
 * StockDetailSplitPanel: Reusable right split panel with de-duplicated upper metrics
 * and a reserved lower half for upcoming news and earnings reports.
 */
export function StockDetailSplitPanel({
  ticker,
  dailyCandles,
  intradayCandles = [],
  quote,
  quotesByTicker,
  onClose,
}: StockDetailSplitPanelProps) {
  const report = useMemo(() => {
    return buildTickerDetailedReport(
      ticker,
      dailyCandles,
      intradayCandles,
      quote,
      quotesByTicker
    );
  }, [ticker, dailyCandles, intradayCandles, quote, quotesByTicker]);

  if (!report) {
    return (
      <aside
        data-testid="daily-1d-report-pane"
        className="flex w-full lg:w-1/2 flex-col bg-slate-950 p-5 overflow-y-auto items-center justify-center text-slate-500 border-l border-slate-800/80"
      >
        <span className="font-mono text-xs">
          No detailed report data available for {ticker}
        </span>
      </aside>
    );
  }

  return (
    <aside
      data-testid="daily-1d-report-pane"
      className="flex w-full lg:w-1/2 flex-col bg-slate-950 p-4 sm:p-5 overflow-y-auto space-y-4 h-full border-l border-slate-800/80"
    >
      {/* Header: Instrument Name, Exchange, Type Badge & Optional Close */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <h2 className="font-mono text-base font-bold text-slate-100">
              {report.ticker}
            </h2>
            <span
              data-testid="daily-1d-instrument-badge"
              className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider ${
                report.instrumentType === 'etf'
                  ? 'border border-cyan-500/30 bg-cyan-500/10 text-cyan-400'
                  : 'border border-blue-500/30 bg-blue-500/10 text-blue-400'
              }`}
            >
              {report.instrumentType === 'etf' ? 'ETF' : 'STOCK'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            {report.name} • {report.exchange}
          </p>
        </div>

        {onClose && (
          <button
            type="button"
            data-testid="close-split-panel-btn"
            onClick={onClose}
            title="Close Split Panel"
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-400 transition hover:border-slate-700 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* 1. Upper Half: De-Duplicated Key Numbers & Unified Range Bars */}
      <section
        data-testid="split-panel-upper-metrics"
        className="flex flex-col gap-3"
      >
        <div
          data-testid="daily-1d-key-numbers-section"
          className="flex flex-col gap-3 rounded-xl border border-slate-800/70 bg-slate-900/40 p-3 sm:p-4"
        >
          {/* Row 1: 4-Column Point Metrics Strip (Pure point metrics, no range duplication) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {/* Open & Overnight Gap */}
            <div
              data-testid="daily-1d-report-open-card"
              className="flex flex-col rounded-lg border border-slate-800/80 bg-slate-900/80 p-2"
            >
              <span className="text-[11px] font-medium text-slate-500">Open</span>
              <span
                data-testid="daily-1d-open"
                className="font-mono text-sm font-bold text-slate-100"
              >
                ${report.open.toFixed(2)}
              </span>
              <span
                className={`font-mono text-[10px] font-semibold mt-0.5 ${
                  report.overnightGap >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                Gap {report.overnightGap >= 0 ? '+' : ''}
                {report.overnightGap.toFixed(2)} ({report.overnightGapPercent >= 0 ? '+' : ''}
                {report.overnightGapPercent.toFixed(1)}%)
              </span>
            </div>

            {/* Close & Intraday Move */}
            <div
              data-testid="daily-1d-report-close-card"
              className="flex flex-col rounded-lg border border-slate-800/80 bg-slate-900/80 p-2"
            >
              <span className="text-[11px] font-medium text-slate-500">Close</span>
              <span
                data-testid="daily-1d-close"
                className="font-mono text-sm font-bold text-slate-100"
              >
                ${report.close.toFixed(2)}
              </span>
              <span
                className={`font-mono text-[10px] font-semibold mt-0.5 ${
                  report.openToCloseChange >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                Intraday {report.openToCloseChange >= 0 ? '+' : ''}
                {report.openToCloseChange.toFixed(2)} ({report.openToCloseChangePercent >= 0 ? '+' : ''}
                {report.openToCloseChangePercent.toFixed(1)}%)
              </span>
            </div>

            {/* Prev Close & Day Change */}
            <div className="flex flex-col rounded-lg border border-slate-800/80 bg-slate-900/80 p-2">
              <span className="text-[11px] font-medium text-slate-500">Prev Close</span>
              <span
                data-testid="daily-1d-prev-close"
                className="font-mono text-sm font-bold text-slate-200"
              >
                ${report.previousClose.toFixed(2)}
              </span>
              <span
                data-testid="daily-1d-change"
                className={`font-mono text-[10px] font-semibold mt-0.5 ${
                  report.change >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {report.change >= 0 ? '+' : ''}
                {report.change.toFixed(2)} ({report.changePercent >= 0 ? '+' : ''}
                {report.changePercent.toFixed(1)}%)
              </span>
            </div>

            {/* Volume & Context */}
            <div className="flex flex-col rounded-lg border border-slate-800/80 bg-slate-900/80 p-2">
              <span className="text-[11px] font-medium text-slate-500">Volume</span>
              <span className="font-mono text-sm font-bold text-slate-100">
                {(report.volume / 1_000_000).toFixed(2)}M
              </span>
              <span className="font-mono text-[10px] text-slate-400 mt-0.5 truncate">
                {report.relativeVolume.toFixed(2)}x ({report.volumeStatusLabel.split(' ')[0]})
              </span>
            </div>
          </div>

          {/* Row 2: 3 Unified Range Bars (Every range appears once, combining numbers & progress bar) */}
          <div className="flex flex-col gap-2 pt-1 border-t border-slate-800/50">
            <UnifiedRangeRow
              label="Today's Session Range"
              low={report.dayRange.low}
              high={report.dayRange.high}
              positionPercent={report.dayRange.positionPercent}
              distanceFromHighPercent={report.dayRange.distanceFromHighPercent}
              lowTestId="daily-1d-low"
              highTestId="daily-1d-high"
            />
            <UnifiedRangeRow
              testId="daily-1d-report-52w-card"
              label="52-Week Range"
              low={report.week52Range.low}
              high={report.week52Range.high}
              positionPercent={report.week52Range.positionPercent}
              distanceFromHighPercent={report.week52Range.distanceFromHighPercent}
            />
            <UnifiedRangeRow
              testId="daily-1d-report-history-high-card"
              label="Historical Range"
              low={report.historyRange.low}
              high={report.historyHigh}
              positionPercent={report.historyRange.positionPercent}
              distanceFromHighPercent={report.historyRange.distanceFromHighPercent}
            />
          </div>
        </div>

        {/* Row 3: Multi-Horizon Returns & Moving Averages */}
        <div
          data-testid="daily-1d-horizon-trend-section"
          className="flex flex-col gap-2.5 rounded-xl border border-slate-800/70 bg-slate-900/40 p-3"
        >
          {/* 5-Horizon Returns Strip */}
          <div className="grid grid-cols-5 gap-1.5">
            {report.periodReturns.map((item) => {
              const isUp = item.changePercent >= 0;
              return (
                <div
                  key={item.label}
                  className="flex flex-col items-center justify-center rounded-lg border border-slate-800 bg-slate-900/90 py-1.5 px-1 text-center"
                >
                  <span className="text-[10px] font-semibold text-slate-400">
                    {item.label}
                  </span>
                  <span
                    className={`font-mono text-[11px] font-bold mt-0.5 ${
                      isUp ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {isUp ? '+' : ''}
                    {item.changePercent.toFixed(1)}%
                  </span>
                </div>
              );
            })}
          </div>

          {/* Moving Averages Benchmarks */}
          <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-800/50">
            {report.movingAverages.map((ma) => (
              <div
                key={ma.period}
                className="flex flex-col rounded-lg border border-slate-800/70 bg-slate-900/60 p-1.5"
              >
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-400 font-medium">{ma.label}</span>
                  <span
                    className={`font-mono font-semibold text-[9px] rounded px-1 ${
                      ma.isAbove
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : 'bg-rose-500/15 text-rose-400'
                    }`}
                  >
                    {ma.isAbove ? 'Above' : 'Below'}
                  </span>
                </div>
                <div className="flex items-baseline justify-between mt-0.5 font-mono">
                  <span className="text-[11px] font-bold text-slate-200">
                    ${ma.price.toFixed(2)}
                  </span>
                  <span
                    className={`text-[9px] ${
                      ma.isAbove ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {ma.distancePercent >= 0 ? '+' : ''}
                    {ma.distancePercent.toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Row 4: Instrument-Tailored Pulse (ETF Breadth vs Stock 20D Pulse) */}
        {report.instrumentType === 'etf' && report.etfBreadth && (
          <div
            data-testid="daily-1d-etf-breadth-section"
            className="flex flex-col gap-2.5 rounded-xl border border-slate-800/70 bg-slate-900/40 p-3"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Market Breadth &amp; Constituents
                </h3>
                <p className="text-[11px] text-slate-400">
                  {report.etfBreadth.indexLabel} ({report.etfBreadth.totalCount} stocks)
                </p>
              </div>
              <span className="rounded bg-cyan-500/10 border border-cyan-500/25 px-1.5 py-0.5 font-mono text-[10px] text-cyan-300">
                ETF Pulse
              </span>
            </div>

            {/* Counts of Up vs Down */}
            <div className="grid grid-cols-3 gap-2 text-center font-mono">
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-1.5">
                <span className="text-[9px] uppercase text-emerald-400 block">Went Up</span>
                <span
                  data-testid="daily-1d-etf-up-count"
                  className="text-xs font-bold text-emerald-300"
                >
                  ▲ {report.etfBreadth.advancingCount} ({report.etfBreadth.advancingPercent.toFixed(1)}%)
                </span>
              </div>

              <div className="rounded-lg border border-slate-700/60 bg-slate-800/40 p-1.5">
                <span className="text-[9px] uppercase text-slate-400 block">Flat</span>
                <span className="text-xs font-bold text-slate-300">
                  • {report.etfBreadth.unchangedCount} ({report.etfBreadth.unchangedPercent.toFixed(1)}%)
                </span>
              </div>

              <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-1.5">
                <span className="text-[9px] uppercase text-rose-400 block">Went Down</span>
                <span
                  data-testid="daily-1d-etf-down-count"
                  className="text-xs font-bold text-rose-300"
                >
                  ▼ {report.etfBreadth.decliningCount} ({report.etfBreadth.decliningPercent.toFixed(1)}%)
                </span>
              </div>
            </div>

            {/* Stacked Breadth Bar */}
            <div className="flex h-2 w-full rounded-full overflow-hidden bg-slate-800">
              <div
                className="bg-emerald-500"
                style={{ width: `${report.etfBreadth.advancingPercent}%` }}
              />
              <div
                className="bg-slate-500"
                style={{ width: `${report.etfBreadth.unchangedPercent}%` }}
              />
              <div
                className="bg-rose-500"
                style={{ width: `${report.etfBreadth.decliningPercent}%` }}
              />
            </div>

            {/* Top Holdings Pulse */}
            <div className="flex flex-col gap-1 pt-1 border-t border-slate-800/50">
              <span className="text-[11px] font-semibold text-slate-400">
                Top Holdings Pulse
              </span>
              <div
                data-testid="daily-1d-etf-top-holdings"
                className="flex flex-col divide-y divide-slate-800/60 font-mono text-xs"
              >
                {report.etfBreadth.topHoldings.map((h) => {
                  const isUp = h.changePercent >= 0;
                  return (
                    <div
                      key={h.ticker}
                      className="flex items-center justify-between py-1 first:pt-0 last:pb-0"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-200">{h.ticker}</span>
                        <span className="text-[11px] text-slate-500 font-sans truncate max-w-[140px]">
                          {h.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400">
                          {h.weightPercent.toFixed(1)}% wt
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.2 font-bold text-[10px] ${
                            isUp
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : 'bg-rose-500/15 text-rose-400'
                          }`}
                        >
                          {isUp ? '+' : ''}
                          {h.changePercent.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {report.instrumentType === 'stock' && report.stockPulse && (
          <div
            data-testid="daily-1d-stock-pulse-section"
            className="flex flex-col gap-2.5 rounded-xl border border-slate-800/70 bg-slate-900/40 p-3"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  20-Session Pulse &amp; Volatility
                </h3>
                <p className="text-[11px] text-slate-400">
                  Last {report.stockPulse.lookbackDays} Trading Days
                </p>
              </div>
              <span className="rounded bg-blue-500/10 border border-blue-500/25 px-1.5 py-0.5 font-mono text-[10px] text-blue-300">
                Stock Pulse
              </span>
            </div>

            {/* Counts of Up vs Down Days */}
            <div className="grid grid-cols-2 gap-2 text-center font-mono">
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-1.5">
                <span className="text-[9px] uppercase text-emerald-400 block">Up Days</span>
                <span
                  data-testid="daily-1d-stock-up-days"
                  className="text-xs font-bold text-emerald-300"
                >
                  ▲ {report.stockPulse.upDaysCount} Up Days ({report.stockPulse.upDaysPercent.toFixed(0)}%)
                </span>
              </div>

              <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-1.5">
                <span className="text-[9px] uppercase text-rose-400 block">Down Days</span>
                <span
                  data-testid="daily-1d-stock-down-days"
                  className="text-xs font-bold text-rose-300"
                >
                  ▼ {report.stockPulse.downDaysCount} Down Days ({report.stockPulse.downDaysPercent.toFixed(0)}%)
                </span>
              </div>
            </div>

            {/* Stacked 20D Bar */}
            <div className="flex h-2 w-full rounded-full overflow-hidden bg-slate-800">
              <div
                className="bg-emerald-500"
                style={{ width: `${report.stockPulse.upDaysPercent}%` }}
              />
              <div
                className="bg-rose-500"
                style={{ width: `${report.stockPulse.downDaysPercent}%` }}
              />
            </div>

            {/* Range Strength & ATR Details */}
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800/50">
              <div className="flex flex-col rounded-lg border border-slate-800/70 bg-slate-900/60 p-1.5">
                <span className="text-[10px] text-slate-400 font-medium">Session Strength</span>
                <span className="font-mono text-[11px] font-bold text-slate-200 mt-0.5">
                  {report.stockPulse.closeStrengthLabel}
                </span>
                <span className="text-[9px] font-mono text-slate-500">
                  Closed at {report.stockPulse.closeLocationPercent.toFixed(0)}% of range
                </span>
              </div>

              <div className="flex flex-col rounded-lg border border-slate-800/70 bg-slate-900/60 p-1.5">
                <span className="text-[10px] text-slate-400 font-medium">Typical Daily Swing (14D ATR)</span>
                <span className="font-mono text-[11px] font-bold text-slate-200 mt-0.5">
                  ${report.stockPulse.atr14.toFixed(2)} ({report.stockPulse.atr14Percent.toFixed(1)}%)
                </span>
                <span className="text-[9px] font-mono text-slate-500">
                  {report.stockPulse.todayRangeRatioVsAtr}x typical daily range
                </span>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 2. Bottom Half: Reserved Clean Space for Future News & Earnings Reports */}
      <section
        data-testid="split-panel-lower-reserved"
        className="flex flex-1 min-h-[160px] flex-col rounded-xl border border-dashed border-slate-800/70 bg-slate-900/20 p-4 text-center justify-center items-center"
      >
        <div className="max-w-xs space-y-1.5 text-slate-500">
          <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-slate-800/80 text-slate-400">
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
                d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"
              />
            </svg>
          </div>
          <p className="font-mono text-xs font-semibold text-slate-400">
            News &amp; Earnings Reports
          </p>
          <p className="text-[11px] text-slate-500">
            Space reserved for upcoming live market headlines, company press releases, and SEC earnings reports.
          </p>
        </div>
      </section>
    </aside>
  );
}

export function DailySessionSplitView({
  ticker,
  dailyCandles,
  intradayCandles = [],
  quote,
  quotesByTicker,
  isLoading = false,
  showSplitPanel = true,
  onToggleSplitPanel,
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
      {/* Left Area: Clean Dedicated Latest Trading Day (1D) Chart */}
      <section
        data-testid="daily-1d-chart-pane"
        className={`flex flex-col border-b lg:border-b-0 ${
          showSplitPanel ? 'w-full lg:w-1/2 lg:border-r' : 'w-full flex-1'
        } border-slate-800/80 bg-slate-950 p-4 overflow-hidden`}
      >
        {/* Top Session Header: Date, 1D Badge & Return Action (No redundant 6-column metrics strip) */}
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
                left: `${Math.min((activeHoverX / chartWidth) * 100, 75)}%`,
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

      {/* Right Area: StockDetailSplitPanel (Rendered when showSplitPanel is true) */}
      {showSplitPanel && (
        <StockDetailSplitPanel
          ticker={ticker}
          dailyCandles={dailyCandles}
          intradayCandles={intradayCandles}
          quote={quote}
          quotesByTicker={quotesByTicker}
          onClose={onToggleSplitPanel}
        />
      )}
    </div>
  );
}
