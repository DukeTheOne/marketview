# MarketView Test Infrastructure & Architecture

## Overview
MarketView's testing infrastructure enforces strict architectural invariants (headless core isolation, logical coordinate projection, schema validation) while providing comprehensive, opaque-box verification across all functional layers.

The test suite runs under **Vitest** in a pure Node environment without requiring browser DOM globals or headless browsers, validating domain models, headless stores, coordinate projectors, and rendered React components via deterministic static markup assertions.

---

## Architecture & Boundaries

```
┌─────────────────────────────────────────────────────────────┐
│                 E2E & Integration Tests                     │
│  src/test/e2e/milestone5-e2e.test.ts (Tiers 1–4, 105 tests) │
│  src/core/__tests__/milestone-5-integration.test.ts         │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
               ▼                              ▼
┌──────────────────────────────┐┌──────────────────────────────┐
│       UI & Feature Tests     ││     Headless Core Tests      │
│  OverlayCanvas, ChartToolbar ││  alert-store, annotation-store│
│  TradeJournalDrawer, Popover ││  architecture-boundaries,     │
│  JournalAnalyticsCard        ││  mobile-portability, schemas  │
└──────────────────────────────┘└──────────────────────────────┘
```

### Invariants Enforced:
1. **Strict Headless Core (`src/core/**`)**:
   - Zero imports from React, `react-dom`, `lightweight-charts`, or UI components.
   - Zero references to browser DOM globals (`window`, `document`, `HTMLElement`, `localStorage`).
   - Pure domain validation through Zod schemas.
   - Verified by `src/core/__tests__/architecture-boundaries.test.ts` and `src/core/__tests__/mobile-portability.test.ts`.

2. **Logical Chart Coordinates (`src/core/schemas/annotation.ts`)**:
   - Every annotation anchor is strictly `{ timestamp: number, price: number }` (Unix UTC seconds + floating-point price).
   - Pixel screen coordinates (`x`, `y`) are prohibited from domain models and persistent storage.

3. **Storage Repository Abstraction**:
   - All persistence flows through the `StorageRepository` interface (`getWatchlists`, `saveWatchlists`, `getAnnotations`, `saveAnnotations`, `getTrades`, `saveTrades`).
   - Tests execute against `InMemoryStorageRepository` with zero side effects.

---

## Test Suite Structure (Tiers 1–4)

The test suite in `src/test/e2e/milestone5-e2e.test.ts` contains 105 tests organized into four rigorous tiers:

### Tier 1: Feature Coverage (45 tests, 5 per feature F1–F9)
- **F1 (Fibonacci Plugin Registration)**: Plugin registration in `overlayPluginRegistry`, `requiredAnchors === 2`, label `"Fib Retracement"`, default payload levels `[0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]`, and schema validation.
- **F2 (Fibonacci Toolbar Button)**: "Fib" button in `ChartToolbar`, `Percent` icon, active purple styling (`bg-purple-500 text-slate-950`), inactive styling, and tooltip guidance.
- **F3 (Fibonacci Two-Step Guidance Banner)**: Step 1 banner (`draftAnchors.length === 0`), step 2 banner (`draftAnchors.length === 1`), banner hiding when inactive or null, and canvas crosshair styling.
- **F4 (Journal Analytics Embedding)**: Embedding inside `TradeJournalDrawer`, section title, cumulative P&L equity curve SVG (`role="img"`), KPI cards (Expectancy, Best Win, Worst Loss), and Setup Tag attribution ranking list.
- **F5 (Price Alerts Popover UI)**: Conditional open/closed rendering, header title & price badge, direction selectors (`CROSSING_UP` / `CROSSING_DOWN`), alert list items with status badges, and action buttons.
- **F6 (Price Alerts Header Integration)**: "Alerts" button in `TopHeaderBar`, active alert count badge, pulsing `BellRing` icon on triggers, triggered alert notification banner, and "View" / dismiss actions.
- **F7 (Real-Time Quote Alert Evaluation)**: Empty store instantiation, normalized ticker addition, `CROSSING_UP` trigger logic, `CROSSING_DOWN` trigger logic, and trigger timestamp recording.
- **F8 (Headless Boundary Compliance)**: Schema validation with logical anchors, rejection of pixel coordinates, headless repository execution, pure P&L summary calculation, and annotation type schema enumeration.
- **F9 (E2E & Boundary Test Suite Pass)**: Concurrent store factory execution, quote schema parsing, alert schema parsing, trade entry schema parsing, and pure level math verification.

### Tier 2: Boundary & Corner Cases (45 tests, 5 per feature F1–F9)
- **F1 Corner Cases**: Inverted downtrend calculation (swing high to swing low), flat price range handling, micro-cent decimal precision, invalid ratio rejection outside `[0, 2]`, and draft preview null guards.
- **F2 Corner Cases**: Zero annotation count badge suppression, singular/plural badge formatting, rapid tool switching without class pollution, and preservation of all 5 tool buttons.
- **F3 Corner Cases**: Tool deselection transition to `pointer-events-none`, inter-tool switching from Fibonacci to Trendline, empty annotation list safety, co-existence with existing annotations, and selection banner suppression.
- **F4 Corner Cases**: Empty trade history empty state, open-only trades empty state, all-loss portfolio rose gradient, descending net P&L setup tag ranking, and untagged trade fallback.
- **F5 Corner Cases**: Empty alert list notice for active ticker, "Use $price" prefill button, active ticker vs All Alerts filter tabs, re-arm button for dismissed/triggered alerts, and note truncation.
- **F6 Corner Cases**: Zero alert count badge suppression when no active alerts exist, multiple simultaneously triggered alerts banner aggregation, pinging beacon animation, loading quote fallback, and timeframe tab switching.
- **F7 Corner Cases**: Exact price boundary hit triggering, large earnings gap jumps, non-retriggering guard on already triggered alerts, and `shouldTriggerAlert` status check safety.
- **F8 Corner Cases**: Rejection of Infinity/NaN in alert prices, complex JSON payloads with arbitrary properties, lossless JSON serialization roundtripping, exact dollar/percent P&L return formulas, and rejection of string timestamps.
- **F9 Corner Cases**: Complete isolation between independent alert store instances, 100-tick high-frequency stream performance, repository ticker filtering for annotations and trades, and `clearTriggeredBanner` independence from alert status.

### Tier 3: Cross-Feature Combinations (10 tests)
- **T3-01 (F1 x F8)**: Fibonacci plugin stores and retrieves strictly logical anchors via headless storage repository.
- **T3-02 (F2 x F3)**: Toolbar tool selection directly drives OverlayCanvas banner status display.
- **T3-03 (F4 x F7)**: Alert trigger event followed by journal trade logging & analytics curve recalculation.
- **T3-04 (F5 x F6)**: Creating alerts in popover updates TopHeaderBar active badge count.
- **T3-05 (F6 x F7)**: Quote evaluation triggering alert reflects immediately in TopHeaderBar banner and pulsing badge.
- **T3-06 (F3 x F1)**: Two anchor clicks produce a valid registered Fibonacci annotation in registry.
- **T3-07 (F4 x F8)**: Journal analytics calculations operate purely on headless TradeEntry domain models without DOM.
- **T3-08 (F5 x F7)**: Rearming a dismissed alert in popover enables subsequent evaluateQuote to re-trigger it.
- **T3-09 (F1 x F2 x F3)**: Full chart annotation cycle (select from toolbar -> banner guides -> commit -> registry renders).
- **T3-10 (F5 x F6 x F7)**: Complete alert lifecycle (create via popover -> visible in header -> quote stream triggers -> banner appears -> dismiss removes banner and updates state).

### Tier 4: Real-World Application Scenarios (5 tests)
- **T4-S1 (Comprehensive Swing Trader Technical Analysis Workflow)**: Fibonacci retracement calculated on NVDA swing low ($100) to swing high ($200); CROSSING_DOWN price alert armed at 61.8% golden ratio level ($161.80); market pulls back and triggers alert; buy position executed and exited at $195.00 target; journal analytics curve updates with +$1675.00 profit and 100% win rate on "Fib Confluence" setup.
- **T4-S2 (Multi-Asset Watchlist & Breakout Scalper Workflow)**: Simultaneous alerts across AAPL, TSLA, MSFT; multi-symbol quote stream triggers AAPL and TSLA concurrently; trader dismisses AAPL and re-arms TSLA; subsequent quote stream re-triggers TSLA while ignoring dismissed AAPL.
- **T4-S3 (Complete Risk Management & Stop-Loss Breakdown Workflow)**: Long position opened on MSFT at $410; stop-loss alert set at $400; price breaches to $398; alert triggers; trader closes position at stop price; journal analytics renders rose gradient equity curve, -$240.00 realized P&L, and updated worst loss metric.
- **T4-S4 (Full Session Hydration, State Persistence & Recovery Workflow)**: Initial session loaded from repository containing persisted Fibonacci annotations and historical trades; store hydration on mount; TradeJournalDrawer renders live analytics curve and setup tags seamlessly.
- **T4-S5 (Adversarial Stress & Error Recovery Workflow)**: Invalid alert inputs (negative prices, zero prices, whitespace tickers) rejected with schema errors without corrupting store; penny-stock micro-price alert ($0.0001) armed and triggered during volatility spike; alert cleanly removed from both alerts list and banner state.

---

## Test Execution Commands

| Target | Command | Expected Output |
|--------|---------|-----------------|
| Typecheck | `npm run typecheck` | 0 TypeScript errors (`tsc --noEmit` exits code 0) |
| Complete Test Suite | `npm run test` | 14 test files passed, 160 tests passed |
| E2E Suite Only | `npx vitest run src/test/e2e/milestone5-e2e.test.ts` | 1 test file passed, 105 tests passed |
| Production Build | `npm run build` | Clean bundle generated in `dist/` |
