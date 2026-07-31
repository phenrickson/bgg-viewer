# BGG Viewer — Discover — Design

**Date:** 2026-07-31
**Status:** Draft for review
**Branch:** `feat/discover`
**Builds on:** [2026-07-29-explore-workspace-design.md](2026-07-29-explore-workspace-design.md)
(that spec defines Explore — the full rail, the plot, the three-level Universe/Scope/Brush
model; this spec adds the *step before it*)

> Copy note: all user-facing strings are **placeholder** — Phil writes the final copy.

## Why

Today the app goes Home → Explore. The landing page is inviting: a headline, a search box,
and five "Try a query" chips. Explore is a workspace: a filter rail with year, complexity,
geek-rating, players, best-at, and six facet lists, over a plot and a table.

The gap is the step between them. A user who clicks a landing chip lands in the full rail
with every control visible at once — the tool, before they have asked a question big enough
to need it. **Discover is the missing middle**: a small number of simple, digestible
questions that return a readable list of games, with Explore one click away when the user
wants precision.

Framing: Explore answers *"query the catalog as a set."* Discover answers *"just show me
some good games like X."*

## Goal

A new top-level tab between Home and Explore, at `/discover`, that:

1. asks **three simple questions** as rows of chips — Categories, Players, Complexity;
2. renders the answer as a **readable game list**, not a data table;
3. hands off to Explore, carrying the exact same scope, whenever the user wants more.

### Success criteria

- A user can go from the landing page to a useful list of games **without seeing a rail**.
- Landing-page query chips deep-link into Discover, not Explore.
- Selecting a chip updates the list **instantly** (client-side DuckDB, no server call).
- The scope is in the URL — shareable and reload-safe, exactly as Explore's is.
- "See all N in Explore" opens Explore **already scoped** to the same set.

## Architecture — Discover is a second view over the existing `Scope`

Discover introduces **no new query layer**. Every dial is a patch on the existing
`Scope` object ([scope.ts](../../../src/lib/catalog/scope.ts)), compiled by the existing
`toWhere()`, serialized by the existing `scopeToParams()`, and run against the existing
in-browser DuckDB catalog.

| Dial | Scope field(s) | Selection |
|---|---|---|
| Categories | `categories: string[]` (or `mechanics` / `families`, see below) | multi-select |
| Players | `bestAt: number \| null` | single-select |
| Complexity | `weightMin` + `weightMax` | single-select |

This is the whole extensibility argument of the catalog spec paying off: Discover is a new
*view module* over the same client catalog, and the hand-off to Explore is nearly free
because both pages speak the same scope.

**Consequence:** `/discover` and `/games` share URL parameter names. A scope means the same
thing on both routes; only the presentation differs.

### Chip → scope patch mapping

The six category chips are **hand-authored label → `Partial<Scope>` patches**, not raw
category values. This is deliberate: the labels a board-gamer recognizes do not all live in
one artifact column — "Party Game" is a `categories` value, "Cooperative" is a `mechanics`
value. The map absorbs that difference so the labels can stay short.

**Verified against the cached artifact (35,265 rows) — not assumed.** An earlier draft
proposed Strategy / Family / Thematic on the theory that BGG's subdomains live in `families`.
They do not: `families` holds Kickstarter tags, admin flags, digital implementations, and
component notes ("Crowdfunding: Kickstarter", "Admin: Upcoming Releases", "Components:
Miniatures"). Those three labels have **no backing values** and are dropped.

The map lives in one exported const so the six labels can be changed in one edit:

```ts
// discover-dials.ts — the ONLY place Discover's vocabulary is defined
export const CATEGORY_CHIPS: { label: string; patch: Partial<Scope> }[] = [ … ];
export const PLAYER_CHIPS:   { label: string; bestAt: number }[]        = [ … ];
export const COMPLEXITY_BANDS: { label: string; min: number|null; max: number|null }[] = [ … ];
```

Starting values (all placeholder, all one edit to change):

- **Categories** — six chips, every value verified present in the artifact with its game
  count. `Card Game` was considered and rejected: at 11,517 games spanning every kind of
  play, it barely narrows anything. The six sit in a balanced 2.3k–5.3k band, so no chip
  dominates the others.

  | Label | Scope field | Value | Games |
  |---|---|---|---|
  | Wargame | `categories` | `Wargame` | 5,344 |
  | Fantasy | `categories` | `Fantasy` | 4,768 |
  | Party Game | `categories` | `Party Game` | 3,590 |
  | Cooperative | `mechanics` | `Cooperative Game` | 3,425 |
  | Abstract | `categories` | `Abstract Strategy` | 2,518 |
  | Economic | `categories` | `Economic` | 2,274 |

- **Players** — 1, 2, 3, 4, 5, 6+. Each sets `bestAt`, i.e. *"the community says this game is
  best at N,"* which is the flagship filter BGG itself cannot do.
- **Complexity** — Light (`< 2.0`), Medium-Light (`2.0–2.5`), Medium (`2.5–3.0`),
  Medium-Heavy (`3.0–3.5`), Heavy (`≥ 3.5`). Bands are contiguous and single-select, so
  "Light" and "Heavy" cannot both be on.

**Multi-select semantics.** Categories are multi-select and combine with **AND**, matching
`toWhere()`'s existing behavior for `scope.categories`. Two categories therefore narrow;
they do not union. This is a known sharp edge — see Open questions.

**A note on `bestAt`.** The header comment in `scope.ts` claims best-at data "isn't in the
catalog artifact" and that we filter on min/max support instead. That comment is **stale**:
`best_player_counts` is in `INT_LIST_COLUMNS` and `toWhere()` already emits
`list_contains(best_player_counts, N)`. The filter works. Correcting the comment is a
cleanup item in the plan.

## The page

Layout, top to bottom, following the wireframe:

```
Categories   [Strategy] [Family] [Party] [Thematic] [Abstract] [Cooperative]
Players      [1] [2] [3] [4] [5] [6+]
Complexity   [Light] [Medium-Light] [Medium] [Medium-Heavy] [Heavy]

  ── 214 games · top rated first ────────────── See all 214 in Explore → ──
  ┌──────────────────────────────────────────────────────────────────┐
  │  [img]  Game Name  2020            1 [2] 3 [4] 5 6   Medium-Heavy │
  │         Categories · here          60–200 min             8.03 ▔▔ │
  │  …                                                                │
  └──────────────────────────────────────────────────────────────────┘
```

### The dial strip

Three labeled rows. Each row is a small uppercase label (reusing the landing page's `.try`
style) above a wrapped row of chips (reusing `.chip`). The visual language is **lifted
directly from the landing page** — same pill shape, same `color-mix(in oklch, var(--primary)
…)` ramp, same border treatment — so Discover reads as a continuation of the front door
rather than a new place.

One addition the landing page does not need: a **selected** state. Landing chips navigate;
Discover chips toggle. Selected chips are filled (higher `--primary` mix, `--primary`
border); unselected chips keep the current quiet tint. Selection is also conveyed by
`aria-pressed`, so it is never color-only.

Chips are `<button>`s, not links — they mutate state and push a URL rather than navigate.

### The results header

One line above the list: the **live count**, the sort ("top rated first"), and a right-aligned
**"See all N in Explore →"** link. That link is `\`/games?${scopeToParams(scope)}\`` — the
same scope, the other room.

### The result row

Two lines, on one grid, with three zones — thumbnail / identity / signals:

- **Thumbnail** — ~56px, rounded, left.
- **Line 1:** name (prominent) + year (muted, inline). Right-aligned: geek rating as a number
  over the thin fixed-domain bar (5.5–8.8), reused verbatim from `GameList` so ratings stay
  comparable down the column and across pages.
- **Line 2:** the player-count pips (1–6, best emphasized / recommended mid / rest dim —
  reused verbatim from `GameList`, self-labelling and needing no legend), a **worded
  complexity badge**, and up to three category names, truncating.
- A **playtime** column sits between the identity and rating zones.

Departures from Explore's row, all deliberate:

1. **Complexity is a word, not a number.** "Medium-Heavy" over "3.4". Discover's user has not
   asked to think in a 1–5 weight scale.
2. **The badge is tinted, not filled.** A five-step tint ramp (pale → saturated across
   Light → Heavy) keeps complexity legible as an *ordered* scale without letting it outshout
   the game's name. Per `style-rules`, the word carries the meaning and the tint only
   reinforces it — never color alone.
3. **Mechanics are omitted; categories capped at three.** The mechanic wall is what makes a
   dense card unscannable.
4. **No rank numeral.** The rating bar already conveys the ordering.

### Height and scroll behavior

Discover is a **fill-height page** (Pattern A in `frontend-patterns`): page root
`flex min-h-0 flex-1 flex-col`, the dial strip at natural height, the list in a `flex-1
min-h-0` region scrolling internally with the results header pinned.

The list wrapper uses **`flex: 0 1 auto`**, exactly as `GameList` does and for the same
documented reason: a five-result set must size to its five rows, not stretch into a screen of
empty bordered card that reads as "something failed to load." No `svh`/`vh`, no fixed pixel
heights.

### Default and empty states

- **No chips selected** — show **top-rated games, all-time**: `universe: 'rated'`, ordered by
  `geek_rating DESC`. Discover is never blank; arriving at the tab directly gives you
  something to look at. This mirrors the landing page's "Top rated, all-time" chip.
- **A selection with no matches** — the count reads 0 and the list shows a short message
  naming the chips to deselect. Because the dials are coarse and combine with AND, this is
  reachable (e.g. Abstract + Cooperative + best-at-6), so it must read as a normal answer,
  not an error.
- **Catalog still warming** — the dial strip renders and is clickable immediately; the list
  shows the loading state until `catalog.status === 'ready'`. The landing page already warms
  the catalog on mount, so arriving from Home usually finds it hot.

## Data — the thumbnail and playtime question

The row above needs `thumbnail`, `min_playtime`, and `max_playtime`. **None are in the
catalog artifact today** — `columns.ts` deliberately excludes "the heavy fields
(description/image)," and the offline spec confirms playtime is warehouse-only.

BGG image URLs are **not** reconstructible from `game_id`: they are
`cf.geekdo-images.com/<opaque-hash>__thumb/img/<opaque-hash>/fit-in/200x150/pic<imageid>.jpg`,
where both hashes are content-derived and `<imageid>` is an upload counter unrelated to the
game id. The URL must be carried.

**Decision: build Discover first with a stubbed thumbnail, then measure and decide.**
The row design is what is in question; the artifact change is a permanent cost on every
page's download and should not be committed to before the layout has earned it.

- **Step 1** — ship the list with a placeholder tile in the thumbnail slot and no playtime
  column. The layout is complete and judgeable.
- **Step 2** — add `thumbnail`, `min_playtime`, `max_playtime` to `SCALAR_COLUMNS`, rebuild,
  and **measure the artifact delta**. ~38k URLs of ~60 chars is ~2 MB raw but shares a long
  prefix and should compress hard; playtime is two ints and near-free. Baseline is 1.79 MB.
- **Fallback if the delta is unacceptable** — a second, lazily-loaded `game_id → thumbnail`
  artifact fetched when Discover mounts. The precedent is already documented in `columns.ts`
  for the Predictions view ("its own artifact loaded on demand so a session that never opens
  it never pays for it"). Not chosen up front, because Discover is intended to be the default
  on-ramp and most sessions will pay the cost anyway; a second artifact adds a load and
  version path for a saving few sessions realize.

## Navigation

`.mainnav` in [+layout.svelte](../../../src/routes/+layout.svelte) gains a third link between
Home and Explore. Its active-tab logic must become three-way: today `Home` is active whenever
the path is *not* `/games`, so `/discover` would light up Home.

## Landing page changes

The five "Try a query" chips currently deep-link to `/games`. They change to deep-link to
`/discover`, carrying the same scope params. Two of the five (`Best at 2 players`, `Best at 6
players`) map cleanly onto a Discover dial and will render with that chip pre-selected. The
other three carry scope Discover has no dial for — see below.

## Scope Discover cannot express

A URL can carry any `Scope`; Discover's strip exposes only three of its fields. A scope
arriving with `yearMin`, `q`, a designer, or a rating floor is **honored in the query** — it
filters the list — but has no chip to represent it.

Discover shows these as **read-only context chips** in the results header, styled as the
existing `FilterChips` are, each with a "clear" affordance. It never silently drops a filter,
and it never grows a control for one. If the user wants to *edit* those, the "See all N in
Explore" link is the answer, and that is the intended pressure.

## Component plan

New, under `src/lib/discover/`:

- `discover-dials.ts` — the three chip vocabularies and their scope patches. Pure data plus
  the predicates that decide whether a chip is currently selected. Unit-tested.
- `DialStrip.svelte` — the three labeled chip rows. Props: current `Scope`; emits a patch.
- `DiscoverList.svelte` — the query, the results header, and the rows.
- `GameRow.svelte` — one row. Split out because it owns the grid, the badge ramp, and the
  pip encoding, and both `DiscoverList` and any future card view want it.

Route: `src/routes/(app)/discover/+page.svelte` + `+page.ts` with `export const ssr = false`
(same as Explore — DuckDB-WASM is browser-only).

Reused unchanged: `catalog.svelte.ts` (`query`), all of `scope.ts`, the `.chip` visual
language, and `GameList`'s rating-bar and pip encodings.

**Extraction, not duplication.** The rating bar and the best/recommended pips exist today
inside `GameList.svelte`. Rather than copy their markup and CSS into `GameRow`, both
encodings move into small shared components under `src/lib/catalog/encodings/`
(`RatingBar.svelte`, `PlayerPips.svelte`) that `GameList` and `GameRow` both use. Copying
them would guarantee they drift, and the pip component in particular carries a non-obvious
`position: relative` fix that must not be lost — `GameList.svelte` documents at length how
its absence adds thousands of pixels of phantom page scroll.

## Error handling

- **Catalog load failure** — the dial strip still renders; the list region shows the failure
  and a retry, matching Explore's handling. Chips remain clickable and keep updating the URL.
- **Query failure** — logged, list region shows an error state; the previous result set is
  cleared rather than left stale under a new selection.
- **Unparseable URL params** — `scopeFromParams` already coerces to defaults; a garbage
  `?best=banana` yields `null`, not a crash.
- **Unknown chip values** — a URL carrying a category the map does not know still filters
  correctly (it is just a scope value) and appears as a read-only context chip.

## Testing

- **Unit (vitest)** — `discover-dials.ts`: each chip's patch produces the expected `Scope`;
  the selected-state predicates round-trip; complexity bands are contiguous and
  non-overlapping; a Discover scope survives `scopeToParams` → `scopeFromParams`.
- **Unit** — the complexity-band → label function, including boundary values and null weight.
- **Component** — `GameRow` renders with null year / null weight / no player-count votes /
  missing thumbnail without layout breakage.
- **Manual** — light **and** dark; a 5-row result and a 1,000-row result (short list must not
  stretch); the Explore hand-off carries the scope; a landing chip lands correctly pre-selected.
- `just verify` (types + tests + build) before the PR.

## Out of scope

- **Changing Explore.** Discover is additive; the rail, plot, and table are untouched apart
  from the shared-encoding extraction.
- **Sort controls.** Discover is always "top rated first." Sorting is what Explore is for.
- **Pagination.** The list scrolls internally over a bounded result; if the set is larger than
  the bound, the count and the Explore link say so.
- **Search on Discover.** The nav search box is already global.
- **Saved / shareable named queries.** Still deferred, as in the Explore spec.
- **New dials** beyond the three. Adding a fourth is the failure mode this page exists to
  avoid.

## Open questions

- ~~**The six category labels.**~~ **Resolved.** Every value is verified against the cached
  artifact with its game count (table above). Still one edit to change if they read wrong on
  screen.
- **Multi-select category semantics.** AND is what `toWhere()` does today and what this spec
  assumes. OR ("Strategy *or* Thematic") may match user expectation better on a page this
  casual. Testable once it is on screen; changing it would mean a Discover-specific predicate
  rather than reusing `toWhere` as-is.
- **How many games the list bounds to** before the Explore hand-off is the only way further.
- **Whether the landing page keeps its chips at all**, or becomes a thinner door now that
  Discover exists and does the same job with more room.
- **Whether "6+" should mean `bestAt >= 6`** rather than exactly 6. `toWhere` supports only
  equality on `bestAt` today.

## Next

An implementation plan (`writing-plans`), branch `feat/discover`, PR per step. Order: shared
encodings extracted → dials module + tests → route and dial strip → list and row with stubbed
art → nav and landing wiring → measure and decide the thumbnail/playtime artifact change.
