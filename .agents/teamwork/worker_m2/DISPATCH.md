# Dispatch: worker_m2

## Identity
- Archetype: teamwork_preview_worker
- Role: Implementation Specialist (Milestone 2: Journal Analytics Card Integration)
- Working directory: /home/duke/Project/marketview/.agents/teamwork/worker_m2
- Parent: orchestrator_1 (5baf8267-0986-4e4c-9c66-3023b959d67b)

## Task Description
Read /home/duke/Project/marketview/.agents/teamwork/ORIGINAL_REQUEST.md, /home/duke/Project/marketview/.agents/teamwork/PROJECT.md, and /home/duke/Project/marketview/.agents/teamwork/explorer_survey_2/handoff.md thoroughly.

Implement Requirement R2 (Journal Analytics Card Integration):
1. In `src/features/journal/TradeJournalDrawer.tsx`:
   - Import `JournalAnalyticsCard` from `./JournalAnalyticsCard`.
   - Embed `<JournalAnalyticsCard trades={trades} summary={summary} />` directly between the KPI Stats Bar and the Main Drawer Body (`flex flex-1 flex-col overflow-hidden lg:flex-row`).
   - Pass live `trades` and `summary` props.
2. In `src/features/journal/__tests__/journal-analytics.test.ts`:
   - Create unit/integration tests verifying:
     - `JournalAnalyticsCard` renders empty state correctly when closed trades < 1.
     - `JournalAnalyticsCard` renders positive equity curve, best win, worst loss, and expectancy correctly with closed trades.
     - Setup tag breakdown attribution rankings and win rates.
     - Embedding verification inside `TradeJournalDrawer` (rendered markup contains `JournalAnalyticsCard` elements when `isOpen={true}`).
   - Ensure tests are compatible with the Node test environment (`react-dom/server`'s `renderToStaticMarkup` or pure logic assertions).
3. Run verification commands:
   - `npm run typecheck`
   - `npm run test`
   - `npm run build`
   Ensure all pass with code 0.

## File Ownership
- Exclusively owns:
  - `src/features/journal/TradeJournalDrawer.tsx`
  - `src/features/journal/__tests__/journal-analytics.test.ts`
- DO NOT edit files outside your assigned boundary.

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Completion
Write your completion report to `/home/duke/Project/marketview/.agents/teamwork/worker_m2/handoff.md` and notify orchestrator_1 via send_message.

## 2026-10-27T08:08:22Z
You are worker_m2.
Your working directory is /home/duke/Project/marketview/.agents/teamwork/worker_m2.
Read /home/duke/Project/marketview/.agents/teamwork/worker_m2/DISPATCH.md, /home/duke/Project/marketview/.agents/teamwork/ORIGINAL_REQUEST.md, /home/duke/Project/marketview/.agents/teamwork/PROJECT.md, and /home/duke/Project/marketview/.agents/teamwork/explorer_survey_2/handoff.md.
Implement Milestone 2: Journal Analytics Card Integration (TradeJournalDrawer.tsx, tests).
Run npm run typecheck, npm run test, and npm run build.
Write your handoff report to /home/duke/Project/marketview/.agents/teamwork/worker_m2/handoff.md and notify orchestrator_1 (parent conv ID: 5baf8267-0986-4e4c-9c66-3023b959d67b) via send_message.
