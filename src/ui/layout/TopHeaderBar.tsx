import { Activity, BookOpen, Database, RefreshCw } from 'lucide-react';
import type { TickerQuote, Timeframe } from '../../core/schemas/market';

const TIMEFRAMES: Timeframe[] = ['15m', '1h', '1D', '1W'];

export interface TopHeaderBarProps {
  activeTicker: string;
  activeTimeframe: Timeframe;
  quote: TickerQuote | undefined;
  providerId: string;
  isLoading: boolean;
  isJournalOpen: boolean;
  tradeCount: number;
  onSelectTimeframe: (timeframe: Timeframe) => void;
  onRefresh: () => void;
  onToggleJournal: () => void;
}

export function TopHeaderBar({
  activeTicker,
  activeTimeframe,
  quote,
  providerId,
  isLoading,
  isJournalOpen,
  tradeCount,
  onSelectTimeframe,
  onRefresh,
  onToggleJournal,
}: TopHeaderBarProps) {
  const isPositive = (quote?.change ?? 0) >= 0;

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900/90 px-4">
      <div className="flex items-center gap-5">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30">
            <Activity className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold tracking-tight text-slate-100">
                MarketView
              </span>
              <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-400 ring-1 ring-emerald-500/20">
                COMPLETE M1-M4
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Logical (timestamp, price) Architecture
            </p>
          </div>
        </div>

        <div className="h-6 w-px bg-slate-800" />

        {/* Active Ticker Quote Summary */}
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-lg font-bold text-white">
            {activeTicker}
          </span>
          {quote ? (
            <>
              <span className="font-mono text-base font-semibold text-slate-100">
                ${quote.price.toFixed(2)}
              </span>
              <span
                className={`rounded px-1.5 py-0.5 font-mono text-xs font-medium ${
                  isPositive
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : 'bg-rose-500/15 text-rose-400'
                }`}
              >
                {isPositive ? '+' : ''}
                {quote.change.toFixed(2)} ({isPositive ? '+' : ''}
                {quote.changePercent.toFixed(2)}%)
              </span>
              <span className="hidden font-mono text-xs text-slate-400 md:inline">
                H: ${quote.high.toFixed(2)} · L: ${quote.low.toFixed(2)}
              </span>
            </>
          ) : (
            <span className="text-xs text-slate-500">Loading quote...</span>
          )}
        </div>
      </div>

      {/* Timeframe Switcher, Journal Drawer Toggle & Provider Badge */}
      <div className="flex items-center gap-3">
        <div className="flex items-center rounded-lg border border-slate-800 bg-slate-950 p-0.5">
          {TIMEFRAMES.map((tf) => {
            const active = tf === activeTimeframe;
            return (
              <button
                key={tf}
                type="button"
                onClick={() => onSelectTimeframe(tf)}
                className={`rounded-md px-2.5 py-1 font-mono text-xs font-medium transition ${
                  active
                    ? 'bg-emerald-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tf}
              </button>
            );
          })}
        </div>

        {/* Trade Journal Drawer Toggle Button */}
        <button
          type="button"
          onClick={onToggleJournal}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
            isJournalOpen
              ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
              : 'border-slate-800 bg-slate-950 text-slate-300 hover:border-slate-700 hover:text-white'
          }`}
        >
          <BookOpen className="h-3.5 w-3.5 text-emerald-400" />
          <span>Journal</span>
          {tradeCount > 0 && (
            <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.2 font-mono text-[10px] text-emerald-300">
              {tradeCount}
            </span>
          )}
        </button>

        <div className="hidden items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1 text-xs text-slate-400 sm:flex">
          <Database className="h-3.5 w-3.5 text-emerald-400" />
          <span className="font-mono">{providerId}</span>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          title="Refresh Quotes & Candles"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-800 bg-slate-950 text-slate-300 transition hover:border-slate-700 hover:text-white"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin text-emerald-400' : ''}`}
          />
        </button>
      </div>
    </header>
  );
}
