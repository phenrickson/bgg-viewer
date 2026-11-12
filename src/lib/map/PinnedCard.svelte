<script lang="ts">
  /**
   * The selected game's card, pinned beside its dot — the hover card grown into its actions
   * when you click (Phil, 2026-11-11: a card popping up in the canvas's corner didn't read
   * as belonging to the game you clicked). Opens to the side of the dot with room: right and
   * down by default, flipping left or up near an edge, and clamped inside the canvas.
   *
   * The layer hands it the dot's screen position each paint and fades it with the rest of
   * its text (out while the camera or the games move, back once they rest).
   */
  import type { Snippet } from 'svelte';

  let {
    x,
    y,
    r,
    width,
    height,
    alpha = 1,
    children
  }: {
    /** The dot's centre and radius, screen px. */
    x: number;
    y: number;
    r: number;
    /** The canvas, screen px. */
    width: number;
    height: number;
    alpha?: number;
    children: Snippet;
  } = $props();

  let w = $state(0), h = $state(0);
  const GAP = 10, EDGE = 8;
  const left = $derived.by(() => {
    const right = x + r + GAP;
    const l = right + w + EDGE <= width ? right : x - r - GAP - w;
    return Math.max(EDGE, Math.min(width - w - EDGE, l));
  });
  const top = $derived.by(() => {
    const below = y - 12;
    const t = below + h + EDGE <= height ? below : y + 12 - h;
    return Math.max(EDGE, Math.min(height - h - EDGE, t));
  });
</script>

<!-- Hidden (and inert) while faded out, so a moving view never leaves a card to click. -->
<section
  class="pinned"
  aria-label="Selected game"
  bind:offsetWidth={w}
  bind:offsetHeight={h}
  style:left="{left}px"
  style:top="{top}px"
  style:opacity={alpha}
  style:pointer-events={alpha > 0.5 ? 'auto' : 'none'}
  style:visibility={alpha > 0 ? 'visible' : 'hidden'}
>
  {@render children()}
</section>

<style>
  /* The map's floating-panel look (`.map-hud-panel`), sized like the hover card's bigger sibling. */
  .pinned {
    position: absolute; z-index: 3; width: 20rem; max-width: calc(100% - 16px);
    display: flex; flex-direction: column; gap: var(--space-sm);
    border: 1px solid var(--border); border-radius: var(--radius); background: var(--card);
    box-shadow: 0 2px 12px rgb(0 0 0 / 0.3);
    padding: var(--space-sm) var(--space-md);
    font-size: 0.85rem;
  }
</style>
