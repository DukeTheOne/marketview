# Vertical-Slice Specification: Milestone 1 — Headless Core, Market Data Adapter/Cache, Storage Repository & Base Chart/Watchlist CRUD

## 1. Slice Scope & Architectural Invariants Check

### In-Scope Deliverables
1. **Project & Tooling Scaffold**: Vite + React 19 + TypeScript (`strict: true`, `noUncheckedIndexedAccess: true`), Tailwind CSS, Vitest, `zod`, `zustand`, `@tanstack/react-query`, and TradingView `lightweight-charts` v5.
2. **Headless Domain Schemas (`src/core/schemas/`)**:
   - `market.ts`: `TickerSymbolSchema`, `TimeframeSchema`, `TickerQuoteSchema`, `OHLCVCandleSchema`, `TickerSearchResultSchema`.
   - `watchlist.ts`: `WatchlistSchema` (`id`, `name`, `tickers`, `createdAt`, `updatedAt`).
   - `annotation.ts`: `LogicalAnchorSchema` (`{ timestamp: number, price: number }`), `ChartAnnotationTypeSchema` (`'sticker' | 'trendline' | 'trade_marker'`), `ChartAnnotationSchema` (foundational contract locked in Milestone 1 so Milestone 2–4 plugins require zero schema migrations).
3. **Market Data Adapter & Rate-Limit Cache (`src/core/providers/`)**:
   - `MarketDataProvider.ts`: Port interface for quotes, historical OHLCV candles, and ticker search.
   - `CachedMarketDataProvider.ts`: Decorator adding configurable TTL caching, in-flight request deduplication, stale-on-error fallback, and token-bucket rate limiting.
   - `DeterministicDemoProvider.ts`: Seeded, deterministic OHLCV & quote generator for offline usage and deterministic unit testing.
   - `FinnhubProvider.ts`: Live REST adapter normalizing Finnhub responses through Zod schemas before returning.
4. **Persistence Port & Adapters (`src/core/repositories/`)**:
   - `StorageRepository.ts`: Generic asynchronous port (`getWatchlists`, `saveWatchlists`, `getAnnotations`, `saveAnnotations`).
   - `InMemoryStorageRepository.ts`: Pure in-memory adapter for unit tests and SSR/headless verification.
   - `IndexedDBStorageRepository.ts`: Browser persistence adapter using IndexedDB (with graceful fallback) injected at the application entrypoint.
5. **Headless Zustand Stores (`src/core/stores/`)**:
   - `marketStore.ts`: Vanilla-compatible Zustand store factory managing `activeTicker`, `activeTimeframe`, and quote/candle fetching via the injected `MarketDataProvider`.
   - `watchlistStore.ts`: Vanilla-compatible Zustand store factory managing multi-watchlist CRUD (`createWatchlist`, `renameWatchlist`, `deleteWatchlist`, `addTickerToWatchlist`, `removeTickerFromWatchlist`) persisted through `StorageRepository`.
6. **Web UI & Base Chart Host (`src/ui/` & `src/features/chart/`)**:
   - `src/ui/watchlist/WatchlistSidebar.tsx`: Interactive watchlist selector, custom watchlist creation/deletion, ticker search/addition, and live quote badges.
   - `src/features/chart/ChartContainer.tsx`: Renders `lightweight-charts` candlestick + volume histogram series and exposes the `CoordinateProjector` (`logicalToScreen` / `screenToLogical`) hook point for Milestone 2's overlay layer.

### Architectural Invariants Verification
- [x] **Zero DOM/UI Imports in `src/core/`**: No file in `src/core/**` may import `react`, `react-dom`, `lightweight-charts`, `src/ui/**`, `src/features/**`, or reference `window` / `document` inside domain logic.
- [x] **Strict Adapter Boundary**: UI components never invoke `fetch()` directly; all market data flows through `CachedMarketDataProvider`.
- [x] **Logical Coordinate Contract**: `ChartAnnotationSchema` strictly enforces `anchors: Array<{ timestamp: number; price: number }>` (Unix seconds UTC + float price) and forbids screen `(x, y)` coordinates.

---

## 2. Headless Core Contracts (`src/core/`)

### 2.1 Market Schemas (`src/core/schemas/market.ts`)
```typescript
import { z } from 'zod';

export const TickerSymbolSchema = z
  .string()
  .trim()
  .min(1)
  .max(12)
  .transform((val) => val.toUpperCase());

export const TimeframeSchema = z.enum(['15m', '1h', '1D', '1W']);
export type Timeframe = z.infer<typeof TimeframeSchema>;

export const TickerQuoteSchema = z.object({
  ticker: TickerSymbolSchema,
  price: z.number().finite().nonnegative(),
  change: z.number().finite(),
  changePercent: z.number().finite(),
  high: z.number().finite().nonnegative(),
  low: z.number().finite().nonnegative(),
  open: z.number().finite().nonnegative(),
  previousClose: z.number().finite().nonnegative(),
  timestamp: z.number().int().positive(), // Unix seconds UTC
});
export type TickerQuote = z.infer<typeof TickerQuoteSchema>;

export const OHLCVCandleSchema = z.object({
  timestamp: z.number().int().positive(), // Unix seconds UTC
  open: z.number().finite().nonnegative(),
  high: z.number().finite().nonnegative(),
  low: z.number().finite().nonnegative(),
  close: z.number().finite().nonnegative(),
  volume: z.number().finite().nonnegative(),
});
export type OHLCVCandle = z.infer<typeof OHLCVCandleSchema>;

export const TickerSearchResultSchema = z.object({
  ticker: TickerSymbolSchema,
  name: z.string().min(1),
  exchange: z.string().default('US'),
});
export type TickerSearchResult = z.infer<typeof TickerSearchResultSchema>;
```

### 2.2 Watchlist Schemas (`src/core/schemas/watchlist.ts`)
```typescript
import { z } from 'zod';
import { TickerSymbolSchema } from './market';

export const WatchlistSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(60),
  tickers: z.array(TickerSymbolSchema),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
});
export type Watchlist = z.infer<typeof WatchlistSchema>;
```

### 2.3 Chart Annotation Schemas (`src/core/schemas/annotation.ts`)
```typescript
import { z } from 'zod';
import { TickerSymbolSchema } from './market';

export const LogicalAnchorSchema = z.object({
  timestamp: z.number().int().positive(), // Unix seconds UTC
  price: z.number().finite().positive(),  // Logical price level
});
export type LogicalAnchor = z.infer<typeof LogicalAnchorSchema>;

export const ChartAnnotationTypeSchema = z.enum([
  'sticker',
  'trendline',
  'trade_marker',
]);
export type ChartAnnotationType = z.infer<typeof ChartAnnotationTypeSchema>;

export const ChartAnnotationSchema = z.object({
  id: z.string().min(1),
  ticker: TickerSymbolSchema,
  type: ChartAnnotationTypeSchema,
  anchors: z.array(LogicalAnchorSchema).min(1),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
});
export type ChartAnnotation = z.infer<typeof ChartAnnotationSchema>;
```

### 2.4 Market Data Provider Port (`src/core/providers/MarketDataProvider.ts`)
```typescript
import type { OHLCVCandle, TickerQuote, TickerSearchResult, Timeframe } from '../schemas/market';

export interface CandleQueryOptions {
  ticker: string;
  timeframe: Timeframe;
  limit?: number;
}

export interface MarketDataProvider {
  readonly id: string;
  getQuote(ticker: string): Promise<TickerQuote>;
  getCandles(options: CandleQueryOptions): Promise<OHLCVCandle[]>;
  searchTickers(query: string): Promise<TickerSearchResult[]>;
}
```

### 2.5 Storage Repository Port (`src/core/repositories/StorageRepository.ts`)
```typescript
import type { Watchlist } from '../schemas/watchlist';
import type { ChartAnnotation } from '../schemas/annotation';

export interface StorageRepository {
  getWatchlists(): Promise<Watchlist[]>;
  saveWatchlists(watchlists: Watchlist[]): Promise<void>;
  getAnnotations(ticker?: string): Promise<ChartAnnotation[]>;
  saveAnnotations(annotations: ChartAnnotation[]): Promise<void>;
}
```

### 2.6 Headless Store Factories (`src/core/stores/`)
- `createMarketStore(provider: MarketDataProvider)`:
  - State: `activeTicker: string`, `activeTimeframe: Timeframe`, `quotesByTicker: Record<string, TickerQuote>`, `candlesByKey: Record<string, OHLCVCandle[]>`, `isLoadingCandles: boolean`, `error: string | null`.
  - Actions: `setActiveTicker(ticker: string)`, `setActiveTimeframe(tf: Timeframe)`, `refreshActiveCandles()`, `refreshQuotes(tickers: string[])`.
- `createWatchlistStore(repository: StorageRepository)`:
  - State: `watchlists: Watchlist[]`, `activeWatchlistId: string`, `isHydrated: boolean`.
  - Actions: `hydrate()`, `selectWatchlist(id: string)`, `createWatchlist(name: string)`, `renameWatchlist(id: string, name: string)`, `deleteWatchlist(id: string)`, `addTicker(watchlistId: string, ticker: string)`, `removeTicker(watchlistId: string, ticker: string)`.

---

## 3. UI & Chart Plugin Layer (`src/features/` & `src/ui/`)

### 3.1 Coordinate Projector Contract (`src/features/chart/types.ts`)
Even in Milestone 1 (before overlay plugins are added in Milestone 2), `ChartContainer.tsx` exposes a clean coordinate projection bridge so Milestone 2's `OverlayCanvas` mounts with zero breaking changes:
```typescript
import type { LogicalAnchor } from '../../core/schemas/annotation';

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface CoordinateProjector {
  logicalToScreen(anchor: LogicalAnchor): ScreenPoint | null;
  screenToLogical(point: ScreenPoint): LogicalAnchor | null;
}
```

### 3.2 Component Hierarchy
- `src/App.tsx`: Wires `CachedMarketDataProvider` (wrapping `FinnhubProvider` if `VITE_FINNHUB_API_KEY` is present, else `DeterministicDemoProvider`) and `IndexedDBStorageRepository` into the headless stores.
- `src/ui/layout/TopHeaderBar.tsx`: Displays active ticker symbol, live price/change pill, timeframe switcher (`15m`, `1h`, `1D`, `1W`), and active data provider badge (`Cached Demo` / `Cached Finnhub`).
- `src/ui/watchlist/WatchlistSidebar.tsx`:
  - Dropdown/tabs to switch between custom watchlists + "+ New Watchlist" inline input and delete/rename controls.
  - Add-ticker form with instant validation and remove button per ticker row.
  - Live price & percentage change badges per ticker.
- `src/features/chart/ChartContainer.tsx`:
  - Initializes TradingView `lightweight-charts` v5 (`createChart`, `CandlestickSeries`, `HistogramSeries` for volume).
  - Automatically updates candles when `activeTicker` or `activeTimeframe` changes.
  - Responsive `ResizeObserver` handling.

---

## 4. Ordered File Manifest

1. `[NEW] package.json` — Dependencies (`react`, `react-dom`, `zod`, `zustand`, `@tanstack/react-query`, `lightweight-charts`, `lucide-react`) & devDependencies (`typescript`, `vite`, `@vitejs/plugin-react`, `tailwindcss`, `@tailwindcss/vite`, `vitest`).
2. `[NEW] tsconfig.json` — Strict TypeScript configuration (`strict: true`, `noUncheckedIndexedAccess: true`, `noEmit: true`).
3. `[NEW] vite.config.ts` — Vite + React + Tailwind v4 + Vitest configuration.
4. `[NEW] index.html` & `[NEW] src/index.css` — Base dark-theme terminal styling.
5. `[NEW] src/core/schemas/market.ts` — `TickerSymbolSchema`, `TimeframeSchema`, `TickerQuoteSchema`, `OHLCVCandleSchema`, `TickerSearchResultSchema`.
6. `[NEW] src/core/schemas/watchlist.ts` — `WatchlistSchema`.
7. `[NEW] src/core/schemas/annotation.ts` — `LogicalAnchorSchema`, `ChartAnnotationTypeSchema`, `ChartAnnotationSchema`.
8. `[NEW] src/core/providers/MarketDataProvider.ts` — Provider port interface.
9. `[NEW] src/core/providers/CachedMarketDataProvider.ts` — TTL cache + in-flight deduplication + rate-limit decorator.
10. `[NEW] src/core/providers/DeterministicDemoProvider.ts` — Seeded realistic OHLCV & quote provider.
11. `[NEW] src/core/providers/FinnhubProvider.ts` — Finnhub REST API adapter with Zod response normalization.
12. `[NEW] src/core/repositories/StorageRepository.ts` — Persistence port interface.
13. `[NEW] src/core/repositories/InMemoryStorageRepository.ts` — In-memory persistence implementation.
14. `[NEW] src/core/repositories/IndexedDBStorageRepository.ts` — Browser IndexedDB persistence implementation.
15. `[NEW] src/core/stores/marketStore.ts` — Headless Zustand store factory for market quotes & candles.
16. `[NEW] src/core/stores/watchlistStore.ts` — Headless Zustand store factory for watchlist CRUD.
17. `[NEW] src/core/index.ts` — Public barrel export for the headless core.
18. `[NEW] src/features/chart/types.ts` — `ScreenPoint` and `CoordinateProjector` interfaces.
19. `[NEW] src/features/chart/ChartContainer.tsx` — `lightweight-charts` v5 candlestick & volume viewport.
20. `[NEW] src/ui/layout/TopHeaderBar.tsx` — Active ticker stats & timeframe selector.
21. `[NEW] src/ui/watchlist/WatchlistSidebar.tsx` — Custom watchlist CRUD & ticker list panel.
22. `[NEW] src/App.tsx` & `[NEW] src/main.tsx` — Application shell and dependency injection wiring.
23. `[NEW] src/core/__tests__/architecture-boundaries.test.ts` — Static AST/regex boundary test verifying zero forbidden imports in `src/core/**`.
24. `[NEW] src/core/__tests__/cached-provider.test.ts` — Unit tests for TTL caching, in-flight deduplication, rate-limit protection, and Zod validation.
25. `[NEW] src/core/__tests__/watchlist-store.test.ts` — Unit tests for watchlist CRUD and `InMemoryStorageRepository` persistence round-trips.

---

## 5. Verification & Test Matrix

| Check ID | Target | Verification Command | Acceptance Criteria |
| :--- | :--- | :--- | :--- |
| **TC-01** | Type & Hook Safety | `npm run typecheck` (`tsc --noEmit`) | Zero TypeScript errors under `strict: true` and `noUncheckedIndexedAccess: true`; `.agents/hooks.json` passes on every file edit. |
| **TC-02** | Headless Core Isolation | `npx vitest run src/core/__tests__/architecture-boundaries.test.ts` | Fails if any file in `src/core/**` imports from `src/ui`, `src/features`, `react-dom`, `lightweight-charts`, or references `window`/`document`. |
| **TC-03** | Adapter & Cache Guarantees | `npx vitest run src/core/__tests__/cached-provider.test.ts` | Repeat calls within TTL hit cache (`underlyingCalls === 1`); concurrent identical requests deduplicate; rate-limit overflow serves cached/fallback or throws typed `RateLimitExceededError`. |
| **TC-04** | Watchlist CRUD & Persistence | `npx vitest run src/core/__tests__/watchlist-store.test.ts` | Creating/renaming/deleting watchlists and adding/removing normalized uppercase tickers persist cleanly to `StorageRepository` and re-hydrate accurately. |
| **TC-05** | Logical Coordinate Schema | `npx vitest run` | `ChartAnnotationSchema` accepts `{ timestamp, price }` anchors and rejects payloads missing logical anchors. |
