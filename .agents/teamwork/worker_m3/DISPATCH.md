# Dispatch: worker_m3

## Identity
- Archetype: teamwork_preview_worker
- Role: Implementation Specialist (Milestone 3: Price Alerts UI & Real-Time Quote Evaluation)
- Working directory: /home/duke/Project/marketview/.agents/teamwork/worker_m3
- Parent: orchestrator_1 (5baf8267-0986-4e4c-9c66-3023b959d67b)

## Task Description
Read /home/duke/Project/marketview/.agents/teamwork/ORIGINAL_REQUEST.md, /home/duke/Project/marketview/.agents/teamwork/PROJECT.md, and /home/duke/Project/marketview/.agents/teamwork/explorer_survey_3/handoff.md thoroughly.

Implement Requirement R3 (Price Alerts UI & Real-Time Quote Evaluation):
1. Create `src/ui/alerts/PriceAlertsPopover.tsx`:
   - Must conform to `PriceAlertsPopoverProps`:
     - `isOpen: boolean`
     - `activeTicker: string`
     - `currentPrice?: number`
     - `alerts: PriceAlert[]`
     - `lastTriggeredAlertIds: string[]`
     - `onClose: () => void`
     - `onCreateAlert: (input: { ticker: string; targetPrice: number; condition: AlertCondition; note?: string }) => void`
     - `onDismissAlert: (id: string) => void`
     - `onRearmAlert: (id: string) => void`
     - `onDeleteAlert: (id: string) => void`
     - `onClearTriggeredBanner?: () => void`
   - UI features:
     - Active ticker creation form: Target Price input, Direction selector (`CROSSING_UP` / `CROSSING_DOWN`), optional Note input, Submit button.
     - Alerts list with status badges (`ACTIVE`, `TRIGGERED`, `DISMISSED`) and timestamps.
     - Per-alert action buttons: Dismiss, Re-arm, and Delete.
     - Dark Tailwind theme consistent with `WatchlistSidebar.tsx` and `TopHeaderBar.tsx`.
2. In `src/ui/layout/TopHeaderBar.tsx`:
   - Add Alerts toggle button next to Journal button with active alert count badge.
   - Pulsing amber badge when `lastTriggeredAlertIds.length > 0`.
   - Prominent notification banner when `lastTriggeredAlertIds.length > 0` with trigger summary, "View" action to open popover, and dismiss action calling `onClearTriggeredBanner`.
   - Render `PriceAlertsPopover` anchored to the Alerts button.
3. In `src/App.tsx`:
   - Wire `createAlertStore` in `useMemo`.
   - Subscribe to `alerts` and `lastTriggeredAlertIds` via `useStore(alertStore, ...)`.
   - In `useEffect` observing `quotesByTicker`, loop through `Object.values(quotesByTicker)` and call `alertStore.getState().evaluateQuote(quote)`.
   - Pass alert handlers and state into `TopHeaderBar`.
4. In `src/core/__tests__/milestone-5-integration.test.ts`:
   - Create integration tests verifying alert lifecycle, quote evaluation, triggering, dismiss, rearm, remove, and multi-symbol evaluation.
5. Run verification commands:
   - `npm run typecheck`
   - `npm run test`
   - `npm run build`
   Ensure all pass with code 0 and architectural boundaries remain clean.

## File Ownership
- Exclusively owns:
  - `src/ui/alerts/PriceAlertsPopover.tsx`
  - `src/ui/layout/TopHeaderBar.tsx`
  - `src/App.tsx`
  - `src/core/__tests__/milestone-5-integration.test.ts`
- DO NOT edit files outside your assigned boundary.

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Completion
Write your completion report to `/home/duke/Project/marketview/.agents/teamwork/worker_m3/handoff.md` and notify orchestrator_1 via send_message.


## 2026-10-27T08:08:22Z
You are worker_m3.
Your working directory is /home/duke/Project/marketview/.agents/teamwork/worker_m3.
Read /home/duke/Project/marketview/.agents/teamwork/worker_m3/DISPATCH.md, /home/duke/Project/marketview/.agents/teamwork/ORIGINAL_REQUEST.md, /home/duke/Project/marketview/.agents/teamwork/PROJECT.md, and /home/duke/Project/marketview/.agents/teamwork/explorer_survey_3/handoff.md.
Implement Milestone 3: Price Alerts UI & Real-Time Quote Evaluation (PriceAlertsPopover.tsx, TopHeaderBar.tsx, App.tsx, integration tests).
Run npm run typecheck, npm run test, and npm run build.
Write your handoff report to /home/duke/Project/marketview/.agents/teamwork/worker_m3/handoff.md and notify orchestrator_1 (parent conv ID: 5baf8267-0986-4e4c-9c66-3023b959d67b) via send_message.
