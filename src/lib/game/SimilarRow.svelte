<script lang="ts">
  /**
   * One neighbour in a "similar games" list: art, name and year, then two badges — how
   * *alike* it is, and how *well-rated* it is.
   *
   * Lifted out of the game-detail page's "Similar games" card when the Recommend tool became
   * the second page to list neighbours, so a match reads the same on both. Colours come from
   * `$lib/game/similarity` (the same scales as the `/dev/similar` bench): `similarityColor`'s
   * diverging formula over the measure's own 0..1 bounds, `ratingColor`'s green quality ramp.
   * The rating badge shows the raw average rating (more spread than the geek rating).
   *
   * `children`, when given, is a second line under the name — Recommend's one-line "why".
   */
  import type { Snippet } from 'svelte';
  import { similarityPct, similarityColor, ratingColor } from './similarity';

  let {
    href,
    name,
    year = null,
    thumbnail = null,
    similarity,
    rating = null,
    children
  }: {
    href: string;
    name: string;
    year?: number | null;
    thumbnail?: string | null;
    similarity: number;
    rating?: number | null;
    children?: Snippet;
  } = $props();
</script>

<a class="row" {href}>
  {#if thumbnail}
    <img class="mono" src={thumbnail} alt="" loading="lazy" />
  {:else}
    <span class="mono ph">{name?.[0] ?? '?'}</span>
  {/if}
  <span class="txt">
    <span class="nmw"><span class="nm">{name}</span> {#if year}<span class="yr">{year}</span>{/if}</span>
    {#if children}<span class="sub">{@render children()}</span>{/if}
  </span>
  <span class="badges">
    <span class="badge" style:color={similarityColor(similarity)}>
      <span class="bl">sim</span>{Math.round(similarityPct(similarity))}%
    </span>
    <span class="badge" style:color={ratingColor(rating)}>
      <span class="bl">rating</span>{rating && rating > 0 ? rating.toFixed(1) : '—'}
    </span>
  </span>
</a>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    padding: 0.45rem 0.6rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    text-decoration: none;
    color: inherit;
    background: var(--background);
    min-width: 0;
  }
  .row:hover {
    border-color: var(--primary);
  }
  .row:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 1px;
  }
  /* Shared footprint for the real thumbnail and the initials placeholder, so a row never
     shifts size once a (fire-and-forget, non-blocking) thumbnail lookup resolves. */
  .mono {
    width: 2rem;
    height: 2rem;
    border-radius: 6px;
    background: var(--muted);
    flex: none;
    object-fit: cover;
  }
  .mono.ph {
    display: grid;
    place-items: center;
    font-weight: 700;
    font-size: 0.9rem;
    color: var(--muted-foreground);
  }
  .txt {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }
  .nmw,
  .sub {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .nm {
    font-weight: 600;
    font-size: 0.9rem;
  }
  .row:hover .nm {
    color: var(--primary);
  }
  .yr {
    color: var(--muted-foreground);
    font-size: 0.78rem;
  }
  .sub {
    color: var(--muted-foreground);
    font-size: 0.74rem;
  }
  /* Each badge tints its own border + fill off the `currentColor` set per row. */
  .badges {
    margin-left: auto;
    flex: none;
    display: flex;
    gap: 0.3rem;
  }
  .badge {
    display: inline-flex;
    align-items: baseline;
    gap: 0.22rem;
    font-size: 0.8rem;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
    padding: 0.12rem 0.4rem;
    border-radius: 999px;
    border: 1px solid color-mix(in oklch, currentColor 30%, transparent);
    background: color-mix(in oklch, currentColor 12%, transparent);
  }
  .bl {
    font-size: 0.58rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    opacity: 0.7;
  }
</style>
