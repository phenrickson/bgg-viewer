<script lang="ts">
  /**
   * One game as a TILE — art on top, then name and year, then (optionally) its match badges,
   * one line of context and a footer of actions. The visual unit for a short list you browse by
   * picture: a handful of recommendations, a shelf to start from.
   *
   * Not `GameCard`: that is a dense list row that has run out of width, art beside text, laid
   * out to scan down. A tile is laid out to scan across — a few in a row, art first.
   *
   * Built on the shared `Card`. Its parts — art, name and year, badges, the context line, the
   * footer — are rows of a CSS SUBGRID, shared with every tile in the same grid row: each part
   * is as tall as the tallest tile's in that row, so a row lines up without reserving blank
   * space, and a one-line name keeps its year right under it. The parent must be a grid
   * (`AutoGrid`). The art is a 4:3 frame (BGG's ~200px thumbnail inside at its own shape, never
   * scaled up); the name is capped at two lines, the context line at two.
   *
   * `compact` keeps only the art, name and year, for a row of small picks (not a subgrid).
   *
   * The art and the name link to `href`. Badges, `line` and `actions` sit outside the links, so
   * they can hold controls of their own. `onsim` makes the sim badge a button; `marker` is a
   * badge on the art's corner ("On your shelf").
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
    /** One line of context under the badges (two at most). */
    line,
    /** Controls in the footer. */
    actions,
    onsim,
    simOpen = false,
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
    line?: Snippet;
    actions?: Snippet;
    onsim?: () => void;
    simOpen?: boolean;
    class?: string;
    style?: string;
  } = $props();

  const hasBadges = $derived(!compact && (similarity != null || rating !== undefined));
  /** How many subgrid rows this tile spans: art, name, then whichever parts it has. */
  const rows = $derived(2 + (hasBadges ? 1 : 0) + (!compact && line ? 1 : 0) + (!compact && actions ? 1 : 0));
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

<Card.Root
  size="sm"
  class="tile min-w-0 {compact ? '' : 'grid grid-rows-subgrid'} {className}"
  data-compact={compact || undefined}
  style="{compact ? '' : `grid-row: span ${rows};`} {style}"
>
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

  <Card.Content class="ident">
    <a class="nm" {href} title={name}>{name}</a>
    {#if year}<span class="yr">{year}</span>{/if}
  </Card.Content>

  {#if hasBadges}
    <Card.Content><SimBadges {similarity} {rating} {onsim} {simOpen} /></Card.Content>
  {/if}

  {#if !compact && line}
    <Card.Content><p class="line">{@render line()}</p></Card.Content>
  {/if}

  {#if !compact && actions}
    <Card.Footer class="gap-2">{@render actions()}</Card.Footer>
  {/if}
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
  /* Name and year together; the name capped at two lines (full name on hover). */
  :global(.tile .ident) {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
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
  .yr {
    font-size: 0.8rem;
    color: var(--muted-foreground);
  }
  .line {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    margin: 0;
    font-size: 0.8rem;
    line-height: 1.4;
    color: var(--muted-foreground);
  }

  /* Compact: smaller name. */
  :global(.tile[data-compact]) .nm {
    font-size: 0.8rem;
    font-weight: 600;
  }
</style>
