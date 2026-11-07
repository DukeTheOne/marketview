# Dispatch for Reviewer M1-2

**Role**: Storage, Sync & Preferences Reviewer
**Working Directory**: /home/duke/Project/marketview/.agents/teamwork/reviewer_m1_2
**Project Root**: /home/duke/Project/marketview
**Original Request**: /home/duke/Project/marketview/.agents/teamwork/ORIGINAL_REQUEST.md
**Specification Document**: /home/duke/Project/marketview/docs/specs/milestone-15-performance-and-behavior-hardening.md
**Worker Handoff**: /home/duke/Project/marketview/.agents/teamwork/worker_m1/handoff.md

## Tasks:
Review the changes made by worker_m1 in:
1. `src/core/schemas/preferences.ts`: `LivePollIntervalSchema` extended to 60 and 300, default 15 maintained.
2. `src/core/serialization/workspaceExport.ts`:
   - `computeWorkspaceContentHash` excludes `activeIndicators` and `pollIntervalSec`.
   - `mergeWorkspaceSnapshots` preserves local `activeIndicators` and `pollIntervalSec` when `hasSyncedBefore === true`.
3. `src/core/stores/annotationStore.ts` and `src/core/stores/watchlistStore.ts`:
   - Synchronous optimistic `set(...)` calls before `await repository.save*()`.
   - Validated `activeWatchlistId` in `hydrate()` fallback to `firstId`.
4. Run test verification:
   - `npx vitest run src/core/__tests__/firebase-sync-and-gc.test.ts`
   - `npx vitest run src/core/__tests__/watchlist-store.test.ts`
   - `npx vitest run src/core/__tests__/annotation-store.test.ts`
5. Assess correctness, robustness, race condition prevention, and schema backward compatibility.
6. Output your verdict (`APPROVE` or `REQUEST_CHANGES`) and report in `/home/duke/Project/marketview/.agents/teamwork/reviewer_m1_2/handoff.md`.


## 2026-11-07T17:44:26Z
You are Reviewer M1-2.
Your working directory is: /home/duke/Project/marketview/.agents/teamwork/reviewer_m1_2
Your task description is in: /home/duke/Project/marketview/.agents/teamwork/reviewer_m1_2/DISPATCH.md
Read /home/duke/Project/marketview/.agents/teamwork/ORIGINAL_REQUEST.md, the spec in docs/specs/milestone-15-performance-and-behavior-hardening.md, and worker_m1 handoff at /home/duke/Project/marketview/.agents/teamwork/worker_m1/handoff.md.
Review preferences.ts (LivePollIntervalSchema), workspaceExport.ts (hash isolation, merge preservation), and stores (annotationStore, watchlistStore). Run vitest on core tests.
Write your review report and verdict (APPROVE or REQUEST_CHANGES) to /home/duke/Project/marketview/.agents/teamwork/reviewer_m1_2/handoff.md and notify your parent.
