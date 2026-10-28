# MarketView

**High-Velocity Stock Market Watchlist, Logical Chart Annotation Engine & Trade Execution Journal**

MarketView is a local-first, keyboard-driven market workstation built around a **strict headless core** (`src/core/`). Designed in accordance with **Mooers' Law**—*an information system will be used only when it is more painless and trouble-free to use than not to use*—MarketView starts in seconds with zero API keys required, anchors every chart drawing to logical `(timestamp, price)` coordinates, and persists your entire workspace locally in IndexedDB with 1-click JSON/CSV portability.

---

## ⚡ 30-Second Quick Start

### 1. Development Mode (Hot Reload + Live Yahoo Proxy)

```bash
npm install
npm run dev
```

Open **`http://localhost:5173`** in your browser. Live market quotes and multi-timeframe OHLCV candles stream automatically via the built-in `/api/yahoo` proxy.

### 2. Production Build & Standalone Server

Build the optimized production bundle and launch the zero-dependency standalone Node server (serves `dist/` + the live `/api/yahoo` market data proxy):

```bash
npm run build
npm start
```

Open **`http://localhost:4173`** (or set a custom port with `PORT=8080 npm start`).

### 3. Install as a Desktop or Mobile App (PWA)

MarketView ships with a Web App Manifest (`public/manifest.json`) and standalone viewport configuration so you can run it like a native desktop or mobile terminal:

- **Chrome / Edge / Brave (Desktop)**: Click the **Install MarketView** icon inside the right edge of the address bar (or open `Menu ⋮ → Save and share → Install MarketView...`). MarketView launches in its own dedicated OS window without browser chrome.
- **iOS / iPadOS (Safari)**: Open MarketView, tap **Share**, and select **Add to Home Screen**.
- **Android (Chrome)**: Tap `Menu ⋮ → Install app` (or **Add to Home screen**).

---

## ⌨️ Keyboard-First Daily Workflow (Cheat Sheet)

Keep your hands on the keyboard during active market sessions. Every core action has a direct single-key binding (automatically suppressed when typing inside an input field):

| Shortcut | Action |
| :--- | :--- |
| `/` | **Search Symbol**: Focus the top ticker search input to jump to or add any symbol (`AAPL`, `NVDA`, `BTC-USD`, `SPY`) |
| `b` | **Zen Chart Mode**: Toggle the left Watchlist & Price Alerts sidebar to maximize chart canvas area |
| `1` – `4` | **Switch Timeframe**: `1` = `15m`, `2` = `1h`, `3` = `1D`, `4` = `1W` |
| `s` | **Sticker Tool**: Arm emoji sticker placement (`🚀`, `⚠️`, `🎯`, `💎`, `🔥`, `📉`) at a logical `(timestamp, price)` |
| `t` | **Trendline Tool**: Arm 2-point logical trendline drawing (click anchor A, then click anchor B) |
| `f` | **Fibonacci Tool**: Arm 2-point Fibonacci retracement drawing (`0%`, `23.6%`, `38.2%`, `50%`, `61.8%`, `78.6%`, `100%`) |
| `m` | **Trade Marker Tool**: Arm `BUY` or `SELL` execution marker placement on the chart |
| `Del` / `Backspace` | **Delete Annotation**: Remove the currently selected chart annotation |
| `j` | **Trade Journal Drawer**: Toggle the bottom Trade Execution Journal & Equity Curve Analytics drawer |
| `Esc` | **Cancel / Reset**: Cancel active drawing tool, deselect active annotation, or close open modals/drawers |
| `?` | **Shortcuts Guide**: Open or close the interactive Keyboard Shortcuts & Quick Reference modal |

> **Tip**: Click any existing Sticker, Trendline, Fibonacci retracement, or Trade Marker on the chart to select it, **drag its anchor handles** to adjust its logical `(timestamp, price)` coordinates in real time, or press `Delete` / `Backspace` to remove it.

---

## 📡 Live Market Data Modes

Switch data providers anytime from the top header bar without losing your watchlists, annotations, or journal entries:

1. **Yahoo Finance Live Stream (Default — Zero API Key)**
   - Works out-of-the-box with no registration or API key required.
   - Fetches real-time quotes and multi-timeframe OHLCV history (`15m`, `1h`, `1D`, `1W`) for equities, ETFs, indices, and crypto via the local `/api/yahoo` proxy.
   - Automatically falls back to deterministic synthetic candles if your machine goes offline.
2. **Finnhub REST API Mode**
   - Select **Finnhub** in the header data-source selector and paste a free Finnhub API key (or configure `VITE_FINNHUB_API_KEY` in `.env`).
   - All requests pass through `CachedMarketDataProvider` with TTL caching and in-flight promise deduplication to protect free-tier rate limits.
3. **Deterministic Offline Demo Mode**
   - Select **Demo** for 100% offline, reproducible market data powered by a seeded PRNG (`mulberry32`) and Box-Muller volatility generator.

---

## 🛠️ Core Capabilities Overview

### 1. Logical `(timestamp, price)` Chart Overlays
- **No Brittle Pixel Coordinates**: Every chart drawing is validated with `ChartAnnotationSchema` and stored exclusively as logical `(timestamp, price)` anchors. Drawings automatically stay locked to price action across zoom, pan, window resize, and timeframe switches.
- **Full Annotation Suite**:
  - **Emoji Stickers (`s`)**: Rapid visual callouts anchored to specific candle timestamps and price levels.
  - **2-Point Trendlines (`t`)**: Support, resistance, and channel lines with customizable stroke color and width.
  - **Fibonacci Retracements (`f`)**: Automatic 7-level retracement grids (`0.0%` to `100.0%`) with shaded price zones and live price labels.
  - **Trade Execution Markers (`m`)**: High-contrast `BUY` / `SELL` badges anchored directly to execution bars.
- **Interactive Anchor Dragging**: Select any annotation on the canvas and drag its anchor points (`PointerDown` → `PointerMove` → `PointerUp`) with automatic persistence to `StorageRepository`.
- **Horizontal Price Alert Lines**: Armed price alerts for the active ticker render directly on the chart canvas as dashed horizontal target lines (`▲ ABOVE` in emerald / `▼ BELOW` in amber) with right-axis price tags.

### 2. Technical Indicators & Live Telemetry
- Computed via pure, zero-DOM mathematical utilities in `src/core/utils/indicators.ts`:
  - **SMA 20** (Simple Moving Average)
  - **EMA 50** (Exponential Moving Average)
  - **BB 20** (20-period Bollinger Bands, `±2σ` upper/lower envelopes)
  - **VWAP** (Cumulative Volume-Weighted Average Price)
  - **Volume Histogram** (Color-coded bullish/bearish volume bars)
  - **Live RSI (14) Badge**: Real-time Relative Strength Index readout in the chart header with automatic overbought (`≥ 70`) and oversold (`≤ 30`) highlighting.

### 3. Trade Execution Journal, Equity Curve Analytics & Data Portability
- **FIFO Realized PnL & Portfolio Metrics**: Log `LONG` and `SHORT` executions with quantity, price, stop-loss, and setup notes. MarketView automatically computes **Total Realized PnL**, **Win Rate %**, **Profit Factor**, **Average R-Multiple**, **Max Drawdown**, and renders an interactive **SVG Cumulative Equity Curve**.
- **1-Click CSV Export**: Export your complete trade execution ledger to a standard `.csv` file for spreadsheet analysis or tax reporting.
- **1-Click Workspace JSON Backup & Restore**: Export or restore all watchlists, chart annotations, trade journal entries, and price alerts as a single Zod-validated `.json` workspace file.

### 4. Financial MCP Server & Headless Mobile Runner
- **Model Context Protocol (MCP) Server (`src/mcp/server.mjs`)**:
  - Connect Claude Desktop, Cursor, or any MCP client to MarketView's financial data engine over `stdio`:
    ```bash
    npm run mcp
    ```
  - Exposes `get_live_quote`, `get_historical_candles`, `get_technical_summary` (`SMA 20`, `EMA 50`, `RSI 14`, `BB 20`, `VWAP`), and `render_ascii_chart`.
- **Headless Mobile Simulation (`npm run demo:mobile`)**:
  - Demonstrates that `src/core/` runs 100% unmodified in a non-browser runtime (React Native / Expo / Node CLI):
    ```bash
    npm run demo:mobile
    ```

---

## 🏗️ Headless Core Architecture & Verification

MarketView enforces strict architectural boundaries between its portable domain core (`src/core/`) and the web presentation layer (`src/ui/`, `src/features/`):

```text
src/
├── core/
│   ├── schemas/        # Zod schemas & inferred types (TickerQuote, OHLCVCandle, ChartAnnotation, Watchlist, TradeEntry, PriceAlert)
│   ├── providers/      # MarketDataProvider port, CachedMarketDataProvider decorator, YahooFinanceProvider, FinnhubProvider, DeterministicDemoProvider
│   ├── repositories/   # StorageRepository port, InMemoryStorageRepository (tests/CLI), IndexedDBStorageRepository (browser + localStorage fallback)
│   ├── stores/         # Headless Zustand vanilla store factories (watchlistStore, chartStore, annotationStore, journalStore, alertStore)
│   └── utils/          # Pure technical indicators (SMA, EMA, Bollinger Bands, VWAP, RSI) & workspace backup/CSV serializers
├── features/
│   ├── chart/          # TradingView Lightweight Charts v5 host + HTML5 Canvas overlay engine (Sticker, Trendline, Fibonacci, TradeMarker, Alert lines)
│   └── journal/        # Trade execution logging drawer, FIFO PnL analytics & SVG equity curve
├── ui/                 # Watchlist sidebar, Price Alerts panel, Keyboard Shortcuts modal, Workspace backup controls
└── mcp/                # Standalone Model Context Protocol (MCP) financial server (stdio)
```

### Verification Commands

Run the full verification suite at any time:

```bash
# 1. Strict TypeScript check (strict: true, noUncheckedIndexedAccess: true)
npm run typecheck

# 2. Headless Core & Domain Unit Tests (Vitest)
npm run test

# 3. Production Bundle Build
npm run build

# 4. Headless Mobile Core Portability Proof
npm run demo:mobile
```
