<script lang="ts" module>
  /** How a result is laid out: a card in a grid, one line in a list, or the featured pick. */
  export type ResultLayout = 'card' | 'row' | 'feature';
</script>

<script lang="ts">
  /**
   * One game as an ANSWER — a result you're meant to look at and maybe follow, not a row to
   * compare down a column. Art leads; the facts a reader decides on (how heavy, how long, who
   * it plays well with) are quiet chips; the rating is a tile you can scan.
   *
   * Three layouts of the same content:
   * - `card`: art beside the text, for a two-column grid (Help me find a game's Cards);
   * - `row`: one line, for a list (its List);
   * - `feature`: a larger card for the one game being put forward (Pick one for me).
   *
   * Art is drawn at or under the thumbnail's own ~200px, never upscaled.
   *
   * Orange is kept for what's clickable: the name is a link in the text colour, the chips and
   * rating are neutral. `actions` sit outside the link (More like this, Another one), and
   * `eyebrow` / `onclose` are for the feature's "Picked for you" and ×.
   */
  import type { Snippet } from 'svelte';
  import type { DiscoverGame } from '$lib/discover/types';
  import { complexityLabel, playerCounts } from '$lib/discover/dials';
  import { boxPlaytimeLabel } from './playtime';

  let {
    game,
    href,
    layout = 'card',
    eyebrow = '',
    onclose,
    actions
  }: {
    game: DiscoverGame;
    href: string;
    layout?: ResultLayout;
    eyebrow?: string;
    onclose?: () => void;
    actions?: Snippet;
  } = $props();

  const weight = $derived(complexityLabel(game.average_weight));
  const time = $derived(boxPlaytimeLabel(game.min_playtime, game.max_playtime));
  const players = $derived(playerCounts(game.best_player_counts, game.recommended_player_counts));
  const cats = $derived(
    (game.categories ? Array.from(game.categories) : []).slice(0, layout === 'card' ? 2 : 3)
  );
  const rating = $derived(game.geek_rating == null ? '—' : game.geek_rating.toFixed(2));
  const initials = $derived(
    game.name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('')
  );
</script>

<article class="gr {layout}">
  {#if game.thumbnail}
    <img class="art" src={game.thumbnail} alt="" loading="lazy" />
  {:else}
    <span class="art ph" aria-hidden="true">{initials}</span>
  {/if}

  <div class="body">
    {#if eyebrow || onclose}
      <div class="top">
        {#if eyebrow}<span class="eyebrow">{eyebrow}</span>{/if}
        {#if onclose}
          <button type="button" class="close" aria-label="Put the pick away" onclick={onclose}>×</button>
        {/if}
      </div>
    {/if}
    <div class="id">
      <a class="nm" {href}>{game.name}</a>
      {#if layout === 'card'}
        <span class="sub">
          {#if game.year_published != null}{game.year_published}{/if}{#if cats.length}{game.year_published != null ? ' · ' : ''}{cats.join(' · ')}{/if}
        </span>
      {:else if game.year_published != null}
        <span class="yr">{game.year_published}</span>
      {/if}
    </div>
    <div class="chips">
      {#if weight}<span class="chip">{weight}</span>{/if}
      {#if time}<span class="chip">{time}</span>{/if}
      {#if players.best && layout !== 'row'}
        <span class="chip">Best at {players.best}{#if players.also} · also {players.also}{/if}</span>
      {/if}
      {#if layout !== 'card' && cats.length}<span class="cats">{cats.join(' · ')}</span>{/if}
    </div>
    {#if actions && layout !== 'row'}<div class="acts">{@render actions()}</div>{/if}
  </div>

  {#if layout === 'row'}
    <span class="players">
      {#if players.best}
        <span class="dim">Best</span> <b>{players.best}</b>{#if players.also}<span class="dim"> · also {players.also}</span>{/if}
      {/if}
    </span>
  {/if}
  <span class="rating" title="Geek rating">
    <b>{rating}</b>
    {#if layout === 'feature'}<span class="dim">rating</span>{/if}
  </span>
  {#if actions && layout === 'row'}<div class="acts">{@render actions()}</div>{/if}
</article>

<style>
  .gr {
    display: grid;
    gap: var(--space-md);
    min-width: 0;
    color: var(--foreground);
  }
  .card {
    grid-template-columns: 6rem minmax(0, 1fr) auto;
    padding: 0.9rem;
    border-radius: 14px;
    background: color-mix(in oklch, var(--foreground) 3%, var(--card));
    border: 1px solid var(--border);
  }
  .feature {
    grid-template-columns: 10.5rem minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-lg);
    padding: 1.25rem;
    border-radius: 16px;
    background: color-mix(in oklch, var(--foreground) 5%, var(--card));
    border: 1px solid var(--border);
  }
  .row {
    grid-template-columns: 3.5rem minmax(0, 1fr) 10.5rem 4rem 8.5rem;
    align-items: center;
    padding: 0.75rem 0.25rem;
    border-bottom: 1px solid color-mix(in oklch, var(--border) 60%, transparent);
  }

  .art {
    width: 6rem; height: 6rem; border-radius: 8px; object-fit: cover;
    background: color-mix(in oklch, var(--muted) 70%, var(--card));
  }
  .feature .art { width: 10.5rem; height: 10.5rem; border-radius: 10px; }
  .row .art { width: 3.5rem; height: 3.5rem; border-radius: 7px; }
  .ph {
    display: flex; align-items: center; justify-content: center;
    color: var(--muted-foreground); font-size: 0.85rem; font-weight: 650;
  }

  .body { display: flex; flex-direction: column; gap: 0.45rem; min-width: 0; }
  .feature .body { gap: 0.6rem; }

  .top { display: flex; align-items: center; justify-content: space-between; gap: var(--space-sm); }
  .eyebrow {
    font-size: 0.72rem; font-weight: 650; letter-spacing: 0.06em; text-transform: uppercase;
    color: var(--primary);
  }
  .close {
    font: inherit; font-size: 1.2rem; line-height: 1; cursor: pointer; padding: 0 0.2rem;
    background: none; border: none; color: var(--muted-foreground);
  }
  .close:hover { color: var(--foreground); }

  .id { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
  .row .id, .feature .id { flex-direction: row; align-items: baseline; gap: 0.5rem; }
  .nm {
    color: var(--foreground); text-decoration: none;
    font-size: 1rem; font-weight: 700; line-height: 1.25; letter-spacing: -0.01em;
  }
  .nm:hover { color: var(--primary); }
  .nm:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; border-radius: 3px; }
  .feature .nm { font-size: 1.75rem; font-weight: 750; letter-spacing: -0.02em; }
  .row .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .sub, .yr { font-size: 0.82rem; color: var(--muted-foreground); }
  .yr { flex: none; }
  .feature .yr { font-size: 1rem; }

  .chips { display: flex; flex-wrap: wrap; align-items: center; gap: 0.35rem; min-width: 0; }
  .chip {
    font-size: 0.75rem; white-space: nowrap;
    padding: 0.12rem 0.55rem; border-radius: 999px;
    background: color-mix(in oklch, var(--foreground) 9%, var(--card));
    color: color-mix(in oklch, var(--foreground) 88%, var(--muted-foreground));
  }
  .feature .chip { font-size: 0.82rem; padding: 0.2rem 0.65rem; }
  .cats {
    font-size: 0.8rem; color: var(--muted-foreground); margin-left: 0.2rem;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;
  }
  .feature .cats { flex-basis: 100%; margin-left: 0; font-size: 0.88rem; }

  .acts { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-md); margin-top: auto; }
  .row .acts { justify-content: flex-end; }

  .players { font-size: 0.88rem; font-variant-numeric: tabular-nums; }
  .players b { font-weight: 650; }
  .dim { color: var(--muted-foreground); }

  /* A tile you can scan down a column: neutral, the number carries it. */
  .rating {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    font-variant-numeric: tabular-nums;
  }
  .rating b { font-weight: 750; letter-spacing: -0.02em; }
  .card .rating {
    align-self: start; width: 3.5rem; height: 3.5rem; border-radius: 12px;
    background: color-mix(in oklch, var(--foreground) 9%, var(--card));
  }
  .card .rating b { font-size: 1.1rem; }
  .feature .rating {
    align-self: start; width: 4.5rem; height: 4.5rem; border-radius: 14px;
    background: color-mix(in oklch, var(--foreground) 9%, var(--card));
  }
  .feature .rating b { font-size: 1.5rem; }
  .feature .rating .dim { font-size: 0.7rem; }
  .row .rating { align-items: flex-end; }
  .row .rating b { font-size: 1rem; font-weight: 650; }

  /* Narrow: the feature stacks its art over the text; the row sheds the player column. */
  @container (max-width: 36rem) {
    .feature { grid-template-columns: 6rem minmax(0, 1fr) auto; gap: var(--space-md); }
    .feature .art { width: 6rem; height: 6rem; }
    .feature .nm { font-size: 1.25rem; }
    .row { grid-template-columns: 3.5rem minmax(0, 1fr) 3.5rem; }
    .row .players { display: none; }
    .row .acts { grid-column: 2 / -1; justify-content: flex-start; }
  }
</style>
