# Handoff Report: Milestone 1 Headless Core Hardening

**Agent**: worker_m1 (Core Implementation Specialist)  
**Parent**: a9a9c8ed-8a35-4f8f-8dd8-9119837c3c50  
**Timestamp**: 2026-11-07T17:43:30Z  

---

## 1. Observation

### 1.1 Implementation Changes in Core Domain
1. `src/core/indicators/technicalIndicators.ts`:
   - Exported `ComputedChartIndicators` interface (lines 105–112):
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
   - Implemented `computeAllChartIndicators(candles: OHLCVCandle[]): ComputedChartIndicators` (lines 459–538), computing SMA 20, EMA 50, VWAP, RSI 14, BB 20, and the summary in a single pass over sorted candles without redundant sorting or duplicate series runs. Handles empty array or invalid candle input returning empty arrays and null summary without throwing.
   - Refactored `computeChartIndicatorsSummary` (lines 543–547) to delegate directly to `computeAllChartIndicators(candles).summary`.
   - Implemented `findSurroundingCandles<T extends { timestamp: number }>(sortedCandles: ReadonlyArray<T>, targetTimestamp: number): { left: T | null; right: T | null }` (lines 553–602) using $O(\log N)$ binary search, returning `{ left: null, right: first }` when target is before first, `{ left: last, right: null }` when after last, `{ left: candle, right: candle }` on exact matches, and `{ left: candleLeft, right: candleRight }` when strictly between.
2. `src/core/schemas/preferences.ts`:
   - Extended `LivePollIntervalSchema` (lines 8–15) with `z.literal(60)` and `z.literal(300)` while preserving `UserPreferencesSchema.pollIntervalSec` default as `15`.
3. `src/core/serialization/workspaceExport.ts`:
   - In `mergeWorkspaceSnapshots` (lines 292–301), preserved `activeIndicators: local.preferences.activeIndicators` and `pollIntervalSec: local.preferences.pollIntervalSec` when `local.preferences && hasSyncedBefore` is true.
   - In `computeWorkspaceContentHash` (lines 448–460), excluded `activeIndicators` and `pollIntervalSec` from preferences projection so cloud sync dirty calculation tracks only domain data and persistent account credentials.
4. `src/core/stores/annotationStore.ts`:
   - Updated `addAnnotation` (lines 84–90), `updateAnnotation` (lines 115–117), and `deleteAnnotation` (lines 122–127) to call `set(...)` synchronously immediately before `await repository.saveAnnotations(next)`.
5. `src/core/stores/watchlistStore.ts`:
   - In `hydrate()` (lines 56–63), validated that `get().activeWatchlistId` exists in loaded `existing` watchlists, falling back to `firstId` if stale or missing. Seeded watchlists also perform synchronous `set(...)` before repository save.
   - In `createWatchlist` (lines 94–99), `renameWatchlist` (lines 114–116), `deleteWatchlist` (lines 125–130), `addTicker` (lines 150–152), and `removeTicker` (lines 167–169), moved `set(...)` synchronously before `await repository.saveWatchlists(next)`.
6. `src/core/index.ts`:
   - Verified that line 26 (`export * from './indicators/technicalIndicators';`) re-exports all newly added types and functions.

### 1.2 Test Execution Results
1. `npx vitest run src/core/`:
   - Exit code: `0`.
   - Result: 18 test files passed (18 total), 146 tests passed (146 total), 0 failures.
   - Verbatim summary:
     ```
     Test Files  18 passed (18)
          Tests  146 passed (146)
       Duration  2.76s
     ```
2. `npx vitest run src/core/__tests__/technical-indicators.test.ts`:
   - Exit code: `0`.
   - Result: 26 tests passed (including 6 new tests for `findSurroundingCandles` and 4 new tests for `computeAllChartIndicators`).
3. `npx vitest run src/core/__tests__/firebase-sync-and-gc.test.ts`:
   - Exit code: `0`.
   - Result: 21 tests passed (updated line 430 assertion for local indicator preservation, and verified content hash invariance when `activeIndicators` or `pollIntervalSec` changes).
4. `npx vitest run src/core/__tests__/watchlist-store.test.ts`:
   - Exit code: `0`.
   - Result: 3 tests passed (verified `hydrate()` stale `activeWatchlistId` fallback to `firstId`, and verified synchronous in-memory state updates before `saveWatchlists` resolves).
5. `npx vitest run src/core/__tests__/architecture-boundaries.test.ts`:
   - Exit code: `0`.
   - Result: 2 tests passed, confirming 0 UI/DOM/React/LightweightCharts imports in `src/core/**`.
6. `npx vitest run src/core/__tests__/mobile-portability.test.ts`:
   - Exit code: `0`.
   - Result: 2 tests passed, confirming strict mobile portability.

---

## 2. Logic Chain

1. **Indicator Performance Optimization**:
   - `calculateSMA`, `calculateEMA`, `calculateVWAP`, `calculateRSI`, and `calculateBollingerBands` take sorted candles and return indicator points.
   - Previously, `ChartContainer` called these functions individually and `computeChartIndicatorsSummary` re-sorted and re-calculated all of them again.
   - `computeAllChartIndicators` sorts and validates the candles once, invokes each indicator calculator over the sorted series, constructs `summary` from the terminal elements, and returns `{ sma20, ema50, vwap, rsi14, bb20, summary }`.
   - `computeChartIndicatorsSummary` now delegates directly to `computeAllChartIndicators(candles).summary`, guaranteeing exact mathematical equivalence across the entire app.
2. **Binary Search Interpolation**:
   - `findSurroundingCandles` provides $O(\log N)$ search over ascending-sorted candles.
   - Immediate boundary checks handle empty arrays, `targetTimestamp < first.timestamp`, and `targetTimestamp > last.timestamp`.
   - Standard binary search returns `{ left: candle, right: candle }` on exact hits (preventing divide-by-zero during linear interpolation) and `{ left: sortedCandles[high], right: sortedCandles[low] }` when between bars.
3. **Cloud Sync Isolation**:
   - Toggling indicators or switching auto-refresh intervals are local viewport concerns.
   - Excluding `activeIndicators` and `pollIntervalSec` from `computeWorkspaceContentHash` ensures `isDirty` remains `false` when users toggle chart indicators or adjust auto-refresh.
   - Preserving local `activeIndicators` and `pollIntervalSec` in `mergeWorkspaceSnapshots` on initialized devices (`hasSyncedBefore === true`) prevents incoming remote snapshots from wiping local chart view configuration.
4. **Optimistic Store Updates**:
   - In `annotationStore` and `watchlistStore`, awaiting repository saves before `set(...)` created a race condition where subsequent synchronous calls read stale state.
   - Moving `set(...)` immediately after Zod validation ensures state is updated in memory synchronously before async persistence completes.
   - In `watchlistStore.hydrate()`, validating `existing.some((w) => w.id === currentId)` ensures stale or deleted `activeWatchlistId` references safely fall back to `firstId`.

---

## 3. Caveats

1. **Whole-App Typecheck (`npm run typecheck`)**:
   - Running `npm run typecheck` (`tsc --noEmit`) currently yields 1 error in `src/App.tsx:812`:
     ```
     src/App.tsx:812:9 - error TS2322: Type '0 | 5 | 30 | 60 | 15 | 300' is not assignable to type 'LivePollIntervalSec | undefined'.
       Type '60' is not assignable to type 'LivePollIntervalSec | undefined'.
     812         pollIntervalSec={savedPreferences.pollIntervalSec}
     ```
   - This occurs because `src/ui/providers/ProviderSettingsPopover.tsx` line 14 still defines `export type LivePollIntervalSec = 0 | 5 | 15 | 30;`.
   - In the project plan, updating `ProviderSettingsPopover.tsx` is assigned to Milestone 2 (worker_m2, task F16). As worker_m1 exclusively owns files in `src/core/**` and must strictly respect file boundaries, worker_m1 left `src/ui/` untouched for worker_m2. Once worker_m2 updates `LivePollIntervalSec` in `ProviderSettingsPopover.tsx`, `npm run typecheck` will pass with 0 errors across the entire repository.

---

## 4. Conclusion

All Milestone 1 headless core tasks are complete, genuine, and verified:
- `ComputedChartIndicators`, `computeAllChartIndicators`, and `findSurroundingCandles` are exported and tested in `src/core/indicators/technicalIndicators.ts`.
- `LivePollIntervalSchema` in `src/core/schemas/preferences.ts` supports 60 and 300 with default 15.
- Cloud sync hash calculation isolates domain data from local indicators and poll interval in `src/core/serialization/workspaceExport.ts`.
- `annotationStore` and `watchlistStore` update state synchronously before repository writes, with `activeWatchlistId` fallback validation in `hydrate()`.
- All 18 test suites in `src/core/` (146 tests) pass with 0 failures, 0 regressions, and zero architectural boundary violations.

---

## 5. Verification Method

To independently verify the implementation:

1. **Run Core Unit Tests**:
   ```bash
   npx vitest run src/core/
   ```
   Expect: 18 passed test files, 146 passed tests, 0 failures.

2. **Run Technical Indicators Tests**:
   ```bash
   npx vitest run src/core/__tests__/technical-indicators.test.ts
   ```
   Expect: 26 passed tests covering `findSurroundingCandles` and `computeAllChartIndicators`.

3. **Run Sync & Content Hash Invariance Tests**:
   ```bash
   npx vitest run src/core/__tests__/firebase-sync-and-gc.test.ts
   ```
   Expect: 21 passed tests verifying local indicator preservation and content hash invariance.

4. **Run Watchlist Store Tests**:
   ```bash
   npx vitest run src/core/__tests__/watchlist-store.test.ts
   ```
   Expect: 3 passed tests verifying stale activeWatchlistId fallback and synchronous state update before save.

5. **Run Architectural Boundary & Portability Tests**:
   ```bash
   npx vitest run src/core/__tests__/architecture-boundaries.test.ts
   npx vitest run src/core/__tests__/mobile-portability.test.ts
   ```
   Expect: 4 passed tests, 0 violations.

6. **Invalidation Conditions**:
   - If `computeWorkspaceContentHash` outputs different hashes when `activeIndicators` or `pollIntervalSec` changes, sync isolation is violated.
   - If `findSurroundingCandles` returns non-null left/right for out-of-range timestamps or fails $O(\log N)$ bounds, coordinate interpolation is broken.
   - If `watchlistStore.hydrate()` retains an ID not in `existing`, stale watchlist fallback is invalidated.
