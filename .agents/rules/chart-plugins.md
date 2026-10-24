---
trigger: glob
globs:
  - "src/features/chart/**"
description: Enforces the Open-Closed ChartOverlayPlugin registry pattern whenever an agent reads or modifies files in src/features/chart/**.
---

# Chart Overlay Plugin Engine Rules (`src/features/chart/**`)

## Open-Closed Principle for Chart Customizations
The base chart host (`src/features/chart/ChartContainer.tsx`) and overlay canvas (`src/features/chart/overlays/OverlayCanvas.tsx`) are **CLOSED for tool-specific modification** and **OPEN for extension** via the `OverlayPluginRegistry`.

## How to Register Any New Chart Tool (`sticker`, `trendline`, `trade_marker`, `fibonacci`, etc.)
1. **Never Add Tool-Specific Branching to `ChartContainer.tsx`**:
   - Do not add `if (tool === 'sticker')` or tool-specific state hooks inside the base chart component.
2. **Implement `ChartOverlayPlugin<TPayload>`** in `src/features/chart/overlays/plugins/<ToolName>Plugin.tsx`:
   - `type`: Unique discriminant matching `ChartAnnotation['type']`.
   - `label`: Human-readable tool name for the toolbar.
   - `requiredAnchors`: Number of logical `{ timestamp: number; price: number }` anchors needed to complete placement (`1` for sticker or trade marker, `2` for trendline).
   - `payloadSchema`: Zod schema validating the tool's specific `payload` object.
   - `createDefaultPayload(anchors: LogicalAnchor[]): TPayload`: Factory returning the initial validated payload when anchor placement finishes.
   - `renderAnnotation(ctx: OverlayRenderContext<TPayload>): ReactNode`: Converts each logical `{ timestamp, price }` anchor to viewport `{ x, y }` pixels via `ctx.projector.logicalToScreen(anchor)` and renders the interactive HTML/SVG overlay.
   - `renderDraftPreview?(ctx: OverlayDraftContext): ReactNode`: Optional live rubber-band preview while placing multi-anchor tools (such as trendlines).
3. **Register in One Place**:
   - Export the plugin and add it to the `OVERLAY_PLUGINS` array in `src/features/chart/overlays/registry.ts`.
4. **Logical Coordinate Invariant**:
   - When a user drags or edits an existing overlay on the chart, convert the new viewport position back to `{ timestamp, price }` via `ctx.projector.screenToLogical({ x, y })` and persist the updated logical anchors through `useAnnotationStore`.
