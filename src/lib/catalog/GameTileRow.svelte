<script lang="ts" module>
  /** What a tile in the row needs. */
  export type RowGame = { game_id: number; name: string; year_published: number | null; thumbnail: string | null };
</script>

<script lang="ts">
  /**
   * A single row of compact GameTiles — a handful of games to start from.
   *
   * Always exactly one row: as many tiles as fit the row's own width (6, 4, 3 or 2), never a
   * wrapped orphan on a second line. The tiles past that are `display: none`, so they leave
   * the tab order too, rather than hiding behind an overflow a keyboard can still reach.
   *
   * `rise` gives the row its one load-in: the tiles rise into place a beat apart, and not at
   * all for anyone who asks for less motion.
   */
  import GameTile from './GameTile.svelte';

  /** The stagger between tiles in the load-in. */
  const RISE_STAGGER_MS = 70;

  let {
    games,
    hrefFor,
    rise = false,
    label
  }: {
    games: RowGame[];
    hrefFor: (id: number) => string;
    rise?: boolean;
    /** Accessible name for the row. */
    label: string;
  } = $props();
</script>

<div class="wrap">
  <ul class="row" aria-label={label}>
    {#each games as g, i (g.game_id)}
      <li class:rise style={rise ? `animation-delay: ${i * RISE_STAGGER_MS}ms` : undefined}>
        <GameTile compact href={hrefFor(g.game_id)} name={g.name} year={g.year_published} thumbnail={g.thumbnail} />
      </li>
    {/each}
  </ul>
</div>

<style>
  /* The row measures itself, so the tile count follows the space it's given, not the window. */
  .wrap { container-type: inline-size; }
  .row {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: var(--space-sm);
  }
  .row > li { min-width: 0; display: flex; }
  .row > li > :global(*) { flex: 1; }

  /* One row at every width: fewer, wider tiles as the row narrows. */
  @container (max-width: 52rem) {
    .row { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .row > li:nth-child(n + 5) { display: none; }
  }
  @container (max-width: 36rem) {
    .row { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .row > li:nth-child(n + 4) { display: none; }
  }
  @container (max-width: 24rem) {
    .row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .row > li:nth-child(n + 3) { display: none; }
  }
  .row > li:nth-child(n + 7) { display: none; }

  .rise { animation: tile-row-rise 420ms ease-out both; }
  @keyframes tile-row-rise {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    .rise { animation: none; }
  }
</style>
