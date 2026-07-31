# BGG Viewer — Explore Workspace — Design

**Date:** 2026-07-29
**Status:** Draft for review
**Builds on:** [2026-07-28-client-catalog-architecture-design.md](2026-07-28-client-catalog-architecture-design.md)
(that spec settles the *data foundation* — a client-side DuckDB-WASM catalog over a daily
Parquet artifact; this spec is the *view layer* — what the user sees and does in Explore)

> Copy note: all user-facing strings (headlines, taglines, microcopy) are **placeholder** —
> Phil writes the final copy. The mockup's copy is illustrative only.

## Goal

Define the **Explore workspace** (`/games`) and the **landing page** that fronts it: what a
user sees, how they interact, and how it renders fast when the expectation is *seeing all the
games at once*. The data layer beneath (catalog, artifact, scale-to-zero) is already settled.

Reference mockup: [docs/design/explore-workspace-mockup.html](../../design/explore-workspace-mockup.html).

## Product framing (the why)

BoardGameGeek lets you rank by geek rating, view one game, or click a single mechanic — it can
**not let you query games as a set**. Explore is that query tool: filter, visualize, and read a
whole slice of the catalog at once. Model enrichments (predictions, similarity) are a
differentiating *layer in their own rooms*, not the foundation.

- **Audience:** board-game enthusiasts are the floor (must serve them); power/data users too.
- **Three core jobs:** (1) see/examine **sets** of games by criteria — *this spec*; (2) review
  **predictions for upcoming** games — a separate `/predictions` page; (3) examine an
  **individual game** — the detail page, already built.

## The three-level model (the core mental model)

Explore has three nested levels of narrowing, each cheaper and more transient than the last.
Keeping them visually distinct is a design requirement — conflating them is the main UX risk.

1. **Universe** — the base population the query runs over. Two to start:
   - **Top 10,000** — the top 10k by `geek_rating` (≈ BGG's published rank). Curated, crisp,
     recognizable. **Default.**
   - **All rated** — every game with a geek rating (`users_rated >= 30`). The long tail; the
     completionist/power view.
   A coarse, deliberate dial (top of the rail).
2. **Scope** — the rail query *within* the universe: year, complexity, geek-rating, players +
   best-at, category/mechanic facets. Lives in the **URL** — shareable, reload-safe.
3. **Brush** — a throwaway sub-selection *within* the answer set — drag a region of the plot to
   narrow the table. **Not** persisted; cleared in one click; the query stays put.

## What the user sees — the Explore canvas

- **Rail:** the **Universe** dial at top, then **Scope** filters below.
- **Canvas header:** live count + scope summary; an **Explore / Summary** lens switch; *Save view*
  (future).
- **Body — a linked plot *over* table, both full-width, stacked:**
  - **Plot (the headline).** A scatter where **every game in universe ∩ scope is a point**
    (default y = `geek_rating`, x = `average_weight`). A scatter of the actual games is the
    games *and* their shape at once — that is why it leads, not the aggregate charts. Hover →
    the game's name; click → `/games/{id}`; **brush → sub-select**.
  - **Table (the same games, as rows).** Sortable; the brush filters it; hovering a row
    cross-highlights its point and vice-versa; row click → detail. Full-width, internal scroll
    (fill-height pattern).
- **Set summary (secondary lens).** A collapsible strip — rating histogram, games-per-year, top
  categories. Aggregate *shape*, deliberately demoted from the headline. Serves the data-user's
  "characterize this slice" desire without stealing the stage from the games.

## Rendering approach (a first-class requirement here)

Because "see all the games" is the expectation, the plot must draw the whole current
universe ∩ scope as points and stay interactive. Drawing that many points is *not* the hard part;
the data path and hit-testing are. Design for the ~38k working-set ceiling (Top-10k default).

- **Canvas point layer** — never SVG (38k DOM nodes is death), not WebGL (unneeded < ~100k pts).
  Use LayerChart's Canvas layer.
- **Numbers-only hot query** — the per-filter plot query returns `average_weight AS x,
  geek_rating AS y, game_id` and **drops `name`**; numeric columns marshal as near-zero-copy
  typed arrays (~15ms). An **`id → name` Map** is built once at catalog load and resolves the
  hovered point's name (O(1)). *(This is the "lazy names" fix from the 07-29 handoff — now
  foundational, not a cleanup.)*
- **Spatial index for hover — already handled by LayerChart.** `ScatterChart.svelte` already
  renders on a Canvas layer with `tooltipContext={{ mode: 'quadtree' }}`, i.e. O(log n) hover
  hit-testing over the cloud. No hand-built `d3-quadtree` is needed for hover; the brush (below)
  is the only bespoke hit-test we add.
- **Layer separation** so cheap interactions don't redraw the expensive cloud:
  - *Base cloud (Canvas)* — all points; redrawn only on data/scale change.
  - *Selection tint* — a `Uint8` "selected" mask drives brushed-in-solid vs. dimmed-out; brushing
    updates the mask and redraws the base (throttled to `requestAnimationFrame`).
  - *Hover marker + tooltip (small SVG)* — just the one hovered point; reuse LayerChart `Tooltip`.
- **Brush → table** — the brush is x/y bounds; filter the in-memory typed arrays (sub-ms) or push
  the bounds into DuckDB for the table page. No round-trip for the plot highlight.
- **Density-by-N** — radius/alpha scale with set size: Top-10k crisper/opaque (each game legible);
  All-rated smaller/lower-alpha so density reads through accumulation. A hexbin/density underlay
  is a **v2** escalation if dense regions still muddy.
- **Budgets** (measured with the Playwright latency harness): universe/scope change → full
  re-render **< 300ms**; hover response **< 16ms** (60fps); brush drag **60fps**.

## The landing page

Fronts Explore; **orients the user and warms the catalog** in the background.

- On arrival, kick `initCatalog()` + the priming query so the first Explore interaction is warm.
- **Catalog-independent entry points work immediately** (search → detail is a point lookup that
  doesn't wait on the catalog): a game **search box**, **example-query chips** that drop into a
  pre-scoped Explore, and entry cards (Explore *ready*; Predictions / Similarity / Collection
  *soon*). A subtle "warming…" indicator makes the background load honest.

## Data implications

- **No new artifact columns required.** `users_rated` and `geek_rating` are already in
  `SCALAR_COLUMNS` ([columns.ts](../../../src/lib/server/catalog/columns.ts)) and drive both
  universes. *(Optional: add an explicit `bgg_rank` only to match BGG's published rank exactly
  rather than derive Top-N by `geek_rating`.)*
- The plot's hot query drops `name`; `columns.ts` itself is unchanged.

## Open questions / to test

- **One plot vs. two (or swappable axes).** One-plot-at-top may be thin — Phil wants to test it.
  The Canvas + quadtree machinery is per-plot and reusable, so a second plot (e.g. rating ×
  popularity) or an axis switcher is cheap to add if testing says one is weak.
- **Universe control placement** — rail-top (framing the scope) vs. canvas header.
- **Brush affordance** — how throwaway it feels; where the one-click clear lives.
- **Summary** — a lens toggle vs. inline collapsed.
- **Density-by-N** — automatic from live count vs. a subtle manual control.
- **Default universe** — recommend Top 10,000.

## Out of scope

- **Entity profile pages** (designer / artist / publisher) — their own slice, an entity-detail
  archetype reached by click-through, *not* a rail filter.
- **Predictions / similarity / collection** modules — their own rooms.
- **Save view / shareable saved queries** — later.
- **Kitchen-sink (140k)** — a data-artifact problem, not a rendering one.

## Next

An implementation **plan** (branch → PR per step; the "lazy names" numbers-only query + quadtree
land first as the plot's foundation, then the brush link, then the Universe dial, then the
landing page). Follows the `frontend-patterns` / `style-rules` skills; front-end verify +
Playwright latency checks against the budgets above.
