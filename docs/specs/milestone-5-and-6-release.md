# Vertical Slice Specification: Milestones 5, 6 & v1.0 Release Readiness

## 1. Objective & Scope

This specification documents the architecture, domain models, headless state stores, chart overlay plugins, and production packaging delivered across **Milestone 5 (Advanced Overlays, Technical Indicators, Alerts & Data Sovereignty)** and **Milestone 6 (Mooers' Law Keyboard-First Operator UX, Session Persistence, PWA & Standalone Production Server)**.

Together, Milestones 5 and 6 complete MarketView's v1.0 release criteria:
1. **2-Point Fibonacci Retracement Overlay (`FibonacciPlugin`)** anchored in logical `(timestamp, price)` coordinates.
2. **Technical Indicator Engine (`SMA 20`, `EMA 50`, `Bollinger Bands 20`, `VWAP`, `RSI 14`, `Volume`)** computed via pure functions in `src/core/utils/indicators.ts`.
3. **Persistent Price Alerts & Live Chart Alert Lines** backed by `PriceAlertSchema`, `createAlertStore`, and `StorageRepository`.
4. **Trade Journal Analytics, SVG Cumulative Equity Curve & CSV Export** with FIFO realized PnL and R-multiple metrics.
5. **1-Click Workspace JSON Backup & Restore** across all `StorageRepository` namespaces.
6. **Mooers' Law Keyboard-First UX & Session Layout Persistence** (`/`, `b`, `1`–`4`, `s`, `t`, `f`, `m`, `j`, `Del`/`Backspace`, `Esc`, `?`) with persisted operator preferences.
7. **PWA Installability & Zero-Dependency Production Server (`server.mjs` / `npm start`)** serving `dist/` alongside the live `/api/yahoo` market data proxy on port `4173`.

---

## 2. Architectural Boundaries Check

| Invariant | Verification |
| :--- | :--- |
| **Strict Headless Core (`src/core/**`)** | Zero imports from `src/ui/**`, `src/features/**`, `react`, `react-dom`, or `lightweight-charts`. All indicator math, alert evaluation, journal analytics, and backup serialization execute in pure TypeScript. |
| **Zod Schema Boundary Validation** | All entities persisted or restored (`ChartAnnotationSchema`, `PriceAlertSchema`, `TradeEntrySchema`, `WatchlistSchema`, `WorkspaceBackupSchema`, `UiPreferencesSchema`) are validated with Zod before entering or leaving `src/core/`. |
| **Logical Chart Coordinates** | Fibonacci retracements, trendlines, stickers, trade markers, and horizontal price alert lines project from logical `(timestamp, price)` coordinates to viewport pixels only at canvas render time. |
| **Repository Persistence Port** | All state mutations flow through `StorageRepository` (`InMemoryStorageRepository` in tests/CLI, `IndexedDBStorageRepository` in browser). |

---

## 3. Domain Schemas & Pure Core Modules (`src/core/`)

### 3.1 Fibonacci Annotation Schema (`src/core/schemas/annotation.ts`)
- Extends `AnnotationTypeSchema` to `'sticker' | 'trendline' | 'trade_marker' | 'fibonacci'`.
- `FibonacciPayloadSchema`:
  - `color: string` (default `'#a855f7'`)
  - `lineWidth: number` (`1` to `8`, default `1.5`)
  - `showLabels: boolean` (default `true`)
- Enforces via `.superRefine()` that `type === 'fibonacci'` requires **at least 2 anchors** (`anchors.length >= 2`).

### 3.2 Price Alert Schema & Headless Store (`src/core/schemas/alert.ts`, `src/core/stores/alertStore.ts`)
- `PriceAlertSchema`:
  - `id: string`
  - `ticker: string` (normalized uppercase)
  - `targetPrice: number` (positive float)
  - `direction: 'above' | 'below'`
  - `note?: string`
  - `triggered: boolean`
  - `createdAt: number` (Unix seconds UTC)
  - `triggeredAt?: number` (Unix seconds UTC)
- `createAlertStore(storage: StorageRepository)` provides:
  - `hydrate()`, `addAlert()`, `removeAlert()`, `clearTriggered()`, `replaceAllAlerts()`, and `evaluateQuote(quote: TickerQuote)` which transitions armed alerts to `triggered: true` when `quote.price >= targetPrice` (`above`) or `quote.price <= targetPrice` (`below`).

### 3.3 Technical Indicators Engine (`src/core/utils/indicators.ts`)
Pure mathematical functions operating on `readonly OHLCVCandle[]`:
- `calculateSMA(candles, period)`: Rolling arithmetic mean of close prices.
- `calculateEMA(candles, period)`: Exponentially weighted moving average (`k = 2 / (period + 1)`).
- `calculateBollingerBands(candles, period, stdDevMultiplier)`: Middle SMA band with `±k·σ` population standard deviation envelopes.
- `calculateVWAP(candles)`: Cumulative `∑(TypicalPrice × Volume) / ∑Volume` across candle bars.
- `calculateRSI(candles, period)`: Wilder's smoothed Relative Strength Index (`0`–`100`).

### 3.4 Trade Journal Analytics (`src/core/stores/journalStore.ts`)
- `computeJournalAnalytics(entries)` computes:
  - `totalTrades`, `closedTrades`, `winningTrades`, `losingTrades`
  - `winRate` (`0`–`100%`), `totalRealizedPnl`, `grossProfit`, `grossLoss`, `profitFactor`
  - `averageRMultiple` (for trades with `stopLoss` defined)
  - `equityCurve: Array<{ timestamp: number; cumulativePnl: number; tradePnl: number; ticker: string }>`

### 3.5 Workspace Backup & CSV Export (`src/core/utils/workspaceBackup.ts`)
- `WorkspaceBackupSchema` validates versioned JSON snapshots containing `watchlists`, `activeWatchlistId`, `annotationsByTicker`, `journalEntries`, and `priceAlerts`.
- `exportJournalEntriesToCsv(entries)` generates RFC-4180 compliant CSV output with proper quote escaping.

### 3.6 Session & Operator Preferences (`src/core/schemas/preferences.ts` / `StorageRepository`)
- Persists operator session state (`activeTicker`, `timeframe`, `activeIndicators`, `isWatchlistCollapsed`, `isJournalOpen`) so reloading the browser or launching the installed PWA restores the exact workstation layout.

---

## 4. Feature & Presentation Layer (`src/features/`, `src/ui/`)

### 4.1 Fibonacci Overlay Plugin & Interactive Anchor Dragging (`src/features/chart/overlays/`)
- `FibonacciPlugin.ts`:
  - Computes 7 standard Fibonacci retracement ratios (`0`, `0.236`, `0.382`, `0.5`, `0.618`, `0.786`, `1`).
  - Projects each level's logical price via `CoordinateProjector.priceToY(level.price)` across the horizontal span `[minX, maxX]`.
  - Renders alternating translucent zone fills, dashed level lines, diagonal anchor connector, and right-aligned `% ($price)` labels.
  - Supports hit-testing within the bounding box (`32px` padding) and interactive endpoint dragging in `AnnotationOverlayCanvas.tsx`.

### 4.2 Horizontal Price Alert Lines on Chart Canvas (`src/features/chart/overlays/AnnotationOverlayCanvas.tsx`)
- Projects all active (`!triggered`) price alerts for the current `ticker` using `projector.priceToY(alert.targetPrice)`.
- Renders dashed horizontal target lines across the viewport width with high-contrast pill tags (`▲ ABOVE $price` in emerald, `▼ BELOW $price` in amber).

### 4.3 Mooers' Law Keyboard-First Operator UX (`src/App.tsx`, `src/ui/layout/`)
- Global keyboard listener ignores events originating inside `<input>`, `<textarea>`, `<select>`, or `contentEditable` targets.
- Single-key bindings:
  - `/`: Focus symbol search input
  - `b`: Toggle Watchlist sidebar collapse (Zen chart mode)
  - `1`–`4`: Switch chart timeframe (`15m`, `1h`, `1D`, `1W`)
  - `s`, `t`, `f`, `m`: Arm Sticker, Trendline, Fibonacci, or Trade Marker tool
  - `Delete` / `Backspace`: Remove selected chart annotation
  - `j`: Toggle Trade Journal & Equity Curve drawer
  - `Esc`: Reset active tool / selection / open modals
  - `?`: Toggle Keyboard Shortcuts & Quick Start reference modal

### 4.4 Standalone Production Server & PWA (`server.mjs`, `public/manifest.json`)
- `server.mjs`: Zero-dependency Node HTTP server listening on `process.env.PORT || 4173`.
  - Proxies `/api/yahoo/v8/finance/chart/:symbol` directly to `https://query1.finance.yahoo.com` with automatic CORS and cache headers.
  - Serves compiled static assets from `dist/` with immutable caching for hashed bundles and SPA `index.html` fallback.
- `public/manifest.json` + SVG icons enable 1-click desktop/mobile installation.

---

## 5. Verification Matrix

1. **Type Safety & Architectural Guard**:
   - `npm run typecheck` (`tsc --noEmit`) passes with zero errors under `strict: true` and `noUncheckedIndexedAccess: true`.
2. **Automated Unit Tests**:
   - `npm run test` (`vitest run`) verifies all schemas, indicator calculations, alert triggers, Fibonacci level projections, journal analytics, backup/CSV serialization, and store actions.
3. **Production Build & Runtime**:
   - `npm run build && npm start` serves the production bundle and live `/api/yahoo` endpoint on port `4173`.
