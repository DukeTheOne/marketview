import { useState, type FormEvent } from 'react';
import {
  CheckCircle2,
  Clock,
  DollarSign,
  Percent,
  PlusCircle,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  calculateTradePnLPercent,
  calculateTradeRealizedPnL,
  type JournalSummary,
  type TradeEntry,
  type TradeSide,
} from '../../core/schemas/trade';
import { JournalAnalyticsCard } from './JournalAnalyticsCard';


export interface TradeJournalDrawerProps {
  isOpen: boolean;
  activeTicker: string;
  currentTickerPrice: number;
  trades: TradeEntry[];
  summary: JournalSummary;
  filterStatus: 'ALL' | 'OPEN' | 'CLOSED';
  onClose: () => void;
  onFilterChange: (filter: 'ALL' | 'OPEN' | 'CLOSED') => void;
  onLogTrade: (trade: {
    ticker: string;
    side: TradeSide;
    entryPrice: number;
    quantity: number;
    stopLossPrice?: number;
    takeProfitPrice?: number;
    setupTags?: string[];
    notesMarkdown?: string;
    createChartMarker?: boolean;
  }) => Promise<void>;
  onClosePosition: (id: string, exitPrice: number) => Promise<void>;
  onDeleteTrade: (id: string) => Promise<void>;
  onSelectTicker: (ticker: string) => void;
}

const SETUP_TAG_PRESETS = ['Breakout', 'Retest', 'Dip Buy', 'Momentum', 'Reversal'];

export function TradeJournalDrawer({
  isOpen,
  activeTicker,
  currentTickerPrice,
  trades,
  summary,
  filterStatus,
  onClose,
  onFilterChange,
  onLogTrade,
  onClosePosition,
  onDeleteTrade,
  onSelectTicker,
}: TradeJournalDrawerProps) {
  const [side, setSide] = useState<TradeSide>('BUY');
  const [ticker, setTicker] = useState(activeTicker);
  const [price, setPrice] = useState(currentTickerPrice.toString());
  const [quantity, setQuantity] = useState('100');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [selectedTag, setSelectedTag] = useState('Breakout');
  const [notes, setNotes] = useState('');
  const [createMarker, setCreateMarker] = useState(true);

  const [closingTradeId, setClosingTradeId] = useState<string | null>(null);
  const [exitPriceInput, setExitPriceInput] = useState('');

  if (!isOpen) {
    return null;
  }

  const handleFormSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const entryPriceNum = parseFloat(price);
    const quantityNum = parseInt(quantity, 10);
    if (isNaN(entryPriceNum) || isNaN(quantityNum) || entryPriceNum <= 0 || quantityNum <= 0) {
      return;
    }

    await onLogTrade({
      ticker: ticker.trim().toUpperCase() || activeTicker,
      side,
      entryPrice: entryPriceNum,
      quantity: quantityNum,
      stopLossPrice: stopLoss ? parseFloat(stopLoss) : undefined,
      takeProfitPrice: takeProfit ? parseFloat(takeProfit) : undefined,
      setupTags: selectedTag ? [selectedTag] : [],
      notesMarkdown: notes,
      createChartMarker: createMarker,
    });

    setNotes('');
  };

  const handleExecuteClose = async (id: string) => {
    const exitVal = parseFloat(exitPriceInput);
    if (isNaN(exitVal) || exitVal <= 0) return;
    await onClosePosition(id, exitVal);
    setClosingTradeId(null);
    setExitPriceInput('');
  };

  const filteredTrades = trades.filter((t) => {
    if (filterStatus === 'ALL') return true;
    return t.status === filterStatus;
  });

  const isNetPositive = summary.totalRealizedPnL >= 0;

  return (
    <div className="absolute inset-x-0 bottom-0 z-40 flex max-h-[82%] flex-col border-t border-slate-800 bg-slate-900/98 shadow-2xl backdrop-blur-xl transition-all">
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30">
            <TrendingUp className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">
              Trade Execution Journal & Portfolio Analytics
            </h2>
            <p className="text-[11px] text-slate-400">
              Synchronized with Logical Chart Markers & Headless Storage
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* KPI Stats Bar */}
      <div className="grid grid-cols-2 gap-3 border-b border-slate-800 bg-slate-950/60 p-4 sm:grid-cols-4">
        <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-3">
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
            <DollarSign className="h-3 w-3 text-emerald-400" />
            Realized P&L
          </span>
          <p
            className={`font-mono text-lg font-bold ${
              isNetPositive ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {isNetPositive ? '+' : ''}${summary.totalRealizedPnL.toFixed(2)}
          </p>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-3">
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
            <Percent className="h-3 w-3 text-sky-400" />
            Win Rate
          </span>
          <p className="font-mono text-lg font-bold text-slate-100">
            {summary.winRatePercent}%{' '}
            <span className="text-xs text-slate-400">
              ({summary.winCount}W / {summary.lossCount}L)
            </span>
          </p>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-3">
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
            <Clock className="h-3 w-3 text-amber-400" />
            Positions
          </span>
          <p className="font-mono text-lg font-bold text-slate-100">
            {summary.openTrades} Open{' '}
            <span className="text-xs text-slate-400">
              / {summary.closedTrades} Closed
            </span>
          </p>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-3">
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
            <CheckCircle2 className="h-3 w-3 text-purple-400" />
            Profit Factor
          </span>
          <p className="font-mono text-lg font-bold text-purple-300">
            {summary.profitFactor.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Edge Analytics & Setup Attribution */}
      <JournalAnalyticsCard trades={trades} summary={summary} />

      {/* Main Drawer Body: Log Form + Trade History Table */}
      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Execution Log Form */}
        <form
          onSubmit={handleFormSubmit}
          className="w-full shrink-0 border-b border-slate-800 p-4 lg:w-80 lg:border-r lg:border-b-0"
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Log Execution
            </span>
            <div className="flex rounded-md border border-slate-800 p-0.5 bg-slate-950">
              <button
                type="button"
                onClick={() => setSide('BUY')}
                className={`rounded px-2 py-0.5 text-[11px] font-bold ${
                  side === 'BUY'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                BUY
              </button>
              <button
                type="button"
                onClick={() => setSide('SHORT')}
                className={`rounded px-2 py-0.5 text-[11px] font-bold ${
                  side === 'SHORT'
                    ? 'bg-rose-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                SHORT
              </button>
            </div>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] uppercase font-semibold text-slate-400">
                  Symbol
                </label>
                <input
                  type="text"
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value.toUpperCase())}
                  className="w-full rounded border border-slate-800 bg-slate-950 px-2 py-1 font-mono text-slate-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-semibold text-slate-400">
                  Price ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full rounded border border-slate-800 bg-slate-950 px-2 py-1 font-mono text-slate-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] uppercase font-semibold text-slate-400">
                  Shares
                </label>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full rounded border border-slate-800 bg-slate-950 px-2 py-1 font-mono text-slate-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-semibold text-slate-400">
                  Stop ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Optional"
                  value={stopLoss}
                  onChange={(e) => setStopLoss(e.target.value)}
                  className="w-full rounded border border-slate-800 bg-slate-950 px-2 py-1 font-mono text-slate-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-semibold text-slate-400">
                  Target ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Optional"
                  value={takeProfit}
                  onChange={(e) => setTakeProfit(e.target.value)}
                  className="w-full rounded border border-slate-800 bg-slate-950 px-2 py-1 font-mono text-slate-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] uppercase font-semibold text-slate-400">
                Setup Strategy
              </label>
              <select
                value={selectedTag}
                onChange={(e) => setSelectedTag(e.target.value)}
                className="w-full rounded border border-slate-800 bg-slate-950 px-2 py-1 text-slate-100 focus:border-emerald-500 focus:outline-none"
              >
                {SETUP_TAG_PRESETS.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] uppercase font-semibold text-slate-400">
                Execution Notes
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Entry rationale or catalyst..."
                className="w-full resize-none rounded border border-slate-800 bg-slate-950 p-1.5 text-slate-100 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                id="markerCheckbox"
                type="checkbox"
                checked={createMarker}
                onChange={(e) => setCreateMarker(e.target.checked)}
                className="rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-400"
              />
              <label
                htmlFor="markerCheckbox"
                className="cursor-pointer text-[11px] text-slate-300"
              >
                Pin Buy/Sell marker on active chart
              </label>
            </div>

            <button
              type="submit"
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-500 py-1.5 font-semibold text-slate-950 transition hover:bg-emerald-400"
            >
              <PlusCircle className="h-4 w-4" />
              <span>Record Trade</span>
            </button>
          </div>
        </form>

        {/* Trade Log History Table */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Filter Bar */}
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5">
            <div className="flex items-center gap-1.5">
              {(['ALL', 'OPEN', 'CLOSED'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => onFilterChange(status)}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                    filterStatus === status
                      ? 'bg-slate-800 text-emerald-400 ring-1 ring-emerald-500/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
            <span className="text-xs text-slate-400">
              {filteredTrades.length} records
            </span>
          </div>

          {/* Table Container */}
          <div className="flex-1 overflow-y-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 border-b border-slate-800 bg-slate-950/90 text-slate-400">
                <tr>
                  <th className="py-2 pl-4 pr-2 font-medium">Symbol</th>
                  <th className="px-2 py-2 font-medium">Side</th>
                  <th className="px-2 py-2 font-medium">Entry</th>
                  <th className="px-2 py-2 font-medium">Qty</th>
                  <th className="px-2 py-2 font-medium">Status / Exit</th>
                  <th className="px-2 py-2 font-medium">Realized P&L</th>
                  <th className="px-2 py-2 font-medium">Tags</th>
                  <th className="py-2 pr-4 pl-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {filteredTrades.map((t) => {
                  const pnl = calculateTradeRealizedPnL(t);
                  const pnlPct = calculateTradePnLPercent(t);
                  const isPositive = (pnl ?? 0) >= 0;

                  return (
                    <tr
                      key={t.id}
                      className="transition hover:bg-slate-800/40"
                    >
                      <td className="py-2.5 pl-4 pr-2">
                        <button
                          type="button"
                          onClick={() => onSelectTicker(t.ticker)}
                          className="font-bold text-white hover:text-emerald-400 hover:underline"
                        >
                          {t.ticker}
                        </button>
                      </td>
                      <td className="px-2 py-2.5">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            t.side === 'BUY' || t.side === 'COVER'
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : 'bg-rose-500/15 text-rose-400'
                          }`}
                        >
                          {t.side}
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-slate-200">
                        ${t.entryPrice.toFixed(2)}
                      </td>
                      <td className="px-2 py-2.5 text-slate-300">
                        {t.quantity}
                      </td>
                      <td className="px-2 py-2.5">
                        {t.status === 'OPEN' ? (
                          closingTradeId === t.id ? (
                            <div className="flex items-center gap-1 font-sans">
                              <input
                                type="number"
                                step="0.01"
                                placeholder="Exit $"
                                value={exitPriceInput}
                                onChange={(e) => setExitPriceInput(e.target.value)}
                                className="w-20 rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 font-mono text-xs text-white focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => handleExecuteClose(t.id)}
                                className="rounded bg-emerald-500 px-1.5 py-0.5 text-[11px] font-bold text-slate-950 hover:bg-emerald-400"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => setClosingTradeId(null)}
                                className="rounded px-1 py-0.5 text-[11px] text-slate-400 hover:text-white"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setClosingTradeId(t.id);
                                setExitPriceInput(currentTickerPrice.toString());
                              }}
                              className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300 hover:bg-amber-500/20"
                            >
                              Close Position
                            </button>
                          )
                        ) : (
                          <span className="text-slate-300">
                            Closed @ ${t.exitPrice?.toFixed(2)}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2.5">
                        {pnl !== null ? (
                          <span
                            className={
                              isPositive ? 'text-emerald-400' : 'text-rose-400'
                            }
                          >
                            {isPositive ? '+' : ''}${pnl.toFixed(2)} (
                            {isPositive ? '+' : ''}
                            {pnlPct?.toFixed(1)}%)
                          </span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 font-sans">
                        {t.setupTags.map((tag) => (
                          <span
                            key={tag}
                            className="mr-1 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400"
                          >
                            {tag}
                          </span>
                        ))}
                      </td>
                      <td className="py-2.5 pr-4 pl-2 text-right">
                        <button
                          type="button"
                          title="Delete trade record"
                          onClick={() => onDeleteTrade(t.id)}
                          className="rounded p-1 text-slate-500 hover:bg-rose-500/15 hover:text-rose-400 transition"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {filteredTrades.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="py-12 text-center font-sans text-xs text-slate-500"
                    >
                      No trades match the selected filter. Log a new trade on the
                      left or click "Trade Marker" in the chart toolbar.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
