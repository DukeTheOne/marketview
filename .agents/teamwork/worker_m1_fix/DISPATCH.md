# Dispatch for Worker M1 Fix (Core Test Typing Remediation)

**Role**: Core Implementation Fix Worker
**Working Directory**: /home/duke/Project/marketview/.agents/teamwork/worker_m1_fix
**Project Root**: /home/duke/Project/marketview
**Original Request**: /home/duke/Project/marketview/.agents/teamwork/ORIGINAL_REQUEST.md
**Specification Document**: /home/duke/Project/marketview/docs/specs/milestone-15-performance-and-behavior-hardening.md
**Fix Recommendations**:
- /home/duke/Project/marketview/.agents/teamwork/explorer_m1_fix_1/handoff.md
- /home/duke/Project/marketview/.agents/teamwork/explorer_m1_fix_1/watchlist-store-ts2341.patch

## Scope & Exclusively Owned File:
- `src/core/__tests__/watchlist-store.test.ts`

## Task:
1. Apply the bound method delegation fix in `src/core/__tests__/watchlist-store.test.ts` (lines 71–81):
   ```ts
   const delayedRepo: InMemoryStorageRepository = new InMemoryStorageRepository();
   const originalSave = delayedRepo.saveWatchlists.bind(delayedRepo);
   // Intercept saveWatchlists to delay completion
   delayedRepo.saveWatchlists = async (watchlists) => {
     saveCallCount++;
     await new Promise<void>((resolve) => {
       resolveSave = () => {
         void originalSave(watchlists).then(resolve);
       };
     });
   };
   ```
2. Verify:
   - Run `npx vitest run src/core/__tests__/watchlist-store.test.ts` -> must pass (3/3).
   - Run `npx vitest run src/core/` -> all core test suites must pass.
   - Run `npx tsc --noEmit` -> confirm `src/core/**` has ZERO TypeScript errors (only the expected `src/App.tsx:812` error from Milestone 2 remains).
   - Run `npx vitest run src/core/__tests__/architecture-boundaries.test.ts` -> 0 violations.

## MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.



## 2026-11-07T17:59:29Z
You are the Core Implementation Fix Worker (worker_m1_fix).
Your working directory is: /home/duke/Project/marketview/.agents/teamwork/worker_m1_fix
Your task is in: /home/duke/Project/marketview/.agents/teamwork/worker_m1_fix/DISPATCH.md
Read /home/duke/Project/marketview/.agents/teamwork/ORIGINAL_REQUEST.md and the explorer report at /home/duke/Project/marketview/.agents/teamwork/explorer_m1_fix_1/handoff.md.

Update src/core/__tests__/watchlist-store.test.ts lines 71-81 to use bound method delegation (originalSave = delayedRepo.saveWatchlists.bind(delayedRepo)), eliminating TS2341.
Run vitest and tsc --noEmit to verify 0 errors in src/core/**.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Write your handoff report to /home/duke/Project/marketview/.agents/teamwork/worker_m1_fix/handoff.md and notify your parent.
