# Milestone 14 — Ephemeral Viewport Isolation & Quota-Safe Sync Hashing

## 1. Slice Scope & Architectural Invariants Check

### Problem Statement
In Milestone 13, `computeWorkspaceContentHash` included ephemeral viewport and navigation fields (`activeTicker`, `activeTimeframe`, `activeWatchlistId`, `isSidebarCollapsed`) inside the normalized `preferences` hash object. Consequently:
1. **Unnecessary Firestore Write Quota Consumption**: Every time a user clicks another stock in the watchlist, switches timeframe (`15m`, `1h`, `1D`, `1W`, etc.), selects a different watchlist tab, or collapses the sidebar (`B`), `currentContentHash` mutates, marking the workspace `isDirty` and triggering a 3.5s debounced Firestore write.
2. **Multi-Device Focus Hijacking**: When two devices are open (e.g., Desktop on `AAPL` and Mobile checking `NVDA`), syncing `activeTicker` and `activeTimeframe` overwrites the active chart symbol and timeframe on the other device during a pull/merge.
3. **Viewport Zoom Reset on Auto-Sync**: `handleSyncNow` in `src/App.tsx` unconditionally increments `focusRevision` (`setFocusRevision((rev) => rev + 1)`), causing the chart to snap back to default zoom 3.5s after drawing an annotation.

### Architectural Solution
Separate **User Preferences** into two distinct behavioral tiers while keeping local IndexedDB persistence intact:
- **Tier 1 — Ephemeral Viewport State (Local IndexedDB Only, Excluded from Cloud Dirty Hash)**:
  - `activeTicker`
  - `activeTimeframe`
  - `activeWatchlistId`
  - `isSidebarCollapsed`
  - Volatile sync metadata (`exportedAt`, `lastCloudSyncTimestamp`, `cloudSyncEmail`, `cloudSyncUid`)
  - *Behavior*: Persisted immediately to local IndexedDB so refreshing the browser restores the user's exact spot on that device, but **never** mutates `computeWorkspaceContentHash`, **never** triggers `isDirty`, and **never** overwrites an already-initialized device's active ticker/timeframe during background sync.
- **Tier 2 — Cloud-Synced Domain & Account State (Included in Cloud Dirty Hash)**:
  - `watchlists` (custom lists, ticker membership/order, names, timestamps)
  - `annotations` (trendlines, stickers, Fibonacci retracements, trade markers, logical anchors)
  - `trades` (trade journal entries)
  - `alerts` (price alerts)
  - `deletedIds` (tombstone registry)
  - Account/Chart config in `preferences`: `providerMode`, `finnhubApiKey`, `firebaseApiKey`, `firebaseProjectId`, `pollIntervalSec`, `activeIndicators`.

### Architectural Invariants Check
- **Zero DOM/UI imports in `src/core/`**: Confirmed. `src/core/serialization/workspaceExport.ts` remains 100% pure TypeScript + Zod.
- **MarketDataProvider boundary**: Confirmed. No changes to market data fetching or caching layers.
- **Logical chart coordinates**: Confirmed. All annotations remain anchored to `{ timestamp, price }`.

---

## 2. Headless Core Contracts (`src/core/`)

### 2.1 Deterministic Content Hashing (`src/core/serialization/workspaceExport.ts`)
Update `computeWorkspaceContentHash(snapshot: WorkspaceBackup): string` to strip ephemeral viewport fields from the `preferences` hash projection:

```typescript
export function computeWorkspaceContentHash(snapshot: WorkspaceBackup): string {
  const normalized = {
    version: snapshot.version,
    watchlists: snapshot.watchlists
      .map((w) => ({
        id: w.id,
        name: w.name,
        tickers: w.tickers,
        createdAt: w.createdAt,
        updatedAt: w.updatedAt,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    annotations: snapshot.annotations
      .map((a) => ({
        id: a.id,
        ticker: a.ticker,
        type: a.type,
        anchors: a.anchors,
        payload: a.payload,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    trades: snapshot.trades
      .map((t) => ({
        id: t.id,
        ticker: t.ticker,
        side: t.side,
        status: t.status,
        entryPrice: t.entryPrice,
        exitPrice: t.exitPrice,
        quantity: t.quantity,
        entryTimestamp: t.entryTimestamp,
        exitTimestamp: t.exitTimestamp,
        stopLossPrice: t.stopLossPrice,
        takeProfitPrice: t.takeProfitPrice,
        setupTags: t.setupTags,
        notesMarkdown: t.notesMarkdown,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    alerts: (snapshot.alerts ?? [])
      .map((al) => ({
        id: al.id,
        ticker: al.ticker,
        targetPrice: al.targetPrice,
        condition: al.condition,
        note: al.note,
        createdAt: al.createdAt,
        triggeredAt: al.triggeredAt,
        status: al.status,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    deletedIds: Object.keys(snapshot.deletedIds ?? {})
      .sort()
      .reduce<Record<string, number>>((acc, key) => {
        acc[key] = snapshot.deletedIds[key]!;
        return acc;
      }, {}),
    // Only hash persistent account & indicator configuration; exclude ephemeral viewport state
    // (activeTicker, activeTimeframe, activeWatchlistId, isSidebarCollapsed, lastCloudSyncTimestamp)
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
  };

  return computeFnv1aHash(JSON.stringify(normalized));
}
```

### 2.2 Multi-Device Snapshot Merge (`src/core/serialization/workspaceExport.ts`)
In `mergeWorkspaceSnapshots(local, remote, nowSec)`:
- If `isLocalFreshDefault` is `true` (a brand-new device/browser signing into Cloud Sync for the first time with `!local.preferences?.lastCloudSyncTimestamp`), adopt `remote.preferences` (including initial `activeTicker`, `activeTimeframe`, `activeWatchlistId`, and `isSidebarCollapsed`).
- If `isLocalFreshDefault` is `false` (an initialized device that has already synced before), preserve the local device's ephemeral viewport state (`activeTicker`, `activeTimeframe`, `activeWatchlistId`, `isSidebarCollapsed`) even when `remote.exportedAt >= local.exportedAt`, while still merging `providerMode`, `finnhubApiKey`, `firebaseApiKey`, `firebaseProjectId`, `pollIntervalSec`, and `activeIndicators`.

---

## 3. UI & Chart Plugin Layer (`src/features/` & `src/ui/`)

### 3.1 Prevent Viewport Hijacking & Zoom Reset (`src/App.tsx`)
In `handleSyncNow`:
1. Capture `const wasFreshDevice = !local.preferences?.lastCloudSyncTimestamp;` before merging.
2. Only switch `marketStore.getState().setActiveTicker(...)`, `setActiveTimeframe(...)`, and `setFocusRevision((rev) => rev + 1)` if `wasFreshDevice` is `true` or if `providerMode` / `finnhubApiKey` changed during the sync.
3. Do **not** call `setFocusRevision((rev) => rev + 1)` on routine background auto-syncs so the user's current chart pan/zoom state remains completely untouched after drawing annotations.

---

## 4. Ordered File Manifest

1. **`[MODIFY]` [src/core/serialization/workspaceExport.ts](file:///home/duke/Project/marketview/src/core/serialization/workspaceExport.ts)**:
   - Remove `activeTicker`, `activeTimeframe`, `activeWatchlistId`, and `isSidebarCollapsed` from `computeWorkspaceContentHash`.
   - Preserve local ephemeral viewport fields (`activeTicker`, `activeTimeframe`, `activeWatchlistId`, `isSidebarCollapsed`) in `mergeWorkspaceSnapshots` when `isLocalFreshDefault` is `false`.
2. **`[MODIFY]` [src/App.tsx](file:///home/duke/Project/marketview/src/App.tsx)**:
   - Guard `setActiveTicker`, `setActiveTimeframe`, and `setFocusRevision` in `handleSyncNow` so routine background syncs never hijack the active ticker/timeframe or reset chart zoom.
3. **`[MODIFY]` [src/core/__tests__/firebase-sync-and-gc.test.ts](file:///home/duke/Project/marketview/src/core/__tests__/firebase-sync-and-gc.test.ts)**:
   - Add unit tests verifying that changing `activeTicker`, `activeTimeframe`, `activeWatchlistId`, or `isSidebarCollapsed` produces the exact same `computeWorkspaceContentHash`.
   - Add unit test verifying that `mergeWorkspaceSnapshots` preserves local `activeTicker` and `activeTimeframe` on an already-initialized device (`lastCloudSyncTimestamp !== null`) when pulling a newer remote snapshot.

---

## 5. Verification & Test Matrix

- **Typecheck**: `npm run typecheck` (`tsc --noEmit`) must pass with zero errors.
- **Unit Tests (`src/core/__tests__/firebase-sync-and-gc.test.ts`)**:
  1. `computes identical content hash when ephemeral viewport state (activeTicker, activeTimeframe, activeWatchlistId, isSidebarCollapsed) changes`:
     - Mutate `activeTicker` (`AAPL` -> `NVDA`), `activeTimeframe` (`1D` -> `15m`), `activeWatchlistId`, and `isSidebarCollapsed` (`false` -> `true`). Assert `computeWorkspaceContentHash(snap1) === computeWorkspaceContentHash(snap2)`.
  2. `preserves local activeTicker and activeTimeframe on initialized devices when merging a newer remote snapshot`:
     - Local snapshot has `lastCloudSyncTimestamp: 1711800000`, `activeTicker: 'AAPL'`, `activeTimeframe: '15m'`. Remote snapshot has `exportedAt: 1711950000`, `activeTicker: 'NVDA'`, `activeTimeframe: '1W'`, plus a new annotation. Assert merged result contains the new annotation while keeping `merged.preferences.activeTicker === 'AAPL'` and `merged.preferences.activeTimeframe === '15m'`.
  3. Existing test `adopts remote API keys and preferences when local client is a fresh default guest` continues to pass (`lastCloudSyncTimestamp: null` adopts remote `NVDA` and `finnhubApiKey`).
