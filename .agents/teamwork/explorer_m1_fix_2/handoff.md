# Handoff Report: TS2341 Fix Strategy for `src/core/__tests__/watchlist-store.test.ts`

**Agent**: Explorer M1-Fix-2  
**Roles**: Core Test Fix Investigator  
**Working Directory**: `/home/duke/Project/marketview/.agents/teamwork/explorer_m1_fix_2`  
**Parent**: `a9a9c8ed-8a35-4f8f-8dd8-9119837c3c50`  
**Timestamp**: 2026-11-07T17:58:00Z  
**Target File**: `src/core/__tests__/watchlist-store.test.ts` (line 77)  

---

## 1. Observation

### 1.1 Verbatim TypeScript Compiler Failure
Running `npx tsc --noEmit` fails with exit code 2:
```
src/App.tsx:812:9 - error TS2322: Type '0 | 5 | 30 | 60 | 15 | 300' is not assignable to type 'LivePollIntervalSec | undefined'.
  Type '60' is not assignable to type 'LivePollIntervalSec | undefined'.

812         pollIntervalSec={savedPreferences.pollIntervalSec}
            ~~~~~~~~~~~~~~~

  src/ui/layout/TopHeaderBar.tsx:80:3
    80   pollIntervalSec?: LivePollIntervalSec;
         ~~~~~~~~~~~~~~~
    The expected type comes from property 'pollIntervalSec' which is declared here on type 'IntrinsicAttributes & TopHeaderBarProps'

src/core/__tests__/watchlist-store.test.ts:77:23 - error TS2341: Property 'watchlists' is private and only accessible within class 'InMemoryStorageRepository'.

77           delayedRepo.watchlists = [...watchlists];
                         ~~~~~~~~~~

Found 2 errors in 2 files.
Errors  Files
     1  src/App.tsx:812
     1  src/core/__tests__/watchlist-store.test.ts:77
```

### 1.2 Code Inspection
1. **`src/core/repositories/InMemoryStorageRepository.ts`** (lines 18–19, 47–49):
   ```ts
   export class InMemoryStorageRepository implements StorageRepository {
     private watchlists: Watchlist[];
     ...
     public async saveWatchlists(watchlists: Watchlist[]): Promise<void> {
       this.watchlists = watchlists.map((w) => WatchlistSchema.parse(w));
     }
   ```
   `watchlists` is marked `private`. Encapsulation prevents external access.
2. **`src/core/__tests__/watchlist-store.test.ts`** (lines 71–81):
   ```ts
   const delayedRepo: InMemoryStorageRepository = new InMemoryStorageRepository();
   // Intercept saveWatchlists to delay completion
   delayedRepo.saveWatchlists = async (watchlists) => {
     saveCallCount++;
     await new Promise<void>((resolve) => {
       resolveSave = () => {
         delayedRepo.watchlists = [...watchlists];
         resolve();
       };
     });
   };
   ```
   Line 77 directly writes to `delayedRepo.watchlists`, bypassing `saveWatchlists` and violating TypeScript visibility rules.

---

## 2. Logic Chain

1. **Test Intent Analysis**:
   The test `'updates in-memory state synchronously before repository.saveWatchlists completes'` (lines 67–134) tests that mutating methods on `watchlistStore` (`hydrate`, `createWatchlist`, `addTicker`, `renameWatchlist`, `removeTicker`, `deleteWatchlist`) execute `set(...)` synchronously in memory before the returned async persistence promise (`await repository.saveWatchlists(...)`) resolves.
2. **Failure Mechanism**:
   To delay persistence, the test author intercepted `delayedRepo.saveWatchlists`. In doing so, the author wanted the repository's internal state to update once `resolveSave!()` was called. However, assigning directly to `delayedRepo.watchlists` triggered `TS2341` because the field is declared `private` in `InMemoryStorageRepository`.
3. **Alternative Fix Strategies Evaluated**:
   - **Strategy A (Recommended — Bound Delegation)**:
     Bind `delayedRepo.saveWatchlists` to `originalSave` before overriding it. When `resolveSave!()` is invoked, call `originalSave(watchlists).then(resolve)`:
     ```ts
     const delayedRepo: InMemoryStorageRepository = new InMemoryStorageRepository();
     const originalSave = delayedRepo.saveWatchlists.bind(delayedRepo);
     delayedRepo.saveWatchlists = async (watchlists) => {
       saveCallCount++;
       await new Promise<void>((resolve) => {
         resolveSave = () => {
           originalSave(watchlists).then(resolve);
         };
       });
     };
     ```
     - *Type Safety*: 100% type-safe under `strict: true`. Zero compiler errors or warnings.
     - *Encapsulation*: Preserves `private` visibility; uses the public repository contract.
     - *Correctness*: Performs schema validation (`WatchlistSchema.parse`) and updates repository state accurately.
     - *Diff Footprint*: Minimal (2 lines changed).
   - **Strategy B (Subclassing)**:
     Create `class DelayedStorageRepository extends InMemoryStorageRepository` and call `await super.saveWatchlists(watchlists)`.
     - *Assessment*: Type-safe, but introduces unnecessary class boilerplate inside the test closure and requires closing over test-scoped variables.
   - **Strategy C (Type Casting `(delayedRepo as any).watchlists`)**:
     - *Assessment*: **REJECTED**. Violates strict type safety guidelines, bypasses compiler guarantees, and circumvents Zod schema validation.
   - **Strategy D (Modifying `InMemoryStorageRepository.ts` to `protected` or `public`)**:
     - *Assessment*: **REJECTED**. Violates architectural encapsulation by modifying production domain code solely to satisfy a test flaw.
4. **Empirical Verification of Strategy A**:
   Applying the patch to `src/core/__tests__/watchlist-store.test.ts`:
   - `npx tsc --noEmit` output:
     `Found 1 error in src/App.tsx:812` (0 errors in `src/core/**`).
   - `npx vitest run src/core/__tests__/watchlist-store.test.ts` output:
     `3 passed (3)` in 20ms.

---

## 3. Caveats

1. `src/App.tsx:812` remains as the single TypeScript compilation error in the project. This error is strictly in the UI layer (`ProviderSettingsPopover` / `TopHeaderBarProps`) and is explicitly assigned to Milestone 2 (worker_m2). Core domain and core test suites are 100% free of TypeScript errors once this test fix is applied.
2. In `originalSave(watchlists).then(resolve)`, if an invalid watchlist were somehow passed, `originalSave` would reject with a Zod validation error. In the test suite, this is desirable behavior.

---

## 4. Conclusion

The recommended fix strategy is **Strategy A (Bound Method Delegation)**:
Capture `const originalSave = delayedRepo.saveWatchlists.bind(delayedRepo)` and delegate the delayed execution via `originalSave(watchlists).then(resolve)`.

### Exact Diff
```diff
--- a/src/core/__tests__/watchlist-store.test.ts
+++ b/src/core/__tests__/watchlist-store.test.ts
@@ -71,11 +71,11 @@ describe('Watchlist Headless Store & StorageRepository Persistence (TC-04)', ()
     const delayedRepo: InMemoryStorageRepository = new InMemoryStorageRepository();
+    const originalSave = delayedRepo.saveWatchlists.bind(delayedRepo);
     // Intercept saveWatchlists to delay completion
     delayedRepo.saveWatchlists = async (watchlists) => {
       saveCallCount++;
       await new Promise<void>((resolve) => {
         resolveSave = () => {
-          delayedRepo.watchlists = [...watchlists];
-          resolve();
+          originalSave(watchlists).then(resolve);
         };
       });
     };
```

A machine-applicable patch file has been generated and verified at:
`/home/duke/Project/marketview/.agents/teamwork/explorer_m1_fix_2/watchlist-store-ts2341.patch`

---

## 5. Verification Method

### 5.1 Test Patch Application
```bash
git apply /home/duke/Project/marketview/.agents/teamwork/explorer_m1_fix_2/watchlist-store-ts2341.patch
```

### 5.2 Verify Zero Errors in `src/core/**`
```bash
npx tsc --noEmit
```
**Expected Output**:
`Found 1 error in src/App.tsx:812` (no errors in `src/core/**`).

### 5.3 Verify Unit Test Passes
```bash
npx vitest run src/core/__tests__/watchlist-store.test.ts
```
**Expected Output**:
`Test Files  1 passed (1)`  
`Tests       3 passed (3)`

### 5.4 Invalidation Condition
If `npx tsc --noEmit` produces any errors in `src/core/**`, or if `watchlist-store.test.ts` fails, this recommendation is invalidated.
