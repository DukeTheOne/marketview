---
name: spec-slice
description: >-
  Generates a strict, architecture-compliant vertical-slice specification in docs/specs/<slice-name>.md before implementation. Use when the user invokes /spec-slice or asks to design/spec a milestone or feature slice for MarketView prior to coding.
---

# Vertical-Slice Specification Skill (`/spec-slice`)

This skill separates **Architectural Planning** (high-reasoning model) from **Deterministic Execution** (fast coding model or isolated Git Worktree subagent).

## Workflow Steps

1. **Verify Architectural Context**:
   - Read [AGENTS.md](../../AGENTS.md) and [architecture-boundaries.md](../../rules/architecture-boundaries.md).
   - Inspect existing files in `src/core/schemas/`, `src/core/providers/`, `src/core/repositories/`, and `src/features/chart/overlays/` so the spec builds cleanly on existing contracts without breaking changes.

2. **Generate `docs/specs/<slice-name>.md`**:
   Create or overwrite the target Markdown specification file with the following mandatory sections:
   - **1. Slice Scope & Architectural Invariants Check**:
     - Confirm zero DOM/UI imports in `src/core/`.
     - Confirm all external market data flows through `MarketDataProvider`.
     - Confirm all chart overlays use logical `{ timestamp, price }` coordinates and register via `ChartOverlayPlugin`.
   - **2. Headless Core Contracts (`src/core/`)**:
     - Exact Zod schemas (`src/core/schemas/*.ts`) and exported TypeScript types.
     - Repository / Provider interfaces and store state/action signatures (`src/core/stores/*.ts`).
   - **3. UI & Chart Plugin Layer (`src/features/` & `src/ui/`)**:
     - Component tree, props, and `ChartOverlayPlugin` implementation details (anchor count, payload schema, coordinate projection behavior).
   - **4. Ordered File Manifest**:
     - Step-by-step checklist of `[NEW]` and `[MODIFY]` files ordered from zero-dependency schemas up to UI integration.
   - **5. Verification & Test Matrix**:
     - Exact Vitest unit test cases (`src/core/**/*.test.ts`) and `npx tsc --noEmit` checks required for sign-off.

3. **Pause for Model / Worktree Handoff**:
   - Do **NOT** write or modify production code in `src/` during the `/spec-slice` step unless explicitly asked by the user.
   - Present the clickable link to `docs/specs/<slice-name>.md` and instruct the user on how to hand the spec off to an execution model or a parallel Git Worktree subagent.
