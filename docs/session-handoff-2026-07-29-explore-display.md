# Session handoff — 2026-07-29 (Explore v1 built; display still unsatisfying)

Continues the Explore redesign from [session-handoff-2026-07-29-explore-redesign.md](session-handoff-2026-07-29-explore-redesign.md).
The **radical-pragmatism v1 loop is built and working** (landing → Explore → detail),
but **Phil is not happy with how Explore displays** — that's the open problem for the next
session. Read "The unresolved problem" below before changing anything.

## Plan of record

[docs/superpowers/plans/2026-07-29-explore-v1-pragmatic.md](superpowers/plans/2026-07-29-explore-v1-pragmatic.md)
— supersedes the earlier plan. Spec + mockup unchanged
([spec](superpowers/specs/2026-07-29-explore-workspace-design.md),
[mockup](design/explore-workspace-mockup.html)). Note the build **diverged from the mockup
deliberately** this session (scatter cut, aggregates behind a lens) — the plan's "Decisions
baked in" section is the current source of truth, not the mockup.

## State

- **Branch:** `feat/explore-cleanup` (grew well past "cleanup" — holds the whole session's
  work). Stacked on `feat/landing` → `feat/explore-canvas` → `feat/explore-rail` →
  `feat/catalog-fields` → `feat/explore-lazy-names` → (PR #9, still open). **Nothing pushed.**
  Everything committed; working tree clean.
- **Verify:** `just check` clean; `pnpm exec vitest run` 45 passing.
- **Run:** `gcloud auth application-default login` once (the Node BigQuery client needs ADC;
  `bq` alone isn't enough), then `just dev` → localhost:5173 (dev-auth bypass via
  `DEV_AUTH_EMAIL=dev@local`). Open `/games`.

## What was built (commits on the branch, oldest→newest)

1. `feat(catalog)` — **expanded the artifact** ([columns.ts](../src/lib/server/catalog/columns.ts)):
   added `best_player_counts` / `recommended_player_counts` (INT arrays, from
   `analytics.best_player_counts`), `designers` / `artists` / `publishers` (families were
   already in); dropped duplicate `complexity`. Size cost ~1 MB gzipped — verified trivial.
   `build.ts` JOINs best_player_counts + SPLITs to arrays; `serialize.ts` handles `List<Int32>`.
2. `feat(explore)` best-at filter + table Best/Rec columns; **two-tier rail** — direct
   facets (categories/mechanics + a **Best at N** control) and **type-ahead comboboxes**
   ([EntityFilter.svelte](../src/lib/catalog/EntityFilter.svelte)) for
   designers/artists/publishers/families (DISTINCT over the in-browser catalog — no server,
   no top-N cap). Filters compile in [scope.ts](../src/lib/catalog/scope.ts), URL round-trip.
3. `feat(explore)` aggregate canvas + `fix` chart legibility + `wip` layout iterations.
4. `feat(landing)` — the landing at `(app)/+page.svelte`.
5. `feat(detail)` — box art, description, publishers on `/games/[id]`.
6. `feat(explore)` — **Table|Summary lens** (current state, see below) + global
   [GameSearch.svelte](../src/lib/catalog/GameSearch.svelte) in the nav.

## Current Explore shape (`/games`)

- **Rail** (left): Universe dial (Top 10k / All rated) · Year/Complexity/Geek number inputs
  · Plays-with · **Best at** · Categories/Mechanics checkbox facets (global counts, loaded
  once) · **Find** type-ahead (designer/artist/publisher/family).
- **Header:** live count + scope descriptor + **[▦ Table | ▤ Summary]** lens toggle (default Table).
- **Table lens:** the games table only (fills viewport, internal scroll, sticky header).
  Columns incl. Best at / Rec at. DuckDB-paged (250/page).
- **Summary lens:** [SetSummary](../src/lib/catalog/views/SetSummary.svelte) = 3 distributions
  (rating/complexity/games-per-year), each headlined by its median/span stat; then
  [SetComposition](../src/lib/catalog/views/SetComposition.svelte) = Best-at / Top categories /
  Top mechanics as horizontal bars. Charts are [BarChart](../src/lib/charts/BarChart.svelte) /
  [RowBarChart](../src/lib/charts/RowBarChart.svelte) (LayerChart).

Landing = warming pill + hero (placeholder copy) + `GameSearch` + query chips (deep-link to
pre-scoped Explore) + entry cards. Nav = Home / Explore tabs + compact `GameSearch`.

## The unresolved problem (the reason for handoff)

**Phil is still unhappy with how Explore displays.** Crucially: **performance is good** (the
in-browser DuckDB path is fast, filters/charts update instantly). The dissatisfaction is
purely about **_seeing_ the data** — the visual presentation of the games and the set's shape
is not where Phil wants it. So the next session's job is a **visual/presentation** pass
(how the data is shown — table design, chart design, hierarchy, what's shown at all), **not**
perf work and not more IA plumbing.

The two jobs it must serve, per Phil:
1. **use search criteria to find games** (the table);
2. **examine information about those sets of games** (the aggregations).

The lens toggle was the latest attempt to separate these. It may still not be right. Do a
fresh **front-end design pass** — Phil explicitly wants design direction, not just
mechanics, and responds to concrete options/mockups over prose.

**Things already tried this session (don't just re-propose these):**
- Headline **scatter plot** of games — **cut** (too bespoke/risky; aggregates carry "shape").
- Aggregates stacked **above** the table — rejected (buried the games).
- Aggregates as a collapsible disclosure — rejected (toggle felt laggy; fixed, still meh).
- Distributions 2-up / 3-up / 2×2, composition beside vs below the table — iterated a lot.
- **KPI number tiles** — rejected ("hard to understand as numbers by themselves"); medians
  now sit on their distribution charts instead.
- Current: **Table|Summary lens**, Table default. Still not landing.

**Open design questions to push on:** Is the lens right, or should shape + list coexist
(e.g. a compact always-on summary strip + table)? Are these the right aggregates? Should the
rail's category/mechanic facets be scope-aware (they're global counts now) and thus double as
the "top categories/mechanics" view (removing that redundancy with SetComposition)? Is the
chart styling itself (LayerChart bar/row charts) carrying its weight, or should the summary be
rethought? Consider loading the `frontend-patterns` / `style-rules` / `dataviz` skills.

## Process / cautions

- **Phil writes all user-facing copy** — landing/hero strings are flagged placeholders.
- Delivery: branch → PR → Phil merges (never `gh pr merge`). Nothing pushed yet; the
  stacked-branch → PR strategy is undecided (ask Phil).
- Everything Explore is **in-browser DuckDB-WASM** over the catalog artifact; the server only
  serves the artifact + the game-detail point lookup. Keep interactions client-side.
- The `brainstorming` + `planning` superpowers skills now live in this repo's
  `.claude/skills/` (copied + retuned this session).
