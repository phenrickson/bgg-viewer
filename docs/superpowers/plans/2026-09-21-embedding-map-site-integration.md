# Embedding map — site integration implementation plan

Spec: `docs/superpowers/specs/2026-09-16-embedding-map-explore-design.md` (v1, explore)
Supersedes that spec's "Layout" paragraph — see *Departures from the v1 spec* below.

## Goal

Rebuild `/dev/map`'s chrome so the page reads as part of bgg-viewer rather than as a bench:
the same rail + canvas workspace `/games` uses, the same control-priority doctrine
`Rail.svelte` established, and the layout system's header/count conventions instead of
hand-rolled ones. The map itself — `PointCanvas`, `MapLayer`, the artifact, the projections —
does not change.

**Success:** `/dev/map` at desktop width shows a left rail and a canvas that fills the rest;
at narrow width the rail moves into a bottom `Sheet` with a live-count footer, matching
`/games`; a first-time visitor meets ~4 controls instead of ~15; `pnpm check` and
`pnpm test` pass; the page still round-trips through the URL and nothing about selection,
hover, export or the timeline regresses.

**Not in scope:** promoting the route out of `/dev`, the renderer decision (Sigma vs
`NetworkLayer`), and the production network path. Those are the open items on PR #71 and are
independent of this work.

## Why now

The page was built as an instrument for one user, and it shows: fifteen controls in one
undifferentiated flex-wrap strip, a bespoke `.page`/`.controls`/`.body` layout with literal
spacing values, its own `<h1>`, and a footer line that is half internals. None of that is
wrong for a bench. All of it is wrong for a feature, and none of it is load-bearing — the
map component underneath is already the clean part.

## Departures from the v1 spec

The v1 spec chose **"No sidebar — the map *is* the page"** and a control strip above the
canvas. That was right for the bench and is wrong for the feature, for two reasons the spec
could not have known at the time:

1. The strip did not survive contact with the real control count. Fifteen controls wrap
   unpredictably (in the current build "Export" wraps to its own line), and a single row
   affords no grouping, so every control reads at equal weight.
2. `/games` has since established a rail + canvas workspace with a documented narrow-mode
   strategy. A second full-page data view that does not use it is the inconsistency.

The spec's detail-panel call — "right on desktop, bottom sheet on phone" — is kept, and is
already built (commit `0cbde4c`).

## Affected surfaces

- `src/routes/(app)/dev/map/+page.svelte` — layout, header, controls, footer
- `src/routes/(app)/dev/map/+page.server.ts` — breadcrumbs/subtitle for the layout header
- **new** `src/lib/map/MapRail.svelte` — the map's rail, built to the `Rail.svelte` doctrine
- `src/lib/map/MapLayer.svelte` — comment fix only (see step 5)

No changes to `PointCanvas.svelte`, `surface.ts`, `view.ts`, the artifact, or any `map/*.ts`
module. No new dependencies.

## Reuse

- **`.workspace` / `.sidebar` / `.canvas` grid** from `routes/(app)/games/+page.svelte:387-393`
  — `grid-template-columns: 16rem minmax(0, 1fr)`, plus its `@media` fallbacks at :531-551.
- **The narrow-mode `Sheet`** at `games/+page.svelte:252-274` — `side="bottom"`,
  `h-[92dvh]`, header/scroll-region/footer, and the live-count dismiss button. Its comments
  explain why bottom rather than right and why 92dvh rather than 100; both apply unchanged.
- **The `Rail.svelte` priority doctrine** (`lib/catalog/Rail.svelte:3-20`): always-open /
  collapsed-and-counted / moved-elsewhere, ranked by how often you reach for a control, not
  by what category it belongs to. `<details>` does the collapsing natively.
- **`.chead` count line** from `games/+page.svelte:289-300` — house style for "N games".
- **Layout header via server load** — `breadcrumbs` + `subtitle`, per the frontend-patterns
  skill; replaces the page's own `<h1>` and eyebrow.

## Control triage

Applying the Rail doctrine to `ViewState`. This is the substantive design decision in the
plan; everything else is mechanical.

**Always open in the rail** — what you reach for first, and what changes what you are
looking at:

- **Colour** (weight / geek / rating / year / upcoming / category)
- **Size** (popularity / uniform)

**Collapsed, counted** — `<details>` with a badge showing the current value, so a shut row
still says what it is set to:

- **Projection** — badge `PCA · PC1×PC2`. Holds projection *and* the X/Y axis selects, which
  are meaningless without it. This is where PC3–PC6 stop shouting at a general visitor while
  staying one click from Phil. The v1 spec calls the axis pair "the exploration instrument";
  collapsing it keeps that intact.
- **Filters** — badge = count of non-default filters. Min ratings, Upcoming, and the kept-
  categories chip (currently an ad-hoc button in the strip).

**Not in the rail** — these act on the current *view*, not on which games are in it, and
belong in a small toolbar above the canvas:

- **Pan / Lasso** — a mode toggle. Icon buttons, not a text segmented control.
- **Export** — opens the existing export panel.
- **Timeline** — a scrubber; it needs width and would be cramped at 16rem. Kept as a
  feature, not a demo (Phil's call, 2026-09-21).

### The lasso is a filter

Phil's call, 2026-09-21: the lasso stays, and it reads as a *filter* rather than as a power
gesture. That is a change in framing, not in mechanics — `keep` already filters — but it
changes where the state is shown and how it is confirmed.

- **The kept set lives in the rail's Filters `<details>`**, badged like any other filter
  ("42 games lassoed ×"), beside Min ratings and Upcoming, with the same dismissal
  affordance as the existing category chip. Today it is a toggle chip in the control strip,
  which is easy to set and easy to forget.
- **Confirm, do not filter on release.** Lassoing selects; a prominent button applies it.
  Immediate filtering is fewer steps but a mis-drawn lasso is cheap to make and expensive to
  undo on an exploratory map. The button replaces the current low-key "Show only these" chip
  and follows the `/games` sheet's live-count pattern — `Show 42 games` — which is the same
  reward loop: a number that moves, on the control that acts.
- **The `keep`-reframe stops being an oddity.** Framing the kept set is simply what the map
  does when its filter changes. See step 5, which becomes a rationale fix rather than the
  removal of a vestige.

## Steps

### 1. Header via the layout

`+page.server.ts` returns `breadcrumbs` and `subtitle`; delete the page's `<header class="top">`
(`+page.svelte:225-231`), its `<h1>`, and the "Dev only" eyebrow. The dev-only status is
better carried by a badge in the breadcrumb area than by body copy.

The page's own search input (`+page.svelte:232-243`) moves into the canvas toolbar rather
than the header — it locates a game on the map, which is a view action, and it sits directly
beside the nav's global "Jump to a game…" today, where two search boxes read as a mistake.
Give it the same visual treatment as the nav input (border, icon); it currently renders as
unframed placeholder text.

**Verify:** breadcrumbs render, no duplicate title, search still selects and centres a game.

### 2. Workspace layout

Replace `.page` / `.body` / `.map` with the `/games` grid: `.workspace` > `.sidebar` +
`.canvas`. Copy the `narrow` media-query state (`games/+page.svelte:101-120`), including the
effect that closes the sheet when leaving narrow — "leaving narrow with the sheet open would
strand a modal over a desktop layout."

The canvas region keeps its current internals unchanged: `PointCanvas` fills it, and the
selection panel still overlays it (commit `0cbde4c`).

**Verify:** desktop shows rail + canvas; resizing to narrow moves the rail into the sheet and
back without stranding it; the canvas never changes size on selection (the regression fixed
in `0cbde4c`).

### 3. `MapRail.svelte`

New component in `src/lib/map/`, taking `bind:view` (`ViewState`). Structure per the triage
above: two always-open controls, two counted `<details>`.

It does **not** share `Rail.svelte` or `Scope`. `Scope` compiles to a SQL WHERE clause for
DuckDB (`catalog/scope.ts:1-5`); `ViewState` is mostly rendering instructions —
`projection`, `x`, `y`, `colour`, `size` have no SQL meaning. Only `minRatings` and
`upcoming` are scope-shaped, and `Scope` already has richer equivalents. The map also reads
points from the coordinates artifact, not from the catalog query `toWhere()` targets. What is
shared is the doctrine and the layout, not the state model.

Match `Rail.svelte`'s markup conventions so the two rails are visually indistinguishable —
same section headings, same `<details>` + badge treatment, same spacing tokens.

**Verify:** every control still drives `view` and round-trips through the URL; a shut
`<details>` shows its current value; keyboard and screen-reader behaviour is whatever
`<details>` gives natively.

### 4. Canvas toolbar and count line

A `.chead`-style row above the canvas: the count on the left in house style, the view actions
(search, Pan/Lasso, timeline, Export) on the right.

Replace the debug footer —

> 30,251 games plotted · 5,750 hidden by filters · 245 without coordinates · model
> embeddings-v2026 v6 · 6 components · anchors: 0

— with `30,251 games · 5,750 hidden by filters`. The rest (`without coordinates`,
`components`, `anchors`, model version) moves to an info tooltip. The v1 spec asked for the
model line and flagged the copy as placeholder; provenance is worth keeping, just not as body
text. Note `Card.Controls` already has an `info` slot for exactly this if the toolbar becomes
a card.

**Verify:** counts still update with filters; the model version is still discoverable.

### 5. Fix the `keep`-reframe comment

`MapLayer.svelte:152-157` justifies the auto-reframe by a resize that no longer happens (the
selection panel overlays now) and attributes it to the wrong trigger — it says a lasso fires
it, but `frameIdx` is `keep ?? focus` and `keep` is only non-null once "Show only these" is
on. A plain lasso just highlights.

Rewrite the comment to state the real trigger and rationale: keeping a set is an explicit
filter, so framing it is the right response — which is exactly the framing decision above,
so the comment and the feature now agree. Behaviour unchanged — `frameIdx` is not touched.

If step 3 moves the kept set into the rail's Filters group, this comment should point at it,
so the next reader finds the filter rather than guessing at the camera.

**Verify:** comment matches observed behaviour; lasso alone does not reframe, "Show only
these" does.

### 6. Verify

`just verify` (check + test + build). Visual pass in **both light and dark** — the
frontend-patterns skill's rule, and the map's palette work is dark-first, so light is the
likelier regression. Check at desktop and narrow widths.

## Risks

- **The rail costs canvas width.** 16rem off a ~1400px page is ~11%. The plot currently
  occupies ~40% of its frame with large dead margins, so this should be a net gain in
  apparent density — but it is worth looking at, and it is the reason the framing item below
  is called out separately rather than folded in.
- **`<details>` hides state.** Mitigated by badges on shut rows; this is the same bet
  `Rail.svelte` already made and it held up there.
- **Two rails to keep in sync.** Deliberate — see step 3. The cost is visual drift if one
  changes; the alternative is a shared component with a state model that does not fit.

## Follow-ups (not this plan)

- **Initial framing.** `PointCanvas.svelte:235` frames the NDC square `[-1,1]²` regardless of
  where points actually sit, which is why the plot is a small smear in a large frame. A
  data-extent fit would fix the vertical dead space the rail does not address. Independent of
  this work.
- **The `+3` ring pad** is constant, so the ring/dot ratio runs from ~4× at the low end to
  ~1.33× at the high end. A proportional pad with a floor would even it out.
- **Selection panel presentation.** One selected game probably wants a card (thumbnail,
  link); a lasso wants the table. Same panel, two presentations.
- **Map from a `Scope`.** "Show me the map of *these* games" would connect Explore and the
  map. A feature, not a refactor — additive to everything above.
