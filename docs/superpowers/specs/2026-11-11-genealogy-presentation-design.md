# Genealogy: presentation and motion

*2026-11-11. Follows [2026-10-12-game-genealogy-design.md](2026-10-12-game-genealogy-design.md);
the tree rules there are unchanged. Branch `feat/game-lineage`, PR #88.*

## Why

The genealogy tool works but feels janky and doesn't look like the rest of the app. Phil wants
it to feel right and match the house look before anything else (routing from the game page,
coming out of dev) is decided. The model is the **map**: the other canvas tool.

## Goals

1. **The map's grammar.** Same shell, same tabbed sidebar, same HUD-over-canvas chrome, same
   canvas states. Someone who knows `/map` should know where everything is.
2. **One smooth motion per change.** An unfold, fold, threshold change or re-centre is a single
   glide where labels and links travel with their games: no blink, no second camera move.
3. **Nothing moves that you didn't ask to move.** Selecting a game, or a control appearing,
   never resizes the canvas.

## Non-goals

Routing from the game page, the network tool, leaving dev, new data, copy (Phil writes it; all
labels stay PLACEHOLDER), unreachable ⊕ on collided labels (review item 5), and sibling-branch
re-spreading beyond what the glide softens.

## Decisions (Phil)

- Closer to the map than to the card/hero pages.
- The map's sidebar holds the controls (mockup A), not a HUD toolbar.
- "Just build it and I'll look": the remaining calls below are mine.

## The design (my calls, flagged for review)

**Shell.** `Container size="wide" fill` > `.workspace` grid: sidebar + canvas, as on `/map`.
The "Dev only — prototype" header goes; the route stays dev-gated.

**Sidebar.** The map's sidebar, extracted into a shared `ToolSidebar` component (tabs stacked
when shut; when open, a 17rem card titled by the lit tab; not animated, as on the map). Tabs:
- **Controls**: a `GenealogyRail` in `MapRail`'s idiom (`.grp` sections, `.lbl` labels,
  `SegGroup`, `.note`): Vertical axis (Year / Generation), Similarity (native range, the
  readout moving live while dragging, the tree committing on release), Same year (Show / Hide).
- **Key**: the legend, in the same rail idiom.

The map page keeps its own copy of the sidebar for now. Moving it onto `ToolSidebar` is a
mechanical follow-up, kept out of this change so the production map isn't touched.

**HUD.** The map's `.hud` / `.stack` chrome, shared through a small `hud.css` (prefixed class
names, so nothing collides with Tailwind):
- left stack: the chosen game (name, year), the game count with Reset, and the centre's
  "+N earlier / later / same year" and "Show fewer" chips;
- right stack: game search, and under it the selected game as a floating panel (Centre on
  this, unfold / fold / more, Game page, close). It floats, so selecting doesn't squash the tree.

The empty notes ("No earlier games…") and loading or error states take the map's `.state` look.

**Motion.** The layer tweens positions itself instead of handing regl a GPU transition:
- `PointCanvas` gains an opt-in driver flag, `instant`. Position changes then draw with no
  transition and don't clear the lines or hide the overlay. Every other layer behaves as before.
- `GenealogyLayer` runs a ~450 ms ease-out tween on `requestAnimationFrame`, emitting
  positions every frame. Links and labels are recomputed from the in-between positions, so
  they travel with their games.
- Entering games start at their parent's position (or the nearest one already on screen),
  and the first tree grows out of the centre game.
- Leaving games (a fold, a threshold rise, a re-centre) glide into their nearest surviving
  ancestor (or the centre), and are hidden when the tween lands.
- No camera refit: the layout already fits the tree to the canvas (`focus: null`).
- Year ticks go straight to their new rows; games glide into them.
- `prefers-reduced-motion`: no tween.

## Builder's latitude

Exact spacing, HUD stack membership and order, the tween's duration and easing within
"snappy", and any extra regl guarding needed for per-frame draws.

## Risk

Per-frame draws through `PointCanvas`'s queue are new. The tree is small, and with a numeric
`opacity` there's no permutation, so I expect them to be cheap. If regl stalls, the fallback is
a shorter GPU transition with the overlay kept up.
