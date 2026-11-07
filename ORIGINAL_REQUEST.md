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


## 2026-11-07T17:24:58Z

Implement Milestone 15 performance and app behavior hardening for MarketView in `/home/duke/Project/marketview` following the specification in `docs/specs/milestone-15-performance-and-behavior-hardening.md`. Resolve high-frequency overlay drag and hover re-render bottlenecks, isolate cloud sync to domain entities (excluding view/indicators/polling), hide unused advanced tools (Fibonacci & Trade Marker), provide auto-refresh intervals (Off, 15s, 1m, 5m defaulting to Off), and ensure synchronous optimistic store state updates.

Working directory: /home/duke/Project/marketview
Integrity mode: development

Reference: `docs/specs/milestone-15-performance-and-behavior-hardening.md`

## Requirements

### R1. Overlay Drag Buffering & Debounced Keystroke Persistence
- In `TrendlinePlugin.tsx` and `FibonacciPlugin.tsx`, buffer anchor coordinates during mouse movement in local state (`dragAnchors`) for 60fps rendering without store updates, and commit `onUpdate({ anchors })` exactly once on `mouseup`.
- In `StickerPlugin.tsx`, buffer pin/header dragging in local state (`dragAnchor`) committing once on `mouseup`. Keep note textarea state synchronous for zero-lag typing, debounce `onUpdate({ payload: { markdown } })` by 250ms, and flush immediately on blur or unmount.
- Fix invalid JSX `style-custom` attribute on Trendline anchor handle.

### R2. Single-Pass Technical Indicators & O(log N) Coordinate Interpolation
- In `src/core/indicators/technicalIndicators.ts`, implement and export `computeAllChartIndicators(candles)` (calculating SMA 20, EMA 50, VWAP, RSI 14, BB 20, and summary in a single pass) and `findSurroundingCandles(sortedCandles, timestamp)` (binary search returning `{ left, right }` bounding candles).
- In `ChartContainer.tsx`, memoize `computeAllChartIndicators` to eliminate duplicate indicator calculations, use `findSurroundingCandles` in `projector.logicalToScreen`, update hover point state only when the snapped candidate point actually changes, and display the blocking loading overlay only when `isLoading && sortedCandles.length === 0`.

### R3. Strict Cloud Sync Isolation for Domain Data
- In `src/core/serialization/workspaceExport.ts`, ensure `computeWorkspaceContentHash` excludes `activeIndicators` and `pollIntervalSec` from the cloud dirty hash calculation so view/indicator toggles remain purely local.
- In `mergeWorkspaceSnapshots`, preserve local `activeIndicators` and `pollIntervalSec` on initialized devices (`hasSyncedBefore === true`).

### R4. Minimalist Toolbar & Relaxed Auto-Refresh
- In `ChartToolbar.tsx` and `src/App.tsx`, set `showAdvancedTools={false}` so only Pointer, Sticker, and Trendline appear in the chart toolbar.
- In `src/core/schemas/preferences.ts`, extend `LivePollIntervalSchema` to support `60` (1m) and `300` (5m) alongside `0`, `5`, `15`, `30`.
- In `ProviderSettingsPopover.tsx`, present the auto-refresh options: `Off` (`0`), `15s` (`15`), `1m` (`60`), and `5m` (`300`), displaying active status cleanly. Default remains `Off` (`0`).
- In `src/App.tsx`, add a visibility-aware polling interval (`document.visibilityState === 'visible'`) that refreshes active candles and watchlist quotes when `pollIntervalSec > 0`.

### R5. Store Consistency & App Hydration Hardening
- In `src/core/stores/annotationStore.ts` and `src/core/stores/watchlistStore.ts`, call `set(...)` synchronously before `await repository.save*()` in all mutating actions to eliminate read-modify-write race conditions.
- In `watchlistStore.hydrate()`, ensure `activeWatchlistId` falls back to `firstId` if the previously stored ID no longer exists in the loaded watchlists.
- In `src/App.tsx`, guard initial hydration so it runs strictly once on mount, initialize `lastSyncedHashRef.current` upon hydration completion, and refresh quotes after importing a workspace JSON backup.

## Acceptance Criteria

### Performance & Overlay Interaction
- [ ] Dragging trendline handles or the trendline body updates visual coordinates smoothly at 60fps without calling `annotationStore.updateAnnotation` or triggering IndexedDB writes during `mousemove`.
- [ ] Releasing the mouse after dragging a trendline or sticker commits the final anchors to the store with a single update call.
- [ ] Typing in a sticker note updates the textarea immediately without lag, and updates are persisted with a 250ms debounce (or flushed on blur).
- [ ] Moving the mouse across the chart within the same candle snap horizon does not re-render `ChartContainer` or `renderOverlayLayer`.

### Cloud Sync & Preferences Isolation
- [ ] Toggling indicators or switching the auto-refresh interval does not change `computeWorkspaceContentHash` and does not mark the workspace dirty (`isDirty === false`).
- [ ] Merging a remote snapshot on an initialized device preserves local `activeIndicators` and `pollIntervalSec`.

### Minimalist Toolbar & Auto-Refresh
- [ ] `ChartToolbar` renders only Pointer, Sticker, and Trendline buttons. Fibonacci and Trade Marker buttons are hidden.
- [ ] `ProviderSettingsPopover` provides selectable interval buttons: `Off`, `15s`, `1m`, and `5m`, defaulting to `Off`.
- [ ] When an interval (`15s`, `1m`, or `5m`) is active, quotes and candles refresh at the designated cadence while the document is visible.

### Test Verification & Zero Regressions
- [ ] `npm run typecheck` passes with 0 errors (`tsc --noEmit`).
- [ ] `npm run test` passes all tests cleanly with 0 failures across `src/core/` and `src/features/`.
- [ ] New unit tests in `src/core/__tests__/technical-indicators.test.ts` verify `findSurroundingCandles` and `computeAllChartIndicators`.
