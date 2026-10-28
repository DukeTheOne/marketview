import { Keyboard, X } from 'lucide-react';

export interface KeyboardShortcutsPopoverProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutItem {
  keys: string[];
  description: string;
}

interface ShortcutCategory {
  title: string;
  items: ShortcutItem[];
}

const SHORTCUT_CATEGORIES: ShortcutCategory[] = [
  {
    title: 'Navigation & Watchlist',
    items: [
      { keys: ['/'], description: 'Focus ticker search input' },
      { keys: ['b'], description: 'Toggle Watchlist sidebar (Zen chart mode)' },
      {
        keys: ['1', '2', '3', '4'],
        description: 'Switch timeframe (15m, 1h, 1D, 1W)',
      },
    ],
  },
  {
    title: 'Chart Drawing & Overlays',
    items: [
      { keys: ['s'], description: 'Sticker Note tool' },
      { keys: ['t'], description: 'Trendline tool' },
      { keys: ['f'], description: 'Fibonacci Retracement tool' },
      { keys: ['m'], description: 'Trade Execution Marker tool' },
      { keys: ['Del', '⌫'], description: 'Delete selected chart annotation' },
      {
        keys: ['Esc'],
        description: 'Cancel active tool / Deselect / Close drawers',
      },
    ],
  },
  {
    title: 'Journal & Alerts',
    items: [
      { keys: ['j'], description: 'Toggle Trade Journal & Analytics drawer' },
    ],
  },
];

export function KeyboardShortcutsPopover({
  isOpen,
  onClose,
}: KeyboardShortcutsPopoverProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      data-testid="keyboard-shortcuts-popover"
      className="absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border border-slate-700 bg-slate-900/95 p-3.5 shadow-2xl backdrop-blur-md"
    >
      {/* Header */}
      <div className="mb-3 flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center gap-2">
          <Keyboard className="h-4 w-4 text-emerald-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
            Keyboard Shortcuts
          </span>
        </div>
        <button
          type="button"
          data-testid="close-shortcuts-popover-btn"
          onClick={onClose}
          title="Close Keyboard Shortcuts"
          className="rounded p-1 text-slate-400 transition hover:bg-slate-800 hover:text-white"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Categories */}
      <div className="space-y-3">
        {SHORTCUT_CATEGORIES.map((category) => (
          <div key={category.title}>
            <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400/90">
              {category.title}
            </h4>
            <div className="space-y-1">
              {category.items.map((item) => (
                <div
                  key={item.description}
                  className="flex items-center justify-between gap-2 rounded-md bg-slate-950/60 px-2 py-1 text-xs"
                >
                  <span className="text-slate-300">{item.description}</span>
                  <div className="flex shrink-0 items-center gap-1">
                    {item.keys.map((key) => (
                      <kbd
                        key={key}
                        className="rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-200 shadow-inner"
                      >
                        {key}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 border-t border-slate-800 pt-2 text-[10px] text-slate-500">
        Mooers&apos; Law UX: Low-friction single-key navigation &amp; drawing
      </div>
    </div>
  );
}
