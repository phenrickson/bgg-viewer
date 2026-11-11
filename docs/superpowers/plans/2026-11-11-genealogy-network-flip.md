# Genealogy ⇄ Network flip: plan

Spec: [2026-11-11-genealogy-network-flip-design.md](../specs/2026-11-11-genealogy-network-flip-design.md)

**Delivery:** on `feat/game-lineage` (PR #88), committed and pushed as each task lands. Check
`gh pr view 88 --json state,mergedAt` before every push. Phil reviews on his dev server.

1. **`Glide` (`genealogy-tween.svelte.ts`).** Move the tween state out of `GenealogyLayer` into a
   class: reactive `cur` and `leaving` (`{ i, via }[]`), and `to(tree, target)` / `stop()`. The pure
   `planTween` / `interpolate` stay in `genealogy-tween.ts`. `GenealogyLayer` takes a `glide` prop.
   Verify: existing tests, `svelte-check`.
2. **Network pure parts (`network.ts`).** `egoParents(graph)`: each node's via, the strongest
   edge into the ring inside it. Optional `seed` positions for `egoSimulation` /
   `layoutEgoNetwork`, with a gentler restart when seeded. Unit tests for both.
3. **URL state.** `v`, `k`, `hops` and `links` in `genealogy-url.ts`, with defaults omitted; tests.
4. **`EgoLayer.svelte`.** The network view on `PointCanvas`: `instant`, `focus: null`, positions
   from the `Glide`, the shared encodings, curved edges (mutual solid; one-way dashed when "All"),
   labels and hover card, select on click.
5. **Page.** View switch, per-view controls in `GenealogyRail`, network graph and warm-started
   layout, the selected card for both views, view-specific HUD and key.
6. **Verify.** `vitest`, `svelte-check`; commit, push, hand over.
