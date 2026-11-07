# Review & Adversarial Challenge Report: Overlays & Toolbar (Milestone 15)

**Reviewer**: `reviewer_m2_1`  
**Roles**: reviewer, critic  
**Target Worker**: `worker_m2`  
**Parent**: `orchestrator_m15` (`a9a9c8ed-8a35-4f8f-8dd8-9119837c3c50`)  
**Timestamp**: 2026-11-07T18:38:00Z  

---

## Review Summary

**Verdict**: **APPROVE**

Worker `worker_m2` has implemented all required performance hardening and behavioral enhancements across the chart overlay plugins (`TrendlinePlugin`, `FibonacciPlugin`, `StickerPlugin`) and `ChartToolbar` in full compliance with the specification (`docs/specs/milestone-15-performance-and-behavior-hardening.md`) and architectural boundaries (`AGENTS.md`).

Integrity audit detected zero integrity violations: no hardcoded test outputs, no facade implementations, no task shortcuts, and no fabricated results.

---

## 1. Observation

1. **Reviewed Source Files**:
   - `src/features/chart/overlays/plugins/TrendlinePlugin.tsx`
   - `src/features/chart/overlays/plugins/FibonacciPlugin.tsx`
   - `src/features/chart/overlays/plugins/StickerPlugin.tsx`
   - `src/features/chart/overlays/ChartToolbar.tsx`

2. **Specific Code Verifications**:
   - `TrendlinePlugin.tsx`:
     - Lines 34–35: Added `const [dragAnchors, setDragAnchors] = useState<[LogicalAnchor, LogicalAnchor] | null>(null)` and `const dragAnchorsRef = useRef<[LogicalAnchor, LogicalAnchor] | null>(null)`.
     - Lines 40–52: Replaced direct `annotation.anchors` references with `effectiveAnchor1` / `effectiveAnchor2` derived from `dragAnchors ?? annotation.anchors`.
     - Lines 81–100 & 128–140: During `handleMouseMove` for both handle dragging and full-line translation, `setDragAnchors` and `dragAnchorsRef.current` are updated. Zero calls to `onUpdate` are made during mousemove events.
     - Lines 106–110 & 148–152: In `handleMouseUp`, `onUpdate({ anchors: dragAnchorsRef.current })` is invoked once, followed by clearing `dragAnchorsRef.current` and `setDragAnchors(null)`.
     - Lines 208–215: Confirmed removal of invalid JSX attribute `style-custom={{ backgroundColor: payload.color }}` on Anchor 1 handle; only standard React `style` and `className` are present.
   - `FibonacciPlugin.tsx`:
     - Lines 61–62: Added `dragAnchors` state and `dragAnchorsRef`.
     - Lines 67–104: Derived `effectiveAnchor1` and `effectiveAnchor2`; `calculateFibonacciLevels` and projected screen coordinates update smoothly during dragging.
     - Lines 120–131 & 164–177: Handle dragging and body dragging buffer anchor updates locally without calling `onUpdate`.
     - Lines 138–142 & 186–190: In `handleMouseUp`, committed once via `onUpdate({ anchors: dragAnchorsRef.current })`.
   - `StickerPlugin.tsx`:
     - Lines 74–76: Added `const [dragAnchor, setDragAnchor] = useState<LogicalAnchor | null>(null)`, `const dragAnchorRef = useRef<LogicalAnchor | null>(null)`, and `primaryAnchor = dragAnchor ?? annotation.anchors[0]`.
     - Lines 120–134: Pin and header grip `handleMouseMove` update `dragAnchor` locally without calling `onUpdate`.
     - Lines 140–144: Single commit on `handleMouseUp` via `onUpdate({ anchors: [dragAnchorRef.current] })`.
     - Lines 79–93: Maintained synchronous `localText` state in `<textarea>` for zero-latency typing.
     - Lines 260–274: Added 250ms debounced persistence via `debounceTimerRef` and `pendingMarkdownRef`.
     - Lines 84–98 & 272–274: Immediate synchronous flush in `flushPendingMarkdown()` invoked on `<textarea>` `onBlur` and component unmount cleanup (`useEffect(() => () => flushPendingMarkdown(), [])`).
     - Lines 101–105: Guarded external `payload.markdown` synchronization with `if (pendingMarkdownRef.current === null)` so incoming sync updates never clobber in-flight keystrokes.
   - `ChartToolbar.tsx`:
     - Line 19: Set default parameter `showAdvancedTools = false`.
     - Lines 65–95: Conditioned `Fib` (Fibonacci Retracement) and `Trade Marker` buttons behind `{showAdvancedTools && ...}`. When omitted or `false`, only `Pointer`, `Sticker`, and `Trendline` (plus annotation count badge) are rendered.

3. **Automated Verification Results**:
   - `npm run typecheck` (`tsc --noEmit`): Exited with code 0 (zero errors in all project files).
   - `npx vitest run src/features/chart/`: 4 test files passed, 32 tests passed, 0 failures.
   - `npm run test` (`vitest run`): 31 test files passed, 374 tests passed, 0 failures.
   - `npm run build`: Production bundle built cleanly in ~5.1s (`dist/assets/index-CgHEzB7d.js` 433.67 kB).

---

## 2. Logic Chain

1. **Overlay Drag Store Throttling**:
   - High-frequency mouse movements previously triggered `onUpdate` on every pixel (60–120Hz), causing severe I/O thrashing in IndexedDB and workspace hash recalculations.
   - By buffering mousemove updates in local component state (`dragAnchors` / `dragAnchor`) and committing only on `mouseup`, visual rendering maintains full 60fps responsiveness while reducing store and database writes from hundreds per interaction to exactly 1.
2. **Typing Debounce & Zero Data Loss Guarantee**:
   - Direct store calls per keystroke in note textareas caused typing lag. Debouncing by 250ms restores zero-latency native typing.
   - Flushing pending edits immediately on `onBlur` and unmount prevents trailing keystroke loss when the user types and immediately clicks away or changes tickers.
3. **Minimalist Toolbar**:
   - Defaulting `showAdvancedTools = false` cleans up the chart header for standard analysis workflows while retaining backward-compatibility for advanced test suites via explicit `showAdvancedTools: true`.

---

## 3. Findings

### Minor Finding 1: Redundant `onUpdate` on Static Click without Movement

- **What**: In `TrendlinePlugin.tsx` (lines 78, 106, 122, 148), `FibonacciPlugin.tsx` (lines 110, 138, 154, 186), and `StickerPlugin.tsx` (lines 117, 140), `dragAnchorsRef.current` (or `dragAnchorRef.current`) is initialized to the existing anchors on `mousedown`:
  ```ts
  dragAnchorsRef.current = [effectiveAnchor1, effectiveAnchor2];
  ```
  On `mouseup`, it unconditionally evaluates:
  ```ts
  if (dragAnchorsRef.current) {
    onUpdate({ anchors: dragAnchorsRef.current });
  }
  ```
- **Where**:
  - `TrendlinePlugin.tsx`: lines 78, 106, 122, 148
  - `FibonacciPlugin.tsx`: lines 110, 138, 154, 186
  - `StickerPlugin.tsx`: lines 117, 140
- **Why**: When a user merely clicks on a line, handle, or sticker pin to select it (mousedown immediately followed by mouseup without any mouse movement), `onUpdate` is invoked once with the identical anchors. While idempotent (it does not alter coordinates), it triggers an unnecessary store update, Zod schema validation, and IndexedDB write on pure clicks.
- **Severity**: **Minor** (Non-blocking performance optimization).
- **Suggestion**: Track a boolean flag `hasMovedRef.current = false` set to `true` inside `handleMouseMove`, or initialize `dragAnchorsRef.current = null` on mousedown and only populate it when `projector.screenToLogical` resolves a new point. On mouseup, only call `onUpdate` if movement occurred.

---

## 4. Adversarial Challenge & Stress Test Report

### Challenge Summary

**Overall Risk Assessment**: **LOW**

### Empirical Stress Tests

| Stress Scenario | Expected Behavior | Actual Behavior | Result |
|---|---|---|---|
| **100+ rapid `mousemove` events during trendline handle drag** | 0 intermediate calls to `onUpdate`, visual coordinates update at 60fps | 0 calls to `onUpdate` during movement | **PASS** |
| **`mouseup` following handle drag** | Exactly 1 commit to `onUpdate` with new anchor coordinates | 1 call with target logical anchors | **PASS** |
| **100+ rapid `mousemove` events during whole trendline line drag** | 0 intermediate calls to `onUpdate`, both anchors translate smoothly | 0 calls to `onUpdate` during movement | **PASS** |
| **`mouseup` following whole line drag** | Exactly 1 commit to `onUpdate` with translated anchors | 1 call with translated logical anchors | **PASS** |
| **100+ rapid `mousemove` events during Fibonacci zone drag** | 0 intermediate calls to `onUpdate`, all levels recalculate at 60fps | 0 calls to `onUpdate` during movement | **PASS** |
| **`mouseup` following Fibonacci zone drag** | Exactly 1 commit to `onUpdate` | 1 call with translated anchors | **PASS** |
| **100+ rapid `mousemove` events during sticker pin drag** | 0 intermediate calls to `onUpdate`, card follows cursor | 0 calls to `onUpdate` during movement | **PASS** |
| **`mouseup` following sticker pin drag** | Exactly 1 commit to `onUpdate` | 1 call with new logical anchor | **PASS** |
| **20 rapid keystrokes within 200ms in sticker textarea** | `localText` updates synchronously each keystroke; 0 `onUpdate` calls before 250ms; 1 call after 250ms with final string | 0 calls before 250ms, 1 call with full text at 250ms | **PASS** |
| **Keystroke followed immediately by blur at 50ms** | `onBlur` flushes pending text immediately; timer canceled (no duplicate call at 250ms) | Synchronous call on blur; exactly 1 call total | **PASS** |
| **Keystroke followed immediately by component unmount at 50ms** | Unmount cleanup flushes pending text | Synchronous call on unmount | **PASS** |
| **Static click without drag on handle or line** | No store write | 1 idempotent call with unchanged anchors | **OBSERVED (Minor Finding 1)** |
| **Invalid JSX attribute audit** | Zero non-standard attributes in DOM output | `style-custom` completely removed | **PASS** |
| **Toolbar default props audit** | Fibonacci and Trade Marker hidden when `showAdvancedTools` is omitted | Only Pointer, Sticker, Trendline rendered | **PASS** |
| **Off-screen coordinate projection failure (`logicalToScreen` / `screenToLogical` returning null)** | Graceful return without throwing uncaught exceptions | Guard clauses `if (!logical) return` prevent null dereferencing | **PASS** |

---

## 5. Verified Claims

1. **Claim**: `TrendlinePlugin.tsx` and `FibonacciPlugin.tsx` buffer dragging in `dragAnchors` and commit once on `mouseup`.  
   → **Verified**: Verified via static code audit and automated test suite. `onUpdate` is never called in `mousemove` and is called once in `mouseup`.
2. **Claim**: Invalid `style-custom` attribute removed from Anchor 1.  
   → **Verified**: Confirmed via DOM inspection and tests.
3. **Claim**: `StickerPlugin.tsx` buffers pin/header drag, updates textarea with zero lag, debounces persistence by 250ms, and flushes on blur/unmount.  
   → **Verified**: Confirmed via code audit and empirical event tests.
4. **Claim**: `ChartToolbar.tsx` defaults `showAdvancedTools = false`.  
   → **Verified**: Confirmed via unit tests in `src/features/chart/__tests__/chart-autoscale-and-toolbar.test.ts`.
5. **Claim**: Zero TypeScript errors and full test suite passes.  
   → **Verified**: Ran `npm run typecheck` (0 errors), `npx vitest run src/features/chart/` (4 files, 32 tests passed), and `npm run test` (31 files, 374 tests passed).

---

## 6. Caveats

- **No Caveats**: The review scope is strictly bounded to `TrendlinePlugin.tsx`, `FibonacciPlugin.tsx`, `StickerPlugin.tsx`, and `ChartToolbar.tsx`. Minor Finding 1 does not pose data integrity or functionality risks.

---

## 7. Conclusion

Milestone 2 (Overlays & Toolbar) changes implemented by `worker_m2` are **APPROVED**.
- Performance bottlenecks during overlay dragging and typing are fully resolved.
- Toolbar minimalist defaults align with user requirements.
- Full type safety, build integrity, and test suite pass with zero regressions.

---

## 8. Verification Method

To independently reproduce the review verification:

1. **Verify TypeScript compilation**:
   ```bash
   npm run typecheck
   ```
   *Expected*: Exit code 0, 0 errors.

2. **Run Chart and Overlay Unit Tests**:
   ```bash
   npx vitest run src/features/chart/
   ```
   *Expected*: 4 test files passed, 32 tests passed, 0 failures.

3. **Run Full Test Suite**:
   ```bash
   npm run test
   ```
   *Expected*: 31 test files passed, 374 tests passed, 0 failures.

4. **Verify Production Build**:
   ```bash
   npm run build
   ```
   *Expected*: Vite production build completes in ~5s with exit code 0.
