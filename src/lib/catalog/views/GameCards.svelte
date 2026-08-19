<script lang="ts">
  /**
   * PROTOTYPE — item #3 from the Track 2 spec (a trimmed-down Explore variant), option C:
   * the same scoped set as GameList, rendered as a card grid instead of a dense table. Built
   * to be looked at and evaluated, not a committed view — no tests, no polish pass, and it
   * may be reworked or dropped entirely depending on what Phil thinks after running it.
   *
   * Same `where`/plumbing as GameList.svelte (catalog/query/thumbnails, same page/PAGE_SIZE
   * pattern) so this is a rendering-path fork, not a second data layer.
   */
  import { catalog, query } from '$lib/catalog/catalog.svelte';
  import RatingBar from '$lib/catalog/encodings/RatingBar.svelte';
  import ComplexityMeter from '$lib/catalog/encodings/ComplexityMeter.svelte';
  import type { Scope } from '$lib/catalog/scope';

  let { where, universe = 'top10k' }: { where: string; universe?: Scope['universe'] } = $props();

  const upcoming = $derived(universe === 'upcoming');

  type Row = {
    game_id: number;
    name: string;
    thumbnail: string | null;
    year_published: number | null;
    geek_rating: number | null;
    average_weight: number | null;
    predicted_geek_rating: number | null;
    predicted_complexity: number | null;
  };

  const PAGE_SIZE = 60;
  let page = $state(0);
  let rows = $state<Row[]>([]);
  let total = $state(0);
  let loading = $state(true);

  $effect(() => {
    where;
    page = 0;
  });

  let token = 0;
  $effect(() => {
    const w = where;
    const offset = page * PAGE_SIZE;
    const mine = ++token;
    catalog.thumbnailsReady;
    loading = true;
    Promise.all([
      query<{ n: number }>(`SELECT COUNT(*)::INT AS n FROM catalog WHERE ${w}`),
      query<Row>(
        `SELECT c.game_id, c.name, c.year_published, c.geek_rating, c.average_weight,
                c.predicted_geek_rating, c.predicted_complexity, t.thumbnail
         FROM catalog c LEFT JOIN thumbnails t USING (game_id)
         WHERE ${w} ORDER BY ${upcoming ? 'c.predicted_geek_rating' : 'c.geek_rating'} DESC NULLS LAST, c.game_id
         LIMIT ${PAGE_SIZE} OFFSET ${offset}`
      )
    ])
      .then(([c, r]) => {
        if (mine !== token) return;
        total = c[0]?.n ?? 0;
        rows = r;
        loading = false;
      })
      .catch((e) => {
        if (mine !== token) return;
        loading = false;
        console.error('game cards query failed', e);
      });
  });

  const pages = $derived(Math.max(1, Math.ceil(total / PAGE_SIZE)));
  const initials = (name: string) =>
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('');
</script>

<div class="wrap">
  {#if loading && !rows.length}
    <p class="state">Loading…</p>
  {:else}
    <div class="grid">
      {#each rows as r (r.game_id)}
        <a class="card" href="/games/{r.game_id}">
          {#if r.thumbnail}
            <img class="art" src={r.thumbnail} alt="" loading="lazy" />
          {:else}
            <span class="art ph" aria-hidden="true">{initials(r.name)}</span>
          {/if}
          <span class="meta">
            <span class="nm">{r.name}</span>
            {#if r.year_published != null}<span class="yr">{r.year_published}</span>{/if}
            <span class="row2">
              <RatingBar value={upcoming ? r.predicted_geek_rating : r.geek_rating} />
              <ComplexityMeter weight={upcoming ? r.predicted_complexity : r.average_weight} />
            </span>
          </span>
        </a>
      {/each}
    </div>

    {#if pages > 1}
      <div class="pager">
        <button disabled={page === 0} onclick={() => (page = Math.max(0, page - 1))}>‹ Prev</button>
        <span class="pg tnum">{(page + 1).toLocaleString()} / {pages.toLocaleString()}</span>
        <button disabled={page >= pages - 1} onclick={() => (page = Math.min(pages - 1, page + 1))}>Next ›</button>
      </div>
    {/if}
  {/if}
</div>

<style>
  .wrap {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }
  .state {
    margin: 0;
    padding: var(--space-xl);
    text-align: center;
    color: var(--muted-foreground);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
    gap: var(--space-md);
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    text-decoration: none;
    color: inherit;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.5rem;
    background: var(--card);
  }
  .card:hover {
    border-color: var(--primary);
  }
  .art {
    width: 100%;
    aspect-ratio: 1;
    border-radius: 6px;
    object-fit: cover;
    background: color-mix(in oklch, var(--muted) 70%, var(--card));
  }
  .art.ph {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--muted-foreground);
    font-size: 1.4rem;
    font-weight: 650;
  }
  .meta {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .nm {
    font-size: 0.85rem;
    font-weight: 650;
    line-height: 1.2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .card:hover .nm {
    color: var(--primary);
  }
  .yr {
    font-size: 0.72rem;
    color: var(--muted-foreground);
  }
  .row2 {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.2rem;
  }
  .row2 :global(.wrap) {
    flex: 1;
    min-width: 0;
    max-width: none;
  }
  .row2 :global(.meter) {
    width: 2.4rem;
    flex: none;
  }

  .pager {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    font-size: 0.78rem;
  }
  .pager button {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--foreground);
    cursor: pointer;
    font: inherit;
    font-size: 0.76rem;
    padding: 0.2rem 0.6rem;
  }
  .pager button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .tnum {
    font-variant-numeric: tabular-nums;
  }
</style>
