import { useState, type FormEvent } from 'react';
import {
  Bell,
  BellOff,
  BellRing,
  Plus,
  RotateCcw,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import type { AlertCondition, PriceAlert } from '../../core/schemas/alert';

export interface PriceAlertsPopoverProps {
  isOpen: boolean;
  activeTicker: string;
  currentPrice?: number;
  alerts: PriceAlert[];
  lastTriggeredAlertIds: string[];
  onClose: () => void;
  onCreateAlert: (input: {
    ticker: string;
    targetPrice: number;
    condition: AlertCondition;
    note?: string;
  }) => void;
  onDismissAlert: (id: string) => void;
  onRearmAlert: (id: string) => void;
  onDeleteAlert: (id: string) => void;
  onClearTriggeredBanner?: () => void;
}

function formatTimestamp(timestampSec: number): string {
  const d = new Date(timestampSec * 1000);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function PriceAlertsPopover({
  isOpen,
  activeTicker,
  currentPrice,
  alerts,
  lastTriggeredAlertIds,
  onClose,
  onCreateAlert,
  onDismissAlert,
  onRearmAlert,
  onDeleteAlert,
  onClearTriggeredBanner,
}: PriceAlertsPopoverProps) {
  const [targetPriceInput, setTargetPriceInput] = useState('');
  const [condition, setCondition] = useState<AlertCondition>('CROSSING_UP');
  const [noteInput, setNoteInput] = useState('');
  const [filterMode, setFilterMode] = useState<'ticker' | 'all'>('ticker');
  const [formError, setFormError] = useState<string | null>(null);

  if (!isOpen) {
    return null;
  }

  const normalizedActiveTicker = activeTicker.trim().toUpperCase();
  const tickerAlerts = alerts.filter(
    (a) => a.ticker === normalizedActiveTicker
  );
  const displayedAlerts = filterMode === 'ticker' ? tickerAlerts : alerts;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const priceNum = parseFloat(targetPriceInput);
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      setFormError('Please enter a valid positive target price.');
      return;
    }

    onCreateAlert({
      ticker: normalizedActiveTicker,
      targetPrice: priceNum,
      condition,
      note: noteInput.trim() ? noteInput.trim() : undefined,
    });

    setTargetPriceInput('');
    setNoteInput('');
  };

  return (
    <div
      data-testid="price-alerts-popover"
      className="absolute right-0 top-full mt-2 w-96 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-800 bg-slate-900 shadow-2xl z-50 overflow-hidden flex flex-col text-slate-100"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3 bg-slate-900/90">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-amber-400" />
          <h3 className="text-sm font-bold text-white">Price Alerts</h3>
          <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-300">
            {normalizedActiveTicker}
          </span>
          {typeof currentPrice === 'number' && (
            <span className="font-mono text-xs text-slate-400">
              ${currentPrice.toFixed(2)}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close alerts popover"
          className="rounded p-1 text-slate-400 transition hover:bg-slate-800 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Triggered Notification Banner inside Popover (if any) */}
      {lastTriggeredAlertIds.length > 0 && (
        <div className="flex items-center justify-between border-b border-amber-500/30 bg-amber-500/15 px-4 py-2 text-xs text-amber-300">
          <div className="flex items-center gap-1.5">
            <BellRing className="h-3.5 w-3.5 animate-pulse text-amber-400" />
            <span>
              {lastTriggeredAlertIds.length} alert{lastTriggeredAlertIds.length > 1 ? 's' : ''} triggered!
            </span>
          </div>
          {onClearTriggeredBanner && (
            <button
              type="button"
              onClick={onClearTriggeredBanner}
              className="text-[11px] underline underline-offset-2 transition hover:text-white"
            >
              Clear banner
            </button>
          )}
        </div>
      )}

      {/* Alert Creation Form */}
      <form onSubmit={handleSubmit} className="border-b border-slate-800 p-4 space-y-3 bg-slate-950/40">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-300">
            New Alert for <span className="font-mono text-amber-400">{normalizedActiveTicker}</span>
          </span>
          {currentPrice && (
            <button
              type="button"
              onClick={() => setTargetPriceInput(currentPrice.toFixed(2))}
              className="text-[11px] text-slate-400 hover:text-amber-300 underline underline-offset-2"
            >
              Use ${currentPrice.toFixed(2)}
            </button>
          )}
        </div>

        {/* Direction Selector */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            data-testid="condition-crossing-up"
            onClick={() => setCondition('CROSSING_UP')}
            className={`flex items-center justify-center gap-1.5 rounded-lg border py-1.5 text-xs font-medium transition ${
              condition === 'CROSSING_UP'
                ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300 font-semibold'
                : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200'
            }`}
          >
            <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
            <span>Crossing Above</span>
          </button>
          <button
            type="button"
            data-testid="condition-crossing-down"
            onClick={() => setCondition('CROSSING_DOWN')}
            className={`flex items-center justify-center gap-1.5 rounded-lg border py-1.5 text-xs font-medium transition ${
              condition === 'CROSSING_DOWN'
                ? 'border-rose-500 bg-rose-500/15 text-rose-300 font-semibold'
                : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200'
            }`}
          >
            <TrendingDown className="h-3.5 w-3.5 text-rose-400" />
            <span>Crossing Below</span>
          </button>
        </div>

        {/* Target Price and Note */}
        <div className="space-y-2">
          <div>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-xs text-slate-400">
                $
              </span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                data-testid="alert-target-price-input"
                placeholder={currentPrice ? currentPrice.toFixed(2) : 'Target Price'}
                value={targetPriceInput}
                onChange={(e) => setTargetPriceInput(e.target.value)}
                className="w-full rounded-lg border border-slate-800 bg-slate-950 pl-6 pr-3 py-1.5 font-mono text-xs text-white placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <input
              type="text"
              maxLength={120}
              data-testid="alert-note-input"
              placeholder="Note (optional, e.g. Breakout retest)"
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
            />
          </div>
        </div>

        {formError && (
          <p className="text-[11px] text-rose-400 font-medium">{formError}</p>
        )}

        <button
          type="submit"
          data-testid="create-alert-submit-btn"
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-amber-500 py-1.5 text-xs font-semibold text-slate-950 shadow transition hover:bg-amber-400"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Create Alert</span>
        </button>
      </form>

      {/* Filter Tabs & List Header */}
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2 bg-slate-900/60">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setFilterMode('ticker')}
            className={`rounded px-2 py-0.5 text-xs font-medium transition ${
              filterMode === 'ticker'
                ? 'bg-slate-800 text-amber-300 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {normalizedActiveTicker} ({tickerAlerts.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('all')}
            className={`rounded px-2 py-0.5 text-xs font-medium transition ${
              filterMode === 'all'
                ? 'bg-slate-800 text-amber-300 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All Alerts ({alerts.length})
          </button>
        </div>
      </div>

      {/* Alerts List */}
      <div className="max-h-64 overflow-y-auto divide-y divide-slate-800/60 p-2">
        {displayedAlerts.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500">
            {filterMode === 'ticker'
              ? `No alerts for ${normalizedActiveTicker}. Create one above.`
              : 'No alerts configured.'}
          </div>
        ) : (
          displayedAlerts.map((alert) => {
            const isTriggered = alert.status === 'TRIGGERED';
            const isDismissed = alert.status === 'DISMISSED';
            const isActive = alert.status === 'ACTIVE';
            const isUp = alert.condition === 'CROSSING_UP';

            return (
              <div
                key={alert.id}
                data-testid={`alert-item-${alert.id}`}
                className={`flex items-center justify-between rounded-lg p-2 transition ${
                  isTriggered
                    ? 'bg-amber-500/10 border border-amber-500/20'
                    : 'hover:bg-slate-800/40'
                }`}
              >
                <div className="space-y-1 pr-2">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs font-bold text-white">
                      {alert.ticker}
                    </span>
                    <span
                      className={`flex items-center gap-0.5 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                        isUp
                          ? 'bg-emerald-500/15 text-emerald-400'
                          : 'bg-rose-500/15 text-rose-400'
                      }`}
                    >
                      {isUp ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : (
                        <TrendingDown className="h-3 w-3" />
                      )}
                      <span>${alert.targetPrice.toFixed(2)}</span>
                    </span>

                    {/* Status Badge */}
                    <span
                      className={`rounded px-1.5 py-0.2 text-[10px] font-semibold ${
                        isActive
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : isTriggered
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {alert.status}
                    </span>
                  </div>

                  {alert.note && (
                    <p className="text-[11px] text-slate-400 italic truncate max-w-[220px]">
                      {alert.note}
                    </p>
                  )}

                  <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
                    <span>Created: {formatTimestamp(alert.createdAt)}</span>
                    {alert.triggeredAt && (
                      <span className="text-amber-400/80">
                        Triggered: {formatTimestamp(alert.triggeredAt)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Per-Alert Action Buttons */}
                <div className="flex items-center gap-1 shrink-0">
                  {isActive && (
                    <button
                      type="button"
                      data-testid={`dismiss-alert-${alert.id}`}
                      onClick={() => onDismissAlert(alert.id)}
                      title="Dismiss alert"
                      className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-amber-300 transition"
                    >
                      <BellOff className="h-3.5 w-3.5" />
                    </button>
                  )}

                  {(isTriggered || isDismissed) && (
                    <button
                      type="button"
                      data-testid={`rearm-alert-${alert.id}`}
                      onClick={() => onRearmAlert(alert.id)}
                      title="Re-arm alert"
                      className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-emerald-400 transition"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  )}

                  <button
                    type="button"
                    data-testid={`delete-alert-${alert.id}`}
                    onClick={() => onDeleteAlert(alert.id)}
                    title="Delete alert"
                    className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-rose-400 transition"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
