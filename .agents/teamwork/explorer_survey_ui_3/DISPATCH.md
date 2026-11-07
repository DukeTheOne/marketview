# Dispatch for UI & Features Explorer (Survey)

**Role**: UI and Feature Layer Investigator
**Working Directory**: /home/duke/Project/marketview/.agents/teamwork/explorer_survey_ui_3
**Project Root**: /home/duke/Project/marketview
**Original Request**: /home/duke/Project/marketview/.agents/teamwork/ORIGINAL_REQUEST.md
**Specification Document**: /home/duke/Project/marketview/docs/specs/milestone-15-performance-and-behavior-hardening.md
**Task**:
Investigate the current state of UI, Chart, and App components in `/home/duke/Project/marketview`:
1. `src/features/chart/overlays/plugins/TrendlinePlugin.tsx` (check current drag handling and `style-custom` attribute)
2. `src/features/chart/overlays/plugins/FibonacciPlugin.tsx` (check current drag handling)
3. `src/features/chart/overlays/plugins/StickerPlugin.tsx` (check current drag handling and textarea typing/debouncing)
4. `src/features/chart/overlays/ChartToolbar.tsx` (check `showAdvancedTools` prop and usage)
5. `src/features/chart/ChartContainer.tsx` (check indicator calculation, hover point handling, loading overlay, `logicalToScreen`)
6. `src/ui/providers/ProviderSettingsPopover.tsx` (check polling interval UI options)
7. `src/App.tsx` (check hydration guard, auto-polling useEffect, `handleImportLocalJson`, `showAdvancedTools`)
8. Existing feature/chart test suites in `src/features/` or elsewhere.
Document current implementation details, state hooks, and exact lines needing modification.
Output your report in `/home/duke/Project/marketview/.agents/teamwork/explorer_survey_ui_3/handoff.md`.

## 2026-11-07T17:28:06Z
Received dispatch from parent (a9a9c8ed-8a35-4f8f-8dd8-9119837c3c50):
Investigate current state of src/features/chart/ (TrendlinePlugin.tsx, FibonacciPlugin.tsx, StickerPlugin.tsx, ChartToolbar.tsx, ChartContainer.tsx), src/ui/providers/ProviderSettingsPopover.tsx, and src/App.tsx.
Document all existing implementations, state hooks, drag handling, typing debounce, and auto-polling logic.
Produce handoff report at /home/duke/Project/marketview/.agents/teamwork/explorer_survey_ui_3/handoff.md.
