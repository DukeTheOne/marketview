# Empirical Challenge Report: Challenger M2 Return 2 (Container & Integration Challenger)

- **Agent**: `challenger_m2_return_2`
- **Archetype / Roles**: EMPIRICAL CHALLENGER / critic, specialist
- **Parent**: `orchestrator_m15` (`a9a9c8ed-8a35-4f8f-8dd8-9119837c3c50`)
- **Working Directory**: `/home/duke/Project/marketview/.agents/teamwork/challenger_m2_return_2`
- **Timestamp**: 2026-11-07T19:35:00Z
- **Type**: Hard
- **Verdict**: **APPROVE**

---

## 1. Observation

### 1.1 Existing Stress Test Execution
Command:
```bash
npx vitest run src/test/challenger-m2-2-stress.test.ts src/test/challenger-m2-verif-2-stress.test.ts
```
Direct output:
```
✓ src/test/challenger-m2-2-stress.test.ts (23 tests) 85ms
✓ src/test/challenger-m2-verif-2-stress.test.ts (11 tests) 85ms
Test Files  2 passed (2)
Tests       34 passed (34)
Duration    1.60s
```

### 1.2 Inspection of ChartContainer Implementation
- **Hover Deduplication & Jitter Suppression** (`src/features/chart/ChartContainer.tsx:662-680`):
  ```tsx
  onMouseMove={(e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const nearest = findNearestHoverPoint(cursorX, hoverCandidatesRef.current);
    const prev = activeHoverPointRef.current;
    const isSame =
      prev === nearest ||
      (prev !== null &&
        nearest !== null &&
        prev.timestamp === nearest.timestamp &&
        prev.price === nearest.price &&
        prev.source === nearest.source &&
        prev.x === nearest.x &&
        prev.y === nearest.y);
    if (!isSame) {
      activeHoverPointRef.current = nearest;
      setActiveHoverPoint(nearest);
    }
  }}
  onMouseLeave={() => {
    if (activeHoverPointRef.current !== null) {
      activeHoverPointRef.current = null;
      setActiveHoverPoint(null);
    }
  }}
  ```
- **Loading Backdrop Non-Blocking Condition** (`src/features/chart/ChartContainer.tsx:776-782`):
  ```tsx
  {isLoading && sortedCandles.length === 0 && (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-slate-950/40 backdrop-blur-[1px]">
      <div className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-300 shadow-lg">
        Syncing {ticker} ({timeframe}) OHLCV series...
      </div>
    </div>
  )}
  ```

### 1.3 Inspection of Auto-Polling Visibility Gating
- **Visibility-Aware Auto-Polling** (`src/App.tsx:257-272`):
  ```tsx
  useEffect(() => {
    const intervalSec = savedPreferences.pollIntervalSec;
    if (intervalSec <= 0) return;

    const intervalId = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void marketStore.getState().refreshActiveCandles();
        const currentTickers = activeWatchlist?.tickers ?? [activeTicker];
        if (currentTickers.length > 0) {
          void marketStore.getState().refreshQuotes(currentTickers);
        }
      }
    }, intervalSec * 1000);

    return () => clearInterval(intervalId);
  }, [savedPreferences.pollIntervalSec, marketStore, activeTicker, activeWatchlist]);
  ```

### 1.4 Adversarial Stress Harness Execution
Authored new stress suite `src/test/challenger-m2-return-2-adversarial.test.ts` testing 9 adversarial conditions:
- 1,000 sub-pixel / float-jitter mousemove events within candle snap horizon (100% deduplication of jitter).
- Boundary distance evaluation at 119.99px, 120.00px, 120.01px in `findNearestHoverPoint`.
- 200 rapid alternating enter/leave burst transitions.
- Cold load (`isLoading: true, candles: []`) vs hot background refresh (`isLoading: true, candles: [c1, ...]`) backdrop presence and `pointer-events-none` enforcement.
- Complete tab visibility lifecycle (`visible` -> `hidden` -> `visible` -> `hidden`), interval reconfiguration cleanup, and SSR/headless toleration.
- 5,000 candle dataset single-pass indicator engine and binary search monotonic bounds.

Command:
```bash
npx vitest run src/test/challenger-m2-return-2-adversarial.test.ts
```
Direct output:
```
✓ src/test/challenger-m2-return-2-adversarial.test.ts (9 tests) 134ms
Test Files  1 passed (1)
Tests       9 passed (9)
Duration    1.45s
```

Combined stress suite execution:
```bash
npx vitest run src/test/challenger-m2-2-stress.test.ts src/test/challenger-m2-verif-2-stress.test.ts src/test/challenger-m2-return-2-adversarial.test.ts
```
Direct output:
```
Test Files  3 passed (3)
Tests       43 passed (43)
Duration    1.68s
```

### 1.5 Full Workspace Regression & Boundary Verification
- **Typecheck**:
  ```bash
  npm run typecheck
  ```
  Result: Exited with code 0 (`tsc --noEmit`).
- **Complete Test Suite**:
  ```bash
  npm run test
  ```
  Result: `Test Files 36 passed (36)`, `Tests 450 passed (450)`. 0 failures.
- **Architectural Boundary & Mobile Portability Suite**:
  ```bash
  npx vitest run src/core/__tests__/architecture-boundaries.test.ts src/core/__tests__/mobile-portability.test.ts
  ```
  Result: `Test Files 2 passed (2)`, `Tests 4 passed (4)`. 0 violations.
- **Production Build**:
  ```bash
  npm run build
  ```
  Result: Exited with code 0 (`tsc --noEmit && vite build`, built production bundle in 2.90s).

---

## 2. Logic Chain

1. **Hover Coordinate Deduplication Resilience**:
   - In `ChartContainer.tsx:662-680`, `onMouseMove` computes the nearest hover candidate and evaluates `isSame` against `activeHoverPointRef.current` comparing `timestamp`, `price`, `source`, `x`, and `y`.
   - Empirically observed across 1,000 rapid jitter events (and across 250 multi-candle traversals) that `setActiveHoverPoint` is called strictly once when entering a snap zone and zero times during internal jitter movements.
   - At the exact 120px snap boundary, `findNearestHoverPoint` rigorously includes points at distance $\le 120.00\text{px}$ and cleanly returns `null` at $120.01\text{px}$.
   - Conclusion: Hover coordinate deduplication completely suppresses jitter re-renders.

2. **Non-Blocking Loading Backdrop**:
   - In `ChartContainer.tsx:776-782`, the loading backdrop is conditioned strictly on `{isLoading && sortedCandles.length === 0}`.
   - When cached candles exist (`sortedCandles.length > 0`), even if `isLoading === true` (such as background polling or interval refresh), the JSX expression evaluates to `false` and zero backdrop DOM markup is emitted.
   - When displayed during cold load (`sortedCandles.length === 0`), the overlay carries `pointer-events-none absolute inset-0 z-20`, ensuring it cannot trap cursor events.
   - Conclusion: Cached candle viewing is non-blocking and background updates never flash or block the chart.

3. **Visibility-Aware Polling Gating**:
   - In `App.tsx:257-272`, `useEffect` creates an interval when `savedPreferences.pollIntervalSec > 0`. On each tick, it explicitly guards execution with `typeof document !== 'undefined' && document.visibilityState === 'visible'`.
   - When the user minimizes or backgrounds the browser tab (`visibilityState` becomes `'hidden'`, `'prerender'`, or `'unloaded'`), ticks pass without invoking `refreshActiveCandles()` or `refreshQuotes()`.
   - When returning to the tab (`visibilityState === 'visible'`), refresh calls immediately resume on the next interval tick.
   - When `pollIntervalSec === 0` (Off), no timer is instantiated. Interval changes properly clear prior timers via cleanup return.
   - Headless / SSR environments where `document` is undefined execute cleanly without throwing `ReferenceError`.
   - Conclusion: Auto-polling strictly honors tab visibility and avoids wasted background CPU/network usage.

4. **Zero Regressions**:
   - All 450 tests across 36 test files in the workspace pass cleanly.
   - Architectural boundaries in `src/core/` are fully preserved with zero DOM/React imports and logical coordinate enforcement.
   - Production bundle compiles without warnings or errors.

---

## 3. Caveats

- **No Caveats**: All four assigned verification criteria (hover deduplication, loading backdrop non-blocking behavior, auto-polling visibility gating, and full workspace regression testing) were empirically validated using programmatic test harnesses, static markup inspection, and end-to-end typecheck/build verification.

---

## 4. Conclusion

- **Verdict**: **APPROVE**
- `ChartContainer.tsx` hover deduplication effectively eliminates jitter-induced re-renders.
- The loading backdrop is strictly non-blocking when cached candles exist and displays only during cold load.
- Tab visibility-aware auto-polling halts when backgrounded and resumes when visible.
- Full workspace test suite passes with 450 tests passing (0 failures), 0 type errors, and a clean production build.

---

## 5. Verification Method

To independently reproduce the empirical findings of this report:

1. **Run Challenger M2 Stress Suites**:
   ```bash
   npx vitest run src/test/challenger-m2-2-stress.test.ts src/test/challenger-m2-verif-2-stress.test.ts src/test/challenger-m2-return-2-adversarial.test.ts
   ```
   *Expected outcome*: 43 passed tests across 3 files.

2. **Run Full Workspace Test Suite**:
   ```bash
   npm run test
   ```
   *Expected outcome*: 450 passed tests across 36 test files with 0 failures.

3. **Run TypeScript Typecheck**:
   ```bash
   npm run typecheck
   ```
   *Expected outcome*: Exits with code 0.

4. **Run Production Build**:
   ```bash
   npm run build
   ```
   *Expected outcome*: Exits with code 0 and outputs production assets to `dist/`.
