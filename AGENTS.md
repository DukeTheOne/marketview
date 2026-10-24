# MarketView — Principal Architecture & Agent Operating Manual

## Project Mission
MarketView is a customizable Stock Market Watchlist, Chart Annotation, and Trade Journaling application. It is architected with a **strict headless core** (`src/core/`) so all domain schemas, market data adapters, caching, repositories, and state stores can be shared directly with a future mobile target without rewriting existing code.

## Tech Stack
- **Runtime & Bundler**: Vite + TypeScript (`strict: true`, `noUncheckedIndexedAccess: true`)
- **UI Framework (Web Target)**: React 19 + Tailwind CSS (`src/ui/`, `src/features/`)
- **Charting Engine**: TradingView `lightweight-charts` v5 (`src/features/chart/`)
- **Headless Core (`src/core/`)**:
  - Validation & Domain Models: `zod`
  - Client State & Domain Actions: `zustand` (vanilla/headless store factory compatible)
  - Async Data & Caching: `@tanstack/query-core` / `@tanstack/react-query`
- **Local Persistence**: `StorageRepository` port backed by `InMemoryStorageRepository` (tests) and `IndexedDBStorageRepository` (browser)
- **Testing**: Vitest (`src/core/**/*.test.ts`)

## Directory Boundaries
- `src/core/schemas/`: Zod schemas and inferred TypeScript types (`TickerQuote`, `OHLCVCandle`, `ChartAnnotation`, `Watchlist`, `TradeEntry`).
- `src/core/providers/`: `MarketDataProvider` port, `CachedMarketDataProvider` rate-limit/TTL decorator, and concrete adapters (`FinnhubProvider`, `DeterministicDemoProvider`).
- `src/core/repositories/`: `StorageRepository` port and persistence adapters (`InMemoryStorageRepository`, `IndexedDBStorageRepository`).
- `src/core/stores/`: Headless Zustand stores for watchlists, active ticker/timeframe, chart annotations, and trade journal entries.
- `src/features/chart/`: `LightweightCharts` host component and the `overlays/` plugin engine (`StickerPlugin`, `TrendlinePlugin`, `TradeMarkerPlugin`).
- `src/features/journal/`: Trade execution logging UI and analytics drawer.
- `src/ui/`: Reusable web presentational primitives and watchlist panels.
- `docs/specs/`: Vertical-slice specification documents generated via `/spec-slice` before implementation.

## Core Commands
- Typecheck: `npm run typecheck` (`tsc --noEmit`)
- Unit Tests: `npm run test` (`vitest run`)
- Dev Server: `npm run dev`
