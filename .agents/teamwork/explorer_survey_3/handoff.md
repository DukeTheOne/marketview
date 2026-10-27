# Handoff Report: Survey of Requirements R3 & R4 (Price Alerts UI & Architectural Boundaries)

## 1. Observation

Direct code-level inspection was conducted across all files relevant to Requirement R3 (Price Alerts UI & Quote Evaluation) and Requirement R4 (Architectural Boundaries & Verification).

### 1.1 Headless Core: `src/core/schemas/alert.ts`
- **Location**: `src/core/schemas/alert.ts` (46 lines).
- **Domain Schemas & Types**:
  - `AlertConditionSchema` (line 7): `z.enum(['CROSSING_UP', 'CROSSING_DOWN'])` -> `AlertCondition`.
  - `AlertStatusSchema` (line 13): `z.enum(['ACTIVE', 'TRIGGERED', 'DISMISSED'])` -> `AlertStatus`.
  - `PriceAlertSchema` (lines 19–29):
    ```ts
    export const PriceAlertSchema = z.object({
      id: z.string().min(1),
      ticker: TickerSymbolSchema, // uppercase, trimmed string
      targetPrice: z.number().finite().positive(),
      condition: AlertConditionSchema,
      status: AlertStatusSchema.default('ACTIVE'),
      note: z.string().default(''),
      createdAt: z.number().int().positive(),
      triggeredAt: z.number().int().positive().optional(),
    });
    ```
  - `shouldTriggerAlert(alert: PriceAlert, currentPrice: number): boolean` (lines 34–45):
    - Returns `false` if `alert.status !== 'ACTIVE'`.
    - If `CROSSING_UP`: returns `currentPrice >= alert.targetPrice`.
    - If `CROSSING_DOWN`: returns `currentPrice <= alert.targetPrice`.

### 1.2 Headless Core: `src/core/stores/alertStore.ts`
- **Location**: `src/core/stores/alertStore.ts` (144 lines).
- **State & Actions**:
  ```ts
  export interface AlertStoreState {
    alerts: PriceAlert[];
    lastTriggeredAlertIds: string[];
    addAlert: (input: {
      ticker: string;
      targetPrice: number;
      condition: AlertCondition;
      note?: string;
    }) => PriceAlert;
    removeAlert: (id: string) => void;
    dismissAlert: (id: string) => void;
    rearmAlert: (id: string) => void;
    clearTriggeredBanner: () => void;
    evaluateQuote: (quote: TickerQuote) => PriceAlert[];
    getAlertsForTicker: (ticker: string) => PriceAlert[];
  }
  ```
- **Store Factory**: `createAlertStore(initialAlerts: PriceAlert[] = []): AlertStore` (lines 33–143).
- **Behavior Observations**:
  - `addAlert` generates ID format `alert-${nowSec}-${random}`, defaults status to `'ACTIVE'`, and prepends to `alerts`.
  - `removeAlert(id)` removes from both `alerts` and `lastTriggeredAlertIds`.
  - `dismissAlert(id)` sets `status: 'DISMISSED'` and removes from `lastTriggeredAlertIds`.
  - `rearmAlert(id)` sets `status: 'ACTIVE'`, clears `triggeredAt: undefined`, and removes from `lastTriggeredAlertIds`.
  - `clearTriggeredBanner()` clears `lastTriggeredAlertIds: []` without altering alert status.
  - `evaluateQuote(quote)` scans active alerts matching `alert.ticker === quote.ticker`. For any where `shouldTriggerAlert(alert, quote.price)` is true, transitions `status: 'TRIGGERED'`, records `triggeredAt: quote.timestamp`, appends to `lastTriggeredAlertIds`, and returns the array of newly triggered alerts.
  - Zero imports from React, DOM globals, or UI libraries (strictly uses `zustand/vanilla`, `../schemas/alert`, `../schemas/market`).

### 1.3 Core Index: `src/core/index.ts`
- **Lines 5 & 20**: Already exports `export * from './schemas/alert';` and `export * from './stores/alertStore';`.

### 1.4 UI Components: `src/ui/alerts/` & `src/ui/alerts/PriceAlertsPopover.tsx`
- **Search Result**: `src/ui/alerts/` does not exist on disk.
- `PriceAlertsPopover.tsx` is completely missing and must be authored from scratch.

### 1.5 Header Integration: `src/ui/layout/TopHeaderBar.tsx`
- **Location**: `src/ui/layout/TopHeaderBar.tsx` (148 lines).
- **Current State**:
  - Props (`TopHeaderBarProps`, lines 6–17): accepts `activeTicker`, `activeTimeframe`, `quote`, `providerId`, `isLoading`, `isJournalOpen`, `tradeCount`, `onSelectTimeframe`, `onRefresh`, `onToggleJournal`.
  - Right-side action bar (lines 89–144): contains Timeframe buttons (90–108), Journal drawer toggle button (111–127), Provider badge (129–132), and Refresh button (134–143).
  - Observation: Currently no button or container for Price Alerts or notification banners exists in `TopHeaderBar.tsx`.

### 1.6 App Wiring: `src/App.tsx`
- **Location**: `src/App.tsx` (287 lines).
- **Current State**:
  - Lines 22–46 (`useMemo`): instantiates `marketStore`, `watchlistStore`, `annotationStore`, and `tradeJournalStore`. Observation: `createAlertStore` is not yet called or instantiated.
  - Lines 48–69: Zustand store selectors. Observation: `alertStore` is not subscribed to.
  - Lines 50 & 97: `const quotesByTicker = useStore(marketStore, (s) => s.quotesByTicker);` and `const activeQuote = quotesByTicker[activeTicker];`.
  - Lines 73–87 & 89–93: `useEffect` hooks fetching candles and quotes. Observation: quote updates are not forwarded to `evaluateQuote`.
  - Lines 104–124: `TopHeaderBar` rendered without alert-related props.

### 1.7 Architectural Boundaries & Tests
- **Boundary Test**: `src/core/__tests__/architecture-boundaries.test.ts` (88 lines) verifies:
  - No file in `src/core/**` (excluding `__tests__`) imports `react`, `react-dom`, `lightweight-charts`, or `src/ui` / `src/features`.
  - No file references DOM globals (`window`, `document`, `localStorage`, `HTMLElement`).
  - `ChartAnnotationSchema` enforces logical `(timestamp, price)` coordinates and rejects pixel coordinates.
- **Portability Test**: `src/core/__tests__/mobile-portability.test.ts` (128 lines) runs `runMobileSimulation` from `src/mobile/mobileRunner.ts` in pure headless mode.
- **Baseline Test Commands**:
  - `npm run typecheck`: Exited code 0 (0 TypeScript errors).
  - `npm run test`: All 10 test files and 27 tests passed in 1.35s.
  - `npm run build`: Exited code 0; Vite production bundle built successfully.

---

## 2. Logic Chain

1. **Headless Core Readiness (from Observations 1.1, 1.2, 1.3)**:
   - `alertStore.ts` and `schemas/alert.ts` are fully developed and tested with 100% pass rate in `src/core/__tests__/alert-store.test.ts`.
   - The store factory `createAlertStore()` is exported at `src/core/index.ts`.
   - Therefore, zero modifications are required inside `src/core/` for the alert store itself.

2. **Component Authoring Gap (from Observation 1.4)**:
   - `src/ui/alerts/PriceAlertsPopover.tsx` must be created.
   - To align with MarketView's architectural boundaries:
     - The component must import domain types (`PriceAlert`, `AlertCondition`, `AlertStatus`) only from `../../core` (or `../../core/schemas/alert`).
     - It must provide:
       1. Active ticker alert creation form: Target Price (number input), Direction selector (`CROSSING_UP` vs `CROSSING_DOWN`), optional Note input, and Submit button.
       2. Alerts list displaying status badges (`ACTIVE`, `TRIGGERED`, `DISMISSED`) and timestamps.
       3. Action buttons per alert: Dismiss (`dismissAlert`), Re-arm (`rearmAlert`), and Delete (`removeAlert`).
       4. Popover dropdown styling consistent with `WatchlistSidebar.tsx` and `ChartToolbar.tsx` (Tailwind dark theme, slate/emerald/amber palette).

3. **Header Integration Strategy (from Observation 1.5)**:
   - `TopHeaderBar.tsx` should expose an Alerts toggle button next to the Journal button.
   - Visual indicators needed:
     - Badge displaying number of active alerts for the current ticker.
     - Pulsing indicator or amber badge when `lastTriggeredAlertIds.length > 0`.
   - Triggered Alert Banner:
     - When `lastTriggeredAlertIds.length > 0`, display a prominent dismissible notification banner (`BellRing` icon, trigger summary, "View" button to open popover, and "Dismiss" button calling `clearTriggeredBanner`).
   - Prop contract: `TopHeaderBarProps` should accept either alert callbacks/state or receive `alertStore: AlertStore`. Exposing explicit props and callbacks preserves testability.

4. **App Integration & Quote Evaluation (from Observation 1.6)**:
   - In `App.tsx`:
     1. Add `alertStore: createAlertStore()` inside `useMemo(() => { ... }, [])`.
     2. Subscribe to `alerts` and `lastTriggeredAlertIds` via `useStore(alertStore, ...)`.
     3. Add a dedicated `useEffect` observing `quotesByTicker`:
        ```tsx
        useEffect(() => {
          for (const quote of Object.values(quotesByTicker)) {
            alertStore.getState().evaluateQuote(quote);
          }
        }, [quotesByTicker, alertStore]);
        ```
     4. This guarantees that:
        - When initial quotes load, alerts are evaluated.
        - When quotes refresh on timeframe or symbol change, alerts are evaluated.
        - When watchlist quotes refresh, alerts across all watchlist tickers are evaluated.
        - Triggered alerts instantly update `lastTriggeredAlertIds` and trigger UI reactivity.
     5. Pass alert state and action handlers into `TopHeaderBar`.

5. **Architectural Boundary Compliance (from Observation 1.7)**:
   - `PriceAlertsPopover.tsx` is placed inside `src/ui/alerts/` (UI layer).
   - `src/core/` is untouched and remains strictly headless.
   - Zero DOM globals or React imports are introduced to `src/core/`.
   - `src/core/__tests__/architecture-boundaries.test.ts` will continue to pass.

6. **Comprehensive Milestone 5 Test Suite (from Observations 1.1–1.7)**:
   - In addition to existing tests, create `src/core/__tests__/milestone-5-integration.test.ts` to programmatically verify:
     - Fibonacci annotation creation, logical coordinate persistence, and default levels.
     - Journal analytics KPI calculation and trade marker linkage.
     - Alert store quote evaluation, triggering, dismiss, re-arm, and multi-symbol scoping.

---

## 3. Caveats

1. **Method Naming in `alertStore`**:
   - The method to delete an alert in `alertStore.ts` is named `removeAlert(id: string)` (not `deleteAlert`).
   - The method to add an alert is `addAlert(input)` (not `createAlert`).
   - The popover component can expose `onCreateAlert` and `onDeleteAlert` in its prop contract and map them to `addAlert` and `removeAlert`.

2. **Triggered Banner vs Dismissing Alert**:
   - `clearTriggeredBanner()` only clears `lastTriggeredAlertIds` (removes the banner); it leaves the alert status as `'TRIGGERED'`.
   - `dismissAlert(id)` sets the alert status to `'DISMISSED'` AND removes it from `lastTriggeredAlertIds`.
   - The UI should support both: a banner close button that calls `clearTriggeredBanner()` and per-alert buttons that call `dismissAlert(id)` or `rearmAlert(id)`.

3. **Multi-Ticker Alert Evaluation**:
   - `marketStore.quotesByTicker` contains quotes for all tickers in the active watchlist plus the active ticker.
   - Looping over `Object.values(quotesByTicker)` in `App.tsx` evaluates alerts across all loaded symbols, which is the intended behavior.

4. **Popover Positioning & Focus**:
   - Ensure the popover container uses `absolute right-0 top-full mt-2 z-50` relative to the Alerts button so it doesn't clip on smaller viewports.

---

## 4. Conclusion

Requirements R3 and R4 have a clear and straightforward path to complete implementation:
1. **Core domain logic (`alertStore.ts` and `schemas/alert.ts`) is 100% complete and tested**.
2. **Missing UI file to create**: `src/ui/alerts/PriceAlertsPopover.tsx`.
3. **Files to update**:
   - `src/ui/layout/TopHeaderBar.tsx`: Add Alerts toggle button, badge, triggered banner, and popover anchor.
   - `src/App.tsx`: Initialize `alertStore`, wire `evaluateQuote` on `quotesByTicker` updates, and forward alert props to `TopHeaderBar`.
4. **New Integration Test to create**: `src/core/__tests__/milestone-5-integration.test.ts` to verify the end-to-end integration of Fibonacci, Journal Analytics, and Price Alerts alongside architectural boundaries.

### Detailed Interface Specification for `PriceAlertsPopover.tsx`
```tsx
export interface PriceAlertsPopoverProps {
  isOpen: boolean;
  activeTicker: string;
  currentPrice?: number;
  alerts: PriceAlert[];
  lastTriggeredAlertIds: string[];
  onClose: () => void;
  onCreateAlert: (input: {
    ticker: string;
    targetPrice: number;
    condition: AlertCondition;
    note?: string;
  }) => void;
  onDismissAlert: (id: string) => void;
  onRearmAlert: (id: string) => void;
  onDeleteAlert: (id: string) => void;
  onClearTriggeredBanner?: () => void;
}
```

---

## 5. Verification Method

To verify Requirements R3 & R4 independently after implementation:

1. **Typecheck Verification**:
   ```bash
   npm run typecheck
   ```
   *Expected*: Code 0, zero errors.

2. **Automated Unit & Boundary Test Suites**:
   ```bash
   npm run test
   ```
   *Expected*: All test suites pass, specifically:
   - `src/core/__tests__/alert-store.test.ts`
   - `src/core/__tests__/architecture-boundaries.test.ts`
   - `src/core/__tests__/mobile-portability.test.ts`
   - `src/core/__tests__/milestone-5-integration.test.ts` (newly added)

3. **Production Build Verification**:
   ```bash
   npm run build
   ```
   *Expected*: Code 0, generates `dist/` bundle cleanly without bundling errors.

4. **Headless Invariant Verification**:
   - Confirm `src/core/` has 0 imports from `react`, `react-dom`, `lightweight-charts`, `src/ui`, `src/features`, or browser DOM globals.
   - Invalidation condition: If any file in `src/core/` imports React or DOM globals, `architecture-boundaries.test.ts` will immediately fail.
