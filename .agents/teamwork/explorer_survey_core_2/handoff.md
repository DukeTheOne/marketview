# Survey Core Explorer: Investigation & Baseline Report (Milestone 15)

## 1. Observation

### 1.1 Baseline Test & Typecheck Execution
- Command: `npm run typecheck` (`tsc --noEmit`)
  - Result: Code `0`, zero TypeScript errors.
- Command: `npm run test` (`vitest run`)
  - Result: Code `0`. 29 test files passed, 331 tests passed, 0 failures.
- Command: `npx vitest run src/core/`
  - Result: Code `0`. 18 test files passed, 133 tests passed, 0 failures.

### 1.2 `src/core/indicators/technicalIndicators.ts` & `src/core/index.ts`
- **File size**: 728 lines in `src/core/indicators/technicalIndicators.ts`.
- **Existing Exports**:
  - Schemas: `IndicatorIdSchema`, `IndicatorPointSchema`, `BollingerPointSchema`, `IntradayPricePointSchema`
  - Types: `IndicatorId`, `PrimaryChartStyle`, `IndicatorPoint`, `BollingerPoint`, `IntradayPricePoint`, `ChartIndicatorsSummary`, `ProjectedHoverPoint`
  - Helpers: `getActiveChartStyle`, `normalizeExclusiveChartStyle`, `toggleExclusiveChartStyle`, `formatCompactVolume`, `calculateSMA`, `calculateEMA`, `calculateBollingerBands`, `calculateVWAP`, `calculateRSI`, `computeChartIndicatorsSummary`, `buildIntradayPricePoints`, `computeAutoIntradayLod`, `computeAutoCandlesLod`, `findNearestHoverPoint`.
- **Missing Functions & Types**:
  - `ComputedChartIndicators` interface is not declared.
  - `computeAllChartIndicators(candles)` is not declared or exported.
  - `findSurroundingCandles(sortedCandles, timestamp)` is not declared or exported.
- **Consumption in `src/features/chart/ChartContainer.tsx`**:
  - Lines 318-351: `ChartContainer` independently calls `calculateSMA(sorted, 20)`, `calculateEMA(sorted, 50)`, `calculateVWAP(sorted)`, and `calculateBollingerBands(sorted, 20, 2)`.
  - Lines 608-616: Inside `projector.logicalToScreen`, an `O(N)` linear loop scans `sortedCandles`:
    ```ts
    for (let i = 0; i < sortedCandles.length; i++) {
      const c = sortedCandles[i]!;
      if (c.timestamp <= anchor.timestamp) {
        leftCandle = c;
      } else {
        rightCandle = c;
        break;
      }
    }
    ```
- **Re-exports in `src/core/index.ts`**:
  - Line 26: `export * from './indicators/technicalIndicators';`. Any newly exported symbol in `technicalIndicators.ts` is automatically exposed via `src/core/index.ts`.

### 1.3 `src/core/schemas/preferences.ts`
- **File size**: 39 lines.
- **Current `LivePollIntervalSchema`** (lines 8-14):
  ```ts
  export const LivePollIntervalSchema = z.union([
    z.literal(0),
    z.literal(5),
    z.literal(15),
    z.literal(30),
  ]);
  export type LivePollInterval = z.infer<typeof LivePollIntervalSchema>;
  ```
- **Current `UserPreferencesSchema` default** (line 22):
  ```ts
  pollIntervalSec: LivePollIntervalSchema.default(15),
  ```
- **Existing Test Assertion** in `src/core/__tests__/preferences-store.test.ts` (lines 15-22):
  ```ts
  const parsed = UserPreferencesSchema.parse({});
  expect(parsed).toEqual({
    ...
    pollIntervalSec: 15,
    ...
  });
  ```
  `UserPreferencesSchema.default(15)` must be preserved so existing default tests pass.
- **Consumer in `src/ui/providers/ProviderSettingsPopover.tsx`**:
  - Line 14: `export type LivePollIntervalSec = 0 | 5 | 15 | 30;`
  - Line 16: `const POLL_INTERVAL_OPTIONS: LivePollIntervalSec[] = [0, 5, 15, 30];`
  - The UI layer will need to update this type and options to `[0, 15, 60, 300]`.

### 1.4 `src/core/serialization/workspaceExport.ts`
- **File size**: 683 lines.
- **Current `computeWorkspaceContentHash`** (lines 450-459):
  ```ts
  preferences: snapshot.preferences
    ? {
        providerMode: snapshot.preferences.providerMode,
        finnhubApiKey: snapshot.preferences.finnhubApiKey,
        firebaseApiKey: snapshot.preferences.firebaseApiKey,
        firebaseProjectId: snapshot.preferences.firebaseProjectId,
        pollIntervalSec: snapshot.preferences.pollIntervalSec,
        activeIndicators: snapshot.preferences.activeIndicators,
      }
    : undefined,
  ```
  Lines 456-457 currently include `pollIntervalSec` and `activeIndicators` in the content hash.
- **Current `mergeWorkspaceSnapshots`** (lines 284-300):
  ```ts
  mergedPreferences = {
    ...remote.preferences,
    ...(local.preferences && hasSyncedBefore
      ? {
          activeTicker: local.preferences.activeTicker,
          activeTimeframe: local.preferences.activeTimeframe,
          activeWatchlistId: local.preferences.activeWatchlistId,
          isSidebarCollapsed: local.preferences.isSidebarCollapsed,
        }
      : {}),
    ...
  ```
  On initialized devices (`hasSyncedBefore === true`), `activeIndicators` and `pollIntervalSec` are NOT preserved and are currently overwritten by `remote.preferences`.
- **Existing Test in `src/core/__tests__/firebase-sync-and-gc.test.ts`** (line 430):
  ```ts
  // Remote account preferences were updated
  expect(merged.preferences?.activeIndicators).toEqual(['CANDLES', 'VOLUME']);
  ```
  This test was created under Milestone 12 semantics where remote indicators overrode local indicators. Under Milestone 15, local `activeIndicators` (`['CANDLES']`) will be preserved on initialized devices, so this test line must be updated.

### 1.5 `src/core/stores/annotationStore.ts` & `src/core/stores/watchlistStore.ts`
- **`src/core/stores/annotationStore.ts` (135 lines)**:
  - `addAnnotation` (lines 84-89):
    ```ts
    const next = [...get().annotations, newAnnotation];
    await repository.saveAnnotations(next);
    set({
      annotations: next,
      selectedAnnotationId: newAnnotation.id,
    });
    ```
    Persistence (`await repository.saveAnnotations(next)`) occurs BEFORE state update (`set(...)`).
  - `updateAnnotation` (lines 115-116):
    ```ts
    await repository.saveAnnotations(next);
    set({ annotations: next });
    ```
    `set` is called after awaiting repository save.
  - `deleteAnnotation` (lines 121-126):
    ```ts
    const next = get().annotations.filter((a) => a.id !== id);
    await repository.saveAnnotations(next);
    set((state) => ({ ... }));
    ```
    `set` is called after awaiting repository save.
- **`src/core/stores/watchlistStore.ts` (173 lines)**:
  - `hydrate()` (lines 53-63):
    ```ts
    const firstId = existing[0]?.id ?? '';
    set({
      watchlists: existing,
      activeWatchlistId: get().activeWatchlistId || firstId,
      isHydrated: true,
    });
    ```
    If `get().activeWatchlistId` references a deleted or non-existent watchlist ID, `get().activeWatchlistId || firstId` retains the stale/invalid ID instead of falling back to `firstId`.
  - Mutating methods (`createWatchlist` lines 94-98, `renameWatchlist` lines 113-114, `deleteWatchlist` lines 124-128, `addTicker` lines 150-151, `removeTicker` lines 168-169):
    All five methods await `repository.saveWatchlists(next)` before calling `set(...)`.

### 1.6 Architectural Boundaries & Invariants
- `src/core/__tests__/architecture-boundaries.test.ts` scans all non-test files under `src/core/` and verifies:
  1. No imports from `react` or `react-dom`.
  2. No imports from `lightweight-charts`.
  3. No imports from `../ui/` or `../features/`.
  4. No references to browser DOM globals (`window`, `document`, `localStorage`, `HTMLElement`).
- Any new functions (`findSurroundingCandles`, `computeAllChartIndicators`) and type declarations in `src/core/` must be 100% pure TypeScript + Zod with zero DOM or UI dependencies.

---

## 2. Logic Chain

1. **Indicator Pipeline & Hover Optimization**
   - *From Observation 1.2*: `ChartContainer.tsx` computes indicators multiple times and performs a linear `O(N)` scan on every off-bar projection.
   - *Deduction*: By providing `computeAllChartIndicators(candles)` in `technicalIndicators.ts`, `ChartContainer` can calculate indicators once in a `useMemo`.
   - *Deduction*: Providing an `O(log N)` `findSurroundingCandles` binary search replaces the linear scan in `projector.logicalToScreen`.
   - *Binary Search Invariant*:
     - If `targetTimestamp < sortedCandles[0].timestamp` → `{ left: null, right: sortedCandles[0] }`.
     - If `targetTimestamp > sortedCandles[last].timestamp` → `{ left: sortedCandles[last], right: null }`.
     - If `targetTimestamp === sortedCandles[mid].timestamp` → `{ left: sortedCandles[mid], right: sortedCandles[mid] }`.
     - If between `sortedCandles[i]` and `sortedCandles[i+1]` → `{ left: sortedCandles[i], right: sortedCandles[i+1] }`.
     - Empty array → `{ left: null, right: null }`.

2. **Relaxed Auto-Polling & Schema Extension**
   - *From Observation 1.3*: `LivePollIntervalSchema` currently only permits `0 | 5 | 15 | 30`.
   - *Deduction*: Extending `LivePollIntervalSchema` with `z.literal(60)` (1m) and `z.literal(300)` (5m) enables the new intervals while remaining backward-compatible with stored preferences (`0`, `5`, `15`, `30`).
   - *Deduction*: Keeping `UserPreferencesSchema.pollIntervalSec` default as `15` preserves existing tests in `preferences-store.test.ts`.

3. **Cloud Sync Isolation for Preferences**
   - *From Observation 1.4*: Currently, `activeIndicators` and `pollIntervalSec` are hashed into `computeWorkspaceContentHash` and overwritten by remote snapshots.
   - *Deduction*: Excluded from `computeWorkspaceContentHash`, toggling an indicator or changing poll intervals will no longer mark the workspace dirty or trigger Firestore PATCH writes.
   - *Deduction*: Preserving them in `mergeWorkspaceSnapshots` when `hasSyncedBefore === true` ensures each device retains its preferred view layout and poll cadence.
   - *Test Adjustment*: In `firebase-sync-and-gc.test.ts` (line 430), the test must be updated to expect local indicators (`['CANDLES']`) to be preserved on initialized devices, and a new test should verify hash invariance when `activeIndicators` or `pollIntervalSec` change.

4. **Store Concurrency & Optimistic State Consistency**
   - *From Observation 1.5*: In `annotationStore` and `watchlistStore`, awaiting repository saves before `set(...)` causes read-modify-write races during rapid interactions.
   - *Deduction*: Moving `set(...)` immediately after Zod validation ensures `get().annotations` and `get().watchlists` are immediately up-to-date in memory for subsequent operations, while `await repository.save*()` persists asynchronously.
   - *Deduction*: In `watchlistStore.hydrate()`, validating `existing.some((w) => w.id === currentId)` prevents invalid or deleted `activeWatchlistId` values from lingering in state.

---

## 3. Caveats

1. **Test Update in `firebase-sync-and-gc.test.ts`**:
   - Line 430 explicitly asserts that remote `activeIndicators` (`['CANDLES', 'VOLUME']`) overwrites local `activeIndicators` (`['CANDLES']`). Updating `mergeWorkspaceSnapshots` to preserve local indicators will break this assertion unless line 430 is updated to expect `['CANDLES']`. This is expected by the Milestone 15 specification (Section 4, item 14).
2. **`UserPreferencesSchema` Default vs UI Default**:
   - The specification states that the UI default auto-refresh is `'Off'` (`0`). However, `UserPreferencesSchema.default(15)` is tested in `preferences-store.test.ts`. To avoid breaking backward compatibility with existing tests, `UserPreferencesSchema` should keep `default(15)`, while `ProviderSettingsPopover` or `App.tsx` can treat initial or unconfigured guest states appropriately.
3. **Exact Match in `findSurroundingCandles`**:
   - When `targetTimestamp === candle.timestamp`, returning `{ left: candle, right: candle }` allows consumers to detect an exact candle hit (`left === right`) without dividing by zero during linear interpolation (`fraction = (anchor.timestamp - left.timestamp) / (right.timestamp - left.timestamp)`). If consumers interpolate, they should check `if (left.timestamp === right.timestamp) return coordinate(left.timestamp)`.

---

## 4. Conclusion & Required Changes

The headless core (`src/core/`) requires modifications across 4 domain files and 3 test suites:

### 4.1 Required Changes in `src/core/indicators/technicalIndicators.ts`
1. Export interface `ComputedChartIndicators`:
   ```ts
   export interface ComputedChartIndicators {
     sma20: IndicatorPoint[];
     ema50: IndicatorPoint[];
     vwap: IndicatorPoint[];
     rsi14: IndicatorPoint[];
     bb20: BollingerPoint[];
     summary: ChartIndicatorsSummary;
   }
   ```
2. Implement and export `computeAllChartIndicators(candles: OHLCVCandle[]): ComputedChartIndicators`:
   - Sorts/validates candles once.
   - Calculates `sma20`, `ema50`, `vwap`, `rsi14`, `bb20`.
   - Constructs `summary` from the terminal elements of the calculated indicator series and the latest candle volume and close price.
3. Implement and export `findSurroundingCandles<T extends { timestamp: number }>(sortedCandles: ReadonlyArray<T>, targetTimestamp: number): { left: T | null; right: T | null }`:
   - Fast boundary checks for empty array, `targetTimestamp < sortedCandles[0].timestamp`, and `targetTimestamp > sortedCandles[len - 1].timestamp`.
   - Binary search (`low <= high`) returning `{ left: midCandle, right: midCandle }` on exact match, or `{ left: sortedCandles[high], right: sortedCandles[low] }` when between bars.

### 4.2 Required Changes in `src/core/schemas/preferences.ts`
1. Extend `LivePollIntervalSchema`:
   ```ts
   export const LivePollIntervalSchema = z.union([
     z.literal(0),
     z.literal(5),
     z.literal(15),
     z.literal(30),
     z.literal(60),
     z.literal(300),
   ]);
   export type LivePollInterval = z.infer<typeof LivePollIntervalSchema>;
   ```

### 4.3 Required Changes in `src/core/serialization/workspaceExport.ts`
1. In `computeWorkspaceContentHash(snapshot: WorkspaceBackup)`:
   - Exclude `pollIntervalSec` and `activeIndicators` from `preferences` projection.
2. In `mergeWorkspaceSnapshots(local, remote, nowSec)`:
   - When `local.preferences && hasSyncedBefore` is true, include `activeIndicators: local.preferences.activeIndicators` and `pollIntervalSec: local.preferences.pollIntervalSec` in the preserved preferences block.

### 4.4 Required Changes in `src/core/stores/`
1. In `src/core/stores/annotationStore.ts`:
   - Move `set(...)` before `await repository.saveAnnotations(...)` in `addAnnotation`, `updateAnnotation`, and `deleteAnnotation`.
2. In `src/core/stores/watchlistStore.ts`:
   - In `hydrate()`:
     ```ts
     const currentId = get().activeWatchlistId;
     const validActiveId = existing.some((w) => w.id === currentId)
       ? currentId
       : firstId;
     ```
   - In `createWatchlist`, `renameWatchlist`, `deleteWatchlist`, `addTicker`, `removeTicker`: move `set(...)` before `await repository.saveWatchlists(...)`.

### 4.5 Required Test Updates in `src/core/__tests__/`
1. `src/core/__tests__/technical-indicators.test.ts`:
   - Add unit tests for `findSurroundingCandles` (exact hit, between bars, before first, after last, empty array).
   - Add unit tests for `computeAllChartIndicators` (matches individual indicator outputs and summary).
2. `src/core/__tests__/firebase-sync-and-gc.test.ts`:
   - Update line 430: `expect(merged.preferences?.activeIndicators).toEqual(['CANDLES']);`.
   - Add unit test: `computeWorkspaceContentHash` produces the identical hash when `activeIndicators` or `pollIntervalSec` change.
3. `src/core/__tests__/watchlist-store.test.ts`:
   - Add test verifying that `hydrate()` resets `activeWatchlistId` to `firstId` when the previously active watchlist ID is missing.
   - Add test verifying optimistic synchronous in-memory update before repository write.

---

## 5. Verification Method

To independently verify the implementation:

1. **Typecheck Verification**:
   ```bash
   npm run typecheck
   ```
   Must exit with code `0` and 0 errors.

2. **Core Test Suite Verification**:
   ```bash
   npx vitest run src/core/
   ```
   All 18 test files (plus newly added test cases) must pass with 0 failures.

3. **Architectural Boundary Verification**:
   ```bash
   npx vitest run src/core/__tests__/architecture-boundaries.test.ts
   ```
   Must pass, verifying zero React/DOM/LightweightCharts imports in `src/core/**`.

4. **Full Workspace Verification**:
   ```bash
   npm run test
   ```
   All 29+ test files across `src/core/`, `src/features/`, and `src/test/` must pass cleanly.

5. **Invalidation Conditions**:
   - If `computeWorkspaceContentHash` produces different hashes when toggling indicators, cloud sync isolation is invalidated.
   - If `findSurroundingCandles` returns `left === null` for a timestamp that exists inside the candle range, coordinate projection will fail.
   - If `annotationStore` or `watchlistStore` mutators fail to update in-memory state before asynchronous repository resolution, race condition tests will fail.
