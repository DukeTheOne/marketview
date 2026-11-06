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
import {
  UserPreferencesSchema,
  type UserPreferences,
} from '../schemas/preferences';

export const WORKSPACE_QUOTAS = {
  MAX_WATCHLISTS: 20,
  MAX_TICKERS_PER_WATCHLIST: 100,
  MAX_ANNOTATIONS: 500,
  MAX_TRADES: 500,
  MAX_ALERTS: 100,
  MAX_TOMBSTONES: 500,
  TOMBSTONE_TTL_SECONDS: 30 * 86400, // 30 days
  MAX_WORKSPACE_BYTES: 150_000, // 150 KB hard cap
} as const;

export const WorkspaceBackupSchema = z.object({
  version: z.literal(1),
  exportedAt: z.number().int().positive(),
  watchlists: z.array(WatchlistSchema).max(WORKSPACE_QUOTAS.MAX_WATCHLISTS),
  annotations: z.array(ChartAnnotationSchema).max(WORKSPACE_QUOTAS.MAX_ANNOTATIONS),
  trades: z.array(TradeEntrySchema).max(WORKSPACE_QUOTAS.MAX_TRADES),
  alerts: z.array(PriceAlertSchema).max(WORKSPACE_QUOTAS.MAX_ALERTS).default([]),
  deletedIds: z.record(z.string(), z.number().int().positive()).default({}),
  preferences: UserPreferencesSchema.optional(),
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
  deletedIds?: Record<string, number>;
  preferences?: UserPreferences;
  exportedAt?: number;
}): string {
  const validated = WorkspaceBackupSchema.parse({
    version: 1,
    exportedAt: data.exportedAt ?? Math.floor(Date.now() / 1000),
    watchlists: data.watchlists,
    annotations: data.annotations,
    trades: data.trades,
    alerts: data.alerts ?? [],
    deletedIds: data.deletedIds ?? {},
    preferences: data.preferences,
  });

  return JSON.stringify(validated, null, 2);
}

/**
 * Garbage-collects expired tombstones (> 30 days old), caps tombstones at MAX_TOMBSTONES,
 * strips any entities whose ID is present in `deletedIds` (with deletedAt >= entity timestamp),
 * deduplicates entities by ID, and trims collections to WORKSPACE_QUOTAS limits.
 */
export function garbageCollectWorkspace(
  snapshot: WorkspaceBackup,
  nowSec: number = Math.floor(Date.now() / 1000)
): WorkspaceBackup {
  // 1. Filter out expired tombstones older than 30 days
  const activeTombstones: Record<string, number> = {};
  for (const [id, deletedAt] of Object.entries(snapshot.deletedIds)) {
    if (
      nowSec - deletedAt <= WORKSPACE_QUOTAS.TOMBSTONE_TTL_SECONDS &&
      deletedAt <= nowSec + 86400
    ) {
      activeTombstones[id] = deletedAt;
    }
  }

  // Cap tombstones to MAX_TOMBSTONES (keep the newest)
  const tombstoneEntries = Object.entries(activeTombstones);
  let cappedTombstones = activeTombstones;
  if (tombstoneEntries.length > WORKSPACE_QUOTAS.MAX_TOMBSTONES) {
    tombstoneEntries.sort((a, b) => b[1] - a[1]);
    cappedTombstones = Object.fromEntries(
      tombstoneEntries.slice(0, WORKSPACE_QUOTAS.MAX_TOMBSTONES)
    );
  }

  // Helper to deduplicate array by ID and check if deleted
  function cleanEntities<T extends { id: string }>(
    items: T[],
    getTimestamp: (item: T) => number,
    maxLimit: number,
    sanitizeItem?: (item: T) => T
  ): T[] {
    const byId = new Map<string, T>();
    for (const rawItem of items) {
      const item = sanitizeItem ? sanitizeItem(rawItem) : rawItem;
      const deletedAt = cappedTombstones[item.id];
      const itemTs = getTimestamp(item);
      // If deleted at or after item timestamp, skip (it is deleted)
      if (deletedAt !== undefined && deletedAt >= itemTs) {
        continue;
      }
      const existing = byId.get(item.id);
      if (!existing || getTimestamp(existing) < itemTs) {
        byId.set(item.id, item);
      }
    }

    const result = Array.from(byId.values());
    if (result.length > maxLimit) {
      result.sort((a, b) => getTimestamp(b) - getTimestamp(a));
      return result.slice(0, maxLimit);
    }
    return result;
  }

  const cleanWatchlists = cleanEntities(
    snapshot.watchlists,
    (w) => w.updatedAt ?? w.createdAt ?? 0,
    WORKSPACE_QUOTAS.MAX_WATCHLISTS,
    (w) => ({
      ...w,
      tickers: w.tickers.slice(0, WORKSPACE_QUOTAS.MAX_TICKERS_PER_WATCHLIST),
    })
  );

  const cleanAnnotations = cleanEntities(
    snapshot.annotations,
    (a) => a.updatedAt ?? a.createdAt ?? 0,
    WORKSPACE_QUOTAS.MAX_ANNOTATIONS,
    (a) => {
      if (
        a.type === 'sticker' &&
        typeof a.payload.markdown === 'string' &&
        a.payload.markdown.length > 1000
      ) {
        return {
          ...a,
          payload: {
            ...a.payload,
            markdown: a.payload.markdown.slice(0, 1000),
          },
        };
      }
      return a;
    }
  );

  const cleanTrades = cleanEntities(
    snapshot.trades,
    (t) => t.updatedAt ?? t.entryTimestamp ?? 0,
    WORKSPACE_QUOTAS.MAX_TRADES
  );

  const cleanAlerts = cleanEntities(
    snapshot.alerts,
    (al) => al.createdAt ?? 0,
    WORKSPACE_QUOTAS.MAX_ALERTS
  );

  return WorkspaceBackupSchema.parse({
    version: 1,
    exportedAt: snapshot.exportedAt,
    watchlists: cleanWatchlists,
    annotations: cleanAnnotations,
    trades: cleanTrades,
    alerts: cleanAlerts,
    deletedIds: cappedTombstones,
    preferences: snapshot.preferences,
  });
}

/**
 * Deterministically merges local and remote workspace snapshots:
 * 1. Unions `deletedIds` tombstones (keeping the latest deletion timestamp per ID).
 * 2. Merges watchlists, annotations, trades, and alerts by `id` (keeping newer `updatedAt`/`createdAt`).
 * 3. Runs `garbageCollectWorkspace()` so deleted items are stripped and expired tombstones are pruned.
 */
export function mergeWorkspaceSnapshots(
  local: WorkspaceBackup,
  remote: WorkspaceBackup,
  nowSec: number = Math.floor(Date.now() / 1000)
): WorkspaceBackup {
  // 1. Union deletedIds tombstones
  const mergedDeletedIds: Record<string, number> = { ...local.deletedIds };
  for (const [id, remoteDeletedAt] of Object.entries(remote.deletedIds)) {
    const localDeletedAt = mergedDeletedIds[id];
    if (localDeletedAt === undefined || remoteDeletedAt > localDeletedAt) {
      mergedDeletedIds[id] = remoteDeletedAt;
    }
  }

  // 2. Helper to merge entity arrays by ID (newer timestamp wins)
  function mergeCollections<T extends { id: string }>(
    localItems: T[],
    remoteItems: T[],
    getTimestamp: (item: T) => number
  ): T[] {
    const map = new Map<string, T>();
    for (const item of localItems) {
      map.set(item.id, item);
    }
    for (const remoteItem of remoteItems) {
      const localItem = map.get(remoteItem.id);
      if (!localItem) {
        map.set(remoteItem.id, remoteItem);
      } else {
        const localTs = getTimestamp(localItem);
        const remoteTs = getTimestamp(remoteItem);
        if (remoteTs >= localTs) {
          map.set(remoteItem.id, remoteItem);
        }
      }
    }
    return Array.from(map.values());
  }

  const mergedWatchlists = mergeCollections(
    local.watchlists,
    remote.watchlists,
    (w) => w.updatedAt ?? w.createdAt ?? 0
  );

  const mergedAnnotations = mergeCollections(
    local.annotations,
    remote.annotations,
    (a) => a.updatedAt ?? a.createdAt ?? 0
  );

  const mergedTrades = mergeCollections(
    local.trades,
    remote.trades,
    (t) => t.updatedAt ?? t.entryTimestamp ?? 0
  );

  const mergedAlerts = mergeCollections(
    local.alerts,
    remote.alerts,
    (al) => al.createdAt ?? 0
  );

  // 3. Merge preferences: newer exportedAt wins, but preserve non-empty API keys and protect remote keys from being wiped by fresh client defaults
  let mergedPreferences = local.preferences;
  if (remote.preferences) {
    const localHasApiKey = Boolean(local.preferences?.finnhubApiKey?.trim());
    const remoteHasApiKey = Boolean(remote.preferences.finnhubApiKey?.trim());
    const isLocalFreshDefault =
      !local.preferences ||
      (!localHasApiKey &&
        local.preferences.providerMode === 'yahoo' &&
        !local.preferences.lastCloudSyncTimestamp);

    if (
      !local.preferences ||
      isLocalFreshDefault ||
      (!localHasApiKey && remoteHasApiKey) ||
      remote.exportedAt >= local.exportedAt
    ) {
      mergedPreferences = {
        ...remote.preferences,
        finnhubApiKey:
          local.preferences?.finnhubApiKey ||
          remote.preferences.finnhubApiKey ||
          '',
        firebaseApiKey:
          local.preferences?.firebaseApiKey ||
          remote.preferences.firebaseApiKey ||
          '',
        firebaseProjectId:
          local.preferences?.firebaseProjectId ||
          remote.preferences.firebaseProjectId ||
          '',
      };
    } else {
      mergedPreferences = {
        ...local.preferences,
        finnhubApiKey:
          local.preferences.finnhubApiKey ||
          remote.preferences.finnhubApiKey ||
          '',
        providerMode:
          local.preferences.finnhubApiKey
            ? local.preferences.providerMode
            : remote.preferences.finnhubApiKey
            ? remote.preferences.providerMode
            : local.preferences.providerMode,
      };
    }
  }

  const mergedSnapshot: WorkspaceBackup = {
    version: 1,
    exportedAt: Math.max(local.exportedAt, remote.exportedAt, nowSec),
    watchlists: mergedWatchlists,
    annotations: mergedAnnotations,
    trades: mergedTrades,
    alerts: mergedAlerts,
    deletedIds: mergedDeletedIds,
    preferences: mergedPreferences,
  };

  return garbageCollectWorkspace(mergedSnapshot, nowSec);
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
