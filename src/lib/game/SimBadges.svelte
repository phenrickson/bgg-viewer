<script lang="ts">
  /**
   * The two badges on a neighbour: how *alike* it is, and how *well-rated* it is. Colours from
   * `./similarity` (the `/dev/similar` bench's scales): `similarityColor`'s diverging formula
   * over similarity's own 0..1 bounds, `ratingColor`'s green quality ramp. The rating is the
   * raw average rating, which spreads more than the geek rating.
   *
   * Shared by `SimilarRow` and `GameTile` so a match reads the same wherever it appears.
   * The sim badge is left out when `similarity` is null. The rating badge is left out when
   * `rating` isn't passed at all; passed as null it shows "—" (no rating yet).
   */
  import { similarityPct, similarityColor, ratingColor } from './similarity';

  let { similarity = null, rating }: { similarity?: number | null; rating?: number | null } = $props();
</script>

<span class="badges">
  {#if similarity != null}
    <span class="badge" style:color={similarityColor(similarity)}>
      <span class="bl">sim</span>{Math.round(similarityPct(similarity))}%
    </span>
  {/if}
  {#if rating !== undefined}
    <span class="badge" style:color={ratingColor(rating)}>
      <span class="bl">rating</span>{rating && rating > 0 ? rating.toFixed(1) : '—'}
    </span>
  {/if}
</span>

<style>
  .badges {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }
  /* Each badge tints its own border + fill off the `currentColor` set per badge. */
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
