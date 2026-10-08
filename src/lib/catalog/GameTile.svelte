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
   * The art and name are one link. `line` and `actions` sit outside it, so they can hold
   * controls of their own without nesting interactive elements; `actions` sits at the foot,
   * so a row of tiles lines its actions up. `onsim` makes the sim badge a button.
   *
   * `artTransition` names the art for a view transition (Recommend's walk moves it into the
   * hero).
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
    /** Controls at the foot of the tile. */
    actions,
    onsim,
    simOpen = false,
    artTransition = null,
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
    actions?: Snippet;
    onsim?: () => void;
    simOpen?: boolean;
    artTransition?: string | null;
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
    <span class="art" style:view-transition-name={artTransition}>
      {#if thumbnail}
        <img src={thumbnail} alt="" loading="lazy" decoding="async" />
      {:else}
        <span class="ph" aria-hidden="true">{initials}</span>
      {/if}
    </span>
    <span class="nm">{name}{#if year}<span class="yr">{year}</span>{/if}</span>
  </a>
  {#if !compact && hasBadges}
    <SimBadges {similarity} {rating} {onsim} {simOpen} />
  {/if}
  {#if !compact && line}
    <div class="line">{@render line()}</div>
  {/if}
  {#if !compact && actions}
    <div class="acts">{@render actions()}</div>
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
  /* The art is BGG's thumbnail, ~200px on its long side, so it's never scaled up: a fixed-height,
     full-width well (so tiles in a row line up, a slow image never reflows one, and the well's
     edges are the text's edges), with the cover at its own shape centred inside it. */
  .art {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 8.5rem;
    padding: 0.5rem;
    box-sizing: border-box;
    border-radius: calc(var(--radius) - 3px);
    background: color-mix(in oklch, var(--muted) 45%, var(--card));
  }
  .art img {
    max-width: 100%;
    max-height: 100%;
    width: auto;
    height: auto;
    border-radius: 4px;
    display: block;
  }
  /* Compact keeps the 4:3 box it had: at that size the thumbnail fills it without scaling up. */
  .compact .art {
    display: block;
    height: auto;
    padding: 0;
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
  .ph {
    display: flex;
    width: 5.5rem;
    height: 100%;
    border-radius: calc(var(--radius) - 3px);
    background: color-mix(in oklch, var(--muted) 70%, var(--card));
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
  /* Two lines kept for the name, so the badges under it line up across a row. */
  .tile:not(.compact) .nm {
    min-height: 2.5em;
  }
  .main:hover .nm {
    color: var(--primary);
  }
  /* A margin, not a text space: a space inside the span is collapsed away. */
  .yr {
    margin-left: 0.35em;
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

  /* The foot: pushed to the bottom, so a row's actions share a line. */
  .acts {
    margin-top: auto;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
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
    width: 100%;
    border-radius: 0;
    font-size: 0.9rem;
  }
</style>
