# One tool, two views: Genealogy ⇄ Network

*2026-11-11. Builds on [2026-11-11-genealogy-presentation-design.md](2026-11-11-genealogy-presentation-design.md).
Branch `feat/game-lineage`, PR #88. Dev-only throughout.*

## Why

Phil: "the real flip here is between Genealogy and Network." Both views answer "what's around this
game?": one ordered by time, one by who neighbours whom. So they should be one tool centred on one
game, with a switch between the two. The goal is still to make it *feel* good.

## What Phil confirmed

- One page, one centre game, a **Genealogy / Network** switch. Search, the selected-game card,
  the HUD and the page are shared; each view brings its own controls.
- The sigma variant is out of scope.

## The design (my calls, flagged for review)

**The flip is one glide.** Games in both views slide from their tree spot to their network spot.
Games only in the new view grow out of their nearest on-screen ancestor, and games only in the
old one fold into theirs. This is the same tween as an unfold, so the glide state (what's on
screen, and the last tree's shape) moves out of `GenealogyLayer` into a `Glide` object the page
owns and hands to whichever layer is mounted.

**Same encodings in both views**, so a flip changes only positions and links: centre in the
accent, every other game one colour, size by ratings, upcoming hollow. The network view drops
the old bench's category colours. Links in the network view are mutual (solid) and, optionally,
one-way (dashed and faint), with thickness by similarity.

**Network view** (a new `EgoLayer`, in `GenealogyLayer`'s idiom and drawn from `NetworkLayer`):
- the graph comes from `buildEgoNetwork` over the same loaded vectors, with eligibility as the
  bench has it (has a vector, not upcoming);
- the layout is `layoutEgoNetwork`, **warm-started** from the previous network positions, so
  changing k or hops, or re-centring, doesn't reshuffle games that stay;
- labels go to the centre, its neighbours, the outer hubs and hovered/selected games;
- clicking selects (as in genealogy), and the card's "Centre on this" re-centres.

**Controls** (sidebar card): the switch at the top, then that view's controls:
- Genealogy: Vertical axis, Similarity, Same year (unchanged);
- Network: Neighbours per game (k, slider 4–25, default 10), Rings (hops 1/2/3, default 2),
  Links (Mutual / All, default Mutual).

Dropped from the bench: min ratings, curve and min-similarity edge filters, and the map↔network
projection flight. Fewer knobs; easy to add back.

**URL:** the view (`v=net`), `k`, `hops` and `links` join the existing state, and are omitted
at their defaults. The centre is shared.

**HUD:** the left stack shows the centre and count in both views. Reset and the "+N" chips are
genealogy-only. The key changes with the view.

**Route and name:** it stays `/dev/genealogy` and the nav row stays "Genealogy" for now.
Renaming the combined tool is Phil's call. `/dev/map/network` stays as it is; retiring it once
this feels right is also Phil's call.

## Non-goals

Leaving dev, the game-page entry, the sigma variant, copy (all PLACEHOLDER), and the map's own
sidebar or HUD.
