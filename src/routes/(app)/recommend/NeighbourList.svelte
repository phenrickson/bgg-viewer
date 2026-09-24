<script lang="ts" module>
  /** One neighbour, hydrated from the catalog for display. */
  export interface Item {
    game_id: number;
    name: string;
    year_published: number | null;
    geek_rating: number | null;
    thumbnail: string | null;
    similarity: number;
    rank: number;
  }
</script>

<script lang="ts">
  /**
   * A ranked list of neighbours. Clicking a name walks to that game (it becomes the seed);
   * the arrow opens its detail page. `owned` tags games on the shelf, so a catalog-wide list
   * shows at a glance which of its answers you already have. `highlight` marks a Surprise-me
   * draw.
   */
  import { similarityPct, similarityColor } from '$lib/game/similarity';

  let {
    items,
    owned,
    onwalk,
    highlight = null
  }: {
    items: Item[];
    owned: Set<number>;
    onwalk: (id: number, name: string) => void;
    highlight?: number | null;
  } = $props();
</script>

<ol class="list">
  {#each items as g (g.game_id)}
    <li class:hl={g.game_id === highlight}>
      <span class="rk tnum">{g.rank}</span>
      {#if g.thumbnail}
        <img src={g.thumbnail} alt="" loading="lazy" />
      {:else}
        <span class="ph" aria-hidden="true">{g.name.slice(0, 1)}</span>
      {/if}
      <span class="body">
        <button type="button" class="nm" onclick={() => onwalk(g.game_id, g.name)}>{g.name}</button>
        <span class="meta">
          {#if g.year_published}<span class="tnum">{g.year_published}</span>{/if}
          {#if owned.has(g.game_id)}<span class="own">on your shelf</span>{/if}
        </span>
      </span>
      <span class="sim tnum" style:color={similarityColor(g.similarity)}>
        {Math.round(similarityPct(g.similarity))}%
      </span>
      <a class="go" href={`/games/${g.game_id}`} aria-label={`Open ${g.name}`}>↗</a>
    </li>
  {/each}
</ol>

<style>
  .list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
  li {
    display: grid; grid-template-columns: 1.4rem 2.4rem 1fr auto 1.4rem;
    align-items: center; gap: 0.6rem; padding: 0.4rem 0.5rem; border-radius: 8px;
  }
  li + li { border-top: 1px solid var(--border); }
  li.hl { background: color-mix(in oklch, var(--primary) 12%, transparent); }
  .rk { font-size: 0.75rem; color: var(--muted-foreground); text-align: right; }
  img, .ph { width: 2.4rem; height: 2.4rem; border-radius: 6px; object-fit: cover; }
  .ph {
    display: grid; place-items: center; background: var(--muted);
    color: var(--muted-foreground); font-weight: 650;
  }
  .body { display: flex; flex-direction: column; min-width: 0; }
  .nm {
    all: unset; cursor: pointer; font-weight: 600; color: var(--foreground);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .nm:hover { color: var(--primary); text-decoration: underline; }
  .nm:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; border-radius: 3px; }
  .meta { display: flex; gap: 0.5rem; font-size: 0.75rem; color: var(--muted-foreground); }
  .own { color: var(--primary); font-weight: 600; }
  .sim { font-size: 0.8rem; font-weight: 650; }
  .go { color: var(--muted-foreground); text-decoration: none; text-align: center; }
  .go:hover { color: var(--primary); }
</style>
