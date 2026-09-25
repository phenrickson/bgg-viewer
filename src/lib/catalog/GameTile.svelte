<script lang="ts">
  /**
   * One game as a TILE — art on top, then name and year, then (optionally) its match badges
   * and one line of context. The visual unit for a short list you browse by picture: a
   * handful of recommendations, a shelf to start from.
   *
   * Not `GameCard`: that is a dense list row that has run out of width, art beside text, laid
   * out to scan down. A tile is laid out to scan across — a few in a row, art first.
   *
   * `compact` drops everything below the name and year, for a row of small picks.
   *
   * The art and name are one link. `line` sits outside it, so it can hold its own control
   * (Recommend's one-line "why" is a button) without nesting interactive elements.
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
  <a class="main" {href}>
    <span class="art">
      {#if thumbnail}
        <img src={thumbnail} alt="" loading="lazy" decoding="async" />
      {:else}
        <span class="ph" aria-hidden="true">{initials}</span>
      {/if}
    </span>
    <span class="nm">{name}{#if year}<span class="yr"> {year}</span>{/if}</span>
  </a>
  {#if !compact && hasBadges}
    <SimBadges {similarity} {rating} />
  {/if}
  {#if !compact && line}
    <div class="line">{@render line()}</div>
  {/if}
</article>

<style>
  .tile {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    padding: 0.55rem 0.55rem 0.7rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--card);
    min-width: 0;
  }
  .tile:has(.main:hover) {
    border-color: var(--primary);
  }
  .main {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    color: inherit;
    text-decoration: none;
    min-width: 0;
  }
  .main:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 3px;
    border-radius: 4px;
  }
  /* A fixed 4:3 box, so a slow or missing image never reflows the tile. `contain`, not
     `cover`: BGG thumbnails come in every shape, and a crop slices the box art. */
  .art {
    display: block;
    aspect-ratio: 4 / 3;
    border-radius: calc(var(--radius) - 3px);
    overflow: hidden;
    background: color-mix(in oklch, var(--muted) 70%, var(--card));
  }
  .art img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }
  .ph {
    display: flex;
    width: 100%;
    height: 100%;
    align-items: center;
    justify-content: center;
    color: var(--muted-foreground);
    font-size: 1.1rem;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .nm {
    font-size: 0.95rem;
    font-weight: 650;
    letter-spacing: -0.01em;
    line-height: 1.25;
    padding: 0 0.15rem;
  }
  .main:hover .nm {
    color: var(--primary);
  }
  .yr {
    font-size: 0.8rem;
    font-weight: 400;
    color: var(--muted-foreground);
  }
  .tile > :global(.badges) {
    padding: 0 0.15rem;
  }
  .line {
    font-size: 0.8rem;
    line-height: 1.35;
    color: var(--muted-foreground);
    padding: 0 0.15rem;
  }

  .compact {
    padding: 0.4rem 0.4rem 0.55rem;
    gap: 0.35rem;
  }
  .compact .nm {
    font-size: 0.8rem;
    font-weight: 600;
  }
  .compact .ph {
    font-size: 0.9rem;
  }
</style>
