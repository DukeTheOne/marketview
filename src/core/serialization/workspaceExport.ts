import { z } from 'zod';
import { WatchlistSchema, type Watchlist } from '../schemas/watchlist';
import {
  ChartAnnotationSchema,
  type ChartAnnotation,
} from '../schemas/annotation';
import {
  TradeEntrySchema,
  calculateTradePnLPercent,
  calculateTradeRealizedPnL,
  type TradeEntry,
} from '../schemas/trade';
import { PriceAlertSchema, type PriceAlert } from '../schemas/alert';

export const WorkspaceBackupSchema = z.object({
  version: z.literal(1),
  exportedAt: z.number().int().positive(),
  watchlists: z.array(WatchlistSchema),
  annotations: z.array(ChartAnnotationSchema),
  trades: z.array(TradeEntrySchema),
  alerts: z.array(PriceAlertSchema).default([]),
});

export type WorkspaceBackup = z.infer<typeof WorkspaceBackupSchema>;

export const TRADE_CSV_HEADERS = [
  'id',
  'ticker',
  'side',
  'status',
  'entryPrice',
  'exitPrice',
  'quantity',
  'entryTimestamp',
  'exitTimestamp',
  'stopLossPrice',
  'takeProfitPrice',
  'realizedPnL',
  'pnlPercent',
  'setupTags',
  'notesMarkdown',
] as const;

/**
 * Validates and serializes a full workspace state snapshot into formatted JSON.
 */
export function serializeWorkspaceBackup(data: {
  watchlists: Watchlist[];
  annotations: ChartAnnotation[];
  trades: TradeEntry[];
  alerts?: PriceAlert[];
  exportedAt?: number;
}): string {
  const validated = WorkspaceBackupSchema.parse({
    version: 1,
    exportedAt: data.exportedAt ?? Math.floor(Date.now() / 1000),
    watchlists: data.watchlists,
    annotations: data.annotations,
    trades: data.trades,
    alerts: data.alerts ?? [],
  });

  return JSON.stringify(validated, null, 2);
}

/**
 * Parses and validates a JSON workspace backup string against WorkspaceBackupSchema.
 */
export function parseWorkspaceBackup(jsonString: string): WorkspaceBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonString);
  } catch (err) {
    throw new Error(
      `Invalid workspace backup JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  try {
    return WorkspaceBackupSchema.parse(raw);
  } catch (err) {
    if (err instanceof z.ZodError) {
      const details = err.issues
        .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
        .join('; ');
      throw new Error(`Invalid workspace backup schema: ${details}`);
    }
    throw err;
  }
}

function escapeCsvCell(value: string): string {
  if (
    value.includes(',') ||
    value.includes('"') ||
    value.includes('\n') ||
    value.includes('\r')
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Exports an array of trade journal entries to an RFC 4180 CSV string,
 * including computed realizedPnL and pnlPercent columns.
 */
export function exportTradesToCsv(trades: TradeEntry[]): string {
  const headerLine = TRADE_CSV_HEADERS.join(',');
  if (trades.length === 0) {
    return headerLine;
  }

  const rows = trades.map((rawTrade) => {
    const trade = TradeEntrySchema.parse(rawTrade);
    const realizedPnL = calculateTradeRealizedPnL(trade);
    const pnlPercent = calculateTradePnLPercent(trade);

    const cells: string[] = [
      trade.id,
      trade.ticker,
      trade.side,
      trade.status,
      String(trade.entryPrice),
      trade.exitPrice !== undefined ? String(trade.exitPrice) : '',
      String(trade.quantity),
      String(trade.entryTimestamp),
      trade.exitTimestamp !== undefined ? String(trade.exitTimestamp) : '',
      trade.stopLossPrice !== undefined ? String(trade.stopLossPrice) : '',
      trade.takeProfitPrice !== undefined ? String(trade.takeProfitPrice) : '',
      realizedPnL !== null ? String(realizedPnL) : '',
      pnlPercent !== null ? String(pnlPercent) : '',
      trade.setupTags.join(';'),
      trade.notesMarkdown ?? '',
    ];

    return cells.map(escapeCsvCell).join(',');
  });

  return [headerLine, ...rows].join('\n');
}

function parseCsvRows(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i += 1) {
    const char = csvText[i];

    if (inQuotes) {
      if (char === '"') {
        if (csvText[i + 1] === '"') {
          currentField += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else if (char === '"' && currentField.length === 0) {
      inQuotes = true;
    } else if (char === ',') {
      currentRow.push(currentField);
      currentField = '';
    } else if (char === '\r') {
      if (csvText[i + 1] === '\n') {
        i += 1;
      }
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
    } else if (char === '\n') {
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }

  if (inQuotes) {
    throw new Error('Invalid CSV format: unterminated quoted field');
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows.filter((row) => !(row.length === 1 && row[0]?.trim() === ''));
}

function parseOptionalNumber(raw: string | undefined, fieldName: string): number | undefined {
  if (raw === undefined || raw.trim() === '') {
    return undefined;
  }
  const num = Number(raw);
  if (Number.isNaN(num)) {
    throw new Error(`Invalid numeric value for ${fieldName}: "${raw}"`);
  }
  return num;
}

function parseRequiredNumber(raw: string | undefined, fieldName: string): number {
  if (raw === undefined || raw.trim() === '') {
    throw new Error(`Missing required numeric value for ${fieldName}`);
  }
  const num = Number(raw);
  if (Number.isNaN(num)) {
    throw new Error(`Invalid numeric value for ${fieldName}: "${raw}"`);
  }
  return num;
}

/**
 * Parses a CSV string exported by exportTradesToCsv back into validated TradeEntry objects.
 */
export function parseTradesFromCsv(csvText: string): TradeEntry[] {
  if (!csvText.trim()) {
    return [];
  }

  const rows = parseCsvRows(csvText);
  if (rows.length === 0) {
    return [];
  }

  const headerRow = rows[0]!;
  const colIndex = new Map<string, number>();
  headerRow.forEach((colName, idx) => {
    colIndex.set(colName.trim(), idx);
  });

  const requiredColumns = [
    'id',
    'ticker',
    'side',
    'status',
    'entryPrice',
    'quantity',
    'entryTimestamp',
  ];
  for (const reqCol of requiredColumns) {
    if (!colIndex.has(reqCol)) {
      throw new Error(`Missing required CSV header column: "${reqCol}"`);
    }
  }

  const getCell = (row: string[], name: string): string => {
    const idx = colIndex.get(name);
    if (idx === undefined) return '';
    return row[idx] ?? '';
  };

  const trades: TradeEntry[] = [];
  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r]!;
    const rawTags = getCell(row, 'setupTags');
    const setupTags =
      rawTags.trim() === ''
        ? []
        : rawTags
            .split(';')
            .map((tag) => tag.trim())
            .filter(Boolean);

    const entryTimestamp = parseRequiredNumber(
      getCell(row, 'entryTimestamp'),
      'entryTimestamp',
    );
    const exitTimestamp = parseOptionalNumber(
      getCell(row, 'exitTimestamp'),
      'exitTimestamp',
    );

    const candidate = {
      id: getCell(row, 'id'),
      ticker: getCell(row, 'ticker'),
      side: getCell(row, 'side'),
      status: getCell(row, 'status'),
      entryPrice: parseRequiredNumber(getCell(row, 'entryPrice'), 'entryPrice'),
      exitPrice: parseOptionalNumber(getCell(row, 'exitPrice'), 'exitPrice'),
      quantity: parseRequiredNumber(getCell(row, 'quantity'), 'quantity'),
      entryTimestamp,
      exitTimestamp,
      stopLossPrice: parseOptionalNumber(
        getCell(row, 'stopLossPrice'),
        'stopLossPrice',
      ),
      takeProfitPrice: parseOptionalNumber(
        getCell(row, 'takeProfitPrice'),
        'takeProfitPrice',
      ),
      setupTags,
      notesMarkdown: getCell(row, 'notesMarkdown'),
      createdAt: entryTimestamp,
      updatedAt: exitTimestamp ?? entryTimestamp,
    };

    trades.push(TradeEntrySchema.parse(candidate));
  }

  return trades;
}
