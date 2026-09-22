# Handoff — the map joins the site's filter language

**Branch:** `feat/embedding-map` (PR #71, open)
**Date:** 2026-09-22
**State:** pushed (`df0f2a5..cf1ced2`). Working tree clean.
`pnpm exec svelte-check` 0 errors / 9 pre-existing warnings (all `AnalysisPanel`).
`pnpm exec vitest run` 414 passing (was 343 at the start of this work).

Previous handoff: `docs/session-handoff-2026-09-21-map-site-integration.md`
Original spec: `docs/superpowers/specs/2026-09-16-embedding-map-explore-design.md`

---

## What this session was for

The previous session's "left undone" list was six items of chrome — an unused prop, a
native `<select>`, ring padding. All real. But it read "integrated with the site" as
"looks like `/games`", and the map was still an island for a structural reason no amount
of rail polish would fix:

**There were two filter languages for the same 36k games.** `Scope` (≈25 fields, compiles
to SQL, drives Explore) and `ViewState` (`minRatings`, `upcoming`, `categories`, a
selection). You could not carry a set from `/games` to the map because there was nothing
to carry it into.

That is what this session fixed, and the visual polish followed from it rather than the
other way round.

## The shape now

**One filter language.** `Scope` is it. `ViewState` is *exactly* the five encodings
(projection, x, y, colour, size) — a test asserts nothing else can creep back in. The
map's three old filters all mapped onto fields `Scope` already had:

| was | is |
|---|---|
| `view.minRatings` | `scope.usersRatedMin` |
| `view.upcoming` | `scope.universe` |
| `view.categories` (palette codes) | `scope.categories` (real BGG tags) |
| `view.selected` | `scope.lasso` (the one genuinely new predicate) |

**The map draws the whole landscape and lights the scope.** Filtering does not remove
points, it fades them. The one thing this page can say that a list cannot is *where a set
sits in the whole of board games*; hiding the rest leaves a scatter of dots in a void,
which is strictly less than the list already told you.

**Position is an input.** `MapLayer` takes a `Projection` (values, axis labels,
isometric?, band?) instead of reaching into `coords.pcs`. `factProjection` (weight ×
rating) exists to prove the seam is general; nothing wires it to UI yet.

**Primary category is a catalog concept.** `$lib/catalog/primary-category.ts` — a
priority-ordered first match over the catalog's own `categories` column. Filtering is
any-of, colouring is exactly-one, both over the same column. A list row or card can now
show the same colour as a point.

## Commits

| | |
|---|---|
| `077cc6a` | position as an input; primary category to `catalog/`; `year` clamp |
| `2d4eb44` | one filter language — `Scope` drives the map, the map lights it |
| `1c76ec8` | Explore's "Map →" link; the dimming bug that erased light games |
| `1ec6041` | map/list disagreement (universe); lasso-to-zoom restored |
| `f211520` | per-bucket alpha |
| `72e54a3` | draw order — lit set on top; context un-over-faded |
| `41aa852` | light what the scope holds, not what the artifact carries |
| `cf1ced2` | fix a test asserting the over-corrected alpha ratio |

---

## Read this before touching the scope→map path

**Three bugs this session were the same mistake**: a cheap local test standing in for the
query. Each one surfaced as "the map disagrees with the list" and *looked like a rendering
problem*, which is what made them expensive.

1. `activeFilters(scope).length > 0` as "is anything filtered". It is a **chips** function
   and deliberately omits the universe (a dial has no "off"), so `u=upcoming` looked like
   no filter and the map lit all 36,001 while the list showed a few thousand.
2. `allLit()` as "no filters, so light everything". The **artifact's population is not the
   default scope's** — coordinates are built over `users_rated >= 30 OR year_published >=
   <this year>`, the default scope is `users_rated >= 30` alone, so ~5,253 thinly-rated
   upcoming games were lit that the default excludes.
3. The count line printing the artifact's row count in its unfiltered branch, same cause.

**The rule the code now follows: the compiled `WHERE` is the only authority on which games
are in scope.** Not a chip count, not a row count, not a flag. `allLit()` was deleted
rather than left unused, with a note in its place, because it is exactly the thing someone
reaches for again. If a fourth shortcut appears, assume it is this error.

## Read this before touching the map's colours

**Contrast maths missed two real bugs that a screenshot caught in seconds.** Both numeric
checks were worth having — one of them found a bug before it shipped — but they cannot
replace looking at the thing.

What per-dot contrast cannot see:

- **Compositing.** Every dot draws semi-transparent, so in the dense middle *thousands* of
  overlapping context dots accumulate into an opaque field. A per-dot ΔE says nothing
  about what 30,000 of them stack into.
- **Z-order.** regl draws in array order, so points handed over last are on top. The lit
  set was sitting behind its own backdrop. No alpha fixes this.

Both are handled now (per-bucket alpha, and a draw-order permutation), but the lesson is
the reason the checks passed while the page looked wrong.

**The one check that did earn its keep**: `--map-ramp-lo` (the pale end of the weight
ramp, the *default* colouring) dimmed to ΔE 0.013 from the page in light mode — every
light game would have silently vanished from the context, in the theme the previous
handoff warned was least tested. Worth re-running that kind of measurement if the palette
changes: the endpoint *was* the pale neutral that scenery wants to be, which is why the
lit ramp now starts below the context band.

## Things that will bite you

**`--map-context` is per theme and measured, not picked.** Light 0.86, dark 0.28, with the
ramp endpoints moved to clear them (light `--map-ramp-lo` 0.90 → 0.78, dark 0.38 → 0.44).
Dark mode borrowing light's endpoint collapses its ramp against `--map-ramp-hi`. If you
change one, re-measure the other.

**Alpha is 0.9 lit / 0.28 context, and the ratio is deliberately not extreme.** An earlier
cut used 0.1 and the landscape became invisible — which loses the point of drawing it.
Keeping the lit set in front is the *draw order*, not a bigger ratio.

**The draw-order permutation lives entirely in `PointCanvas`.** `order[k]` is the layer
index drawn k-th, `slot[i]` the reverse. Everything crossing that boundary goes through
one of them: positions, encodings, the filter, `screen(i)`, hover and selection events.
Layers keep their own stable indices and never learn it happened. **If you add anything
that passes an index to or from regl, map it** — an inverse-mapping bug here scrambles
hover and selection, which is worse than the overlap it fixes. It is identity when nothing
is dimmed.

**`shownX`/`shownY` are in LAYER order**, deliberately — they are compared against the
driver's own arrays. Only the regl call is permuted.

**Per-bucket opacity rides the colour channel.** regl's `opacity` accepts an array indexed
by the colour bucket when `opacityBy: 'valueZ'`, and lit/dimmed is already in that bucket,
so no second value channel was spent (`size` holds the other). Integer buckets make regl
infer CATEGORICAL, which indexes the array directly; a scalar opacity must leave
`opacityBy` unset or every point collapses onto one alpha step.

**`focus`, not `keep`, for framing.** `keep` *removes* the other points, which is what
dimming replaced. Framing is a camera move over a landscape that stays drawn. Capped at
600 — framing thousands of points costs a full positional redraw and buys nothing.

**Do not start or stop the dev server without asking.** Still true. Phil runs it.

---

## Left undone, in rough priority order

1. **Explore does not yet show the plot.** The agreed shape was: the map stays its own
   full-bleed surface (reached via "Map →"), and Explore keeps List/Visualize. If a compact
   plot should also live in Explore's list slot, that is unbuilt.
2. **Promote out of `/dev`.** The route is still `/dev/map`; `MAP_PATH` in
   `$lib/map/route.ts` is the single place to change it.
3. **`factProjection` is unwired.** The seam is proven but there is no axis picker. Adding
   catalog-column axes (weight × rating, year × geek) is a producer function and a control,
   not a renderer change.
4. **The handoff's original chrome list**, minus what dissolved: the colour `<select>` is
   now two rows of three segments, and `yearActive`/min-ratings went away with the rail's
   filters. Still open from it: initial framing uses the NDC square rather than the data
   extent, and the `+3` selection-ring pad is constant so the ring/dot ratio runs ~4× at 30
   ratings to ~1.33× at the top.
5. **The `bgg-viewer` skill** — agreed two sessions ago, still not started.
6. **Light mode has never been looked at** for any of this session's work. Everything was
   verified in dark (the screenshots were dark) plus numerically in both. The palette work
   is dark-first, so light remains the likelier regression.

Still open on PR #71 itself, independent of this: the Sigma vs `NetworkLayer` renderer
decision, and the production path for the network.

## Verify

```sh
pnpm exec svelte-check --tsconfig ./tsconfig.json   # 0 errors; 9 pre-existing AnalysisPanel warnings
pnpm exec vitest run                                # 414 passing
```

Ask before running the dev server. Check light **and** dark.
