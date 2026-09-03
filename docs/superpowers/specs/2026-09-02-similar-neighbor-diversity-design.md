# BGG Viewer — Similar-games neighbour diversity (tuning bench) — Design

**Date:** 2026-09-02
**Status:** Implemented — **the family cap only.** The diversity/MMR knob (item 2 below)
was built, then removed 2026-09-03: it's a sequential greedy pick that can't be
approximated in the deployed `game_neighbors` SQL, and the bench is kept to knobs that
can ship. Sections on MMR are left for the record.
**Builds on:** the `/dev/similar` tuning bench (branch `feat/similar-games-explorer`,
plan `docs/superpowers/plans/` — the "similar-games tuning bench" plan). Dev-only; nothing
here ships to the game page.

> Copy note: all control labels below are **placeholder** — Phil writes the final copy.

## Goal

Give the bench two new ways to stop a similar-games list from being dominated by
near-redundant entries, so we can find the rule that turns "9 Unlock! boxes" into "the 2
best Unlock! boxes plus 8 other things worth playing":

1. **Per-family cap** — at most **N** entries from any one BGG family / series /
   reimplementation line, keeping the N most similar. *(primary — the one Phil wants now)*
2. **Diversity (MMR)** — down-rank a candidate that is very similar to neighbours already
   picked, not just similar to the source. *(secondary — build it, tune later)*

Success: for Risk, Unlock!, Catan, Ticket to Ride, Exit, and a couple of niche games, the
tuned column shows a legible "≤ N per line" list, and with `diversity` at 0 / cap off the
tuned list is **byte-identical to today's**.

## The problem

Today the family/reimplementation controls are two all-or-nothing checkboxes
(`excludeFamily`, `excludeRelated` — `experiments.ts:9-10`, applied in
`+page.svelte` `neighbors()` ~L372-377):

- **off** → Risk's list is Risk: GoT, Risk: StarCraft, Risk: 2210, Risk Legacy, … — the
  clones crowd out everything.
- **on** → a game with one good reimplementation loses it entirely, and Unlock!/Exit/Sherlock
  series lists get gutted even though 2 entries from the series would be genuinely useful.

There is no "a couple per line" in between. Separately, the embedding puts some genuinely
distinct-but-close games (5 flavours of the same mid-weight euro) right on top of each
other, which no family rule catches because BGG never tagged them as related.

## Data already in the browser

`build.ts` ships, per game:

- `family_ids: number[]` — restricted to `Game: …` and `Series: …` families (the
  "this is a version / entry of that line" groupings). Loaded as `ds.fam: Set<number>[]`.
- `related_ids: number[]` — symmetric reimplementation + expansion links. Loaded as
  `ds.rel: Set<number>[]`.
- `emb` — flat L2-normalised `Float32Array(n*64)`; cosine = dot product.

No new columns, no artifact change, no BigQuery change.

## Decision

### 1. Replace the two checkboxes with one `maxPerFamily` control

`Params.excludeFamily` + `Params.excludeRelated` → **`Params.maxPerFamily: number | null`**.

- `null` — keep everything (today's "both off"; the baseline column uses this)
- `0` — drop every family / series / reimplementation match (today's "both on")
- `N ≥ 1` — allow up to N per line, keeping the most similar

**What a "line" is — the bucket keys for one source game:**

- one bucket per `family_id` **F in `sFam`** (the source's own families): holds every
  candidate whose `fam[j]` contains F. This is what caps Unlock!, the Risk family, etc.
- one bucket **`rel`**: every candidate that is a reimplementation/expansion of the source
  (`sRel.has(ids[j]) || rel[j].has(sId)`) — covers the rare reskin that shares no
  `Game:`/`Series:` family with the source.

A candidate can be in several buckets (in the source's series *and* a direct
reimplementation). Rule: **keep it only if every bucket it belongs to is below the cap**;
on keep, increment all of them. (Prevents a second shared family being a loophole.)

**Application point:** during selection, walking candidates in final-score order (after the
sim↔rating blend), *not* as a pre-filter — so the list is always topped up to `topK` with
the next-best non-redundant game. `N = 0` collapses to exactly today's pre-filter behaviour
(first bucket hit → skip).

### 2. Add `Params.diversity: number` (MMR), default `0`

Greedy re-rank over the scored candidate pool. When choosing the next neighbour, maximise:

```text
adjusted = score(cand) − diversity · maxCos(cand, alreadySelected)
```

`score` is the existing `weight·sim + (1−weight)·ratingPct` blend. `maxCos` is the largest
cosine similarity between the candidate and any already-selected neighbour (same
`emb` dot product). `diversity = 0` → `adjusted = score` → selection order = score order →
**unchanged output**. Useful range ~`0`–`0.4`; slider `0`–`0.5` step `0.05`.

### 3. One combined selection loop in `neighbors()`

```text
1. hard filters      (minUsers, band, minSim, excludeTitle, minRatingPct)   — unchanged
2. score each survivor  (sim, then the sim↔rating blend)                     — unchanged
3. sort by score desc
4. pool = top P survivors            (P = max(topK*6, 150), capped at survivors.length)
5. greedy: until we have topK or the pool is exhausted —
     pick the pool entry with the highest `adjusted` score
       that also passes the maxPerFamily bucket check;
     add it, bump its buckets, refresh each remaining entry's maxCos against it
6. return the picked list (in pick order)
```

With `diversity = 0` **and** `maxPerFamily = null`, step 5 degenerates to "take the pool in
score order" → identical bytes to today. This is the safety property the tests pin.

**Cost:** P ≈ 150, K ≤ 50, each pick is O(P) for the argmax + O(P·64) to refresh maxCos ≈
1.4M mults worst case, per source game. Negligible; the panel run (85 sources × 2) stays
well under the "yield so 'running…' paints" threshold already in `runComparison`.

### 4. `tunedSimRank` (the ▲▼ shift badge)

Its reference call
(`neighbors(srcIdx, { ...tunedOpts, weight: 1, topK: MAX })`) inherits `maxPerFamily` and
`diversity` unchanged, so the badge keeps meaning "how far the **rating weight** moved this
row" rather than also absorbing the cap/MMR reordering. No code change beyond the struct
carrying the two new fields.

### 5. Migration for saved experiments (localStorage)

`Params` in `localStorage` from before this change has `excludeFamily` / `excludeRelated`
and no `maxPerFamily` / `diversity`. Normalise on read (in `loadExperiments`, and defensively
in `paramsToOpts`):

```ts
maxPerFamily = 'maxPerFamily' in p ? p.maxPerFamily
             : (p.excludeFamily || p.excludeRelated) ? 0 : null
diversity    = p.diversity ?? 0
```

Old `excludeFamily`/`excludeRelated` keys are dropped on the next save. This is per-machine
scratch data; the migration is a convenience, not a guarantee.

## Affected files

| File | Change |
| --- | --- |
| `src/routes/(app)/dev/similar/experiments.ts` | `Params`: drop `excludeFamily` + `excludeRelated`, add `maxPerFamily: number \| null` and `diversity: number`. Migration in `loadExperiments`. |
| `src/routes/(app)/dev/similar/+page.svelte` | `neighbors()` combined selection loop (bucket cap + MMR); `Opts`, `baseline()`, `currentParams`, `paramsToOpts`, `applyParams`, `runExperiment` updated; control panel — remove 2 checkboxes, add "Max per family" (checkbox + slider, mirrors the complexity-band control) and "Diversity" slider; `esum` summary string. |
| `src/routes/(app)/dev/similar/CompareRuns.svelte` | none expected — `PanelItem.clone` still = "family/reimpl of source", still drives the clone-rate aggregate. Confirm during build. |
| `src/routes/(app)/dev/similar/neighbors.test.ts` *(new)* | Unit-test the selection loop: cap semantics, `N=0` ≡ old exclude, `diversity=0` ≡ pure score order, bucket loophole closed. |

No change to `build.ts`, `serialize.ts`, the Arrow artifact, `columns.ts`, the warehouse
API, or any server code. Not a one-way door — the bench is `dev`-gated and nothing here
feeds the real game page. Rollback = revert the commits.

## Risks / unknowns

- **`neighbors()` is currently inline in `+page.svelte`** and not unit-tested. The selection
  loop is the one piece with real logic worth pinning, and there's no component-test
  harness — so this spec extracts the ranking core into a testable `neighbors.ts` pure
  function (dataset arrays in, index list out). Small refactor, done as step 1.
- **MMR tuning is open-ended.** Ships at `0` (inert). Phil tunes it in a later bench
  session; the winning value (likely a light `0.1`–`0.2`) is recorded in the eventual
  `game_neighbors` profile spec, same as the other params.
- **Bucket cap + a small `topK`:** if `topK` is tiny and the cap forces many skips, the
  pool `P` must be deep enough. `P = max(topK*6, 150)` is generous; the loop just returns a
  short list if the pool genuinely runs out (same as today's "Nothing clears these filters"
  empty state).

## Out of scope

- Any change to the real game page or the warehouse `/similar` read path.
- The `game_neighbors` "quality" profile in bgg-data-warehouse — still the eventual
  follow-up; this spec only sharpens what the bench can express.
- Per-family-*size* logic (suppress a family only if the family itself is large). Considered
  and dropped: needs a family-size table, and "cap at N per line" already gives the
  behaviour Phil wants without it.
- Global (non-source-relative) MMR, or MMR as a hard similarity ceiling between neighbours.

## Verification

- `just check` — svelte-check, lint, types.
- `just test` — Vitest, including the new `neighbors.test.ts` (esp. the two "≡ today"
  identity cases).
- `just dev` on localhost:5173, **light + dark**: for Risk / Unlock! / Ticket to Ride,
  set "Max per family" to 2 and confirm the tuned list keeps 2 per line and fills to
  `topK`; set it off and confirm the tuned list matches a fresh baseline; nudge diversity
  and watch near-duplicate euros spread; load a pre-existing saved experiment and confirm
  it still runs (migration).
- Panel run (Evaluate mode) over the default panel completes without a visible stall.
