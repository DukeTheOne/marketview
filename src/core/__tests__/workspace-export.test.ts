import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  TRADE_CSV_HEADERS,
  WorkspaceBackupSchema,
  exportTradesToCsv,
  parseTradesFromCsv,
  parseWorkspaceBackup,
  serializeWorkspaceBackup,
} from '../serialization/workspaceExport';
import { calculateJournalSummary, type TradeEntry } from '../schemas/trade';
import type { Watchlist } from '../schemas/watchlist';
import type { ChartAnnotation } from '../schemas/annotation';
import type { PriceAlert } from '../schemas/alert';
import { TradeJournalDrawer } from '../../features/journal/TradeJournalDrawer';

const SAMPLE_ALERTS: PriceAlert[] = [
  {
    id: 'alert-nvda-140',
    ticker: 'NVDA',
    condition: 'CROSSING_UP',
    targetPrice: 140.0,
    status: 'ACTIVE',
    note: 'Breakout above key level',
    createdAt: 1710000000,
  },
];

const SAMPLE_WATCHLISTS: Watchlist[] = [
  {
    id: 'wl-core',
    name: 'Core Leaders',
    tickers: ['NVDA', 'AAPL', 'MSFT'],
    createdAt: 1710000000,
    updatedAt: 1710000000,
  },
];

const SAMPLE_ANNOTATIONS: ChartAnnotation[] = [
  {
    id: 'ann-trend-1',
    ticker: 'NVDA',
    type: 'trendline',
    anchors: [
      { timestamp: 1710000000, price: 118.5 },
      { timestamp: 1710086400, price: 126.25 },
    ],
    payload: { label: 'Primary Uptrend', color: '#10b981' },
    createdAt: 1710000000,
    updatedAt: 1710086400,
  },
];

const SAMPLE_TRADES: TradeEntry[] = [
  {
    id: 'trade-closed-1',
    ticker: 'NVDA',
    side: 'BUY',
    status: 'CLOSED',
    entryPrice: 120.5,
    exitPrice: 135.5,
    quantity: 100,
    entryTimestamp: 1710000000,
    exitTimestamp: 1710086400,
    stopLossPrice: 115.0,
    takeProfitPrice: 140.0,
    setupTags: ['Breakout', 'Momentum'],
    notesMarkdown: 'Clean breakout above "key resistance", volume +180%\nHeld runner into close.',
    createdAt: 1710000000,
    updatedAt: 1710086400,
  },
  {
    id: 'trade-open-2',
    ticker: 'AAPL',
    side: 'SHORT',
    status: 'OPEN',
    entryPrice: 210.0,
    quantity: 50,
    entryTimestamp: 1710100000,
    stopLossPrice: 215.0,
    setupTags: ['Reversal'],
    notesMarkdown: 'Failed breakout at supply zone, tight risk.',
    createdAt: 1710100000,
    updatedAt: 1710100000,
  },
];

describe('workspaceExport — Headless Workspace Backup & Trade CSV Serialization', () => {
  describe('WorkspaceBackup JSON Serialization & Parsing', () => {
    it('round-trips a full workspace backup with watchlists, annotations, trades, and alerts', () => {
      const json = serializeWorkspaceBackup({
        exportedAt: 1710200000,
        watchlists: SAMPLE_WATCHLISTS,
        annotations: SAMPLE_ANNOTATIONS,
        trades: SAMPLE_TRADES,
        alerts: SAMPLE_ALERTS,
      });

      const parsed = parseWorkspaceBackup(json);
      expect(parsed.version).toBe(1);
      expect(parsed.exportedAt).toBe(1710200000);
      expect(parsed.watchlists).toEqual(SAMPLE_WATCHLISTS);
      expect(parsed.annotations).toEqual(SAMPLE_ANNOTATIONS);
      expect(parsed.trades).toEqual(SAMPLE_TRADES);
      expect(parsed.alerts).toEqual(SAMPLE_ALERTS);
    });

    it('defaults alerts to [] when omitted in serializeWorkspaceBackup or legacy JSON', () => {
      const json = serializeWorkspaceBackup({
        watchlists: SAMPLE_WATCHLISTS,
        annotations: SAMPLE_ANNOTATIONS,
        trades: SAMPLE_TRADES,
      });

      const parsed = parseWorkspaceBackup(json);
      expect(parsed.alerts).toEqual([]);
      expect(parsed.exportedAt).toBeGreaterThan(0);

      const rawWithoutAlerts = JSON.stringify({
        version: 1,
        exportedAt: 1710200000,
        watchlists: SAMPLE_WATCHLISTS,
        annotations: SAMPLE_ANNOTATIONS,
        trades: SAMPLE_TRADES,
      });
      const parsedLegacy = parseWorkspaceBackup(rawWithoutAlerts);
      expect(parsedLegacy.alerts).toEqual([]);
    });

    it('rejects malformed JSON strings and invalid schema versions', () => {
      expect(() => parseWorkspaceBackup('{not-valid-json')).toThrow(
        /Invalid workspace backup JSON/i,
      );

      const wrongVersion = JSON.stringify({
        version: 99,
        exportedAt: 1710200000,
        watchlists: [],
        annotations: [],
        trades: [],
      });
      expect(() => parseWorkspaceBackup(wrongVersion)).toThrow(
        /Invalid workspace backup schema/i,
      );
    });

    it('rejects annotations with screen pixel coordinates instead of logical (timestamp, price) anchors', () => {
      const invalidPixelAnnotationBackup = JSON.stringify({
        version: 1,
        exportedAt: 1710200000,
        watchlists: [],
        annotations: [
          {
            id: 'bad-ann',
            ticker: 'NVDA',
            type: 'sticker',
            anchors: [{ x: 350, y: 220 }],
            payload: {},
          },
        ],
        trades: [],
      });

      expect(() => parseWorkspaceBackup(invalidPixelAnnotationBackup)).toThrow(
        /Invalid workspace backup schema/i,
      );
      expect(() =>
        WorkspaceBackupSchema.parse(JSON.parse(invalidPixelAnnotationBackup)),
      ).toThrow();
    });
  });

  describe('Trade Journal RFC 4180 CSV Export & Import', () => {
    it('exports header row when trades array is empty and parses back to []', () => {
      const csv = exportTradesToCsv([]);
      expect(csv).toBe(TRADE_CSV_HEADERS.join(','));
      expect(parseTradesFromCsv(csv)).toEqual([]);
      expect(parseTradesFromCsv('')).toEqual([]);
    });

    it('computes realizedPnL and pnlPercent for closed trades and leaves them blank for open trades', () => {
      const csv = exportTradesToCsv(SAMPLE_TRADES);
      const lines = csv.split('\n');
      expect(lines[0]).toBe(
        'id,ticker,side,status,entryPrice,exitPrice,quantity,entryTimestamp,exitTimestamp,stopLossPrice,takeProfitPrice,realizedPnL,pnlPercent,setupTags,notesMarkdown',
      );
      // Closed trade: (135.5 - 120.5) * 100 = 1500, pnlPercent = 12.45
      expect(csv).toContain(',1500,12.45,Breakout;Momentum,');
      // Open trade has empty exitPrice, exitTimestamp, takeProfitPrice, realizedPnL, pnlPercent
      expect(csv).toContain('trade-open-2,AAPL,SHORT,OPEN,210,,50,1710100000,,215,,,');
    });

    it('round-trips trades with commas, escaped double quotes, and multi-line markdown notes via parseTradesFromCsv', () => {
      const csv = exportTradesToCsv(SAMPLE_TRADES);
      const roundTripped = parseTradesFromCsv(csv);

      expect(roundTripped).toHaveLength(2);
      expect(roundTripped[0]).toEqual(SAMPLE_TRADES[0]);
      expect(roundTripped[1]).toEqual(SAMPLE_TRADES[1]);
      expect(roundTripped[0]?.notesMarkdown).toContain('"key resistance", volume +180%\nHeld runner');
    });

    it('throws descriptive errors on unterminated quotes or missing required CSV columns', () => {
      expect(() =>
        parseTradesFromCsv('id,ticker,side,status,entryPrice,quantity,entryTimestamp\n"unclosed'),
      ).toThrow(/unterminated quoted field/i);

      expect(() => parseTradesFromCsv('id,ticker\nt-1,NVDA')).toThrow(
        /Missing required CSV header column/i,
      );
    });
  });

  describe('TradeJournalDrawer UI Export & Backup Controls', () => {
    it('renders Export CSV, Backup JSON, and Restore JSON buttons in TradeJournalDrawer markup', () => {
      const summary = calculateJournalSummary(SAMPLE_TRADES);
      const html = renderToStaticMarkup(
        createElement(TradeJournalDrawer, {
          isOpen: true,
          activeTicker: 'NVDA',
          currentTickerPrice: 135.5,
          trades: SAMPLE_TRADES,
          summary,
          filterStatus: 'ALL',
          onClose: vi.fn(),
          onFilterChange: vi.fn(),
          onLogTrade: vi.fn(),
          onClosePosition: vi.fn(),
          onDeleteTrade: vi.fn(),
          onSelectTicker: vi.fn(),
          onExportCsv: vi.fn(),
          onExportWorkspaceJson: vi.fn(),
          onImportWorkspaceJson: vi.fn(),
        }),
      );

      expect(html).toContain('data-testid="export-trades-csv-btn"');
      expect(html).toContain('Export CSV');
      expect(html).toContain('data-testid="export-workspace-json-btn"');
      expect(html).toContain('Backup JSON');
      expect(html).toContain('data-testid="import-workspace-json-btn"');
      expect(html).toContain('Restore JSON');
    });
  });
});
