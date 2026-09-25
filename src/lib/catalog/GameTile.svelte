<script lang="ts">
  /**
   * One game as a TILE, for a short list you browse a few at a time: a handful of
   * recommendations, a shelf to start from.
   *
   * Full: the thumbnail on the left at its own shape, with the name and year, the match
   * badges and one line of context beside it. The art is BGG's thumbnail (~200px on its long
   * side), so a bigger tile gets more room for detail, never a bigger picture.
   * `compact`: the thumbnail on top in a small 4:3 box and the name and year under it, for a
   * row of small picks.
   *
   * The name is the link (the art links too, but only for the mouse). `line` sits outside
   * the link, so it can hold its own control (Recommend's one-line "why" is a button) without
   * nesting interactive elements.
   */
  import type { Snippet } from 'svelte';
  import SimBadges from '$lib/game/SimBadges.svelte';

  let {
    href,
    name,
    year = null,
    thumbnail = null,
    /** 0..1 — shows the sim badge. */
    similarity = null,
    /** Average rating — shows the rating badge. Omit to leave it out; null shows "—". */
    rating,
    compact = false,
    /** One line under the badges. */
    line,
    class: className = '',
    style = ''
  }: {
    href: string;
    name: string;
    year?: number | null;
    thumbnail?: string | null;
    similarity?: number | null;
    rating?: number | null;
    compact?: boolean;
    line?: Snippet;
    class?: string;
    style?: string;
  } = $props();

  const hasBadges = $derived(similarity != null || rating !== undefined);
  /** Initials stand in for missing box art. */
  const initials = $derived(
    name
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('')
  );
</script>

<article class="tile {className}" class:compact {style}>
  <a class="art" {href} tabindex="-1" aria-hidden="true">
    {#if thumbnail}
      <img src={thumbnail} alt="" loading="lazy" decoding="async" />
    {:else}
      <span class="ph">{initials}</span>
    {/if}
  </a>
  <div class="body">
    <a class="nm" {href}>{name}{#if year}<span class="yr">{year}</span>{/if}</a>
    {#if !compact && hasBadges}
      <SimBadges {similarity} {rating} />
    {/if}
    {#if !compact && line}
      <div class="line">{@render line()}</div>
    {/if}
  </div>
</article>

<style>
  .tile {
    display: grid;
    grid-template-columns: 5.5rem minmax(0, 1fr);
    align-items: start;
    gap: 0.75rem;
    padding: 0.65rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--card);
    min-width: 0;
  }
  .tile:has(a:hover) {
    border-color: var(--primary);
  }
  /* The thumbnail at its own shape inside a fixed-width column, capped in height so a tall
     cover can't stretch the tile, and never scaled past its own size. */
  .art {
    display: flex;
    justify-content: center;
  }
  .art img {
    max-width: 100%;
    max-height: 7rem;
    width: auto;
    height: auto;
    border-radius: 4px;
    display: block;
  }
  .ph {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    aspect-ratio: 1;
    border-radius: 4px;
    background: color-mix(in oklch, var(--muted) 70%, var(--card));
    color: var(--muted-foreground);
    font-size: 1rem;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .body {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.4rem;
    min-width: 0;
  }
  .nm {
    font-size: 0.95rem;
    font-weight: 650;
    letter-spacing: -0.01em;
    line-height: 1.25;
    color: inherit;
    text-decoration: none;
  }
  .nm:hover {
    color: var(--primary);
  }
  .nm:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
    border-radius: 3px;
  }
  /* A margin, not a text space: a space inside the span is collapsed away. */
  .yr {
    margin-left: 0.35em;
    font-size: 0.8rem;
    font-weight: 400;
    color: var(--muted-foreground);
  }
  .line {
    font-size: 0.8rem;
    line-height: 1.35;
    color: var(--muted-foreground);
  }

  /* Compact: art on top in a 4:3 box — at this size the thumbnail fills it without scaling up. */
  .compact {
    grid-template-columns: minmax(0, 1fr);
    gap: 0.35rem;
    padding: 0.4rem 0.4rem 0.55rem;
  }
  .compact .art {
    display: block;
    aspect-ratio: 4 / 3;
    border-radius: calc(var(--radius) - 3px);
    overflow: hidden;
    background: color-mix(in oklch, var(--muted) 70%, var(--card));
  }
  .compact .art img {
    width: 100%;
    height: 100%;
    max-height: none;
    object-fit: contain;
    border-radius: 0;
  }
  .compact .ph {
    height: 100%;
    aspect-ratio: auto;
    border-radius: 0;
    font-size: 0.9rem;
  }
  .compact .nm {
    font-size: 0.8rem;
    font-weight: 600;
  }
</style>
