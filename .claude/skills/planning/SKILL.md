---
name: planning
description: Turn a non-trivial task into a concrete, sequenced implementation plan before writing code. Use when the user asks to "plan" or "how should we implement X", or before any change that touches multiple routes/components, the client catalog shape, the warehouse read API, or the Arrow artifact/columns. Produces an ordered, verifiable plan for approval.
---

# Planning

Produce a plan the user can approve before implementation starts. A good plan is
**ordered, verifiable, and honest about risk** — each step should be something you
can check, not a vague intention.

## Process

1. **Understand first.** Restate the goal and its success criteria. **Read the
   relevant code before planning** — don't plan against assumptions. Note what
   already exists that you can reuse (components, catalog helpers, warehouse client).

2. **Scope.** State what's in and what's explicitly out. Identify every affected
   surface: `src/routes/` pages/layouts, `src/lib/` components & catalog code,
   `src/lib/server/` (warehouse client, catalog build/serialize), the Arrow artifact
   shape (`columns.ts`), tests, `docs/`, and any `.github/workflows/` or Cloud Run/IAM.

3. **Sequence the work.** Break it into ordered steps, each an independent PR,
   smallest-safe-change first. Call out dependencies and stacked-branch order.

4. **Surface risks and unknowns.** What could break or is irreversible — artifact
   schema/column changes (the client and BigQuery SELECT are driven by one
   `columns.ts`, so they can't drift), catalog re-hash/ETag churn, warehouse API cost
   (bytes scanned, the 10MB-per-table minimum), Cloud Run scale-to-zero cold starts,
   auth/IAM (`run.invoker=allUsers` gating), a bespoke interaction (canvas hit-testing,
   brush) that needs a spike. Note the rollback story and open questions.

5. **Define verification.** For each step, how you prove it works — a Vitest unit
   test (SQL/scope builders, serialize), `just check` (svelte-check + lint + types),
   `just dev` on localhost:5173 in **both light and dark**, the Playwright latency
   harness against the plot budgets (< 300ms filter re-render, < 16ms hover), and a
   real scoped slice that looks right.

6. **Present for approval.** Show the plan and stop for a go-ahead before writing
   code. Prefer plan mode (`EnterPlanMode` / `ExitPlanMode`) for anything sizeable, and
   persist the plan under `docs/superpowers/plans/<date>-<slug>.md` next to its spec.

## Output shape

- **Goal & success criteria** — 1–2 lines
- **Affected files/systems** — the concrete list
- **Steps** — numbered, each an independent PR, each with its verification
- **Risks / unknowns / rollback** — what to watch, what's one-way
- **Out of scope** — what you're deliberately not doing

## This repo (shape plans to fit it)

- **SvelteKit + Svelte 5 (runes) + TypeScript + Tailwind v4 tokens**, adapter-node.
  Follow the `frontend-patterns` and `style-rules` skills for any UI; never hardcode
  colors — use the CSS-variable tokens.
- Two data paths, kept separate: the **client catalog** (a daily Arrow artifact loaded
  into DuckDB-WASM in the browser — `src/lib/catalog/`, shape in
  `src/lib/server/catalog/columns.ts`) is for querying games *as a set*; the
  **warehouse read API** (`src/lib/data/*.remote.ts` → `src/lib/server/warehouse/`) is a
  server-side point lookup for a single game's full document. Know which one a change touches.
- Changes ship via **PRs to `main`**, one concern per PR. **Never develop on `main`;
  never `gh pr merge` — Phil merges PRs.** Build/deploy is **Actions-only**.
- Verify with `just check` and `just dev`; write Vitest for logic (scope/SQL/serialize).
- **Phil writes all user-facing copy** — use minimal flagged placeholders, don't craft taglines.
- Design work flows **brainstorm → spec → plan**, documented under `docs/superpowers/`;
  don't hand-roll an inline plan when the task warrants the flow.
