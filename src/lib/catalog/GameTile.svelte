<script lang="ts">
  /**
   * One game as a TILE: the art, the name and year, then at its foot the scores, the game's
   * facts and the tile's actions. The visual unit for a short list you browse by picture: a
   * handful of recommendations, a shelf to start from.
   *
   * Not `GameCard`: that is a dense list row that has run out of width, art beside text, laid
   * out to scan down. A tile is laid out to scan across: a few in a row, art first.
   *
   * Built on the shared `Card`. The art is a fixed 4:3 frame (BGG's ~200px thumbnail inside at
   * its own shape, never scaled up); the name follows, up to two lines; the scores, facts and
   * actions are anchored to the foot, so they line up across a row whatever the names' lengths.
   *
   * `compact` keeps only the art, name and year, for a row of small picks.
   *
   * The art and the name link to `href`. `actions` (small icon buttons, each with its label as a
   * tooltip) sit outside the links, in the foot. `marker` is a badge on the art's top-left
   * ("On your shelf"). `facts` should be short (an icon and a number), so they hold one line.
   */
  import type { Snippet } from 'svelte';
  import * as Card from '$lib/components/ui/card';
  import { Badge } from '$lib/components/ui/badge';
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
    /** A short badge on the art's corner. */
    marker = '',
    /** The game's facts under the name: short, one line. */
    facts,
    /** Icon buttons at the foot. */
    actions,
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
    marker?: string;
    facts?: Snippet;
    actions?: Snippet;
    class?: string;
    style?: string;
  } = $props();

  const hasScores = $derived(!compact && (similarity != null || rating !== undefined));
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

<Card.Root size="sm" class="tile min-w-0 {className}" data-compact={compact || undefined} {style}>
  <Card.Content class="frame">
    <a class="art" {href} tabindex="-1" aria-hidden="true">
      {#if thumbnail}
        <img src={thumbnail} alt="" loading="lazy" decoding="async" />
      {:else}
        <span class="ph">{initials}</span>
      {/if}
    </a>
    {#if marker}<Badge variant="secondary" class="marker">{marker}</Badge>{/if}
  </Card.Content>

  <Card.Content>
    <a class="nm" {href} title={name}>{name}{#if year}<span class="yr">{year}</span>{/if}</a>
  </Card.Content>

  {#if !compact && (hasScores || facts || actions)}
    <!-- Anchored to the foot, so these line up across a row whatever the names' lengths. -->
    <Card.Content class="foot">
      {#if hasScores}<SimBadges {similarity} {rating} />{/if}
      {#if facts}<div class="facts">{@render facts()}</div>{/if}
      {#if actions}<div class="acts">{@render actions()}</div>{/if}
    </Card.Content>
  {/if}
</Card.Root>

<style>
  :global(.tile:has(a:hover)) {
    --tw-ring-color: var(--primary);
  }
  /* The frame holds the art and, on its corner, the marker. */
  :global(.tile .frame) {
    position: relative;
  }
  /* A fixed 4:3 frame: the cover sits inside at its own shape, never scaled past its size. */
  .art {
    display: flex;
    align-items: center;
    justify-content: center;
    aspect-ratio: 4 / 3;
    min-width: 0;
  }
  .art img {
    max-width: 100%;
    max-height: 100%;
    width: auto;
    height: auto;
    border-radius: 4px;
    display: block;
  }
  .ph {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    aspect-ratio: 3 / 4;
    border-radius: 4px;
    background: var(--muted);
    color: var(--muted-foreground);
    font-size: 1.1rem;
    font-weight: 700;
  }
  /* On the frame's corner, so it never takes a line from the parts below. The card's own
     padding is --card-spacing; it sits just inside it. */
  :global(.tile .frame > .marker) {
    position: absolute;
    top: 0;
    left: var(--card-spacing);
  }
  /* Scores, facts and the actions, pushed to the foot of the tile. */
  :global(.tile .foot) {
    margin-top: auto;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .acts {
    display: flex;
    justify-content: flex-end;
    gap: 0.25rem;
  }
  /* The name, capped at two lines (the full name on hover). */
  .nm {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    color: inherit;
    text-decoration: none;
    font-size: 0.95rem;
    font-weight: 650;
    line-height: 1.3;
    letter-spacing: -0.01em;
  }
  .nm:hover {
    color: var(--primary);
  }
  .nm:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
    border-radius: 2px;
  }
  /* One line of short facts. */
  .facts {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    font-size: 0.8rem;
    color: var(--muted-foreground);
    white-space: nowrap;
    overflow: hidden;
  }
  /* A margin, not a text space: a space inside the span is collapsed away. */
  .yr {
    margin-left: 0.4em;
    font-size: 0.8rem;
    font-weight: 400;
    color: var(--muted-foreground);
  }

  /* Compact: smaller name. */
  :global(.tile[data-compact]) .nm {
    font-size: 0.8rem;
    font-weight: 600;
  }
</style>
