import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { KeyboardShortcutsPopover } from '../../ui/shortcuts/KeyboardShortcutsPopover';
import { TopHeaderBar } from '../../ui/layout/TopHeaderBar';
import { WatchlistSidebar } from '../../ui/watchlist/WatchlistSidebar';
import type { TickerQuote } from '../../core/schemas/market';
import type { Watchlist } from '../../core/schemas/watchlist';

const SAMPLE_QUOTE: TickerQuote = {
  ticker: 'AAPL',
  price: 192.45,
  change: 2.15,
  changePercent: 1.13,
  high: 193.8,
  low: 190.1,
  open: 190.5,
  previousClose: 190.3,
  timestamp: 1711929600,
};

const SAMPLE_WATCHLIST: Watchlist = {
  id: 'wl-main',
  name: 'Tech Leaders',
  tickers: ['AAPL', 'NVDA'],
  createdAt: 1711900000,
  updatedAt: 1711929600,
};

describe("Mooers' Law UX & Keyboard Shortcuts Suite", () => {
  describe('KeyboardShortcutsPopover', () => {
    it('renders nothing when isOpen is false', () => {
      const html = renderToStaticMarkup(
        React.createElement(KeyboardShortcutsPopover, {
          isOpen: false,
          onClose: vi.fn(),
        })
      );
      expect(html).toBe('');
    });

    it('renders all shortcut categories and hotkey descriptions when isOpen is true', () => {
      const html = renderToStaticMarkup(
        React.createElement(KeyboardShortcutsPopover, {
          isOpen: true,
          onClose: vi.fn(),
        })
      );

      expect(html).toContain('data-testid="keyboard-shortcuts-popover"');
      expect(html).toContain('data-testid="close-shortcuts-popover-btn"');

      // Categories
      expect(html).toContain('Navigation &amp; Watchlist');
      expect(html).toContain('Chart Drawing &amp; Overlays');
      expect(html).toContain('Journal &amp; Alerts');

      // Navigation & Watchlist hotkeys
      expect(html).toContain('Focus ticker search input');
      expect(html).toContain('Toggle Watchlist sidebar (Zen chart mode)');
      expect(html).toContain('Switch timeframe (15m, 1h, 1D, 1W)');

      // Chart Drawing & Overlays hotkeys
      expect(html).toContain('Sticker Note tool');
      expect(html).toContain('Trendline tool');
      expect(html).toContain('Fibonacci Retracement tool');
      expect(html).toContain('Trade Execution Marker tool');
      expect(html).toContain('Delete selected chart annotation');
      expect(html).toContain('Cancel active tool / Deselect / Close drawers');

      // Journal & Alerts hotkeys
      expect(html).toContain('Toggle Trade Journal &amp; Analytics drawer');
    });
  });

  describe('TopHeaderBar shortcuts & sidebar toggle integration', () => {
    it('renders shortcuts-help-btn by default and omits toggle-sidebar-btn when onToggleSidebar is not provided', () => {
      const html = renderToStaticMarkup(
        React.createElement(TopHeaderBar, {
          activeTicker: 'AAPL',
          activeTimeframe: '1D',
          quote: SAMPLE_QUOTE,
          providerId: 'yahoo-finance-live',
          isLoading: false,
          isJournalOpen: false,
          tradeCount: 3,
          onSelectTimeframe: vi.fn(),
          onRefresh: vi.fn(),
          onToggleJournal: vi.fn(),
        })
      );

      expect(html).toContain('data-testid="shortcuts-help-btn"');
      expect(html).toContain('title="Keyboard Shortcuts (?)"');
      expect(html).not.toContain('data-testid="toggle-sidebar-btn"');
      // Popover starts closed
      expect(html).not.toContain('data-testid="keyboard-shortcuts-popover"');
    });

    it('renders toggle-sidebar-btn when onToggleSidebar is provided in both expanded and collapsed states', () => {
      const expandedHtml = renderToStaticMarkup(
        React.createElement(TopHeaderBar, {
          activeTicker: 'AAPL',
          activeTimeframe: '1D',
          quote: SAMPLE_QUOTE,
          providerId: 'yahoo-finance-live',
          isLoading: false,
          isJournalOpen: false,
          tradeCount: 0,
          onSelectTimeframe: vi.fn(),
          onRefresh: vi.fn(),
          onToggleJournal: vi.fn(),
          isSidebarCollapsed: false,
          onToggleSidebar: vi.fn(),
        })
      );

      expect(expandedHtml).toContain('data-testid="toggle-sidebar-btn"');
      expect(expandedHtml).toContain('title="Toggle Watchlist Sidebar (b)"');

      const collapsedHtml = renderToStaticMarkup(
        React.createElement(TopHeaderBar, {
          activeTicker: 'AAPL',
          activeTimeframe: '1D',
          quote: SAMPLE_QUOTE,
          providerId: 'yahoo-finance-live',
          isLoading: false,
          isJournalOpen: false,
          tradeCount: 0,
          onSelectTimeframe: vi.fn(),
          onRefresh: vi.fn(),
          onToggleJournal: vi.fn(),
          isSidebarCollapsed: true,
          onToggleSidebar: vi.fn(),
        })
      );

      expect(collapsedHtml).toContain('data-testid="toggle-sidebar-btn"');
      expect(collapsedHtml).toContain('border-emerald-500/40');
    });
  });

  describe('TopHeaderBar popovers click-outside backdrop dismissal', () => {
    const baseProps = {
      activeTicker: 'AAPL',
      activeTimeframe: '1D' as const,
      quote: SAMPLE_QUOTE,
      providerId: 'yahoo-finance-live',
      isLoading: false,
      isJournalOpen: false,
      tradeCount: 0,
      onSelectTimeframe: vi.fn(),
      onRefresh: vi.fn(),
      onToggleJournal: vi.fn(),
    };

    it('does not render popover-backdrop when all popovers are closed', () => {
      const html = renderToStaticMarkup(
        React.createElement(TopHeaderBar, baseProps)
      );

      expect(html).not.toContain('data-testid="popover-backdrop"');
      expect(html).not.toContain('data-testid="price-alerts-popover"');
      expect(html).not.toContain('data-testid="provider-settings-popover"');
      expect(html).not.toContain('data-testid="keyboard-shortcuts-popover"');
    });

    it('renders fixed z-40 backdrop and popover when Alerts is open', () => {
      const html = renderToStaticMarkup(
        React.createElement(TopHeaderBar, {
          ...baseProps,
          initialAlertsOpen: true,
        })
      );

      expect(html).toContain('data-testid="popover-backdrop"');
      expect(html).toContain('fixed inset-0 z-40 bg-transparent');
      expect(html).toContain('data-testid="price-alerts-popover"');
    });

    it('renders fixed z-40 backdrop when Provider Settings is open', () => {
      const html = renderToStaticMarkup(
        React.createElement(TopHeaderBar, {
          ...baseProps,
          initialProviderSettingsOpen: true,
        })
      );

      expect(html).toContain('data-testid="popover-backdrop"');
      expect(html).toContain('fixed inset-0 z-40 bg-transparent');
      expect(html).toContain('data-testid="provider-settings-popover"');
    });

    it('renders fixed z-40 backdrop when Keyboard Shortcuts is open', () => {
      const html = renderToStaticMarkup(
        React.createElement(TopHeaderBar, {
          ...baseProps,
          initialShortcutsOpen: true,
        })
      );

      expect(html).toContain('data-testid="popover-backdrop"');
      expect(html).toContain('fixed inset-0 z-40 bg-transparent');
      expect(html).toContain('data-testid="keyboard-shortcuts-popover"');
    });

    it('ensures popover wrapper elements have relative z-50 styling to stay above backdrop', () => {
      const html = renderToStaticMarkup(
        React.createElement(TopHeaderBar, {
          ...baseProps,
          initialAlertsOpen: true,
        })
      );

      // Verify that popover wrapper has relative z-50
      expect(html).toContain('relative z-50');
      // Count that relative z-50 is present for the popover wrappers
      const z50Count = (html.match(/relative z-50/g) || []).length;
      expect(z50Count).toBeGreaterThanOrEqual(3);
    });

    it('clicking the backdrop closes all open popovers', () => {
      const setAlertsMock = vi.fn();
      const setProviderMock = vi.fn();
      const setShortcutsMock = vi.fn();

      const internals = (React as any)
        .__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
      const prevH = internals?.H;

      let hookIndex = 0;
      if (internals) {
        internals.H = {
          useState: (initialValue: unknown) => {
            hookIndex++;
            if (hookIndex === 1) return [true, setAlertsMock]; // isAlertsOpen
            if (hookIndex === 2) return [false, setProviderMock]; // isProviderSettingsOpen
            if (hookIndex === 3) return [false, setShortcutsMock]; // isShortcutsOpen
            return [initialValue, vi.fn()];
          },
        };
      }

      try {
        const elementTree = TopHeaderBar(baseProps);

        const children = React.Children.toArray(elementTree.props.children);
        const backdrop = children.find(
          (child: any) =>
            React.isValidElement(child) &&
            child.props &&
            (child.props as any)['data-testid'] === 'popover-backdrop'
        ) as React.ReactElement<any> | undefined;

        expect(backdrop).toBeDefined();
        expect(backdrop?.props.className).toBe('fixed inset-0 z-40 bg-transparent');

        // Simulate user clicking on backdrop
        backdrop?.props.onClick();

        expect(setAlertsMock).toHaveBeenCalledWith(false);
        expect(setProviderMock).toHaveBeenCalledWith(false);
        expect(setShortcutsMock).toHaveBeenCalledWith(false);
      } finally {
        if (internals) {
          internals.H = prevH;
        }
      }
    });
  });

  describe('WatchlistSidebar collapsible Zen mode & search shortcut attribute', () => {
    it('renders expanded sidebar with data-shortcut-search="true" on the ticker input', () => {
      const html = renderToStaticMarkup(
        React.createElement(WatchlistSidebar, {
          watchlists: [SAMPLE_WATCHLIST],
          activeWatchlistId: SAMPLE_WATCHLIST.id,
          activeTicker: 'AAPL',
          quotesByTicker: { AAPL: SAMPLE_QUOTE },
          onSelectWatchlist: vi.fn(),
          onCreateWatchlist: vi.fn(),
          onRenameWatchlist: vi.fn(),
          onDeleteWatchlist: vi.fn(),
          onAddTicker: vi.fn(),
          onRemoveTicker: vi.fn(),
          onSelectTicker: vi.fn(),
          isCollapsed: false,
        })
      );

      expect(html).toContain('data-shortcut-search="true"');
      expect(html).toContain('Add ticker (e.g. NVDA, NFLX)...');
      expect(html).toContain('Tech Leaders');
      expect(html).toContain('AAPL');
    });

    it('returns empty markup (null) when isCollapsed is true for Zen chart mode', () => {
      const html = renderToStaticMarkup(
        React.createElement(WatchlistSidebar, {
          watchlists: [SAMPLE_WATCHLIST],
          activeWatchlistId: SAMPLE_WATCHLIST.id,
          activeTicker: 'AAPL',
          quotesByTicker: { AAPL: SAMPLE_QUOTE },
          onSelectWatchlist: vi.fn(),
          onCreateWatchlist: vi.fn(),
          onRenameWatchlist: vi.fn(),
          onDeleteWatchlist: vi.fn(),
          onAddTicker: vi.fn(),
          onRemoveTicker: vi.fn(),
          onSelectTicker: vi.fn(),
          isCollapsed: true,
        })
      );

      expect(html).toBe('');
    });
  });
});
