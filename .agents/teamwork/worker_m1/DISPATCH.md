# Dispatch for Worker M1 (Headless Core Hardening)

**Role**: Core Implementation Specialist
**Working Directory**: /home/duke/Project/marketview/.agents/teamwork/worker_m1
**Project Root**: /home/duke/Project/marketview
**Original Request**: /home/duke/Project/marketview/.agents/teamwork/ORIGINAL_REQUEST.md
**Specification Document**: /home/duke/Project/marketview/docs/specs/milestone-15-performance-and-behavior-hardening.md
**Project Plan**: /home/duke/Project/marketview/.agents/teamwork/orchestrator_m15/PROJECT.md
**Core Survey Report**: /home/duke/Project/marketview/.agents/teamwork/explorer_survey_core_2/handoff.md

## Scope & Exclusively Owned Files:
1. `src/core/indicators/technicalIndicators.ts`
2. `src/core/schemas/preferences.ts`
3. `src/core/serialization/workspaceExport.ts`
4. `src/core/stores/annotationStore.ts`
5. `src/core/stores/watchlistStore.ts`
6. `src/core/index.ts`
7. `src/core/__tests__/technical-indicators.test.ts`
8. `src/core/__tests__/firebase-sync-and-gc.test.ts`
9. `src/core/__tests__/watchlist-store.test.ts`

## Tasks:
1. **`src/core/indicators/technicalIndicators.ts`**:
   - Declare and export `ComputedChartIndicators` interface:
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
   - Implement and export `computeAllChartIndicators(candles: OHLCVCandle[]): ComputedChartIndicators`:
     Compute SMA 20, EMA 50, VWAP, RSI 14, BB 20, and the summary in a single pass over sorted candles. Ensure empty array or few candles returns empty series arrays and null summary without throwing.
   - Implement and export `findSurroundingCandles<T extends { timestamp: number }>(sortedCandles: ReadonlyArray<T>, targetTimestamp: number): { left: T | null; right: T | null }`:
     Perform an $O(\log N)$ binary search. If target is before first candle, return `{ left: null, right: sortedCandles[0] }`. If after last, return `{ left: sortedCandles[len-1], right: null }`. If exact match, return `{ left: candle, right: candle }`. If strictly between, return `{ left: sortedCandles[i], right: sortedCandles[i+1] }`. Empty array returns `{ left: null, right: null }`.
2. **`src/core/schemas/preferences.ts`**:
   - Extend `LivePollIntervalSchema` with `z.literal(60)` and `z.literal(300)`:
     ```ts
     export const LivePollIntervalSchema = z.union([
       z.literal(0),
       z.literal(5),
       z.literal(15),
       z.literal(30),
       z.literal(60),
       z.literal(300),
     ]);
     ```
   - Preserve `UserPreferencesSchema.pollIntervalSec` default as `15`.
3. **`src/core/serialization/workspaceExport.ts`**:
   - In `computeWorkspaceContentHash`: exclude `activeIndicators` and `pollIntervalSec` from the preferences projection.
   - In `mergeWorkspaceSnapshots`: when `local.preferences && hasSyncedBefore` is true, preserve local `activeIndicators` and `pollIntervalSec`.
4. **`src/core/stores/annotationStore.ts`**:
   - In `addAnnotation`, `updateAnnotation`, and `deleteAnnotation`, call `set(...)` synchronously immediately before `await repository.saveAnnotations(next)`.
5. **`src/core/stores/watchlistStore.ts`**:
   - In `hydrate()`: validate that `get().activeWatchlistId` exists in `existing`:
     ```ts
     const currentId = get().activeWatchlistId;
     const validActiveId = existing.some((w) => w.id === currentId)
       ? currentId
       : firstId;
     ```
   - In `createWatchlist`, `renameWatchlist`, `deleteWatchlist`, `addTicker`, and `removeTicker`: call `set(...)` synchronously before `await repository.saveWatchlists(next)`.
6. **`src/core/index.ts`**:
   - Ensure re-exports include the new types and functions.
7. **Unit Tests**:
   - `src/core/__tests__/technical-indicators.test.ts`: add comprehensive tests for `findSurroundingCandles` and `computeAllChartIndicators`.
   - `src/core/__tests__/firebase-sync-and-gc.test.ts`: update line 430 to assert preservation of local `activeIndicators` (`['CANDLES']`); add tests verifying content hash invariance when toggling `activeIndicators` or changing `pollIntervalSec`.
   - `src/core/__tests__/watchlist-store.test.ts`: add tests verifying fallback to `firstId` when `activeWatchlistId` is stale, and synchronous in-memory state update.
8. **Verification**:
   - Run `npm run typecheck` (`tsc --noEmit`) to verify 0 errors.
   - Run `npx vitest run src/core/` to verify all core tests pass.
   - Run `npx vitest run src/core/__tests__/architecture-boundaries.test.ts` to confirm zero architectural boundary violations.

## MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Output your handoff report to `/home/duke/Project/marketview/.agents/teamwork/worker_m1/handoff.md`.


## 2026-11-07T17:34:05Z
You are the M1 Core Implementation Worker.
Your working directory is: /home/duke/Project/marketview/.agents/teamwork/worker_m1
Your detailed task instructions are in: /home/duke/Project/marketview/.agents/teamwork/worker_m1/DISPATCH.md
Read /home/duke/Project/marketview/.agents/teamwork/ORIGINAL_REQUEST.md (specifically ## 2026-11-07T17:24:58Z), /home/duke/Project/marketview/docs/specs/milestone-15-performance-and-behavior-hardening.md, and /home/duke/Project/marketview/.agents/teamwork/orchestrator_m15/PROJECT.md.

Implement all Milestone 1 headless core tasks:
- `src/core/indicators/technicalIndicators.ts`: declare and export `ComputedChartIndicators`, implement and export `computeAllChartIndicators`, implement and export `findSurroundingCandles`.
- `src/core/schemas/preferences.ts`: extend `LivePollIntervalSchema` to support 60 and 300.
- `src/core/serialization/workspaceExport.ts`: isolate `activeIndicators` and `pollIntervalSec` from `computeWorkspaceContentHash` and preserve them in `mergeWorkspaceSnapshots`.
- `src/core/stores/annotationStore.ts` and `src/core/stores/watchlistStore.ts`: synchronous optimistic `set(...)` calls before repository saves, and activeWatchlistId validation in `hydrate()`.
- Add unit tests in `src/core/__tests__/technical-indicators.test.ts`, `src/core/__tests__/firebase-sync-and-gc.test.ts`, `src/core/__tests__/watchlist-store.test.ts`.
- Run typecheck and core tests (`npm run typecheck`, `npx vitest run src/core/`) to verify everything passes cleanly.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Produce your handoff report at /home/duke/Project/marketview/.agents/teamwork/worker_m1/handoff.md.
When finished, send a message to your parent with the summary and path to your handoff report.
