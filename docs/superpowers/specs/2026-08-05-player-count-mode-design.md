# BGG Viewer — Player-Count Filter Mode — Design

**Date:** 2026-08-05
**Status:** Proposed
**Builds on:** [2026-07-29-explore-workspace-design.md](2026-07-29-explore-workspace-design.md)
(that spec established the rail and the shape strip; this one moves one of the strip's
filters into the rail)

> Copy note: all user-facing strings below are **placeholder** — Phil writes the final copy.

## Goal

Make **"best at N players"** reachable from the rail. Today it is only reachable by clicking
the shape strip, so the flagship filter — the one BGG itself can't do — is the one filter a
user has to discover in a chart.

Success: a user who wants "games best at 2" can set it without touching the strip, and the
rail and strip never disagree about what is filtered.

## The problem

The rail has a **Plays with** group (1–6+). The strip's fifth cell has a *best at* picker whose
only signpost is the rail's own note — "Supports N at the table. For *best* at N, use the shape
strip" — a pointer from the control you found to the control you didn't.

The two are genuinely different questions, and `scope.ts:7-10` says so deliberately:

- `players` — does the box **support** N? (`min_players <= N AND max_players >= N`)
- `bestAt` — did the community **vote** N best? (`list_contains(best_player_counts, N)`)

Both are useful. Only one is discoverable.

## Decision

Add a **mode toggle** above the existing number row. One number row, two meanings:

```text
PLAYER COUNT                    ← placeholder label
[ Plays with ][ Best at ]       ← placeholder labels; .seg.two, mirrors Universe
[ 1 ][ 2 ][ 3 ][ 4 ][ 5 ][ 6+ ]
<note, swaps with mode>         ← placeholder copy
```

### The mode is UI state, not scope state

`Scope` is **unchanged**. `players` and `bestAt` stay two separate nullable fields with their
existing `p` / `best` URL params, their existing predicates in `toWhere`, and their existing
two chips.

The toggle is a `$state` local to `Rail.svelte` that selects *which field the number row
writes to*. This is the whole reason to prefer it over collapsing the two fields into
`playerCount` + `playerCountMode`:

- `toWhere`, `scopeToParams`, `scopeFromParams`, `activeChips` need **no changes**
- existing shared `?best=4` links keep working — no URL migration, no shim
- the deliberate two-field split the code documents stays intact

### Mutual exclusivity

The modes are exclusive: **switching mode nulls the other field.** Precedent is `setUniverse`
(`Rail.svelte:44-47`), which likewise repairs adjacent state on switch.

This is a real behavior change. Today both fields can be set at once and AND together
("supports 2 **and** best at 4"), and `scope.test.ts:85-110` asserts that conjunction compiles.

A mode toggle necessarily makes the *rail* exclusive — one row can only write one field. It
does **not** by itself close off the combination, because the strip sets `bestAt` on its own
and would happily leave a `players` filter standing. Closing that path is a **separate
deliberate choice**, implemented as the `onpick` change below: we accept losing a
graph-reachable power move in exchange for two controls that can never disagree and one
player-count chip at a time.

`toWhere` still compiles both — a hand-written URL with `p` and `best` still filters on both —
so this is a UI constraint, not a data-layer one.

### Mode is derived from state, not remembered separately

On hydrate the mode follows whichever field is set: `bestAt != null` → Best-at, else Plays-with.

This matters for two paths that would otherwise desync the rail from reality:

1. **A shared `?best=4` link** lands with the toggle already on Best-at and `4` lit. If the
   mode were plain independent state it would default to Plays-with while a best-at filter was
   silently active.
2. **A strip click** sets `scope.bestAt`, so the rail's toggle flips to Best-at on its own.

### The strip stays clickable

The strip is a second affordance for the same filter, not a competitor — it has the
distribution behind it, which is information the rail doesn't have. Its `onpick`
(`ShapeStrip.svelte:305`) additionally nulls `scope.players`, so picking from the strip
enforces the same exclusivity as picking from the rail. Combined with mode-follows-state, the
two controls stay in sync in both directions.

The rail's note loses its forward-reference to the strip.

## Affected files

| File | Change |
|---|---|
| `src/lib/catalog/Rail.svelte` | Mode toggle, number row rewired, note swaps by mode; `setPlayers` generalised |
| `src/lib/catalog/views/ShapeStrip.svelte` | `onpick` also nulls `scope.players` |
| `src/lib/catalog/scope.ts` | **None** |
| `src/lib/catalog/scope.test.ts` | Existing both-set conjunction test still valid; add coverage for exclusivity |

No change to the Arrow artifact, `columns.ts`, the warehouse API, or any server code. Nothing
here is a one-way door: the toggle is presentation over unchanged state, so reverting the two
component edits restores today's behavior exactly.

## Known asymmetry

`bestAt`'s domain is 1–8 (`BEST_AT_DOMAIN`, `ShapeStrip.svelte:54`); the rail's row is 1–6+. The
row stays 1–6+ in both modes for layout stability, so the rail cannot express *best at 7* or
*best at 8* — those remain strip-only.

"6+" is cosmetic in both modes: both predicates treat 6 literally. That quirk predates this
change and is left alone.

## Out of scope

- Changing the `players` / `bestAt` predicates, including the literal-6 behavior
- A "recommended at N" mode (`recommended_player_counts` is not in the catalog shape)
- Extending the rail row to 7/8
- Any restyle of the shape strip beyond the one-line `onpick` change
- The second feature discussed in the same session — separate spec

## Verification

- `just check` — svelte-check, lint, types
- `just test` — Vitest, including the new exclusivity coverage
- `just dev` on localhost:5173 in **both light and dark**: toggle modes, confirm the other
  field's chip clears, confirm counts change, confirm a strip click flips the toggle, confirm
  a pasted `?best=4` URL lands on Best-at
