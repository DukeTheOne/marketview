# BRIEFING — 2026-11-07T17:31:30Z

## Mission
Survey and document current state of UI, Chart plugins, and App components for Milestone 15 performance & behavior hardening.

## 🔒 My Identity
- Archetype: explorer
- Roles: UI and Feature Layer Investigator
- Working directory: /home/duke/Project/marketview/.agents/teamwork/explorer_survey_ui_3
- Original parent: a9a9c8ed-8a35-4f8f-8dd8-9119837c3c50
- Milestone: milestone-15-performance-and-behavior-hardening

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Produce 5-component handoff report at /home/duke/Project/marketview/.agents/teamwork/explorer_survey_ui_3/handoff.md
- Strict adherence to architecture boundaries (headless core, logical coordinates)

## Current Parent
- Conversation ID: a9a9c8ed-8a35-4f8f-8dd8-9119837c3c50
- Updated: not yet

## Investigation State
- **Explored paths**:
  - `docs/specs/milestone-15-performance-and-behavior-hardening.md`
  - `.agents/teamwork/ORIGINAL_REQUEST.md`
  - `src/features/chart/overlays/plugins/TrendlinePlugin.tsx`
  - `src/features/chart/overlays/plugins/FibonacciPlugin.tsx`
  - `src/features/chart/overlays/plugins/StickerPlugin.tsx`
  - `src/features/chart/overlays/ChartToolbar.tsx`
  - `src/features/chart/ChartContainer.tsx`
  - `src/ui/providers/ProviderSettingsPopover.tsx`
  - `src/App.tsx`
  - `src/features/chart/__tests__/` and `src/features/chart/overlays/__tests__/`
- **Key findings**:
  - `TrendlinePlugin`: `handleStartDragHandle` and `handleStartDragLine` invoke `onUpdate` per `mousemove`. Invalid `style-custom` attribute at line 195. No `dragAnchors` buffering.
  - `FibonacciPlugin`: `handleStartDragHandle` and `handleStartDragBody` invoke `onUpdate` per `mousemove`. No `dragAnchors` buffering.
  - `StickerPlugin`: Pin drag invokes `onUpdate` per `mousemove`. `<textarea>` invokes `onUpdate` per keystroke. No 250ms debounce or blur/unmount flush.
  - `ChartToolbar`: Default is `showAdvancedTools = true`; `App.tsx` passes `showAdvancedTools={true}`. Both need to be `false`.
  - `ChartContainer`: Computes indicators redundantly in `useEffect` and `computeChartIndicatorsSummary`. `hoverCursorX` causes 60Hz re-renders across the whole overlay tree; need candidate-change diffing. Linear scan in `logicalToScreen` needs `findSurroundingCandles`. Loading overlay displays on all `isLoading` rather than `isLoading && sortedCandles.length === 0`.
  - `ProviderSettingsPopover`: Only supports `[0, 5, 15, 30]`. Needs `0 | 5 | 15 | 30 | 60 | 300` support, displaying `[0, 15, 60, 300]` as `Off`, `15s`, `1m`, `5m`.
  - `src/App.tsx`: Initial hydration `useEffect` lacks `isHydratedRef.current` guard and runs again if `authSession` changes; does not set `lastSyncedHashRef.current` on completion. Lacks visibility-aware polling interval for `pollIntervalSec > 0`. `handleImportLocalJson` doesn't refresh quotes.
- **Unexplored areas**:
  - None within UI/feature survey scope. All 7 components fully mapped with exact lines.

## Key Decisions Made
- Fully documented all 7 target files with exact line numbers, code snippets (before/after proposals), and testing validation methods in `handoff.md`.

## Artifact Index
- `handoff.md` — Final structured handoff report
- `progress.md` — Liveness heartbeat
- `DISPATCH.md` — Incoming task messages
