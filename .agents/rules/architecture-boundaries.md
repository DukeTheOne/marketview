---
trigger: always_on
description: Enforces the strict headless core boundary, MarketDataProvider adapter pattern, and logical (timestamp, price) chart coordinate invariant across the entire repository.
---

# Architectural Boundaries & Invariants (NON-NEGOTIABLE)

## 1. Strict Headless Core (`src/core/`)
- Files inside `src/core/**` MUST NEVER import from:
  - `src/ui/**` or `src/features/**`
  - `react-dom`, `lightweight-charts`, or any UI component library
  - Browser DOM globals (`window`, `document`, `HTMLElement`, `localStorage`) directly inside domain logic (always inject persistence via `StorageRepository`).
- Every domain entity entering or leaving `src/core/` MUST be validated with a Zod schema defined in `src/core/schemas/`.

## 2. Market Data Adapter Pattern (`src/core/providers/`)
- UI components and feature modules (`src/ui/**`, `src/features/**`) MUST NEVER call `fetch()`, `axios`, or external stock API endpoints directly.
- All market data requests MUST flow through the `MarketDataProvider` interface wrapped by `CachedMarketDataProvider` to respect free-tier API rate limits (Finnhub / Tiingo / Yahoo Finance) and allow zero-rewrite provider hot-swapping.
- External provider payloads MUST be parsed and normalized into `TickerQuoteSchema` and `OHLCVCandleSchema` before leaving the provider boundary.

## 3. Logical Chart Coordinates & Storage Repository (`src/core/schemas/annotation.ts`)
- Every chart customization (`sticker`, `trendline`, `trade_marker`, etc.) MUST conform to `ChartAnnotationSchema`:
  - `id: string`
  - `ticker: string`
  - `type: 'sticker' | 'trendline' | 'trade_marker'`
  - `anchors: Array<{ timestamp: number; price: number }>` (Unix seconds UTC + floating-point price)
  - `payload: Record<string, unknown>`
- NEVER persist screen pixel coordinates (`x`, `y`). Screen coordinates are ephemeral viewport projections computed at render time from logical `(timestamp, price)` anchors.
- All persistence of watchlists, chart annotations, and trade journal entries MUST flow through the `StorageRepository` interface (`src/core/repositories/StorageRepository.ts`).
