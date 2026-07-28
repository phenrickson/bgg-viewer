<script lang="ts">
  import { onMount } from 'svelte';
  import { initCatalog, query, catalog } from '$lib/catalog/catalog.svelte';

  type Hit = { game_id: number; name: string; year_published: number | null; geek_rating: number | null };

  let term = $state('');
  let hits = $state<Hit[]>([]);

  onMount(() => initCatalog());

  async function runSearch() {
    if (catalog.status !== 'ready') return;
    const t = term.trim().toLowerCase().replace(/'/g, "''");
    if (t.length < 2) {
      hits = [];
      return;
    }
    hits = await query<Hit>(
      `SELECT game_id, name, year_published, geek_rating
       FROM catalog WHERE lower(name) LIKE '%${t}%'
       ORDER BY users_rated DESC LIMIT 12`
    );
  }
</script>

<svelte:head><title>Explore · bgg-viewer</title></svelte:head>

<h1>Explore</h1>

{#if catalog.status === 'loading' || catalog.status === 'idle'}
  <p class="state">Loading the catalog into your browser…</p>
{:else if catalog.status === 'error'}
  <p class="state err">Couldn't load the catalog: {catalog.error}</p>
{:else}
  <p class="state ok">
    <b class="tnum">{catalog.count.toLocaleString()}</b> games loaded — querying entirely in-browser.
  </p>

  <input
    class="search"
    placeholder="Search titles… (client-side SQL)"
    bind:value={term}
    oninput={runSearch}
  />

  {#if hits.length}
    <ul class="hits">
      {#each hits as h}
        <li>
          <a href="/games/{h.game_id}">
            <span class="nm">{h.name}</span>
            {#if h.year_published}<span class="yr">{h.year_published}</span>{/if}
            <span class="score tnum">{h.geek_rating != null ? h.geek_rating.toFixed(2) : '—'}</span>
          </a>
        </li>
      {/each}
    </ul>
  {:else if term.trim().length >= 2}
    <p class="state">No matches.</p>
  {/if}

  <p class="note">
    This is the Step-2 proof: the real catalog is a dataframe in your browser. The filter
    rail, charts, and table come next (Steps 3–4).
  </p>
{/if}

<style>
  h1 { font-size: var(--text-heading); font-weight: 700; letter-spacing: -0.02em; margin: 0 0 var(--space-md); }
  .tnum { font-variant-numeric: tabular-nums; }
  .state { color: var(--muted-foreground); }
  .state.ok { color: var(--foreground); }
  .state.err { color: var(--color-negative); }
  .search {
    width: 100%; max-width: 28rem; margin: var(--space-md) 0;
    border: 1px solid var(--border); border-radius: var(--radius);
    background: var(--card); color: var(--foreground);
    padding: var(--space-sm) var(--space-md); font: inherit;
  }
  .search:focus-visible { outline: 2px solid var(--primary); outline-offset: 1px; }
  .hits { list-style: none; padding: 0; margin: 0; max-width: 28rem; display: flex; flex-direction: column; gap: .3rem; }
  .hits a {
    display: flex; align-items: baseline; gap: .6rem;
    padding: .5rem .7rem; border: 1px solid var(--border); border-radius: 8px;
    text-decoration: none; color: inherit; background: var(--card);
  }
  .hits a:hover { border-color: var(--primary); }
  .hits .nm { font-weight: 550; }
  .hits .yr { color: var(--muted-foreground); font-size: 0.8rem; }
  .hits .score { margin-left: auto; color: var(--primary); font-weight: 600; font-size: 0.85rem; }
  .note { margin-top: var(--space-lg); font-size: 0.8rem; color: var(--muted-foreground); border-left: 2px solid var(--primary); padding-left: .75rem; max-width: 30rem; }
</style>
