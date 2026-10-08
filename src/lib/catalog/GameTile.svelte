<script lang="ts">
  /**
   * One game as a TILE — art on top, then name and year, then (optionally) its match badges,
   * one line of context and a footer of actions. The visual unit for a short list you browse by
   * picture: a handful of recommendations, a shelf to start from.
   *
   * Not `GameCard`: that is a dense list row that has run out of width, art beside text, laid
   * out to scan down. A tile is laid out to scan across — a few in a row, art first.
   *
   * Built on the shared `Card`, with every slot a fixed size so tiles in a row line up by
   * construction rather than by luck: the art a fixed 4:3 frame (BGG's ~200px thumbnail sits
   * inside at its own shape, never scaled up), the name clamped to two lines (the full name on
   * hover), the badges one line, the context line clamped to two, the actions in the footer.
   *
   * `compact` keeps only the art and the name, for a row of small picks.
   *
   * The art and name are one link. Badges, `line` and `actions` sit outside it, so they can
   * hold controls of their own without nesting interactive elements. `onsim` makes the sim
   * badge a button; `marker` is a badge of the caller's beside it ("On your shelf").
   * `artTransition` names the art for a view transition.
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
    /** A short badge beside the scores. */
    marker = '',
    /** One line of context under the badges (two at most). */
    line,
    /** Controls in the footer. */
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
    marker?: string;
    line?: Snippet;
    actions?: Snippet;
    onsim?: () => void;
    simOpen?: boolean;
    artTransition?: string | null;
    class?: string;
    style?: string;
  } = $props();

  const hasBadges = $derived(similarity != null || rating !== undefined || !!marker);
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
  <Card.Content class="flex flex-col gap-2">
    <a class="main" {href} title={name}>
      <span class="art" style:view-transition-name={artTransition}>
        {#if thumbnail}
          <img src={thumbnail} alt="" loading="lazy" decoding="async" />
        {:else}
          <span class="ph" aria-hidden="true">{initials}</span>
        {/if}
      </span>
      <span class="nm">{name}</span>
    </a>
    {#if year}<span class="yr">{year}</span>{/if}
  </Card.Content>

  {#if !compact && (hasBadges || line)}
    <Card.Content class="flex flex-1 flex-col gap-2">
      {#if hasBadges}
        <div class="badges">
          <SimBadges {similarity} {rating} {onsim} {simOpen} />
          {#if marker}<Badge variant="secondary">{marker}</Badge>{/if}
        </div>
      {/if}
      {#if line}<p class="line">{@render line()}</p>{/if}
    </Card.Content>
  {/if}

  {#if !compact && actions}
    <Card.Footer class="gap-2">{@render actions()}</Card.Footer>
  {/if}
</Card.Root>

<style>
  :global(.tile:has(.main:hover)) {
    --tw-ring-color: var(--primary);
  }
  .main {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    color: inherit;
    text-decoration: none;
    min-width: 0;
  }
  .main:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 3px;
    border-radius: 4px;
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
  /* Two lines, always: a short name keeps the space, a long one is cut with an ellipsis. */
  .nm {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    min-height: calc(2 * 1.3em);
    font-size: 0.95rem;
    font-weight: 650;
    line-height: 1.3;
    letter-spacing: -0.01em;
  }
  .main:hover .nm {
    color: var(--primary);
  }
  .yr {
    font-size: 0.8rem;
    color: var(--muted-foreground);
  }
  /* One line of badges. */
  .badges {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    gap: 0.3rem;
    overflow: hidden;
  }
  /* Two lines, always, so the footers of a row line up. */
  .line {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    min-height: calc(2 * 1.4em);
    margin: 0;
    font-size: 0.8rem;
    line-height: 1.4;
    color: var(--muted-foreground);
  }

  /* Compact: art and name only, smaller. */
  :global(.tile[data-compact]) .nm {
    font-size: 0.8rem;
    font-weight: 600;
  }
</style>
