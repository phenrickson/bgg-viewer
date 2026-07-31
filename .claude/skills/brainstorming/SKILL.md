---
name: brainstorming
description: Explore options and generate ideas before committing to an approach. Use when the user wants to weigh alternatives, asks "what are my options / how could we approach X", or is at the start of a fuzzy problem and needs divergent thinking before converging on a plan. Not for tasks where the approach is already clear.
---

# Brainstorming

Help the user think broadly before narrowing. The goal is to surface genuinely
different approaches and their trade-offs, then land on a recommendation — not to
start implementing.

## Process

1. **Frame the problem.** Restate the goal in one sentence and name the hard
   constraints (render budgets, catalog artifact size, warehouse API cost, auth/IAM,
   what must not break). If the request is underspecified, ask 1–3 targeted questions
   before diverging — don't brainstorm against a guess.

2. **Diverge.** Generate 3–5 *distinct* approaches, not variations of one idea.
   Push past the obvious first answer. Include at least one "cheap/boring" option
   and one "what if we rethought this" option. For each:
   - How it works (2–4 sentences)
   - Pros / cons
   - Rough effort and risk
   - How well it fits this repo's grain (see below)

3. **Converge.** Compare the options against the constraints. Recommend one (or a
   hybrid), and say plainly *why* it wins and what you'd give up.

4. **Name the unknowns.** What would you need to validate before committing —
   a spike, a latency measurement, a sample query, a question for the user? Hand off to
   `planning` once an approach is chosen, and capture the decision in a spec under
   `docs/superpowers/specs/`.

## Keep it honest

- Don't inflate the count with near-duplicates. Three real options beat five fake ones.
- Surface the option you'd *not* pursue and why — the discarded ideas are part of the value.
- Flag anything that's a one-way door (Arrow artifact/column changes, catalog ETag churn,
  auth/IAM exposure, public-facing outputs).

## This repo (context to weigh options against)

- **SvelteKit + Svelte 5 (runes) + TypeScript + Tailwind v4 tokens.** UI follows the
  `frontend-patterns` / `style-rules` skills; theme-token colors, light + dark.
- **Two data paths:** the client **catalog** (Arrow artifact → DuckDB-WASM, for querying
  games as a set) and the server **warehouse read API** (point lookup for one game).
  The narrow catalog shape is one source of truth in `src/lib/server/catalog/columns.ts`.
- **Render budgets are a real constraint** — the plot draws the whole working set on a
  canvas; hot queries drop `name` and marshal numbers as typed arrays.
- Prefer options that keep interactions **client-side and cheap** (a brush re-query is
  ~15ms) over round-trips; favor reusing what's built over rebuilding.
- Ship via PRs to `main`; **Phil merges PRs and writes all user-facing copy.**
