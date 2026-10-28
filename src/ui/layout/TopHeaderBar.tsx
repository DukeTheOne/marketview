import { useState } from 'react';
import {
  Activity,
  Bell,
  BellRing,
  BookOpen,
  ChevronDown,
  Database,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  X,
} from 'lucide-react';
import type { AlertCondition, PriceAlert } from '../../core/schemas/alert';
import type { TickerQuote, Timeframe } from '../../core/schemas/market';
import { PriceAlertsPopover } from '../alerts/PriceAlertsPopover';
import {
  ProviderSettingsPopover,
  type LivePollIntervalSec,
  type ProviderMode,
} from '../providers/ProviderSettingsPopover';
import { KeyboardShortcutsPopover } from '../shortcuts/KeyboardShortcutsPopover';

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

  // Milestone 3: Price Alerts props
  alerts?: PriceAlert[];
  lastTriggeredAlertIds?: string[];
  onCreateAlert?: (input: {
    ticker: string;
    targetPrice: number;
    condition: AlertCondition;
    note?: string;
  }) => void;
  onDismissAlert?: (id: string) => void;
  onRearmAlert?: (id: string) => void;
  onDeleteAlert?: (id: string) => void;
  onClearTriggeredBanner?: () => void;

  // Milestone 6: Live Provider Switcher & Auto-Polling props
  providerMode?: ProviderMode;
  finnhubApiKey?: string;
  pollIntervalSec?: LivePollIntervalSec;
  marketError?: string | null;
  onSelectProviderMode?: (mode: ProviderMode, finnhubKey?: string) => void;
  onChangePollInterval?: (seconds: LivePollIntervalSec) => void;

  // Mooers' Law UX: Collapsible Watchlist Sidebar
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;

  // Popover initial states (optional, for testing or pre-opened states)
  initialAlertsOpen?: boolean;
  initialProviderSettingsOpen?: boolean;
  initialShortcutsOpen?: boolean;
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
  alerts = [],
  lastTriggeredAlertIds = [],
  onCreateAlert,
  onDismissAlert,
  onRearmAlert,
  onDeleteAlert,
  onClearTriggeredBanner,
  providerMode = 'yahoo',
  finnhubApiKey = '',
  pollIntervalSec = 0,
  marketError = null,
  onSelectProviderMode,
  onChangePollInterval,
  isSidebarCollapsed = false,
  onToggleSidebar,
  initialAlertsOpen = false,
  initialProviderSettingsOpen = false,
  initialShortcutsOpen = false,
}: TopHeaderBarProps) {
  const [isAlertsOpen, setIsAlertsOpen] = useState(initialAlertsOpen);
  const [isProviderSettingsOpen, setIsProviderSettingsOpen] = useState(
    initialProviderSettingsOpen
  );
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(initialShortcutsOpen);
  const isPositive = (quote?.change ?? 0) >= 0;

  const isAnyPopoverOpen =
    isAlertsOpen || isProviderSettingsOpen || isShortcutsOpen;

  const activeAlertCount = alerts.filter((a) => a.status === 'ACTIVE').length;
  const hasTriggered = lastTriggeredAlertIds.length > 0;
  const triggeredAlerts = alerts.filter((a) =>
    lastTriggeredAlertIds.includes(a.id)
  );
  const isLivePolling = pollIntervalSec > 0;

  return (
    <>
      {isAnyPopoverOpen && (
        <div
          data-testid="popover-backdrop"
          className="fixed inset-0 z-40 bg-transparent"
          onClick={() => {
            setIsAlertsOpen(false);
            setIsProviderSettingsOpen(false);
            setIsShortcutsOpen(false);
          }}
        />
      )}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900/90 px-4">
        <div className="flex items-center gap-5">
          {onToggleSidebar && (
            <button
              type="button"
              data-testid="toggle-sidebar-btn"
              onClick={onToggleSidebar}
              title="Toggle Watchlist Sidebar (b)"
              className={`flex h-8 w-8 items-center justify-center rounded-lg border transition ${
                isSidebarCollapsed
                  ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400'
                  : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700 hover:text-white'
              }`}
            >
              {isSidebarCollapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </button>
          )}

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
                  LIVE M1-M6
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

        {/* Timeframe Switcher, Journal Drawer Toggle, Alerts, Auto-Poll & Provider Switcher */}
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

          {/* Price Alerts Toggle Button & Popover */}
          <div className="relative z-50">
            <button
              type="button"
              data-testid="alerts-toggle-btn"
              onClick={() => {
                setIsAlertsOpen((prev) => !prev);
                setIsProviderSettingsOpen(false);
                setIsShortcutsOpen(false);
              }}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                isAlertsOpen
                  ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                  : hasTriggered
                  ? 'border-amber-500/60 bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/40'
                  : 'border-slate-800 bg-slate-950 text-slate-300 hover:border-slate-700 hover:text-white'
              }`}
            >
              {hasTriggered ? (
                <BellRing className="h-3.5 w-3.5 text-amber-400 animate-pulse" />
              ) : (
                <Bell className="h-3.5 w-3.5 text-amber-400" />
              )}
              <span>Alerts</span>
              {activeAlertCount > 0 && (
                <span className="rounded-full bg-slate-800 px-1.5 py-0.2 font-mono text-[10px] text-slate-300">
                  {activeAlertCount}
                </span>
              )}
              {hasTriggered && (
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
                </span>
              )}
            </button>

            <PriceAlertsPopover
              isOpen={isAlertsOpen}
              activeTicker={activeTicker}
              currentPrice={quote?.price}
              alerts={alerts}
              lastTriggeredAlertIds={lastTriggeredAlertIds}
              onClose={() => setIsAlertsOpen(false)}
              onCreateAlert={onCreateAlert ?? (() => {})}
              onDismissAlert={onDismissAlert ?? (() => {})}
              onRearmAlert={onRearmAlert ?? (() => {})}
              onDeleteAlert={onDeleteAlert ?? (() => {})}
              onClearTriggeredBanner={onClearTriggeredBanner}
            />
          </div>

          {/* Quick Live Auto-Poll Toggle Pill */}
          <button
            type="button"
            data-testid="live-poll-toggle-btn"
            onClick={() =>
              onChangePollInterval?.(isLivePolling ? 0 : 15)
            }
            title={
              isLivePolling
                ? `Auto-polling every ${pollIntervalSec}s (click to pause)`
                : 'Auto-polling paused (click to enable 15s live stream)'
            }
            className={`hidden items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-[11px] font-semibold transition sm:flex ${
              isLivePolling
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700 hover:text-slate-200'
            }`}
          >
            {isLivePolling ? (
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
            ) : (
              <span className="inline-flex h-2 w-2 rounded-full bg-slate-600" />
            )}
            <span>{isLivePolling ? `LIVE ${pollIntervalSec}s` : 'PAUSED'}</span>
          </button>

          {/* Clickable Provider Badge & Settings Popover */}
          <div className="relative z-50">
            <button
              type="button"
              data-testid="provider-settings-btn"
              onClick={() => {
                setIsProviderSettingsOpen((prev) => !prev);
                setIsAlertsOpen(false);
                setIsShortcutsOpen(false);
              }}
              title="Configure Market Data Source & Live Polling"
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition ${
                isProviderSettingsOpen
                  ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
                  : marketError
                  ? 'border-rose-500/50 bg-rose-500/10 text-rose-300'
                  : 'border-slate-800 bg-slate-950 text-slate-300 hover:border-slate-700 hover:text-white'
              }`}
            >
              <Database className="h-3.5 w-3.5 text-emerald-400" />
              <span className="font-mono">{providerId}</span>
              <ChevronDown className="h-3 w-3 text-slate-500" />
            </button>

            <ProviderSettingsPopover
              isOpen={isProviderSettingsOpen}
              providerMode={providerMode}
              providerId={providerId}
              finnhubApiKey={finnhubApiKey}
              pollIntervalSec={pollIntervalSec}
              lastUpdatedTimestamp={quote?.timestamp}
              error={marketError}
              onClose={() => setIsProviderSettingsOpen(false)}
              onSelectProviderMode={onSelectProviderMode ?? (() => {})}
              onChangePollInterval={onChangePollInterval ?? (() => {})}
            />
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

          {/* Keyboard Shortcuts Help Button & Popover */}
          <div className="relative z-50">
            <button
              type="button"
              data-testid="shortcuts-help-btn"
              onClick={() => {
                setIsShortcutsOpen((prev) => !prev);
                setIsAlertsOpen(false);
                setIsProviderSettingsOpen(false);
              }}
              title="Keyboard Shortcuts (?)"
              className={`flex h-8 w-8 items-center justify-center rounded-lg border font-mono text-xs font-bold transition ${
                isShortcutsOpen
                  ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
                  : 'border-slate-800 bg-slate-950 text-slate-300 hover:border-slate-700 hover:text-white'
              }`}
            >
              ?
            </button>

            <KeyboardShortcutsPopover
              isOpen={isShortcutsOpen}
              onClose={() => setIsShortcutsOpen(false)}
            />
          </div>
        </div>
      </header>

      {/* Triggered Alert Notification Banner */}
      {hasTriggered && (
        <div
          data-testid="triggered-alert-banner"
          className="flex items-center justify-between border-b border-amber-500/40 bg-amber-500/15 px-4 py-2 text-xs text-amber-200 shadow-sm"
        >
          <div className="flex items-center gap-2">
            <BellRing className="h-4 w-4 shrink-0 text-amber-400 animate-pulse" />
            <span className="font-semibold text-amber-300">
              Price Alert Triggered:
            </span>
            <span className="font-medium text-amber-100">
              {triggeredAlerts.length > 0
                ? triggeredAlerts
                    .map(
                      (a) =>
                        `${a.ticker} crossed ${
                          a.condition === 'CROSSING_UP' ? 'above' : 'below'
                        } $${a.targetPrice.toFixed(2)}${
                          a.note ? ` ("${a.note}")` : ''
                        }`
                    )
                    .join(' · ')
                : `${lastTriggeredAlertIds.length} alert(s) triggered`}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              data-testid="banner-view-alerts-btn"
              onClick={() => setIsAlertsOpen(true)}
              className="rounded bg-amber-500/20 px-2 py-0.5 font-semibold text-amber-300 transition hover:bg-amber-500/30 hover:text-white"
            >
              View
            </button>
            {onClearTriggeredBanner && (
              <button
                type="button"
                data-testid="banner-dismiss-btn"
                onClick={onClearTriggeredBanner}
                title="Dismiss notification"
                className="rounded p-0.5 text-amber-300/80 transition hover:bg-amber-500/20 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
