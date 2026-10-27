import { useEffect, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  Check,
  Cpu,
  Database,
  Globe,
  KeyRound,
  Radio,
  X,
} from 'lucide-react';

export type ProviderMode = 'yahoo' | 'finnhub' | 'demo';
export type LivePollIntervalSec = 0 | 5 | 15 | 30;

const POLL_INTERVAL_OPTIONS: LivePollIntervalSec[] = [0, 5, 15, 30];

export interface ProviderSettingsPopoverProps {
  isOpen: boolean;
  providerMode: ProviderMode;
  providerId: string;
  finnhubApiKey: string;
  pollIntervalSec: LivePollIntervalSec;
  lastUpdatedTimestamp?: number;
  error?: string | null;
  onClose: () => void;
  onSelectProviderMode: (mode: ProviderMode, finnhubKey?: string) => void;
  onChangePollInterval: (seconds: LivePollIntervalSec) => void;
}

function formatTime(timestampSec: number): string {
  const d = new Date(timestampSec * 1000);
  return d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function ProviderSettingsPopover({
  isOpen,
  providerMode,
  providerId,
  finnhubApiKey,
  pollIntervalSec,
  lastUpdatedTimestamp,
  error,
  onClose,
  onSelectProviderMode,
  onChangePollInterval,
}: ProviderSettingsPopoverProps) {
  const [keyInput, setKeyInput] = useState(finnhubApiKey);

  useEffect(() => {
    setKeyInput(finnhubApiKey);
  }, [finnhubApiKey]);

  if (!isOpen) {
    return null;
  }

  const handleFinnhubApply = (e: FormEvent) => {
    e.preventDefault();
    onSelectProviderMode('finnhub', keyInput.trim());
  };

  return (
    <div
      data-testid="provider-settings-popover"
      className="absolute right-0 top-full mt-2 w-96 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-800 bg-slate-900 shadow-2xl z-50 overflow-hidden flex flex-col text-slate-100"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3 bg-slate-900/90">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-emerald-400" />
          <h3 className="text-sm font-bold text-white">Market Data Source</h3>
          <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-400">
            {providerId}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close provider settings popover"
          className="rounded p-1 text-slate-400 transition hover:bg-slate-800 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Error Banner (if any) */}
      {error && (
        <div
          data-testid="provider-error-banner"
          className="flex items-start gap-2 border-b border-rose-500/30 bg-rose-500/15 px-4 py-2.5 text-xs text-rose-300"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-semibold text-rose-200">Provider Notice:</span>{' '}
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Provider Mode Selector */}
      <div className="p-4 space-y-2.5 border-b border-slate-800 bg-slate-950/40">
        <div className="text-xs font-semibold text-slate-300">
          Select Adapter Mode
        </div>

        {/* Option 1: Yahoo Finance */}
        <button
          type="button"
          data-testid="provider-mode-yahoo"
          onClick={() => onSelectProviderMode('yahoo')}
          className={`w-full text-left rounded-lg border p-3 transition ${
            providerMode === 'yahoo'
              ? 'border-emerald-500 bg-emerald-500/10 text-white'
              : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700 hover:text-white'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-emerald-400" />
              <span className="text-xs font-bold">
                Yahoo Finance (Live · Zero Key)
              </span>
            </div>
            {providerMode === 'yahoo' && (
              <Check className="h-4 w-4 text-emerald-400" />
            )}
          </div>
          <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">
            Real-world US equity quotes &amp; OHLCV candles via{' '}
            <code className="font-mono text-slate-300">/api/yahoo</code> with
            automatic offline fallback.
          </p>
        </button>

        {/* Option 2: Finnhub REST API */}
        <div
          className={`rounded-lg border p-3 transition ${
            providerMode === 'finnhub'
              ? 'border-emerald-500 bg-emerald-500/10 text-white'
              : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700'
          }`}
        >
          <button
            type="button"
            data-testid="provider-mode-finnhub"
            onClick={() => onSelectProviderMode('finnhub', keyInput.trim())}
            className="w-full text-left"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-amber-400" />
                <span className="text-xs font-bold">
                  Finnhub REST API (Live Key + Yahoo Candle Hybrid)
                </span>
              </div>
              {providerMode === 'finnhub' && (
                <Check className="h-4 w-4 text-emerald-400" />
              )}
            </div>
            <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">
              Direct Finnhub real-time quote endpoint paired with live candle
              history.
            </p>
          </button>

          <form onSubmit={handleFinnhubApply} className="mt-2.5 flex gap-2">
            <input
              type="password"
              data-testid="finnhub-api-key-input"
              placeholder="Enter Finnhub API key..."
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              className="flex-1 rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 font-mono text-xs text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
            />
            <button
              type="submit"
              data-testid="finnhub-apply-btn"
              className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400"
            >
              Apply
            </button>
          </form>
        </div>

        {/* Option 3: Deterministic Demo Engine */}
        <button
          type="button"
          data-testid="provider-mode-demo"
          onClick={() => onSelectProviderMode('demo')}
          className={`w-full text-left rounded-lg border p-3 transition ${
            providerMode === 'demo'
              ? 'border-emerald-500 bg-emerald-500/10 text-white'
              : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700 hover:text-white'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-sky-400" />
              <span className="text-xs font-bold">
                Deterministic Demo Engine (Offline)
              </span>
            </div>
            {providerMode === 'demo' && (
              <Check className="h-4 w-4 text-emerald-400" />
            )}
          </div>
          <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">
            Seeded synthetic market generator for offline testing.
          </p>
        </button>
      </div>

      {/* Real-Time Auto-Polling Controls */}
      <div className="p-4 space-y-2.5 bg-slate-900/80">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Radio
              className={`h-3.5 w-3.5 ${
                pollIntervalSec > 0
                  ? 'text-emerald-400 animate-pulse'
                  : 'text-slate-500'
              }`}
            />
            <span className="text-xs font-semibold text-slate-200">
              Live Stream Auto-Polling
            </span>
          </div>
          <span className="font-mono text-[11px] text-slate-400">
            {pollIntervalSec > 0 ? `Every ${pollIntervalSec}s` : 'Paused'}
          </span>
        </div>

        <div className="grid grid-cols-4 gap-1.5">
          {POLL_INTERVAL_OPTIONS.map((sec) => {
            const active = pollIntervalSec === sec;
            return (
              <button
                key={sec}
                type="button"
                data-testid={`poll-interval-btn-${sec}`}
                onClick={() => onChangePollInterval(sec)}
                className={`rounded-lg border py-1.5 font-mono text-xs font-semibold transition ${
                  active
                    ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
                    : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                {sec === 0 ? 'Off' : `${sec}s`}
              </button>
            );
          })}
        </div>

        {/* Footer metadata */}
        <div className="flex items-center justify-between pt-1 text-[10px] font-mono text-slate-500">
          <span>Active ID: {providerId}</span>
          {typeof lastUpdatedTimestamp === 'number' && (
            <span>Last tick: {formatTime(lastUpdatedTimestamp)}</span>
          )}
        </div>
      </div>
    </div>
  );
}
