# Handoff Report: Requirement R1 Investigation (Fibonacci Retracement Chart Integration)

**Agent**: `explorer_survey_1`  
**Role**: Codebase Researcher (R1: Fibonacci Retracement Chart Integration)  
**Date**: 2026-10-27T08:05:00Z  
**Target Milestone**: Milestone 5 Module Integration  

---

## 1. Observation

### 1.1 Existing Fibonacci Plugin Implementation
- **File**: `/home/duke/Project/marketview/src/features/chart/overlays/plugins/FibonacciPlugin.tsx` (545 lines)
- **Plugin Definition (lines 413–541)**:
  ```typescript
  export const fibonacciPlugin: ChartOverlayPlugin<FibonacciPayload> = {
    type: 'fibonacci',
    label: 'Fib Retracement',
    requiredAnchors: 2,
    payloadSchema: FibonacciPayloadSchema,
    createDefaultPayload(): FibonacciPayload {
      return {
        color: '#a855f7',
        levels: [...FIBONACCI_DEFAULT_LEVELS],
        extendRight: false,
        showPrices: true,
        fillBackground: true,
      };
    },
    renderAnnotation(props) {
      return <FibonacciAnnotationComponent key={props.annotation.id} {...props} />;
    },
    renderDraftPreview({ anchors, currentMousePoint, projector }: OverlayDraftRenderProps) {
      ...
    },
  };
  ```
- **Registration Mechanism (lines 543–545)**:
  ```typescript
  // Register Fibonacci retracement plugin into global registry
  overlayPluginRegistry.register(fibonacciPlugin);
  ```
  The plugin self-registers into `overlayPluginRegistry` via a top-level side effect when imported.
- **Pure Level Calculation Helper (lines 39–50)**:
  ```typescript
  export function calculateFibonacciLevels(
    startPrice: number,
    endPrice: number,
    ratios: readonly number[] = FIBONACCI_DEFAULT_LEVELS,
  ): FibonacciComputedLevel[] {
    const delta = endPrice - startPrice;
    return ratios.map((ratio) => ({
      ratio,
      label: `${(ratio * 100).toFixed(1)}%`,
      price: startPrice + delta * ratio,
    }));
  }
  ```
- **Interactive Component (`FibonacciAnnotationComponent`, lines 52–411)**:
  - Renders alternating translucent zone fills (`fillOpacity: 0.12 / 0.05`) between adjacent Fibonacci levels.
  - Renders a diagonal dashed anchor line (`strokeDasharray="4 4"`) with a 16px transparent hit area for body dragging.
  - Renders horizontal level lines with thicker styling on boundary lines (0%, 100%) and golden ratios (50%, 61.8%).
  - Renders price & percentage badges pinned to the left edge of each level.
  - Supports handle dragging on anchor 0 (`0.0%`) and anchor 1 (`100.0%`) via `handleStartDragHandle`.
  - Supports entire body dragging via `handleStartDragBody`, preserving relative price and time deltas converted via `projector.screenToLogical`.
  - When selected (`isSelected === true`), mounts a floating formatting toolbar (lines 330–408) supporting color presets (`#a855f7`, `#38bdf8`, `#10b981`, `#f59e0b`, `#f43f5e`), zone fill toggling, price readout toggling, rightward ray extension, and annotation deletion.
- **Draft Preview (`renderDraftPreview`, lines 433–540)**:
  - When `anchors.length === 1` and `currentMousePoint !== null`, computes projected levels between `anchors[0]` and `currentMousePoint`, drawing rubber-band level lines, zone fills, and a floating badge reading `"Click to anchor Fib levels"` with a `Percent` icon.

### 1.2 Chart Overlay Canvas
- **File**: `/home/duke/Project/marketview/src/features/chart/overlays/OverlayCanvas.tsx` (178 lines)
- **Plugin Registration Imports (lines 9–12)**:
  ```typescript
  // Ensure default plugins are registered
  import './plugins/StickerPlugin';
  import './plugins/TrendlinePlugin';
  import './plugins/TradeMarkerPlugin';
  ```
  `import './plugins/FibonacciPlugin';` is **missing**. Because of this, `overlayPluginRegistry.get('fibonacci')` returns `undefined` at runtime.
- **Anchor Placement Flow (lines 74–111)**:
  - Clicking the canvas converts viewport `(x, y)` to logical `(timestamp, price)` via `hostContext.projector.screenToLogical(clickPoint)`.
  - When `activeTool === 'fibonacci'`, `activePlugin.requiredAnchors === 2`.
  - First click: `nextAnchors.length === 1 < 2`. Calls `setDraftAnchors(nextAnchors)`.
  - Mouse movement: triggers `renderDraftPreview`.
  - Second click: `nextAnchors.length === 2 === activePlugin.requiredAnchors`. Calls `onAddAnnotation({ ticker, type: 'fibonacci', anchors: nextAnchors, payload: defaultPayload })`, resets `draftAnchors` to `[]`, calls `onSelectTool(null)`, and clears `mousePoint`.
- **Status Guidance Banner (lines 114–136)**:
  - `renderStatusBanner` only handles `activeTool === 'sticker'` and `activeTool === 'trendline'`:
  ```typescript
  if (activeTool === 'trendline') {
    return (
      <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-sky-500/40 bg-sky-950/85 px-4 py-1.5 text-xs font-medium text-sky-200 shadow-xl backdrop-blur-md">
        {draftAnchors.length === 0
          ? 'Click chart to place first point of trendline · Click Pointer to cancel'
          : 'Click chart to place second point and finish trendline'}
      </div>
    );
  }
  ```
  - For `activeTool === 'fibonacci'`, `renderStatusBanner` currently falls through and returns `null`.

### 1.3 Chart Toolbar
- **File**: `/home/duke/Project/marketview/src/features/chart/overlays/ChartToolbar.tsx` (83 lines)
- **Current Tool Buttons (lines 17–72)**:
  - `Pointer` (`activeTool === null`, `MousePointer` icon)
  - `Sticker` (`activeTool === 'sticker'`, `StickyNote` icon, amber theme)
  - `Trendline` (`activeTool === 'trendline'`, `TrendingUp` icon, sky theme)
  - `Trade Marker` (`activeTool === 'trade_marker'`, `BookmarkCheck` icon, emerald theme)
- There is currently **no button** for `'fibonacci'`.
- Requirement R1 explicitly specifies: `expose a "Fib" tool button in src/features/chart/overlays/ChartToolbar.tsx`.

### 1.4 Core Schemas and Store Support
- **Schema File**: `/home/duke/Project/marketview/src/core/schemas/annotation.ts`
  - Line 22: `'fibonacci'` is already present in `ChartAnnotationTypeSchema = z.enum(['sticker', 'trendline', 'trade_marker', 'fibonacci'])`.
  - Lines 90–99: `FIBONACCI_DEFAULT_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;` and `FibonacciPayloadSchema` are fully defined with Zod defaults.
  - Logical coordinate invariant: anchors are strictly `{ timestamp: number, price: number }`. No screen pixels are persisted.
- **Store File**: `/home/duke/Project/marketview/src/core/stores/annotationStore.ts`
  - Already accepts `ChartAnnotationType | null` for `activeTool` and validates new annotations with `ChartAnnotationSchema.parse`.
  - No changes needed in `src/core/stores/annotationStore.ts` or `src/App.tsx`.

### 1.5 Existing Tests & Test Infrastructure
- **Existing Schema Test**: `/home/duke/Project/marketview/src/core/__tests__/fibonacci-schema.test.ts` (76 lines, 5 tests, all passing):
  - Validates `ChartAnnotationTypeSchema.parse('fibonacci')`.
  - Validates default Fibonacci payload generation.
  - Validates custom levels and styling.
  - Validates rejection of ratios outside `[0, 2]`.
  - Validates complete 2-anchor `ChartAnnotation` schema parsing.
- **Test Command Status**:
  - `npm run test` executes `vitest run` in `node` environment across `src/**/*.test.ts`: 10 test files, 27 tests passing.
  - `npm run typecheck` (`tsc --noEmit`) passes cleanly with 0 errors.

---

## 2. Logic Chain

1. **Self-Registration Pattern**:
   - `FibonacciPlugin.tsx` ends with `overlayPluginRegistry.register(fibonacciPlugin);`.
   - In `OverlayCanvas.tsx`, other plugins (`StickerPlugin`, `TrendlinePlugin`, `TradeMarkerPlugin`) are registered purely by importing their modules for side effects (lines 10–12).
   - Adding `import './plugins/FibonacciPlugin';` in `OverlayCanvas.tsx` registers `'fibonacci'` into `overlayPluginRegistry` with zero changes required to `registry.ts` or `ChartContainer.tsx` (fully satisfying the Open-Closed Principle).

2. **Toolbar Activation**:
   - In `ChartToolbar.tsx`, buttons toggle `onSelectTool(activeTool === '<type>' ? null : '<type>')`.
   - Adding a `<button>` with label `"Fib"`, icon `<Percent className="h-3.5 w-3.5" />`, and purple accent styling (`bg-purple-500 text-slate-950 font-semibold` when active, `text-slate-400 hover:text-purple-300` when inactive) provides the user-facing entry point.
   - When clicked, `onSelectTool('fibonacci')` is invoked, setting `activeTool = 'fibonacci'` in `annotationStore`.

3. **Two-Step Guidance Banner**:
   - When `activeTool === 'fibonacci'`, `OverlayCanvas` activates crosshair cursor and pointer-events.
   - Before click 1, `draftAnchors.length === 0`: the banner must prompt the user to place the first anchor (0.0% level) and offer cancellation via Pointer.
   - After click 1, `draftAnchors.length === 1`: the banner must prompt the user to place the second anchor (100.0% level) to finish the retracement.
   - Using matching purple styling (`border-purple-500/40 bg-purple-950/85 text-purple-200`) maintains visual cohesion with the sky banner of Trendline and amber banner of Sticker.

4. **Multi-Anchor Commitment**:
   - Once click 2 occurs, `nextAnchors.length === 2 === activePlugin.requiredAnchors`.
   - `handleCanvasClick` in `OverlayCanvas.tsx` automatically calls `onAddAnnotation({ ticker, type: 'fibonacci', anchors: nextAnchors, payload: defaultPayload })`.
   - `onAddAnnotation` delegates to `annotationStore.getState().addAnnotation()`, validating through `ChartAnnotationSchema` and persisting via `StorageRepository`.
   - `setDraftAnchors([])` and `onSelectTool(null)` return the UI to Pointer mode.

---

## 3. Caveats

1. **No Application Source Code Modified**:
   - In accordance with explorer read-only constraints, no changes were made to `OverlayCanvas.tsx`, `ChartToolbar.tsx`, or any application file.
2. **Vitest Test Environment**:
   - Vitest runs in `node` environment (`environment: 'node'` in `vite.config.ts`), with `window` and `document` undefined.
   - Unit tests for `FibonacciPlugin` should test `calculateFibonacciLevels`, plugin metadata (`type`, `requiredAnchors`, `defaultPayload`), and `overlayPluginRegistry.get('fibonacci')` without attempting to mount DOM components directly in the node test environment.
3. **App.tsx Non-Involvement**:
   - `App.tsx` already delegates tool handling dynamically to `ChartToolbar` and `OverlayCanvas`. No changes are required in `App.tsx` for R1.

---

## 4. Conclusion

Requirement R1 is clearly scoped, architecturally isolated, and ready for immediate implementation. All core domain models and UI plugin components (`FibonacciPlugin.tsx`, `FibonacciPayloadSchema`, `calculateFibonacciLevels`) are already implemented and tested.

### Exact Implementation Checklist for R1:

1. **Update `src/features/chart/overlays/OverlayCanvas.tsx`**:
   - **Line 13**: Add side-effect import:
     ```typescript
     import './plugins/FibonacciPlugin';
     ```
   - **Line 134**: In `renderStatusBanner()`, add the Fibonacci branch:
     ```typescript
     if (activeTool === 'fibonacci') {
       return (
         <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-purple-500/40 bg-purple-950/85 px-4 py-1.5 text-xs font-medium text-purple-200 shadow-xl backdrop-blur-md">
           {draftAnchors.length === 0
             ? 'Click chart to place first anchor of Fibonacci retracement · Click Pointer to cancel'
             : 'Click chart to place second anchor and finish Fibonacci retracement'}
         </div>
       );
     }
     ```

2. **Update `src/features/chart/overlays/ChartToolbar.tsx`**:
   - **Line 1**: Add `Percent` to lucide-react imports:
     ```typescript
     import { MousePointer, BookmarkCheck, StickyNote, TrendingUp, Percent } from 'lucide-react';
     ```
   - **Line 58** (after Trendline button): Add the "Fib" button:
     ```typescript
     <button
       type="button"
       title="Fibonacci Retracement (Click twice to calculate Fibonacci retracement levels)"
       onClick={() => onSelectTool(activeTool === 'fibonacci' ? null : 'fibonacci')}
       className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition ${
         activeTool === 'fibonacci'
           ? 'bg-purple-500 text-slate-950 shadow-sm font-semibold'
           : 'text-slate-400 hover:text-purple-300'
       }`}
     >
       <Percent className="h-3.5 w-3.5" />
       <span>Fib</span>
     </button>
     ```

3. **Add Test Coverage**:
   - Create `src/features/chart/overlays/__tests__/fibonacci-plugin.test.ts` to verify:
     - `calculateFibonacciLevels` arithmetic accuracy for uptrend (e.g. 100 → 200) and downtrend (e.g. 200 → 100).
     - Auto-registration in `overlayPluginRegistry` when `OverlayCanvas` is imported.
     - Plugin properties: `requiredAnchors === 2`, `type === 'fibonacci'`, and `createDefaultPayload()`.

---

## 5. Verification Method

To independently verify the investigation and future implementation:

1. **Verify Plugin Registration and Typecheck**:
   ```bash
   npm run typecheck
   ```
   Must pass with exit code `0`.

2. **Run Schema and Boundary Tests**:
   ```bash
   npx vitest run src/core/__tests__/fibonacci-schema.test.ts
   npx vitest run src/core/__tests__/architecture-boundaries.test.ts
   ```
   All tests must pass, confirming that `FibonacciPayloadSchema` remains strictly headless with zero DOM or UI dependencies.

3. **Verify Registry Auto-Registration**:
   Inspect `overlayPluginRegistry.get('fibonacci')` after importing `src/features/chart/overlays/OverlayCanvas`. It must return the registered `fibonacciPlugin` object with `requiredAnchors === 2`.

4. **Verify Clean Production Build**:
   ```bash
   npm run build
   ```
   Must produce a clean production bundle in `dist/`.
