# Original User Request

## 2026-10-27T07:56:15Z

Integrate the three Milestone 5 modules (`FibonacciPlugin`, `JournalAnalyticsCard`, and `createAlertStore` with a new `PriceAlertsPopover` UI) into the MarketView application and verify the end-to-end integration programmatically.

Working directory: /home/duke/Project/marketview
Integrity mode: development

## Requirements

### R1. Fibonacci Retracement Chart Integration
Register `FibonacciPlugin` (`src/features/chart/overlays/plugins/FibonacciPlugin.tsx`) in `src/features/chart/overlays/OverlayCanvas.tsx` and expose a "Fib" tool button in `src/features/chart/overlays/ChartToolbar.tsx` along with a two-step placement guidance banner in `OverlayCanvas.tsx` when `activeTool === 'fibonacci'`.

### R2. Journal Analytics Card Integration
Embed `JournalAnalyticsCard` (`src/features/journal/JournalAnalyticsCard.tsx`) inside `src/features/journal/TradeJournalDrawer.tsx` so users can inspect the chronological cumulative P&L equity curve, per-trade expectancy, and setup-tag win-rate attribution directly inside the journal drawer.

### R3. Price Alerts UI & Real-Time Quote Evaluation
Create a `PriceAlertsPopover` component in `src/ui/alerts/PriceAlertsPopover.tsx` allowing users to create (`CROSSING_UP` / `CROSSING_DOWN`), view (`ACTIVE` / `TRIGGERED` / `DISMISSED`), dismiss, re-arm, and delete price alerts for the active ticker. Wire `createAlertStore` (`src/core/stores/alertStore.ts`) into `src/App.tsx` and `src/ui/layout/TopHeaderBar.tsx` so refreshing or loading quotes automatically evaluates active alerts via `evaluateQuote` and displays a triggered-alert notification badge/banner.

### R4. Architectural Boundaries & End-to-End Verification
Maintain all architectural invariants in `AGENTS.md` and `.agents/rules/architecture-boundaries.md` (strictly headless `src/core/` with zero React/DOM imports, logical chart coordinates only) and add programmatic test coverage verifying the integrated Milestone 5 workflows.

## Verification Resources

- Typecheck command: `npm run typecheck` (`tsc --noEmit`)
- Unit & architectural boundary test suite: `npm run test` (`vitest run`)
- Production bundle build: `npm run build`
- Existing headless core boundary test: `src/core/__tests__/architecture-boundaries.test.ts`

## Acceptance Criteria

### Build & Type Safety
- [ ] `npm run typecheck` exits with code `0` and zero TypeScript errors.
- [ ] `npm run build` succeeds and produces a clean production bundle in `dist/`.

### Automated Tests & Architectural Invariants
- [ ] `npm run test` passes all existing and newly added unit/integration tests with zero failures.
- [ ] `src/core/__tests__/architecture-boundaries.test.ts` and `src/core/__tests__/mobile-portability.test.ts` pass without violations.

### Functional Completeness
- [ ] `FibonacciPlugin` is imported and registered in `OverlayCanvas.tsx`, selectable from `ChartToolbar.tsx`, and displays a placement status banner for both anchor clicks.
- [ ] `JournalAnalyticsCard` is rendered inside `TradeJournalDrawer.tsx` receiving live `trades` and `summary` props.
- [ ] `PriceAlertsPopover.tsx` is wired into `TopHeaderBar.tsx` and `App.tsx`, and quote updates in `App.tsx` invoke `alertStore.getState().evaluateQuote(quote)`.
