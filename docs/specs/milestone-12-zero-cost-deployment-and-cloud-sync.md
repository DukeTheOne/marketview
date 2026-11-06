# Vertical Slice Specification: Milestone 12 — Firebase Cloud Sync (`workspaces/{uid}`), Anti-Bombing Storage Quotas, Tombstone Deletion & Garbage Collection

## 1. Slice Scope & Architectural Invariants Check

### Problem Statement & Goal
Enable **zero-setup guest usage** by default (saved locally in `IndexedDB`) alongside **1-Click User Login & Cloud Sync** powered by **Google Firebase Free Tier (Auth + Firestore)**, engineered with strict **Anti-Bombing Storage Quotas** and **Deterministic Deletion + Garbage Collection**:

1. **Anti-Bombing Storage Protection (4 Defense Layers)**:
   - **Layer 1 — Single-Document-Per-User Architecture (`workspaces/{uid}`)**:
     - Each authenticated user can only read/write/delete **one single document** in Firestore (`workspaces/{uid}`). A user can never spam-create thousands of documents.
   - **Layer 2 — Strict Collection Quotas & 150 KB Payload Cap (`src/core/serialization/workspaceExport.ts`)**:
     - Enforces hard caps on every workspace snapshot:
       - `MAX_WATCHLISTS = 20` (max `100` tickers per watchlist)
       - `MAX_ANNOTATIONS = 500` (memos & trendlines; memo markdown capped at `1,000` chars)
       - `MAX_TRADES = 500`
       - `MAX_ALERTS = 100`
       - `MAX_TOMBSTONES = 500`
       - `MAX_WORKSPACE_BYTES = 150_000` (150 KB maximum serialized JSON size).
   - **Layer 3 — Client-Side Cooldown & Hash Deduplication (`src/core/sync/cloudSync.ts`)**:
     - Enforces a minimum cooldown (`MIN_SYNC_COOLDOWN_MS = 5_000`) between cloud writes and skips pushing when the workspace content hash is unchanged since the last sync.
   - **Layer 4 — Server-Side `firestore.rules` Enforcement**:
     - Ships a production `firestore.rules` file that enforces `request.auth.uid == userId`, caps `payloadJson.size() <= 150000`, and enforces a server-side write cooldown (`request.time > resource.data.updatedAt + duration.value(3, 's')`).

2. **Deterministic Deletion & Automatic Garbage Collection (`deletedIds` Tombstones + TTL Pruning)**:
   - **Zombie-Free Multi-Device Deletion**:
     - Deleting a watchlist, chart note (`sticker`), drawing (`trendline`), trade, or alert records its ID and deletion timestamp in `deletedIds: Record<string, number>`.
     - When syncing across devices, `mergeWorkspaceSnapshots(local, remote)` unions `deletedIds` first and strips any entity whose `id` was deleted at or after its creation/update timestamp—ensuring deleted drawings or notes **never resurrect** from another device.
   - **Automatic Garbage Collection (`garbageCollectWorkspace`)**:
     - Automatically prunes tombstones older than `TOMBSTONE_TTL_SECONDS` (30 days) and caps total tombstones to `MAX_TOMBSTONES` (500 newest).
     - Automatically prunes any orphaned or excess items beyond the collection caps (keeping the newest items by timestamp).
   - **1-Click Cloud Vault Deletion (`deleteCloudVault`)**:
     - Allows a user to permanently delete their `workspaces/{uid}` document from Firestore (`HTTP DELETE`), leaving zero residual data on the server.

### Architectural Invariants Verification
- [x] **Zero UI imports in `src/core/`**: All quota enforcement, tombstone garbage collection, snapshot merging, and Firebase REST Auth/Firestore clients live in `src/core/` using injected `fetchImpl` and `zod`—zero DOM or React dependencies.
- [x] **All external payloads validated with Zod**: Every local and remote workspace snapshot is validated through `WorkspaceBackupSchema` (`src/core/serialization/workspaceExport.ts`).
- [x] **All chart annotations use logical `(timestamp, price)` coordinates**: Synced annotations render accurately on any desktop or mobile screen size.
- [x] **All persistence flows through `StorageRepository`**: `StorageRepository` and headless stores coordinate cleanly with the sync engine.

---

## 2. Headless Core Contracts (`src/core/`)

### 2.1 Quota Constants, Tombstones, Garbage Collection & Smart Merge (`src/core/serialization/workspaceExport.ts`)

```ts
export const WORKSPACE_QUOTAS = {
  MAX_WATCHLISTS: 20,
  MAX_TICKERS_PER_WATCHLIST: 100,
  MAX_ANNOTATIONS: 500,
  MAX_TRADES: 500,
  MAX_ALERTS: 100,
  MAX_TOMBSTONES: 500,
  TOMBSTONE_TTL_SECONDS: 30 * 86400, // 30 days
  MAX_WORKSPACE_BYTES: 150_000, // 150 KB hard cap
} as const;

export const WorkspaceBackupSchema = z.object({
  version: z.literal(1),
  exportedAt: z.number().int().positive(),
  watchlists: z
    .array(WatchlistSchema)
    .max(WORKSPACE_QUOTAS.MAX_WATCHLISTS),
  annotations: z
    .array(ChartAnnotationSchema)
    .max(WORKSPACE_QUOTAS.MAX_ANNOTATIONS),
  trades: z
    .array(TradeEntrySchema)
    .max(WORKSPACE_QUOTAS.MAX_TRADES),
  alerts: z
    .array(PriceAlertSchema)
    .max(WORKSPACE_QUOTAS.MAX_ALERTS)
    .default([]),
  deletedIds: z.record(z.string(), z.number().int().positive()).default({}),
  preferences: UserPreferencesSchema.optional(),
});

export type WorkspaceBackup = z.infer<typeof WorkspaceBackupSchema>;

/**
 * Garbage-collects expired tombstones (> 30 days old), caps tombstones at MAX_TOMBSTONES,
 * strips any entities whose ID is present in `deletedIds` (with deletedAt >= entity timestamp),
 * deduplicates entities by ID, and trims collections to WORKSPACE_QUOTAS limits.
 */
export function garbageCollectWorkspace(
  snapshot: WorkspaceBackup,
  nowSec?: number
): WorkspaceBackup;

/**
 * Deterministically merges local and remote workspace snapshots:
 * 1. Unions `deletedIds` tombstones (keeping the latest deletion timestamp per ID).
 * 2. Merges watchlists, annotations, trades, and alerts by `id` (keeping newer `updatedAt`/`createdAt`).
 * 3. Runs `garbageCollectWorkspace()` so deleted items are stripped and expired tombstones are pruned.
 */
export function mergeWorkspaceSnapshots(
  local: WorkspaceBackup,
  remote: WorkspaceBackup,
  nowSec?: number
): WorkspaceBackup;
```

### 2.2 Headless Firebase Auth + Firestore Single-Document Sync Client (`src/core/sync/firebaseSync.ts`)

```ts
export const FirebaseConfigSchema = z.object({
  apiKey: z.string().min(1),
  projectId: z.string().min(1),
});
export type FirebaseConfig = z.infer<typeof FirebaseConfigSchema>;

export const CloudAuthSessionSchema = z.object({
  uid: z.string().min(1),
  email: z.string().email(),
  idToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAtMs: z.number().int().positive(),
});
export type CloudAuthSession = z.infer<typeof CloudAuthSessionSchema>;

export interface FirebaseCloudSyncClient {
  signUpWithEmail(email: string, password: string): Promise<CloudAuthSession>;
  signInWithEmail(email: string, password: string): Promise<CloudAuthSession>;
  pullWorkspace(session: CloudAuthSession): Promise<WorkspaceBackup | null>;
  pushWorkspace(
    session: CloudAuthSession,
    snapshot: WorkspaceBackup
  ): Promise<{ syncedAt: number; byteLength: number }>;
  deleteWorkspaceVault(session: CloudAuthSession): Promise<void>;
}
```

- **Rate-Limit & Anti-Bombing Guards inside `pushWorkspace`**:
  - Runs `garbageCollectWorkspace(snapshot)` and `serializeWorkspaceBackup(snapshot)`.
  - Verifies UTF-8 byte length `<= WORKSPACE_QUOTAS.MAX_WORKSPACE_BYTES` (`150,000` bytes); throws a descriptive quota error if exceeded.
  - Enforces a minimum cooldown (`MIN_SYNC_COOLDOWN_MS = 5_000`) per user unless `force` is specified, and skips redundant network writes if the serialized payload hash matches the last pushed snapshot.

---

## 3. UI & Security Rules Layer (`src/ui/`, `firestore.rules`)

### 3.1 `firestore.rules` (Database Anti-Bombing Security Rules)
Create `firestore.rules` at the repository root so the user can paste it directly into Firebase Console → Firestore → Rules:
```cel
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Lock down the entire database by default
    match /{document=**} {
      allow read, write: if false;
    }

    // Each authenticated user gets exactly ONE document: workspaces/{userId}
    match /workspaces/{userId} {
      allow read, delete: if request.auth != null && request.auth.uid == userId;

      allow create, update: if request.auth != null
        && request.auth.uid == userId
        && request.resource.data.keys().hasOnly(['payloadJson', 'updatedAt', 'byteLength', 'version'])
        && request.resource.data.payloadJson is string
        && request.resource.data.payloadJson.size() <= 150000
        && request.resource.data.byteLength is int
        && request.resource.data.byteLength <= 150000
        && (
          resource == null
          || !('updatedAt' in resource.data)
          || request.time >= resource.data.updatedAt + duration.value(3, 's')
        );
    }
  }
}
```

### 3.2 Cloud Sync & Account Popover (`src/ui/sync/CloudSyncPopover.tsx`)
- Accessible from a **`Sync`** button (`data-testid="cloud-sync-btn"`) in `TopHeaderBar.tsx`.
- Supports:
  1. **Email + Password Sign In / Sign Up** (using `VITE_FIREBASE_API_KEY` & `VITE_FIREBASE_PROJECT_ID` from `.env`, or configurable in the popover).
  2. **1-Click "Sync Now"**: Pulls remote `workspaces/{uid}`, merges with local state using `mergeWorkspaceSnapshots()` (honoring deletion tombstones), updates local stores, and pushes the garbage-collected snapshot back to Firestore.
  3. **Storage Quota Meter**: Displays current workspace size (e.g. `4.2 KB / 150 KB (2.8%)`) and item counts (`12 / 500 notes & drawings`).
  4. **1-Click "Delete Cloud Vault"** (`data-testid="delete-cloud-vault-btn"`): Deletes the remote `workspaces/{uid}` document from Firestore (`deleteWorkspaceVault`) so users can wipe their cloud storage cleanly at any time.
  5. **1-Click Local `.json` File Export / Import**: Works offline with zero login.

---

## 4. Ordered File Manifest

- [x] `[NEW]` `firestore.rules` — Production Firestore security rules enforcing single-document-per-user (`workspaces/{userId}`), 150 KB payload cap, and 3-second server-side write cooldown.
- [x] `[MODIFY]` `src/core/serialization/workspaceExport.ts` — Add `WORKSPACE_QUOTAS`, `deletedIds` tombstone map on `WorkspaceBackupSchema`, `garbageCollectWorkspace()`, and `mergeWorkspaceSnapshots()`.
- [x] `[MODIFY]` `src/core/schemas/preferences.ts` — Add `deletedAnnotationIds: z.record(z.string(), z.number().int().positive()).default({})` (or track tombstones in preferences/repository) so local deletions are recorded for the next sync.
- [x] `[NEW]` `src/core/sync/firebaseSync.ts` — Headless Firebase Auth + Firestore single-document sync client with 150 KB byte-size check, cooldown rate limiter, payload hash deduplication, and `deleteWorkspaceVault()`.
- [x] `[MODIFY]` `src/core/index.ts` — Export `WORKSPACE_QUOTAS`, `garbageCollectWorkspace`, `mergeWorkspaceSnapshots`, and `firebaseSync` contracts.
- [x] `[NEW]` `src/ui/sync/CloudSyncPopover.tsx` — Account Sign-In / Sign-Up, Sync Now, Quota Usage Bar, Delete Cloud Vault, and `.json` File Export/Import popover.
- [x] `[MODIFY]` `src/ui/layout/TopHeaderBar.tsx` — Add the `Sync` button and `CloudSyncPopover` integration.
- [x] `[MODIFY]` `src/App.tsx` — Wire annotation/watchlist deletions to record tombstones and connect `CloudSyncPopover` to hydrate/merge stores.
- [x] `[NEW]` `src/core/__tests__/firebase-sync-and-gc.test.ts` — Unit tests for anti-bombing quota caps, tombstone deletion across devices, 30-day tombstone garbage collection, cooldown rate limiting, and `deleteWorkspaceVault()`.

---

## 5. Verification & Test Matrix

1. **Static Typecheck**:
   - Run `npm run typecheck` (`tsc --noEmit`) — must exit with code `0`.
2. **Unit & Integration Tests**:
   - Run `npm run test` (`vitest run`) — all test suites must pass.
   - Verify in `src/core/__tests__/firebase-sync-and-gc.test.ts`:
     - **Tombstone Deletion**: Deleting an annotation on Device A (`deletedIds[id] = now`) and syncing with Device B (which still has that annotation) permanently removes the annotation instead of resurrecting it.
     - **Garbage Collection**: Tombstones older than 30 days (`TOMBSTONE_TTL_SECONDS`) are automatically pruned, and collections exceeding `WORKSPACE_QUOTAS` are trimmed or rejected.
     - **Anti-Bombing Quota & Cooldown**: Payloads exceeding `150 KB` or `500` annotations are rejected before hitting the network; rapid consecutive `pushWorkspace()` calls within the cooldown window or with identical content hashes do not spam Firestore.
     - **Vault Deletion**: `deleteWorkspaceVault()` sends an authenticated `DELETE` request to `workspaces/{uid}` and frees the cloud document.
