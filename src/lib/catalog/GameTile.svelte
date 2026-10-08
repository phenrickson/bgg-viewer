<script lang="ts">
  /**
   * One game as a TILE: the art, a row of scores with the tile's actions, then the name and the
   * game's facts. The visual unit for a short list you browse by picture: a handful of
   * recommendations, a shelf to start from.
   *
   * Not `GameCard`: that is a dense list row that has run out of width, art beside text, laid
   * out to scan down. A tile is laid out to scan across: a few in a row, art first.
   *
   * Built on the shared `Card`. The fixed-size parts come first (the art in a 4:3 frame, the
   * score row), so they line up across a row by construction; the parts whose length varies
   * (the name, up to two lines, and the facts) come last, so any spare height falls at the
   * foot of a tile, not in the middle of it. BGG's ~200px thumbnail sits inside the frame at
   * its own shape and is never scaled up.
   *
   * `compact` keeps only the art, name and year, for a row of small picks.
   *
   * The art and the name link to `href`. `actions` (icon buttons) and `facts` sit outside the
   * links, so they can hold controls of their own. `marker` is a badge on the art's corner
   * ("On your shelf"). Each item in `facts` should be one unbreakable fact; they wrap as whole
   * items, never mid-fact.
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
    /** The game's facts under the name, after its year. */
    facts,
    /** Icon buttons at the end of the score row. */
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

  const hasScores = $derived(!compact && (similarity != null || rating !== undefined || !!actions));
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
  <Card.Content>
    <a class="art" {href} tabindex="-1" aria-hidden="true">
      {#if thumbnail}
        <img src={thumbnail} alt="" loading="lazy" decoding="async" />
      {:else}
        <span class="ph">{initials}</span>
      {/if}
      {#if marker}<Badge variant="secondary" class="marker">{marker}</Badge>{/if}
    </a>
  </Card.Content>

  {#if hasScores}
    <Card.Content class="scores">
      <SimBadges {similarity} {rating} />
      {#if actions}<span class="acts">{@render actions()}</span>{/if}
    </Card.Content>
  {/if}

  <Card.Content class="ident">
    <a class="nm" {href} title={name}>{name}</a>
    {#if !compact && facts}
      <div class="facts">
        {#if year}<span>{year}</span>{/if}
        {@render facts()}
      </div>
    {:else if year}
      <span class="yr">{year}</span>
    {/if}
  </Card.Content>
</Card.Root>

<style>
  :global(.tile:has(a:hover)) {
    --tw-ring-color: var(--primary);
  }
  /* A fixed 4:3 frame: the cover sits inside at its own shape, never scaled past its size. */
  .art {
    position: relative;
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
  /* On the frame's corner, so it never takes a line from the parts below. */
  .art :global(.marker) {
    position: absolute;
    top: 0;
    left: 0;
  }
  /* Scores on the left, the tile's icon actions on the right: one line. */
  :global(.tile .scores) {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .acts {
    margin-left: auto;
    display: inline-flex;
    gap: 0.15rem;
  }
  :global(.tile .ident) {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
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
  /* Whole facts wrap; a fact never breaks inside itself. */
  .facts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem 0.6rem;
    font-size: 0.8rem;
    color: var(--muted-foreground);
  }
  .facts > :global(*) {
    white-space: nowrap;
  }
  .yr {
    font-size: 0.8rem;
    color: var(--muted-foreground);
  }

  /* Compact: smaller name. */
  :global(.tile[data-compact]) .nm {
    font-size: 0.8rem;
    font-weight: 600;
  }
</style>
