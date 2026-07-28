<script lang="ts">
  import { onMount } from 'svelte';
  import { initCatalog, query, catalog } from '$lib/catalog/catalog.svelte';
  import { DEFAULT_SCOPE, toWhere, scopeToParams, scopeFromParams, type Scope } from '$lib/catalog/scope';
  import Rail from '$lib/catalog/Rail.svelte';

  type Row = {
    game_id: number;
    name: string;
    year_published: number | null;
    geek_rating: number | null;
    average_weight: number | null;
    min_players: number | null;
    max_players: number | null;
  };
  type Facet = { c: string; n: number };

  let scope = $state<Scope>({ ...DEFAULT_SCOPE });
  let count = $state(0);
  let rows = $state<Row[]>([]);
  let categories = $state<Facet[]>([]);
  let mechanics = $state<Facet[]>([]);
  let ready = $state(false);

  onMount(async () => {
    scope = scopeFromParams(new URLSearchParams(location.search));
    await initCatalog();
    if (catalog.status !== 'ready') return;
    // UNNEST must be produced in a subquery before GROUP BY in DuckDB.
    const facetSql = (col: string) =>
      `SELECT c, COUNT(*)::INT AS n FROM (SELECT UNNEST(${col}) AS c FROM catalog) GROUP BY c ORDER BY n DESC LIMIT 15`;
    try {
      categories = await query<Facet>(facetSql('categories'));
      mechanics = await query<Facet>(facetSql('mechanics'));
    } catch (e) {
      console.error('facet load failed', e); // non-critical — still show the workspace
    }
    ready = true;
  });

  const where = $derived(ready ? toWhere(scope) : null);

  $effect(() => {
    if (where == null) return;
    const p = scopeToParams(scope).toString();
    history.replaceState(history.state, '', p ? `?${p}` : location.pathname);
    void runQuery(where);
  });

  async function runQuery(w: string) {
    const [c] = await query<{ n: number }>(`SELECT COUNT(*)::INT AS n FROM catalog WHERE ${w}`);
    count = c?.n ?? 0;
    rows = await query<Row>(
      `SELECT game_id, name, year_published, geek_rating, average_weight, min_players, max_players
       FROM catalog WHERE ${w} ORDER BY users_rated DESC LIMIT 50`
    );
  }

  const num = (n: number | null, d = 2) => (n == null ? '—' : n.toFixed(d));
  const players = (r: Row) =>
    r.min_players == null ? '—' : r.min_players === r.max_players ? `${r.min_players}` : `${r.min_players}–${r.max_players}`;
</script>

<svelte:head><title>Explore · bgg-viewer</title></svelte:head>

{#if catalog.status === 'error'}
  <p class="state err">Couldn't load the catalog: {catalog.error}</p>
{:else if !ready}
  <p class="state">Loading the catalog into your browser…</p>
{:else}
  <div class="workspace">
    <Rail bind:scope {categories} {mechanics} onreset={() => (scope = { ...DEFAULT_SCOPE })} />

    <div class="canvas">
      <div class="canvas-h">
        <span class="scope-sum"><b class="tnum">{count.toLocaleString()}</b> games</span>
        <span class="muted">showing top {Math.min(count, 50)} by popularity · filtered in-browser</span>
      </div>

      <div class="tblwrap">
        <table class="tnum">
          <thead>
            <tr><th>Game</th><th class="num">Year</th><th class="num">Geek</th><th class="num">Weight</th><th>Players</th></tr>
          </thead>
          <tbody>
            {#each rows as r}
              <tr>
                <td class="nm"><a href="/games/{r.game_id}">{r.name}</a></td>
                <td class="num">{r.year_published ?? '—'}</td>
                <td class="num">{num(r.geek_rating)}</td>
                <td class="num">{num(r.average_weight)}</td>
                <td>{players(r)}</td>
              </tr>
            {/each}
            {#if !rows.length}
              <tr><td colspan="5" class="empty">No games match this scope.</td></tr>
            {/if}
          </tbody>
        </table>
      </div>
    </div>
  </div>
{/if}

<style>
  .state { color: var(--muted-foreground); }
  .state.err { color: var(--color-negative); }
  .tnum { font-variant-numeric: tabular-nums; }
  .workspace { display: grid; grid-template-columns: 15rem 1fr; gap: var(--space-lg); align-items: start; }
  @media (max-width: 760px) { .workspace { grid-template-columns: 1fr; } }
  .canvas { min-width: 0; }
  .canvas-h { display: flex; align-items: baseline; gap: var(--space-md); flex-wrap: wrap; margin-bottom: var(--space-md); }
  .scope-sum { font-size: 1rem; }
  .scope-sum b { font-weight: 700; }
  .muted { color: var(--muted-foreground); font-size: 0.82rem; }
  .tblwrap { overflow-x: auto; border: 1px solid var(--border); border-radius: var(--radius); }
  table { width: 100%; border-collapse: collapse; font-size: 0.87rem; }
  thead th { text-align: left; font-size: 0.7rem; text-transform: uppercase; letter-spacing: .05em; color: var(--muted-foreground); font-weight: 600; padding: .5rem .7rem; border-bottom: 1px solid var(--border); background: var(--card); position: sticky; top: 0; }
  thead th.num, td.num { text-align: right; }
  tbody td { padding: .45rem .7rem; border-bottom: 1px solid var(--border); }
  tbody tr:last-child td { border-bottom: none; }
  tbody tr:hover { background: var(--muted); }
  .nm a { color: var(--primary); text-decoration: none; font-weight: 550; }
  .nm a:hover { text-decoration: underline; }
  .empty { text-align: center; color: var(--muted-foreground); padding: var(--space-lg); }
</style>
