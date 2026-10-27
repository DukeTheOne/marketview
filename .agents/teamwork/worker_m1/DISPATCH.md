# Dispatch: worker_m1

## Identity
- Archetype: teamwork_preview_worker
- Role: Implementation Specialist (Milestone 1: Fibonacci Retracement Chart Integration)
- Working directory: /home/duke/Project/marketview/.agents/teamwork/worker_m1
- Parent: orchestrator_1 (5baf8267-0986-4e4c-9c66-3023b959d67b)

## Task Description
Read /home/duke/Project/marketview/.agents/teamwork/ORIGINAL_REQUEST.md, /home/duke/Project/marketview/.agents/teamwork/PROJECT.md, and /home/duke/Project/marketview/.agents/teamwork/explorer_survey_1/handoff.md thoroughly.

Implement Requirement R1 (Fibonacci Retracement Chart Integration):
1. In `src/features/chart/overlays/OverlayCanvas.tsx`:
   - Import `./plugins/FibonacciPlugin` for side-effect plugin registration.
   - In `renderStatusBanner()`, add the status banner branch when `activeTool === 'fibonacci'`:
     - If `draftAnchors.length === 0`: `'Click chart to place first anchor of Fibonacci retracement · Click Pointer to cancel'`
     - Else: `'Click chart to place second anchor and finish Fibonacci retracement'`
     - Style matching purple theme (`border-purple-500/40 bg-purple-950/85 text-purple-200`).
2. In `src/features/chart/overlays/ChartToolbar.tsx`:
   - Import `Percent` from `lucide-react`.
   - Add "Fib" button with `Percent` icon and active/inactive purple styling that calls `onSelectTool(activeTool === 'fibonacci' ? null : 'fibonacci')`.
3. Add unit test suite `src/features/chart/overlays/__tests__/fibonacci-plugin.test.ts` verifying:
   - Arithmetic calculations of `calculateFibonacciLevels` (uptrend & downtrend).
   - Self-registration in `overlayPluginRegistry`.
   - Plugin metadata (`requiredAnchors === 2`, `type === 'fibonacci'`, `createDefaultPayload`).
4. Run verification commands:
   - `npm run typecheck`
   - `npm run test`
   - `npm run build`
   Ensure all pass with code 0.

## File Ownership
- Exclusively owns:
  - `src/features/chart/overlays/OverlayCanvas.tsx`
  - `src/features/chart/overlays/ChartToolbar.tsx`
  - `src/features/chart/overlays/__tests__/fibonacci-plugin.test.ts`
- DO NOT edit files outside your assigned boundary.

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Completion
Write your completion report to `/home/duke/Project/marketview/.agents/teamwork/worker_m1/handoff.md` and notify orchestrator_1 via send_message.

## 2026-10-27T08:08:22Z
You are worker_m1.
Your working directory is /home/duke/Project/marketview/.agents/teamwork/worker_m1.
Read /home/duke/Project/marketview/.agents/teamwork/worker_m1/DISPATCH.md, /home/duke/Project/marketview/.agents/teamwork/ORIGINAL_REQUEST.md, /home/duke/Project/marketview/.agents/teamwork/PROJECT.md, and /home/duke/Project/marketview/.agents/teamwork/explorer_survey_1/handoff.md.
Implement Milestone 1: Fibonacci Retracement Chart Integration (OverlayCanvas.tsx, ChartToolbar.tsx, tests).
Run npm run typecheck, npm run test, and npm run build.
Write your handoff report to /home/duke/Project/marketview/.agents/teamwork/worker_m1/handoff.md and notify orchestrator_1 (parent conv ID: 5baf8267-0986-4e4c-9c66-3023b959d67b) via send_message.
