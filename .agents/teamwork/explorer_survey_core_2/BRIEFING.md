# BRIEFING — 2026-11-07T17:32:45Z

## Mission
Investigate the current state of src/core/ in MarketView (technicalIndicators.ts, preferences.ts, workspaceExport.ts, annotationStore.ts, watchlistStore.ts, index.ts), test suites, and test baselines for Milestone 15.

## 🔒 My Identity
- Archetype: explorer
- Roles: Core Codebase Investigator, Survey Core Explorer
- Working directory: /home/duke/Project/marketview/.agents/teamwork/explorer_survey_core_2
- Original parent: a9a9c8ed-8a35-4f8f-8dd8-9119837c3c50
- Milestone: Milestone 15 - Performance & Behavior Hardening

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Strict Headless Core: files in src/core/** must never import from src/ui/**, src/features/**, react-dom, lightweight-charts, or browser DOM globals
- Only write within working directory /home/duke/Project/marketview/.agents/teamwork/explorer_survey_core_2

## Current Parent
- Conversation ID: a9a9c8ed-8a35-4f8f-8dd8-9119837c3c50
- Updated: 2026-11-07T17:28:06Z

## Investigation State
- **Explored paths**:
  - `src/core/indicators/technicalIndicators.ts` & `src/core/index.ts`
  - `src/core/schemas/preferences.ts`
  - `src/core/serialization/workspaceExport.ts`
  - `src/core/stores/annotationStore.ts` & `src/core/stores/watchlistStore.ts`
  - `src/core/stores/alertStore.ts`
  - `src/core/__tests__/technical-indicators.test.ts`
  - `src/core/__tests__/firebase-sync-and-gc.test.ts`
  - `src/core/__tests__/watchlist-store.test.ts`
  - `src/core/__tests__/architecture-boundaries.test.ts`
  - `src/core/__tests__/workspace-export.test.ts`
  - `src/core/__tests__/annotation-store.test.ts`
  - `src/core/__tests__/preferences-store.test.ts`
  - `src/features/chart/ChartContainer.tsx` (consumer of core indicators)
  - `src/ui/providers/ProviderSettingsPopover.tsx` (consumer of preferences)
- **Key findings**:
  - Baseline tests: All 29 test files passed (331/331 tests passing). `src/core/` has 18 test files (133/133 passing). `npm run typecheck` passes with 0 errors.
  - `technicalIndicators.ts`: Needs `ComputedChartIndicators`, `computeAllChartIndicators(candles)`, and `findSurroundingCandles(sortedCandles, timestamp)`. `index.ts` automatically re-exports all from `technicalIndicators`.
  - `preferences.ts`: `LivePollIntervalSchema` needs `z.literal(60)` and `z.literal(300)`. `UserPreferencesSchema` default should remain `15` to preserve test compatibility with `preferences-store.test.ts`.
  - `workspaceExport.ts`: `computeWorkspaceContentHash` must drop `activeIndicators` and `pollIntervalSec`. `mergeWorkspaceSnapshots` must preserve them when `hasSyncedBefore === true`. Note: `firebase-sync-and-gc.test.ts` line 430 currently asserts remote overwrite of `activeIndicators`; it must be updated to expect local indicator preservation.
  - `annotationStore.ts`: `addAnnotation`, `updateAnnotation`, `deleteAnnotation` must call `set()` synchronously BEFORE awaiting `repository.saveAnnotations()`.
  - `watchlistStore.ts`: `hydrate()` must validate `activeWatchlistId` against `existing.some((w) => w.id === currentId)` and fall back to `firstId`. All 5 mutating methods must call `set()` before awaiting `repository.saveWatchlists()`.
- **Unexplored areas**: None for core survey scope.

## Key Decisions Made
- Fully documented all 5 survey areas, baseline tests, line-by-line observations, logic chains, pitfalls, and verification methods.

## Artifact Index
- /home/duke/Project/marketview/.agents/teamwork/explorer_survey_core_2/DISPATCH.md — Received task instructions
- /home/duke/Project/marketview/.agents/teamwork/explorer_survey_core_2/BRIEFING.md — Active working memory
- /home/duke/Project/marketview/.agents/teamwork/explorer_survey_core_2/progress.md — Liveness heartbeat and milestone tracking
- /home/duke/Project/marketview/.agents/teamwork/explorer_survey_core_2/handoff.md — Final investigation report
