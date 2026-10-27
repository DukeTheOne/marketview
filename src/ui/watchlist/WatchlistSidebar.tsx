import { useRef, useState, type FormEvent } from 'react';
import {
  Check,
  FolderPlus,
  ListFilter,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import type { TickerQuote, TickerSearchResult } from '../../core/schemas/market';
import type { Watchlist } from '../../core/schemas/watchlist';

export interface WatchlistSidebarProps {
  watchlists: Watchlist[];
  activeWatchlistId: string;
  activeTicker: string;
  quotesByTicker: Record<string, TickerQuote>;
  onSelectWatchlist: (id: string) => void;
  onCreateWatchlist: (name: string) => Promise<void>;
  onRenameWatchlist: (id: string, newName: string) => Promise<void>;
  onDeleteWatchlist: (id: string) => Promise<void>;
  onAddTicker: (watchlistId: string, ticker: string) => Promise<void>;
  onRemoveTicker: (watchlistId: string, ticker: string) => Promise<void>;
  onSelectTicker: (ticker: string) => void;
  searchResults?: TickerSearchResult[];
  onSearchTickers?: (query: string) => Promise<TickerSearchResult[]>;
}

export function WatchlistSidebar({
  watchlists,
  activeWatchlistId,
  activeTicker,
  quotesByTicker,
  onSelectWatchlist,
  onCreateWatchlist,
  onRenameWatchlist,
  onDeleteWatchlist,
  onAddTicker,
  onRemoveTicker,
  onSelectTicker,
  searchResults,
  onSearchTickers,
}: WatchlistSidebarProps) {
  const [tickerInput, setTickerInput] = useState('');
  const [internalSearchResults, setInternalSearchResults] = useState<
    TickerSearchResult[]
  >([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const searchReqIdRef = useRef(0);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isCreatingList, setIsCreatingList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [isRenamingList, setIsRenamingList] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const activeWatchlist =
    watchlists.find((w) => w.id === activeWatchlistId) ?? watchlists[0];

  const handleTickerInputChange = (rawVal: string) => {
    const val = rawVal.toUpperCase();
    setTickerInput(val);

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }

    const trimmed = val.trim();
    if (trimmed.length < 1) {
      searchReqIdRef.current += 1;
      setInternalSearchResults([]);
      setIsDropdownOpen(false);
      return;
    }

    setIsDropdownOpen(true);
    if (onSearchTickers) {
      const reqId = ++searchReqIdRef.current;
      searchDebounceRef.current = setTimeout(() => {
        void onSearchTickers(trimmed)
          .then((results) => {
            if (reqId === searchReqIdRef.current) {
              setInternalSearchResults(results);
            }
          })
          .catch(() => {
            if (reqId === searchReqIdRef.current) {
              setInternalSearchResults([]);
            }
          });
      }, 220);
    }
  };

  const handleSelectSearchResult = async (item: TickerSearchResult) => {
    if (!activeWatchlist) {
      return;
    }
    const isAlreadyInWatchlist = activeWatchlist.tickers.includes(item.ticker);
    searchReqIdRef.current += 1;
    setIsDropdownOpen(false);
    setInternalSearchResults([]);
    setTickerInput('');
    setErrorMsg(null);

    if (isAlreadyInWatchlist) {
      onSelectTicker(item.ticker);
      return;
    }

    try {
      await onAddTicker(activeWatchlist.id, item.ticker);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Invalid ticker symbol');
    }
  };

  const handleAddTickerSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeWatchlist || !tickerInput.trim()) {
      return;
    }
    searchReqIdRef.current += 1;
    setIsDropdownOpen(false);
    setInternalSearchResults([]);
    setErrorMsg(null);
    try {
      await onAddTicker(activeWatchlist.id, tickerInput.trim());
      setTickerInput('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Invalid ticker symbol');
    }
  };

  const handleCreateWatchlistSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!newListName.trim()) {
      return;
    }
    setErrorMsg(null);
    try {
      await onCreateWatchlist(newListName.trim());
      setNewListName('');
      setIsCreatingList(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Invalid watchlist name');
    }
  };

  const handleRenameSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeWatchlist || !renameValue.trim()) {
      return;
    }
    setErrorMsg(null);
    try {
      await onRenameWatchlist(activeWatchlist.id, renameValue.trim());
      setIsRenamingList(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to rename');
    }
  };

  const effectiveSearchResults =
    internalSearchResults.length > 0
      ? internalSearchResults
      : (searchResults ?? []);
  const showAutocompleteDropdown =
    isDropdownOpen &&
    tickerInput.trim().length >= 1 &&
    effectiveSearchResults.length > 0;

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-r border-slate-800 bg-slate-900/70">
      {/* Watchlist Selector Header */}
      <div className="border-b border-slate-800 p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <ListFilter className="h-3.5 w-3.5 text-emerald-400" />
            <span>Watchlists ({watchlists.length})</span>
          </div>

          <div className="flex items-center gap-1">
            {activeWatchlist && (
              <button
                type="button"
                title="Rename active watchlist"
                onClick={() => {
                  setRenameValue(activeWatchlist.name);
                  setIsRenamingList((prev) => !prev);
                  setIsCreatingList(false);
                }}
                className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              title="Create new watchlist"
              onClick={() => {
                setIsCreatingList((prev) => !prev);
                setIsRenamingList(false);
              }}
              className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-emerald-400"
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </button>
            {watchlists.length > 1 && activeWatchlist && (
              <button
                type="button"
                title="Delete active watchlist"
                onClick={() => void onDeleteWatchlist(activeWatchlist.id)}
                className="rounded p-1 text-slate-400 hover:bg-rose-500/15 hover:text-rose-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Watchlist Dropdown */}
        <select
          aria-label="Select Watchlist"
          value={activeWatchlist?.id ?? ''}
          onChange={(e) => onSelectWatchlist(e.target.value)}
          className="w-full rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs font-medium text-slate-100 focus:border-emerald-500 focus:outline-none"
        >
          {watchlists.map((wl) => (
            <option key={wl.id} value={wl.id}>
              {wl.name} ({wl.tickers.length})
            </option>
          ))}
        </select>

        {/* Inline Create Watchlist Form */}
        {isCreatingList && (
          <form onSubmit={handleCreateWatchlistSubmit} className="mt-2 flex gap-1.5">
            <input
              type="text"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              placeholder="New watchlist name..."
              className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-md bg-emerald-500 px-2.5 py-1 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
            >
              Save
            </button>
          </form>
        )}

        {/* Inline Rename Watchlist Form */}
        {isRenamingList && (
          <form onSubmit={handleRenameSubmit} className="mt-2 flex gap-1.5">
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder="Rename watchlist..."
              className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-md bg-emerald-500 px-2.5 py-1 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
            >
              Update
            </button>
          </form>
        )}
      </div>

      {/* Add Ticker Input */}
      <form
        onSubmit={handleAddTickerSubmit}
        className="relative border-b border-slate-800 p-3"
      >
        <div className="flex gap-1.5">
          <input
            type="text"
            value={tickerInput}
            onChange={(e) => handleTickerInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setIsDropdownOpen(false);
              }
            }}
            placeholder="Add ticker (e.g. NVDA, NFLX)..."
            className="flex-1 rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 font-mono text-xs text-slate-100 placeholder:font-sans placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
          />
          <button
            type="submit"
            className="flex items-center gap-1 rounded-lg bg-emerald-500/15 px-2.5 py-1.5 text-xs font-semibold text-emerald-400 ring-1 ring-emerald-500/30 transition hover:bg-emerald-500 hover:text-slate-950"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add</span>
          </button>
        </div>

        {/* Live Ticker Search Autocomplete Dropdown */}
        {showAutocompleteDropdown && (
          <div
            data-testid="ticker-search-dropdown"
            className="absolute left-3 right-3 top-full z-30 mt-1 max-h-60 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 shadow-xl"
          >
            {effectiveSearchResults.map((item) => {
              const isAlreadyInWatchlist =
                activeWatchlist?.tickers.includes(item.ticker) ?? false;

              return (
                <button
                  key={item.ticker}
                  type="button"
                  data-testid={`ticker-search-option-${item.ticker}`}
                  onClick={() => void handleSelectSearchResult(item)}
                  className="flex w-full items-center justify-between gap-2 border-b border-slate-800/70 px-2.5 py-2 text-left transition last:border-b-0 hover:bg-slate-800"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-xs font-bold text-emerald-400 ring-1 ring-emerald-500/30">
                      {item.ticker}
                    </span>
                    <span className="truncate text-xs text-slate-200">
                      {item.name}
                    </span>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    {item.exchange && (
                      <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                        {item.exchange}
                      </span>
                    )}
                    {isAlreadyInWatchlist && (
                      <span className="flex items-center gap-0.5 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                        <Check className="h-3 w-3" />
                        <span>In list</span>
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {errorMsg && (
          <p className="mt-1.5 text-[11px] text-rose-400">{errorMsg}</p>
        )}
      </form>

      {/* Ticker Rows */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
        {activeWatchlist?.tickers.map((ticker) => {
          const quote = quotesByTicker[ticker];
          const isSelected = ticker === activeTicker;
          const isPositive = (quote?.change ?? 0) >= 0;

          return (
            <div
              key={ticker}
              onClick={() => onSelectTicker(ticker)}
              className={`group flex cursor-pointer items-center justify-between px-3.5 py-2.5 transition ${
                isSelected
                  ? 'bg-emerald-500/10 border-l-2 border-l-emerald-400'
                  : 'hover:bg-slate-800/50'
              }`}
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-slate-100">
                    {ticker}
                  </span>
                  {isSelected && (
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  )}
                </div>
                <span className="font-mono text-[11px] text-slate-500">
                  {quote
                    ? `O ${quote.open.toFixed(2)} · PC ${quote.previousClose.toFixed(2)}`
                    : 'Fetching quote...'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {quote && (
                  <div className="text-right">
                    <div className="font-mono text-xs font-semibold text-slate-100">
                      ${quote.price.toFixed(2)}
                    </div>
                    <div
                      className={`font-mono text-[11px] font-medium ${
                        isPositive ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {isPositive ? '+' : ''}
                      {quote.changePercent.toFixed(2)}%
                    </div>
                  </div>
                )}

                {activeWatchlist && (
                  <button
                    type="button"
                    title={`Remove ${ticker}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      void onRemoveTicker(activeWatchlist.id, ticker);
                    }}
                    className="opacity-0 group-hover:opacity-100 rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-rose-400 transition"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {activeWatchlist?.tickers.length === 0 && (
          <div className="p-6 text-center text-xs text-slate-500">
            No tickers in this watchlist yet. Add a symbol above to stream its
            OHLCV chart.
          </div>
        )}
      </div>
    </aside>
  );
}
