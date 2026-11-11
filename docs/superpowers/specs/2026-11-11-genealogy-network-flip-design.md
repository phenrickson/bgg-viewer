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

## Revision: links on a 2-D underlay (2026-11-11)

Profiling showed the network view freezing at high neighbour counts: flipping to it at k = 25
(about 2,000 links) produced 14 long tasks totalling 1.28 s. Nearly all of it was regl-scatterplot's
annotation lines rebuilding their geometry on every glide frame (`bufferCopyElement` uses
`splice`, so the cost is quadratic in vertex count). Both views now draw their links on a 2-D
canvas under the GL canvas (`Driver.underlay`; the GL background goes transparent). That's one
native curve per link, about 1–2 ms a frame. Measured after the change: 2 long tasks, about
270 ms. What's left is a ~130 ms stall at the flip (building and laying out the network) and a
glide below 60 fps whose cost doesn't show up in the CPU profile.

## Revision: network defaults, expand and review (2026-11-11)

Phil's review of the network view, and the PR review after it. This supersedes the
**Links** and **Controls** lines above.

- **Links are similarity, not mutual/all.** The network always shows the centre and what
  connects to it; with Mutual as the default, two rings came out as disconnected islands.
  Every link is drawn, straight, in one muted colour, width and opacity by similarity on a
  fixed scale from the floor to 1 (so 0.79 reads as strong). The one-way distinction is an
  opt-in toggle, **One-way links: Plain / Dashed** (URL `ow=1`).
- **Shared similarity floor.** The similarity slider now sits above both views' controls and
  also filters the network's links (`floor` over each game's top k).
- **Expand in the network too.** A selected game's card offers "Expand N more" and "Fold",
  as in the tree (URL `o=`). Rings and Expand coexist: Rings widens every game,
  Expand widens one. Folding a game also folds what was expanded from it.
- **Motion.** Raising k or expanding holds the games already placed, and new ones are
  placed beside the game that brought them in, outward. The glide grows ring by ring from the centre.
- **One embedding version.** The vectors artifact carries each row's `embedding_version` and
  the deployed version (from `monitoring.deployed_models`, read at build time). Genealogy and
  network compare only games on that version, or on the newest when the deployed one
  couldn't be read. Recommend still uses every row.
- **Cost.** One similarity scan per game serves every threshold and k. Scans are kept for the
  page's life, and the tree's, which can run to thousands of links each, are cleared past
  2,000 games. Style toggles no longer rebuild the graph. A glide
  frame touches only the games in play, and the 2-D link canvas is sized only for a layer
  that draws on it.

## Known rough edges (2026-11-11)

- **Slight aliasing and stutter while dragging the canvas** (Phil: "not terrible, just worth
  noting"). A profile of a drag shows steady ~6 ms frames and no long tasks, so it isn't a
  slow frame. Unverified candidates: the text dropping out and fading back on a hesitant drag
  (the camera-rest rule), and the dots versus the 2-D link canvas rendering at different
  pixel ratios (regl's points, against links drawn at devicePixelRatio capped at 2).
- **HUD over the tree:** labels near the top edge can sit under the top-left chips and the
  search box.
- **Network view at high neighbour counts:** a ~130 ms stall as the network is built and laid
  out.
- **Network layout rules** (keeping rings tidy and crossings down) were discussed and parked.
- **Every glide frame still uploads all ~38k points to regl:** regl-scatterplot takes whole
  arrays, so only a different draw path would avoid it.
- **Deployed version in the viewer's fallback build:** the viewer's service account can't read
  `monitoring`, so a runtime-built artifact falls back to the newest version. A read grant
  would be a warehouse Terraform change.
- **Minor, from the review:** an unfold started mid-fold drops the folding games instead of
  finishing them. The artifact version stamp is written in three places. Rows with no
  embedding version are handled inconsistently at build time.
