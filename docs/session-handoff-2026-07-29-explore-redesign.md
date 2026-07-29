# Session handoff — 2026-07-29 (Explore redesign, incomplete)

Picks up the Explore workspace redesign. **The implementation drifted from the target
mockup and the working tree is currently broken — read the "STATE" section first.**

## The target (source of truth)

**`docs/design/explore-workspace-mockup.html`** — the mockup made this session. Open it.
It defines what Explore should look like:
- **Rail** = Universe dial (**Top 10,000 / All rated**) at top, then **Scope**: search,
  Year / Complexity / Geek range controls, Players segmented (1–6+), Categories &
  Mechanics with counts.
- **Canvas header** = live count + scope summary text (e.g. "1,284 games · 2015–2025 ·
  complexity 3–5") + a lens control + Save view.
- **Body** = one **headline Plot** (scatter, games as points) **over** a full-width
  **Table** (same set), linked by a **brush** (drag plot → table narrows; hover row ↔
  point). Aggregate charts (rating dist / games-per-year / top categories) are a
  **secondary "Set summary"** strip, not the headline.

Design docs (also this session): `docs/superpowers/specs/2026-07-29-explore-workspace-design.md`
and `docs/superpowers/plans/2026-07-29-explore-workspace-implementation.md`. The three-level
model is **Universe ⊃ Scope ⊃ Brush**.

## STATE — read before doing anything

**Branch:** `feat/explore-lazy-names` (stacked on `feat/explore-views` / PR #9, which is
still open/unmerged). Nothing pushed for this branch.

**⚠️ The working tree is mid-edit and will NOT type-check.** `scope.ts` was just changed
to replace `ratedOnly` with `universe: 'top10k' | 'rated'`, but **`Rail.svelte` still binds
`scope.ratedOnly`**. First action for the next session: either update `Rail.svelte` to the
new `universe` field (add the Top 10,000 / All rated dial) **or** revert the `scope.ts`
change. Run `just check` to see it.

**Committed** on this branch (2 code + 1 docs commit):
- `docs: Explore workspace design` — mockup + spec + plan.
- `perf(catalog): lazy names` — plot queries select numbers only (`x, y, game_id`, no
  `name`); `catalog.svelte.ts` builds an `id→name` map + `nameOf()`; tooltip resolves via it.

**Uncommitted** working changes (the redesign + spike):
- `src/lib/charts/CloudCanvas.svelte` (NEW) — imperative canvas point-cloud draw loop.
- `src/lib/charts/ScatterCanvas.svelte` (NEW) — Chart (scales/axes/quadtree tooltip) +
  CloudCanvas. Drop-in for the old `ScatterChart.svelte` (which still exists, now unused).
- `src/lib/catalog/views/HeadlinePlot.svelte` (NEW) — the plot; column-pulls points, renders ScatterCanvas.
- `src/lib/catalog/views/SetSummary.svelte` (NEW) — tiles + rating dist + games/year + top cats.
- `src/lib/catalog/views/Overview.svelte` (DELETED) — split into the two above.
- `src/routes/(app)/games/+page.svelte` — stacked layout (plot / summary / bounded table); removed the Overview/Table toggle.
- `src/lib/catalog/views/Table.svelte` — bounded to `max-height:34rem` with internal scroll + sticky header.
- `src/lib/catalog/catalog.svelte.ts` — added `queryColumns()` (typed-array pulls).
- `src/lib/catalog/scope.ts` — `ratedOnly` → `universe` (see warning above).

## Rendering — the key finding (already resolved, keep it)

The old scatter lag was **NOT** string marshaling — it's that LayerChart's `<Points>`
renders **one `<Circle>` component per point** (`node_modules/layerchart/.../Points/Points.base.svelte`),
~0.1ms/point → ~1.9s at 30k. Fix = draw the cloud with a raw canvas loop (`CloudCanvas`),
keep LayerChart for scales/axes and its **quadtree tooltip (which hit-tests off the `data`
array, independent of drawing)**. Measured (dev, ~30k):

| | latency |
|---|---|
| old `<Points>`, 2 plots | ~1,900 ms |
| custom canvas, 2 plots | ~505 ms |
| custom canvas, 1 plot | ~346 ms |
| 1 plot, minimal Chart data | ~283 ms |

Residual is per-chart LayerChart `<Chart>` overhead. Under the 300ms budget needs: one
plot (the design has one) and/or feeding `<Chart>` minimal data + our own hover quadtree.
LayerChart has a native **brush** (`ChartState.brush`) and **Density/Contour** (fast,
non-point) — useful for Step 2 (brush) and the large "All rated" universe.

Latency harness: `<scratchpad>/measure_latency.py` (Playwright, warehouse venv:
`C:/Users/philh/projects/bgg-data-warehouse/.venv/Scripts/python.exe`, `PYTHONUTF8=1`).

## What's DONE vs NOT (against the mockup)

Done: lazy-names data path; validated custom-canvas renderer; a stacked plot / summary /
bounded-table layout; Universe wired in `scope.ts`/`toWhere` (Top 10k = `game_id IN
(… ORDER BY geek_rating DESC LIMIT 10000)`).

**Not done / drifted from mockup (the real remaining work):**
1. **Rail doesn't match the mockup** — still number inputs + a "Rated only" checkbox; needs
   the **Universe dial** + the mockup's scope groups. (And it's currently broken vs `scope.ts`.)
2. **No canvas header** — missing the live count + scope-summary line.
3. **No brush / linking** between plot and table (the core interaction).
4. **Layout/flow** doesn't read like the mockup — spacing, panel treatment, hierarchy.
5. **Landing page** — not started (only the mockup exists).

## Process notes / cautions

- Delivery: branch → PR → hand off; **user merges PRs** (never `gh pr merge`). Build/deploy
  is Actions-only. `just check` + `just dev` (localhost:5173, dev-auth bypass on).
- **The user writes all user-facing copy** — use minimal placeholder text, don't craft lines.
- A dev server may still be running in the background from this session (kill if stale).
- **Recommendation for next session: build directly against `explore-workspace-mockup.html`
  section by section (rail, header, plot, table, summary), not incrementally from the old
  Overview.** That drift is what went wrong here.
