# Vertical-Slice Specification: Milestone 4 — Trade Journal & Buy/Sell Chart Markers

## 1. Slice Scope & Architectural Invariants Check

### In-Scope Deliverables
1. **Headless Core Domain Schemas & Pure Analytics (`src/core/schemas/trade.ts`)**:
   - `TradeSideSchema`: `'BUY' | 'SELL' | 'SHORT' | 'COVER'`.
   - `TradeStatusSchema`: `'OPEN' | 'CLOSED'`.
   - `TradeEntrySchema`: `id`, `ticker`, `side`, `status`, `entryTimestamp`, `entryPrice`, `quantity`, `exitTimestamp?`, `exitPrice?`, `stopLossPrice?`, `takeProfitPrice?`, `setupTags`, `notesMarkdown`, `linkedAnnotationId?`.
   - Pure headless analytics calculations: Realized P&L ($), Return (%), R-Multiple, Win Rate (%), Profit Factor, and aggregate `JournalSummary`.
2. **Chart Annotation Contract Extension (`src/core/schemas/annotation.ts`)**:
   - `TradeMarkerPayloadSchema`: `tradeId?`, `side`, `price`, `quantity`, `setupTag`, `notes`.
   - Plugs directly into `ChartAnnotation['type'] === 'trade_marker'`.
3. **Storage Repository Persistence Port Extension (`src/core/repositories/`)**:
   - Extend `StorageRepository` port with `getTrades(ticker?: string)` and `saveTrades(trades: TradeEntry[])`.
   - Implement in `InMemoryStorageRepository` (tests) and `IndexedDBStorageRepository` (browser persistence).
4. **Headless Zustand Store (`src/core/stores/tradeJournalStore.ts`)**:
   - Vanilla store factory `createTradeJournalStore(repository: StorageRepository)`.
   - Manages trade logging, closing positions, metric summaries, and drawer visibility state with zero UI/DOM imports.
5. **Trade Marker Chart Overlay Plugin (`src/features/chart/overlays/plugins/TradeMarkerPlugin.tsx`)**:
   - Implements `ChartOverlayPlugin<TradeMarkerPayload>` (`type: 'trade_marker'`, `requiredAnchors: 1`).
   - Renders directional execution arrows on the chart (Green upward chevron for `BUY`/`COVER`, Red downward chevron for `SELL`/`SHORT`).
   - Tooltip pill displaying execution details: `BUY 100 @ $228.50`.
   - Clicking a marker selects and highlights the corresponding trade in the journal drawer.
6. **Trade Journal UI Drawer (`src/features/journal/TradeJournalDrawer.tsx`)**:
   - Sliding analytics and trade log drawer.
   - Live KPI stat cards: Total Realized P&L, Win Rate %, Total Closed Trades, Profit Factor.
   - Quick "Log Execution" form supporting optional automatic chart marker creation.
   - Interactive trade list with filter tabs (`ALL`, `OPEN`, `CLOSED`), inline "Close Trade" action, and delete controls.
7. **Chart Toolbar Update (`src/features/chart/overlays/ChartToolbar.tsx`)**:
   - Add `Trade Marker` tool button to place executions directly onto chart candles.

### Architectural Invariants Verification
- [x] **Zero DOM/UI Imports in `src/core/`**: `trade.ts` schemas, analytics math, and `tradeJournalStore.ts` contain zero React or DOM imports.
- [x] **Open-Closed Principle for Chart Customizations**: `ChartContainer.tsx` remains untouched; `TradeMarkerPlugin` registers through `overlayPluginRegistry`.
- [x] **Logical Coordinate Contract**: Trade markers anchor to `{ timestamp, price }` (Unix UTC seconds + execution price). Screen coordinates are ephemeral projections.

---

## 2. Headless Core Contracts (`src/core/`)

### 2.1 Trade Domain Schemas (`src/core/schemas/trade.ts`)
```typescript
import { z } from 'zod';
import { TickerSymbolSchema } from './market';

export const TradeSideSchema = z.enum(['BUY', 'SELL', 'SHORT', 'COVER']);
export type TradeSide = z.infer<typeof TradeSideSchema>;

export const TradeStatusSchema = z.enum(['OPEN', 'CLOSED']);
export type TradeStatus = z.infer<typeof TradeStatusSchema>;

export const TradeEntrySchema = z.object({
  id: z.string().min(1),
  ticker: TickerSymbolSchema,
  side: TradeSideSchema,
  status: TradeStatusSchema,
  entryTimestamp: z.number().int().positive(), // Unix seconds UTC
  entryPrice: z.number().finite().positive(),
  quantity: z.number().int().positive(),
  exitTimestamp: z.number().int().positive().optional(),
  exitPrice: z.number().finite().positive().optional(),
  stopLossPrice: z.number().finite().positive().optional(),
  takeProfitPrice: z.number().finite().positive().optional(),
  setupTags: z.array(z.string()).default([]),
  notesMarkdown: z.string().default(''),
  linkedAnnotationId: z.string().optional(),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
});
export type TradeEntry = z.infer<typeof TradeEntrySchema>;

export interface JournalSummary {
  totalTrades: number;
  openTrades: number;
  closedTrades: number;
  winCount: number;
  lossCount: number;
  winRatePercent: number;
  totalRealizedPnL: number;
  averageWin: number;
  averageLoss: number;
  profitFactor: number;
}
```

### 2.2 Pure Headless Analytics Calculations (`src/core/schemas/trade.ts`)
```typescript
export function calculateTradeRealizedPnL(trade: TradeEntry): number | null {
  if (trade.status !== 'CLOSED' || trade.exitPrice === undefined) {
    return null;
  }
  const multiplier = trade.side === 'BUY' || trade.side === 'COVER' ? 1 : -1;
  const rawPnL = (trade.exitPrice - trade.entryPrice) * trade.quantity * multiplier;
  return Math.round(rawPnL * 100) / 100;
}

export function calculateTradePnLPercent(trade: TradeEntry): number | null {
  if (trade.status !== 'CLOSED' || trade.exitPrice === undefined) {
    return null;
  }
  const multiplier = trade.side === 'BUY' || trade.side === 'COVER' ? 1 : -1;
  const pct = ((trade.exitPrice - trade.entryPrice) / trade.entryPrice) * 100 * multiplier;
  return Math.round(pct * 100) / 100;
}

export function calculateJournalSummary(trades: TradeEntry[]): JournalSummary {
  // Pure functional aggregation over trade array
}
```

### 2.3 Storage Repository Port Extension (`src/core/repositories/StorageRepository.ts`)
```typescript
export interface StorageRepository {
  getWatchlists(): Promise<Watchlist[]>;
  saveWatchlists(watchlists: Watchlist[]): Promise<void>;
  getAnnotations(ticker?: string): Promise<ChartAnnotation[]>;
  saveAnnotations(annotations: ChartAnnotation[]): Promise<void>;
  getTrades(ticker?: string): Promise<TradeEntry[]>;
  saveTrades(trades: TradeEntry[]): Promise<void>;
}
```

---

## 3. UI & Chart Plugin Layer (`src/features/` & `src/ui/`)

### 3.1 Trade Marker Plugin (`src/features/chart/overlays/plugins/TradeMarkerPlugin.tsx`)
- `type: 'trade_marker'`, `requiredAnchors: 1` (`{ timestamp, price }`).
- Renders directional SVG badge:
  - `BUY`/`COVER`: Emerald green background with upward chevron (`ArrowUpCircle`), positioned below candle low.
  - `SELL`/`SHORT`: Rose red background with downward chevron (`ArrowDownCircle`), positioned above candle high.
- Hover/click tooltip: Displays ticker, side, quantity, price, and click to view in journal.
- Clicking a marker opens the journal drawer and scrolls the matching trade entry into view.

### 3.2 Trade Journal Drawer (`src/features/journal/TradeJournalDrawer.tsx`)
- Sliding bottom/side panel opened via header button or marker click:
  - **KPI Metrics Bar**: 4 stat cards (Realized P&L, Win Rate %, Total Closed, Profit Factor).
  - **Log New Trade Form**: Inputs for Ticker, Side (`BUY`/`SELL`), Price, Quantity, Stop-Loss, Take-Profit, Setup Tags (`Breakout`, `Retest`, `Trend Following`, `Dip Buy`), and Notes.
  - **Trade History Table**: Filterable by `ALL`, `OPEN`, `CLOSED`.
    - Active open trades feature an instant "Close Trade" button with an exit price prompt.
    - Closed trades display final Realized P&L in green/red with R-Multiple and percent return.
    - Delete button to remove historical records.

---

## 4. Ordered File Manifest

1. `[NEW] src/core/schemas/trade.ts` — `TradeEntrySchema`, `TradeSideSchema`, `TradeStatusSchema`, pure analytics calculations, and `JournalSummary`.
2. `[MODIFY] src/core/schemas/annotation.ts` — Add `TradeMarkerPayloadSchema`.
3. `[MODIFY] src/core/repositories/StorageRepository.ts` — Add `getTrades` and `saveTrades` methods.
4. `[MODIFY] src/core/repositories/InMemoryStorageRepository.ts` — Implement in-memory trade persistence.
5. `[MODIFY] src/core/repositories/IndexedDBStorageRepository.ts` — Implement IndexedDB trade persistence with in-memory fallback.
6. `[NEW] src/core/stores/tradeJournalStore.ts` — Headless Zustand store factory for trade logging, filtering, and summary metrics.
7. `[MODIFY] src/core/index.ts` — Barrel exports for `trade.ts` and `tradeJournalStore.ts`.
8. `[NEW] src/core/__tests__/trade-journal.test.ts` — Unit tests for P&L math, win rate metrics, trade store lifecycle, and storage persistence.
9. `[NEW] src/features/chart/overlays/plugins/TradeMarkerPlugin.tsx` — Implementation of `ChartOverlayPlugin<TradeMarkerPayload>`.
10. `[MODIFY] src/features/chart/overlays/ChartToolbar.tsx` — Add `Trade Marker` button.
11. `[MODIFY] src/features/chart/overlays/OverlayCanvas.tsx` — Import `./plugins/TradeMarkerPlugin` to auto-register.
12. `[NEW] src/features/journal/TradeJournalDrawer.tsx` — Sliding trade execution log and analytics drawer.
13. `[MODIFY] src/ui/layout/TopHeaderBar.tsx` — Add Trade Journal toggle button with trade count badge.
14. `[MODIFY] src/App.tsx` — Wire `tradeJournalStore` into `App`, synchronize markers with journal entries, and render `TradeJournalDrawer`.

---

## 5. Verification & Test Matrix

| Check ID | Target | Verification Command | Acceptance Criteria |
| :--- | :--- | :--- | :--- |
| **TC-M4-01** | PostToolUse Hook & Types | `npm run typecheck` (`tsc --noEmit`) | Zero TypeScript errors across trade schemas, journal store, markers, and UI drawer. |
| **TC-M4-02** | Core Isolation | `npx vitest run src/core/__tests__/architecture-boundaries.test.ts` | All files in `src/core/**` (including `trade.ts` and `tradeJournalStore.ts`) pass zero-DOM/UI checks. |
| **TC-M4-03** | Pure Analytics Math | `npx vitest run src/core/__tests__/trade-journal.test.ts` | Correctly calculates Realized P&L ($), Return (%), Win Rate (%), and Profit Factor across multiple simulated winning and losing trades. |
| **TC-M4-04** | Trade Store Persistence | `npx vitest run src/core/__tests__/trade-journal.test.ts` | Logging, closing, filtering, and deleting trades persist to `StorageRepository` and re-hydrate accurately. |
| **TC-M4-05** | Production Build | `npm run build` | Clean Vite production build with all features and plugins bundled. |
