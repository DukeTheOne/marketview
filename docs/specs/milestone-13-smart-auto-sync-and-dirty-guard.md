# Vertical Slice Specification: Milestone 13 — Smart Debounced Auto-Sync, Gmail-Style Unsaved Changes Guard (`beforeunload`), & Zero-Waste Delta Pull

## 1. Slice Scope & Architectural Invariants Check

### Problem Statement & Critique of Current Manual Sync Design
While Milestone 12 established a secure, zero-cost single-document Firestore vault (`workspaces/{uid}`) with 150 KB anti-bombing caps and tombstone garbage collection, relying primarily on manual **"Sync Now"** triggers introduces five real-world multi-device vulnerabilities:

1. **Unpushed Local Edits on Tab Close**:
   - When a user draws a trendline, edits a sticker note, or modifies a watchlist and closes the tab without clicking "Sync Now", those edits remain trapped in local `IndexedDB` and do not appear when opening another device.
2. **No Startup / Tab-Focus Auto-Pull on Signed-In Devices**:
   - If Device B is already signed in (`authSession` restored from storage), opening or refreshing Device B currently hydrates only from local `IndexedDB` without pulling newer changes pushed by Device A.
3. **High-Frequency Drag / Keystroke Write Amplification**:
   - Naively auto-syncing on every state change (e.g., dragging a trendline anchor or typing in a sticker memo) would trigger dozens of requests or hit the 5-second rate-limit cooldown.
4. **Volatile `exportedAt` Hash Trap & Redundant Pull-Then-Push Writes**:
   - Hashing the raw `serializeWorkspaceBackup()` string includes `exportedAt` (which ticks every second) and `lastCloudSyncTimestamp`. As a result, hash deduplication fails to recognize identical domain state, and pulling from a second device performs a redundant `PATCH` write back to Firestore even when nothing changed locally.
5. **Silent Tab Closure While Dirty**:
   - Users have no visual indicator in the top bar distinguishing **"All changes saved to cloud"** vs. **"Unsaved local changes pending"**, nor a Gmail-style browser `beforeunload` guard when closing a tab before pending changes finish syncing.

### Solution Architecture (Lightweight, Zero Extra Dependencies, Quota-Safe)
1. **Deterministic Domain Content Hash (`computeWorkspaceContentHash`)**:
   - Computes an FNV-1a hash over normalized domain collections (`watchlists`, `annotations`, `trades`, `alerts`, `deletedIds`, and sync-relevant `preferences`), stripping volatile fields (`exportedAt`, `lastCloudSyncTimestamp`).
2. **Smart Idle-Debounced Auto-Push (`AUTO_SYNC_DEBOUNCE_MS = 3_500`)**:
   - Tracks `lastSyncedHash`. Whenever the current workspace content hash diverges from `lastSyncedHash` (`isDirty === true`), a 3.5-second idle debounce timer schedules a background cloud sync.
   - Rapid mutations (such as dragging a trendline or typing a note) reset the 3.5s timer, collapsing 100 UI events into **1 single Firestore write**.
3. **Gmail-Style `beforeunload` Guard & Header Sync State Pill**:
   - While `authSession !== null && (isDirty || isSyncing)`, registers a native browser `beforeunload` listener (`e.preventDefault(); e.returnValue = '';`).
   - If the user closes or refreshes the tab during the 3.5-second window (or when offline with unsynced edits), the browser prompts: *"Leave site? Changes you made may not be saved."*
   - Once the background sync completes (`isDirty === false`), the listener is inactive so normal tab closing is never interrupted.
4. **Zero-Write Auto-Pull on Startup & Tab Wake (`visibilitychange`)**:
   - Automatically syncs once after initial `IndexedDB` hydration when `authSession` is present, and when the tab regains visibility (`document.visibilityState === 'visible'`) if at least `AUTO_PULL_COOLDOWN_MS = 60_000` (60s) has elapsed since the last sync.
   - **Read-Only Short-Circuit**: During `handleSyncNow`, if `remote !== null` and `computeWorkspaceContentHash(finalToPush) === computeWorkspaceContentHash(remote)`, skips `client.pushWorkspace()` completely—costing **1 Firestore read and 0 Firestore writes**.

### Architectural Invariants Verification
- [x] **Zero DOM/UI imports in `src/core/`**: `computeWorkspaceContentHash` and sync state helpers reside in `src/core/serialization/workspaceExport.ts` and `src/core/sync/firebaseSync.ts` with zero `window`, `document`, or React imports.
- [x] **All external market data flows through `MarketDataProvider`**: Unchanged.
- [x] **All chart overlays use logical `{ timestamp, price }` coordinates**: Unchanged.
- [x] **All persistence flows through `StorageRepository`**: Unchanged.

---

## 2. Headless Core Contracts (`src/core/`)

### 2.1 Deterministic Domain Content Fingerprinting (`src/core/serialization/workspaceExport.ts`)

```ts
/**
 * Computes a deterministic FNV-1a hex hash of the domain content of a WorkspaceBackup,
 * ignoring volatile metadata (`exportedAt`, `preferences.lastCloudSyncTimestamp`).
 * Used to detect true dirty state (`isDirty`) and skip redundant Firestore PATCH writes.
 */
export function computeWorkspaceContentHash(snapshot: WorkspaceBackup): string;
```

### 2.2 Smart Deduplication in `FirebaseSyncClient` (`src/core/sync/firebaseSync.ts`)

```ts
export const AUTO_SYNC_DEBOUNCE_MS = 3_500;
export const AUTO_PULL_VISIBILITY_COOLDOWN_MS = 60_000;

export type CloudSyncStatus = 'offline' | 'synced' | 'dirty' | 'syncing' | 'error';
```

- Update `FirebaseSyncClient.pushWorkspace()` to compute `contentHash = computeWorkspaceContentHash(cleanSnapshot)` instead of hashing the raw JSON string with `exportedAt`.

---

## 3. UI & Application Coordination Layer (`src/App.tsx` & `src/ui/`)

### 3.1 `TopHeaderBar` & `CloudSyncPopover` Sync State Feedback
- Update `TopHeaderBarProps` and `CloudSyncPopoverProps` to accept:
  - `syncStatus?: CloudSyncStatus` (`'offline' | 'synced' | 'dirty' | 'syncing' | 'error'`)
  - `isDirty?: boolean`
- Visual states on the top-right **Sync** button (`data-testid="cloud-sync-btn"`):
  - `'synced'`: Emerald cloud icon + `"Saved"` / green dot (`title="All changes saved to Cloud Vault"`).
  - `'dirty'`: Amber cloud icon + pulsing amber dot + `"Unsaved"` badge (`title="Unsaved local changes — auto-syncing in 3s..."`).
  - `'syncing'`: Spinning emerald `RefreshCw` icon + `"Syncing..."`.
  - `'error'`: Rose cloud/alert icon + rose border (`title={cloudSyncError}`).
  - `'offline'`: Slate `CloudOff` icon (Guest Mode).

### 3.2 Lifecycle Hooks in `src/App.tsx`
1. **Hydration Completion Auto-Sync**:
   - Once initial `IndexedDB` store hydration completes (`isHydrated = true`), if `authSession` is present, record the initial `lastSyncedHashRef` and trigger an initial background `handleSyncNow()` to pull any changes made on other devices while this device was closed.
2. **Debounced Auto-Sync on Domain Edits**:
   - Compare `currentContentHash = useMemo(() => computeWorkspaceContentHash(currentSnapshot), [currentSnapshot])` against `lastSyncedHashRef.current`.
   - When `authSession !== null && isHydrated && currentContentHash !== lastSyncedHashRef.current`, mark `isDirty = true` and schedule `handleSyncNow()` after `AUTO_SYNC_DEBOUNCE_MS` (3,500 ms).
3. **Gmail-Style `beforeunload` Guard**:
   - `useEffect` in `src/App.tsx`: when `authSession !== null && (isDirty || isSyncing)`, attach `window.addEventListener('beforeunload', handleBeforeUnload)` so closing the tab warns the user if changes have not yet reached Firestore.
4. **Tab Wake Auto-Pull (`visibilitychange`)**:
   - When `document.visibilityState === 'visible'` and `Date.now() - lastSyncEpochMs > AUTO_PULL_VISIBILITY_COOLDOWN_MS`, trigger `handleSyncNow()` to pull remote updates seamlessly.

---

## 4. Ordered File Manifest

1. `[MODIFY]` [`src/core/serialization/workspaceExport.ts`](file:///home/duke/Project/marketview/src/core/serialization/workspaceExport.ts)
   - Add and export `computeWorkspaceContentHash(snapshot: WorkspaceBackup): string`.
2. `[MODIFY]` [`src/core/sync/firebaseSync.ts`](file:///home/duke/Project/marketview/src/core/sync/firebaseSync.ts)
   - Export `AUTO_SYNC_DEBOUNCE_MS`, `AUTO_PULL_VISIBILITY_COOLDOWN_MS`, and `CloudSyncStatus`.
   - Use `computeWorkspaceContentHash(cleanSnapshot)` in `pushWorkspace` so hash deduplication is immune to `exportedAt` timestamp changes.
3. `[MODIFY]` [`src/ui/sync/CloudSyncPopover.tsx`](file:///home/duke/Project/marketview/src/ui/sync/CloudSyncPopover.tsx)
   - Display live sync status banner (`All changes saved to cloud` vs. `Unsaved local changes — auto-syncing...`) and manual `Sync Now` override.
4. `[MODIFY]` [`src/ui/layout/TopHeaderBar.tsx`](file:///home/duke/Project/marketview/src/ui/layout/TopHeaderBar.tsx)
   - Render distinct visual states on the header Sync button for `'synced'`, `'dirty'`, `'syncing'`, and `'error'`.
5. `[MODIFY]` [`src/App.tsx`](file:///home/duke/Project/marketview/src/App.tsx)
   - Wire `computeWorkspaceContentHash`, `isDirty` tracking, 3.5s debounced auto-sync, read-only pull short-circuit (skipping `pushWorkspace` when `mergedHash === remoteHash`), startup/visibility auto-pull, and Gmail-style `beforeunload` protection.
6. `[MODIFY]` [`src/core/__tests__/firebase-sync-and-gc.test.ts`](file:///home/duke/Project/marketview/src/core/__tests__/firebase-sync-and-gc.test.ts)
   - Add unit tests verifying `computeWorkspaceContentHash` invariance across differing `exportedAt`/`lastCloudSyncTimestamp` values, sensitivity to annotation/watchlist/tombstone edits, and `pushWorkspace` deduplication.

---

## 5. Verification & Test Matrix

- **Unit Tests (`npm run test`)**:
  - `computeWorkspaceContentHash` produces the exact same hash when `exportedAt` or `lastCloudSyncTimestamp` changes, and a different hash when any watchlist, ticker, annotation anchor, payload, or tombstone changes.
  - `FirebaseSyncClient.pushWorkspace` skips network `PATCH` (`skipped: true`) when called with a snapshot whose domain content matches the last pushed snapshot, even if `exportedAt` increased.
  - Read-only pull short-circuit: when pulling from a remote vault that already matches the merged snapshot, zero `PATCH` requests are issued.
- **Static Typecheck (`npm run typecheck`)**:
  - `npx tsc --noEmit` passes with zero errors and zero architectural boundary violations.
