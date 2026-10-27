# Project: MarketView Milestone 5 Integration

## Architecture
MarketView is architected with a strict headless core (`src/core/`) separated from the React web interface (`src/ui/`, `src/features/`).
- **Headless Core (`src/core/`)**: Zero UI/DOM imports. Domain schemas (`zod`), headless stores (`zustand/vanilla`), and persistence ports (`StorageRepository`).
- **Chart Feature (`src/features/chart/`)**: TradingView `lightweight-charts` v5 host component, `OverlayCanvas` coordinate projection engine, and plugin registry (`StickerPlugin`, `TrendlinePlugin`, `TradeMarkerPlugin`, `FibonacciPlugin`).
- **Journal Feature (`src/features/journal/`)**: `TradeJournalDrawer` with KPI stats, trade execution logging, historical trade table, and `JournalAnalyticsCard` (cumulative P&L equity curve SVG, trade expectancy, setup-tag win-rate attribution).
- **Alerts Feature (`src/ui/alerts/`)**: `PriceAlertsPopover` for creating, viewing, dismissing, and re-arming price alerts, wired via `TopHeaderBar` and real-time quote evaluation in `App.tsx`.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1 | Fibonacci Plugin Registration | Auto-register `FibonacciPlugin` in `OverlayCanvas.tsx` via side-effect import | M1 | ORIGINAL_REQUEST §R1 |
| F2 | Fibonacci Toolbar Button | Add "Fib" button with `Percent` icon in `ChartToolbar.tsx` | M1 | ORIGINAL_REQUEST §R1 |
| F3 | Fibonacci Two-Step Guidance Banner | Display placement status banner in `OverlayCanvas.tsx` for both anchor clicks | M1 | ORIGINAL_REQUEST §R1 |
| F4 | Journal Analytics Embedding | Embed `JournalAnalyticsCard` in `TradeJournalDrawer.tsx` receiving live `trades` and `summary` | M2 | ORIGINAL_REQUEST §R2 |
| F5 | Price Alerts Popover UI | Create `PriceAlertsPopover.tsx` in `src/ui/alerts/` with create/view/dismiss/rearm/delete actions | M3 | ORIGINAL_REQUEST §R3 |
| F6 | Price Alerts Header Integration | Wire Alerts toggle, badge, and triggered notification banner into `TopHeaderBar.tsx` | M3 | ORIGINAL_REQUEST §R3 |
| F7 | Real-Time Quote Alert Evaluation | Instantiate `createAlertStore` in `App.tsx` and evaluate incoming quotes via `evaluateQuote` | M3 | ORIGINAL_REQUEST §R3 |
| F8 | Headless Boundary Compliance | Zero React/DOM imports in `src/core/`, logical coordinates only | M4 | ORIGINAL_REQUEST §R4 |
| F9 | E2E & Boundary Test Suite Pass | 100% pass on all existing, unit, integration, and E2E test suites with zero regressions | M4 | ORIGINAL_REQUEST §R4 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Fibonacci Chart Integration | Register `FibonacciPlugin` in `OverlayCanvas.tsx`, add "Fib" button in `ChartToolbar.tsx`, add guidance banner | none | DONE |
| M2 | Journal Analytics Integration | Embed `JournalAnalyticsCard` inside `TradeJournalDrawer.tsx` with live props | none | DONE |
| M3 | Price Alerts UI & Quote Evaluation | Create `PriceAlertsPopover.tsx`, integrate into `TopHeaderBar.tsx`, and wire `evaluateQuote` in `App.tsx` | none | DONE |
| M-E2E | E2E Testing Suite Track | Requirements-driven E2E test suites (Tiers 1-4) published via `TEST_READY.md` | none | DONE |
| M4 | Final Milestone: E2E Pass & Hardening | Pass 100% E2E tests (Tiers 1-4) + Adversarial hardening (Tier 5) + Forensic Audit | M1, M2, M3, M-E2E | DONE |

## Verification Outcomes
- `npm run typecheck`: Exit code 0, 0 TypeScript errors.
- `npm run test`: 17 test files passed, 209 tests passed, 0 failures.
- `npm run build`: Clean production bundle in `dist/`.
- `npm run demo:mobile`: 6/6 headless mobile simulation stages passed.
- Gate Reviewers: `reviewer_1` (APPROVE), `reviewer_2` (APPROVE).
- Gate Challengers: `challenger_1` (APPROVE), `challenger_2` (APPROVE).
- Forensic Integrity Auditor: `auditor_1` (CLEAN).
