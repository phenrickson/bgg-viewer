<script lang="ts">
  /**
   * One game, as Discover shows it: a picture, a name, and three signals — who it plays
   * well with, how heavy it is, and how well it is rated.
   *
   * Differences from Explore's row are deliberate, not decorative. Complexity is a WORD
   * ("Medium-Heavy") rather than the number 3.4, because a reader who has not asked to think
   * in a 1–5 weight scale should not have to. Mechanics are omitted and categories capped at
   * three, because the full facet wall is exactly what makes a dense card unscannable.
   *
   * The thumbnail is a STUB. `thumbnail` is not in the catalog artifact, and whether to add
   * it is a measured decision deferred until this layout has earned it.
   */
  import RatingBar from '$lib/catalog/encodings/RatingBar.svelte';
  import PlayerPips from '$lib/catalog/encodings/PlayerPips.svelte';
  import { complexityLabel, complexityBandIndex } from './dials';
  import type { DiscoverGame } from './types';

  let { game }: { game: DiscoverGame } = $props();

  const weight = $derived(complexityLabel(game.average_weight));
  /** Band index 1–5, driving the badge's tint step. Derived from the same source as weight. */
  const weightStep = $derived(complexityBandIndex(game.average_weight));
  const cats = $derived((game.categories ? Array.from(game.categories) : []).slice(0, 3));
  /** Initials stand in for box art until the artifact question is settled. */
  const initials = $derived(
    game.name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('')
  );
</script>

<a class="row" href="/games/{game.game_id}">
  <span class="thumb" aria-hidden="true">{initials}</span>

  <span class="main">
    <span class="l1">
      <span class="nm">{game.name}</span>
      {#if game.year_published != null}<span class="yr">{game.year_published}</span>{/if}
    </span>
    <span class="l2">
      <PlayerPips best={game.best_player_counts} recommended={game.recommended_player_counts} />
      {#if weight}
        <span class="cx" data-step={weightStep}>{weight}</span>
      {/if}
      {#if cats.length}<span class="cats">{cats.join(' · ')}</span>{/if}
    </span>
  </span>

  <span class="rate"><RatingBar value={game.geek_rating} /></span>
</a>

<style>
  .row {
    display: grid;
    grid-template-columns: 3.5rem minmax(0, 1fr) 4.5rem;
    align-items: center;
    gap: 0 var(--space-md);
    padding: 0.5rem var(--space-md);
    text-decoration: none;
    color: inherit;
    border-bottom: 1px solid color-mix(in oklch, var(--border) 55%, transparent);
  }
  .row:last-child { border-bottom: none; }
  .row:hover { background: color-mix(in oklch, var(--primary) 7%, transparent); }
  .row:focus-visible { outline: 2px solid var(--primary); outline-offset: -2px; }
  .row > span { min-width: 0; }

  .thumb {
    width: 3.5rem; height: 3.5rem; border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
    background: color-mix(in oklch, var(--muted) 70%, var(--card));
    color: var(--muted-foreground);
    font-size: 0.8rem; font-weight: 650; letter-spacing: -0.02em;
  }

  .main { display: flex; flex-direction: column; gap: 0.28rem; }
  .l1 { display: flex; align-items: baseline; gap: 0.35rem; min-width: 0; }
  .nm {
    font-size: 0.95rem; font-weight: 650; letter-spacing: -0.01em; color: var(--foreground);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .row:hover .nm { color: var(--primary); }
  .yr { font-size: 0.85rem; color: var(--muted-foreground); flex: none; }

  .l2 { display: flex; align-items: center; gap: 0.75rem; min-width: 0; }

  /* Complexity as an ordered tint ramp. The WORD carries the meaning; the tint only
     reinforces it, so the scale survives a colourblind reader and a greyscale print. Kept
     to an outline rather than a solid fill so it never outshouts the game's name. */
  .cx {
    flex: none; font-size: 0.7rem; font-weight: 550; white-space: nowrap;
    padding: 0.1rem 0.45rem; border-radius: 999px; border: 1px solid;
  }
  .cx[data-step='1'] { color: var(--chart-2); border-color: color-mix(in oklch, var(--chart-2) 45%, transparent); background: color-mix(in oklch, var(--chart-2) 10%, transparent); }
  .cx[data-step='2'] { color: var(--chart-3); border-color: color-mix(in oklch, var(--chart-3) 45%, transparent); background: color-mix(in oklch, var(--chart-3) 10%, transparent); }
  .cx[data-step='3'] { color: var(--chart-4); border-color: color-mix(in oklch, var(--chart-4) 45%, transparent); background: color-mix(in oklch, var(--chart-4) 10%, transparent); }
  .cx[data-step='4'] { color: var(--chart-5); border-color: color-mix(in oklch, var(--chart-5) 45%, transparent); background: color-mix(in oklch, var(--chart-5) 10%, transparent); }
  .cx[data-step='5'] { color: var(--chart-1); border-color: color-mix(in oklch, var(--chart-1) 55%, transparent); background: color-mix(in oklch, var(--chart-1) 14%, transparent); }

  .cats {
    font-size: 0.73rem; color: var(--muted-foreground);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;
  }

  /* Narrow canvases drop the categories rather than squeezing the pips. */
  @container (max-width: 40rem) {
    .cats { display: none; }
  }
</style>
