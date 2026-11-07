# Dispatch for Challenger M1-2

**Role**: Sync, Schema & Store Race Condition Challenger
**Working Directory**: /home/duke/Project/marketview/.agents/teamwork/challenger_m1_2
**Project Root**: /home/duke/Project/marketview
**Original Request**: /home/duke/Project/marketview/.agents/teamwork/ORIGINAL_REQUEST.md
**Specification Document**: /home/duke/Project/marketview/docs/specs/milestone-15-performance-and-behavior-hardening.md
**Worker Handoff**: /home/duke/Project/marketview/.agents/teamwork/worker_m1/handoff.md

## Tasks:
Adversarially challenge sync isolation, schema validation, and store concurrency:
1. `computeWorkspaceContentHash`:
   - Generate baseline hash of workspace backup.
   - Mutate `activeIndicators` across all permutations (`['CANDLES']`, `['PRICE_15M', 'VOLUME']`, etc.). Verify hash is 100% IDENTICAL.
   - Mutate `pollIntervalSec` across `0`, `5`, `15`, `30`, `60`, `300`. Verify hash is 100% IDENTICAL.
   - Mutate a domain field (`watchlists`, `annotations`, `finnhubApiKey`). Verify hash CHANGES.
2. `LivePollIntervalSchema`:
   - Test that `60` and `300` parse successfully. Test that invalid intervals (e.g. `10`, `45`, `-1`) are rejected.
3. Store Concurrency & Optimistic State:
   - In `annotationStore` and `watchlistStore`, verify that calling mutating actions updates in-memory Zustand state synchronously before slow/delayed repository write resolves.
   - Test `watchlistStore.hydrate()` with stale/deleted activeWatchlistId and verify fallback to firstId.
4. Execute empirical verification via scripts/tests.
5. Output your verdict (`APPROVE` or `REJECT`) and detailed evidence in `/home/duke/Project/marketview/.agents/teamwork/challenger_m1_2/handoff.md`.


## 2026-11-07T17:44:26Z
You are Challenger M1-2.
Your working directory is: /home/duke/Project/marketview/.agents/teamwork/challenger_m1_2
Your task description is in: /home/duke/Project/marketview/.agents/teamwork/challenger_m1_2/DISPATCH.md
Read /home/duke/Project/marketview/.agents/teamwork/ORIGINAL_REQUEST.md, the spec in docs/specs/milestone-15-performance-and-behavior-hardening.md, and worker_m1 handoff at /home/duke/Project/marketview/.agents/teamwork/worker_m1/handoff.md.
Empirically stress-test computeWorkspaceContentHash invariance (all indicator permutations, poll interval permutations), LivePollIntervalSchema validation, and store optimistic concurrency.
Write your challenge report and verdict (APPROVE or REJECT) to /home/duke/Project/marketview/.agents/teamwork/challenger_m1_2/handoff.md and notify your parent.
