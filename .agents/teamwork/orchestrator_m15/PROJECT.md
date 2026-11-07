# Project: Milestone 15 — Performance & App Behavior Hardening

## Architecture
- Strict headless core (`src/core/`) containing domain schemas, technical indicator algorithms, coordinate search, cloud serialization/sync hashing, and Zustand stores.
- UI & chart presentation layer (`src/features/chart/`, `src/ui/`, `src/App.tsx`) consuming headless core via store hooks and coordinate projector, implementing 60fps drag buffering and debounced persistence.
- Zero DOM/React imports in `src/core/`.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1 | Trendline Drag Buffering | Buffer handle and line dragging coordinates in local state (`dragAnchors`) for 60fps rendering without store updates; commit `onUpdate({ anchors })` once on `mouseup` | M2 | Spec §1.1.1, R1 |
| F2 | Trendline JSX Attribute Fix | Remove invalid JSX `style-custom` attribute on Anchor 1 handle element | M2 | Spec §3.2.1, R1 |
| F3 | Fibonacci Drag Buffering | Buffer handle and zone dragging in local state (`dragAnchors`); commit `onUpdate({ anchors })` once on `mouseup` | M2 | Spec §1.1.1, R1 |
| F4 | Sticker Drag Buffering | Buffer pin/header dragging in local state (`dragAnchor`); commit `onUpdate({ anchors: [dragAnchor] })` once on `mouseup` | M2 | Spec §1.1.1, R1 |
| F5 | Sticker Textarea Debouncing | Synchronous `localText` state; debounce `onUpdate({ payload: { markdown } })` by 250ms with immediate flush on `onBlur` or unmount | M2 | Spec §1.1.2, R1 |
| F6 | Single-Pass Indicator Engine | Implement `computeAllChartIndicators(candles)` (SMA 20, EMA 50, VWAP, RSI 14, BB 20, summary) in a single pass | M1 | Spec §1.1.4, R2 |
| F7 | Binary Search Surrounding Candles | Implement `findSurroundingCandles(sortedCandles, timestamp)` for $O(\log N)$ off-bar interpolation | M1 | Spec §1.1.4, R2 |
| F8 | Indicator Memoization in Chart | Memoize `computeAllChartIndicators` in `ChartContainer.tsx` to eliminate duplicate indicator calculations | M2 | Spec §1.1.4, R2 |
| F9 | $O(\log N)$ Coordinate Interpolation | Use `findSurroundingCandles` in `projector.logicalToScreen` inside `ChartContainer.tsx` | M2 | Spec §1.1.4, R2 |
| F10 | Deduplicated Hover Tracker State | Store `activeHoverPoint` directly and update state only when snapped candidate actually changes | M2 | Spec §1.1.3, R2 |
| F11 | Non-Blocking Chart Loading Backdrop | Display blocking loading overlay only when `isLoading && sortedCandles.length === 0` | M2 | Spec §1.1.9, R2 |
| F12 | Cloud Content Hash Isolation | Exclude `activeIndicators` and `pollIntervalSec` from `computeWorkspaceContentHash` | M1 | Spec §1.1.5, R3 |
| F13 | Local Preferences Merge Preservation | Preserve local `activeIndicators` and `pollIntervalSec` on initialized devices (`hasSyncedBefore === true`) in `mergeWorkspaceSnapshots` | M1 | Spec §1.1.5, R3 |
| F14 | Minimalist Chart Toolbar Default | Set `showAdvancedTools={false}` in `ChartToolbar.tsx` and `App.tsx` (hide Fib and Trade Marker) | M2 | Spec §1.1.6, R4 |
| F15 | Extended Live Poll Interval Schema | Add `60` (1m) and `300` (5m) to `LivePollIntervalSchema` in `preferences.ts` | M1 | Spec §1.1.7, R4 |
| F16 | Relaxed Auto-Refresh Options UI | Offer `Off` (`0`), `15s` (`15`), `1m` (`60`), and `5m` (`300`) in `ProviderSettingsPopover.tsx` | M2 | Spec §1.1.7, R4 |
| F17 | Visibility-Aware Auto-Refresh Polling | Run background `setInterval` when `pollIntervalSec > 0` refreshing active candles and quotes when tab is visible | M2 | Spec §1.1.7, R4 |
| F18 | Synchronous Optimistic Annotation Updates | Call `set(...)` synchronously before `await repository.saveAnnotations(next)` in `annotationStore.ts` | M1 | Spec §1.1.8, R5 |
| F19 | Synchronous Optimistic Watchlist Updates | Call `set(...)` synchronously before `await repository.saveWatchlists(next)` in all mutators in `watchlistStore.ts` | M1 | Spec §1.1.8, R5 |
| F20 | Validated `activeWatchlistId` Hydration | Validate that `activeWatchlistId` exists in loaded watchlists during `hydrate()`, falling back to `firstId` | M1 | Spec §1.1.8, R5 |
| F21 | Idempotent Initial Hydration Guard | Guard initial hydration in `App.tsx` with `isHydratedRef.current` to prevent repeat hydrations on auth token changes | M2 | Spec §1.1.8, R5 |
| F22 | Post-Hydration Hash Initialization | Initialize `lastSyncedHashRef.current = computeWorkspaceContentHash(...)` upon initial store hydration | M2 | Spec §1.1.8, R5 |
| F23 | Post-Import Local Backup Refresh | In `handleImportLocalJson` in `App.tsx`, refresh quotes and validate active ticker after restoring backup | M2 | Spec §1.1.8, R5 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Headless Core Hardening | F6, F7, F12, F13, F15, F18, F19, F20 + Core Unit Tests | None | DONE |
| M2 | Feature & UI Layer Hardening | F1, F2, F3, F4, F5, F8, F9, F10, F11, F14, F16, F17, F21, F22, F23 + UI Tests | M1 | DONE |
| M3 | Full Verification & Forensic Audit | Typecheck, full test suite (469 tests), adversarial challenge, integrity audit | M1, M2 | DONE |

## Code Layout
- `src/core/indicators/technicalIndicators.ts`: `computeAllChartIndicators`, `findSurroundingCandles`, `ComputedChartIndicators`
- `src/core/schemas/preferences.ts`: `LivePollIntervalSchema` extended with 60 and 300
- `src/core/serialization/workspaceExport.ts`: `computeWorkspaceContentHash`, `mergeWorkspaceSnapshots`
- `src/core/stores/annotationStore.ts`: synchronous `set(...)` in mutators
- `src/core/stores/watchlistStore.ts`: synchronous `set(...)` in mutators, validated `activeWatchlistId` in `hydrate()`
- `src/core/index.ts`: export new indicator functions and interfaces
- `src/core/__tests__/technical-indicators.test.ts`: tests for binary search and single-pass indicators
- `src/core/__tests__/firebase-sync-and-gc.test.ts`: test for hash invariance and merge preference preservation
- `src/core/__tests__/watchlist-store.test.ts`: test for stale activeWatchlistId fallback
- `src/features/chart/overlays/plugins/TrendlinePlugin.tsx`: drag buffering, single `onUpdate` commit, remove `style-custom`
- `src/features/chart/overlays/plugins/FibonacciPlugin.tsx`: drag buffering, single `onUpdate` commit
- `src/features/chart/overlays/plugins/StickerPlugin.tsx`: pin drag buffering, 250ms debounced textarea with blur/unmount flush
- `src/features/chart/overlays/ChartToolbar.tsx`: `showAdvancedTools = false` default
- `src/features/chart/ChartContainer.tsx`: memoize `computeAllChartIndicators`, binary search in `projector`, deduplicated hover state, non-blocking loading backdrop
- `src/ui/providers/ProviderSettingsPopover.tsx`: interval options `[0, 15, 60, 300]` and labels
- `src/App.tsx`: `isHydratedRef` guard, `lastSyncedHashRef` init, `showAdvancedTools={false}`, visibility-aware auto-polling, post-import quote refresh

## Interface Contracts
### `computeAllChartIndicators`
```ts
export interface ComputedChartIndicators {
  sma20: IndicatorPoint[];
  ema50: IndicatorPoint[];
  vwap: IndicatorPoint[];
  rsi14: IndicatorPoint[];
  bb20: BollingerPoint[];
  summary: ChartIndicatorsSummary;
}

export function computeAllChartIndicators(
  candles: OHLCVCandle[]
): ComputedChartIndicators;
```

### `findSurroundingCandles`
```ts
export function findSurroundingCandles<T extends { timestamp: number }>(
  sortedCandles: ReadonlyArray<T>,
  targetTimestamp: number
): { left: T | null; right: T | null };
```

### `LivePollIntervalSchema`
```ts
export const LivePollIntervalSchema = z.union([
  z.literal(0),
  z.literal(5),
  z.literal(15),
  z.literal(30),
  z.literal(60),
  z.literal(300),
]);
export type LivePollInterval = z.infer<typeof LivePollIntervalSchema>;
```
