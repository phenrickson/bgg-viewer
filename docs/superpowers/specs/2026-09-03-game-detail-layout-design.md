# Game detail page — one layout for upcoming + settled — Design

**Date:** 2026-09-03
**Status:** Draft — building on `feat/game-detail-layout` (stacked on
`feat/similar-profile-switcher`).
**Context:** decisions from a working session with Phil over two hand-drawn mockups
(Drillers 2026 = upcoming, Dune: Imperium 2020 = settled).

> Copy note: badge/label strings are **placeholder**. Phil writes final copy.

## Problem

The page rearranges itself by `upcoming` (`g.year >= currentYear`): the prediction panel
and the player-count chart swap column and priority via CSS `order`, and the taxonomy
(categories / mechanics / series) sits dead last in the left stack. Result: two different
layouts to reason about, and "what kind of game is this" is buried below the fold.

## Decisions

### 1. One layout, no `order` swapping

Components sit in fixed positions for every game. `upcoming` no longer moves anything —
it only drives per-component wording (the stat strip's "est." line, already built) and
the new badge.

- **Left column:** taxonomy band → About → Player counts
- **Right column:** Similar games → What the model expected (`PredictionPanel`)

`PredictionPanel` always renders in the right column under Similar games (today it jumps
to the left stack for upcoming games). Remove the `{#if upcoming}` left-column copy.

### 2. Taxonomy card — top of the left column, above About

**Not** a full-width band (tried it — imbalanced against the 2-column body below). A
normal `.card` at the **top of the left column**, above About: **Categories** then
**Mechanics** by default. **Series & Families** is hidden behind a toggle
("Series & families (N)" ⇄ "Hide series & families") — it's ~70% metadata for a game
like Dune: Imperium ("Digital Implementations: Steam", "Components: Meeples") and doesn't
belong in the default at-a-glance read.

Existing `.chips` / `.chip` rendering and Explore links unchanged. No filtering of the
Series & Families entries — just collapsed by default.

### 3. Player counts — always visible, pending state when upcoming

The card stays in its normal left-column position for every game. When there are no
votes:
- **Upcoming:** a "pending" empty state — placeholder "No community votes yet — check
  back after release." (the viz frame can stay, empty).
- **Settled:** the existing "No player-count votes for this game."

No more dropping to the foot of the stack for upcoming games.

### 4. Stat strip — reorder + colour

Order becomes **Geek rating · Average · Complexity · Ratings (count)** (Complexity moves
ahead of the ratings count).

Colour the *value* on **Geek rating, Average, and Complexity** — a quality/weight scale,
same tokens the app already uses (`ratingColor` / a complexity scale from
`similarity.ts` or `ComplexityMeter`). Ratings count stays neutral. The "est." /
percentile second line is unchanged.

### 5. Upcoming badge

A small pill in the title line, right after the year: `Drillers 2026 ·[Upcoming]`.
Informational token, not an alert colour. Shows whenever `upcoming` is true
(`g.year >= currentYear`). No badge once a game is settled.

### 6. Hero stays structurally as-is

Contained dark `.hero card` — not the full-bleed look sketched for Drillers. Content
inside it is reorganised only as far as decisions 4–5 require.

## Affected files

| File | Change |
| --- | --- |
| `src/routes/(app)/games/[id]/+page.svelte` | The layout: lift taxonomy to a full-width band with clamp/expand; drop the `order`-swap logic; `PredictionPanel` right-column only; player-count pending state; stat-strip reorder + colour; upcoming badge. |
| `src/lib/game/similarity.ts` | Reuse `ratingColor`; add a complexity-colour helper if one isn't already there (or reuse `ComplexityMeter`'s). |
| `src/routes/(app)/games/[id]/*.test.ts` if a harness exists | badge shows iff upcoming; taxonomy band renders; player-count pending state. |

No change to: the warehouse client / view model (all data already present:
`g.categories/mechanics/families`, `g.year`, `g.weight`, `p.*`), the catalog artifact,
`/dev/similar`.

## Out of scope

- Full-bleed hero.
- Filtering / re-grouping Series & Families content.
- Any new prediction or similar-games behaviour (that's `feat/similar-profile-switcher`).
- Final copy.

## Verification

`just check` / `just test` / `just build`. Phil reviews live on `just dev` as each piece
lands (stat strip → taxonomy band → unified layout + badge → player-count pending).
