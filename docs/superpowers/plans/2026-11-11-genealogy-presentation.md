# Genealogy presentation and motion: plan

Spec: [2026-11-11-genealogy-presentation-design.md](../specs/2026-11-11-genealogy-presentation-design.md)

**Delivery:** on `feat/game-lineage` (PR #88), committed and pushed as each task lands; Phil
reviews on his own dev server. Check `gh pr view 88 --json state,mergedAt` before every push.
No force-pushes.

## Tasks

1. **`PointCanvas` `instant` flag.** Add `instant?: boolean` to `Driver` (`surface.ts`). In
   `PointCanvas`'s draw effect, when it's set: don't set `drawn = false`, skip the zero-position
   first draw and the line clear, and draw with `transition: false`. Verify: `svelte-check`, map
   tests, and the other layers still unchanged (the flag is off by default).

2. **Shared chrome.** `src/lib/map/ToolSidebar.svelte`, extracted from `/map`'s sidebar markup
   and CSS (props: tabs `{ id, label, badge? }[]`, bindable `panel`, a `children(panel)` snippet).
   `src/lib/map/hud.css`, holding the map's `.hud` / `.stack` rules under `map-hud` names.
   The map page itself is untouched.

3. **`GenealogyRail.svelte`.** Controls and key in `MapRail`'s idiom (`SegGroup`, `.grp`,
   `.lbl`, `.note`). The similarity readout follows `oninput` and the tree commits on `onchange`.

4. **Page shell.** Rewrite `/dev/genealogy/+page.svelte`: `Container wide fill` > `.workspace`
   > `ToolSidebar` (Controls / Key) + canvas with left and right HUD stacks and the floating
   selected panel; the map's `.state`. Drop the old header, toolbar, side column and legend row.

5. **Tween in `GenealogyLayer`.** Set `instant: true` and `focus: null`. Keep the current frame's
   positions; on a new layout, build from/to arrays (entering games from their nearest shown
   ancestor, leaving games to their nearest surviving ancestor), run the rAF ease-out, and
   recompute colour, size, visible and lines over the union while it runs. Reduced motion
   skips it. The pure parts (start/target resolution, easing) live in
   `genealogy-tween.ts` with unit tests.

6. **Verify.** `vitest`, `svelte-check`; then commit, push and hand to Phil to look.
