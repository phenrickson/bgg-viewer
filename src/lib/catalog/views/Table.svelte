<script lang="ts">
  import { query } from '$lib/catalog/catalog.svelte';

  let { where }: { where: string } = $props();

  type Row = {
    game_id: number;
    name: string;
    year_published: number | null;
    geek_rating: number | null;
    average_rating: number | null;
    average_weight: number | null;
    users_rated: number | null;
    min_players: number | null;
    max_players: number | null;
    best_player_counts: number[] | null;
    recommended_player_counts: number[] | null;
  };

  // Sorting runs in DuckDB, so it orders the *whole* scoped set — not just the page we
  // render. Each column maps to a safe SQL sort expression (never user input).
  type Col = { key: string; label: string; num: boolean; sql: string };
  const COLS: Col[] = [
    { key: 'name', label: 'Game', num: false, sql: 'lower(name)' },
    { key: 'year', label: 'Year', num: true, sql: 'year_published' },
    { key: 'geek', label: 'Geek', num: true, sql: 'geek_rating' },
    { key: 'rating', label: 'Avg', num: true, sql: 'average_rating' },
    { key: 'weight', label: 'Weight', num: true, sql: 'average_weight' },
    { key: 'rated', label: 'Ratings', num: true, sql: 'users_rated' },
    { key: 'players', label: 'Players', num: false, sql: 'min_players' },
    { key: 'best', label: 'Best at', num: false, sql: 'best_player_counts[1]' },
    { key: 'rec', label: 'Rec at', num: false, sql: 'recommended_player_counts[1]' }
  ];
  const PAGE_SIZE = 250;

  let sortKey = $state('geek');
  let desc = $state(true);
  let page = $state(0);
  let rows = $state<Row[]>([]);
  let total = $state(0);

  function sortBy(c: Col) {
    if (c.key === sortKey) desc = !desc;
    else {
      sortKey = c.key;
      desc = c.num; // numbers default high→low, text A→Z
    }
  }

  const orderExpr = $derived(COLS.find((c) => c.key === sortKey)?.sql ?? 'geek_rating');
  const pages = $derived(Math.max(1, Math.ceil(total / PAGE_SIZE)));
  const from = $derived(total === 0 ? 0 : page * PAGE_SIZE + 1);
  const to = $derived(Math.min(total, (page + 1) * PAGE_SIZE));

  // A new filter or sort always drops you back to the first page. This effect reads
  // where/sort (not page), so paging itself doesn't retrigger it — no loop.
  $effect(() => {
    where;
    sortKey;
    desc;
    page = 0;
  });

  let token = 0;
  $effect(() => {
    const w = where;
    const ord = `${orderExpr} ${desc ? 'DESC' : 'ASC'} NULLS LAST`;
    const offset = page * PAGE_SIZE;
    const mine = ++token;
    Promise.all([
      query<{ n: number }>(`SELECT COUNT(*)::INT AS n FROM catalog WHERE ${w}`),
      query<Row>(
        `SELECT game_id, name, year_published, geek_rating, average_rating,
                average_weight, users_rated, min_players, max_players,
                best_player_counts, recommended_player_counts
         FROM catalog WHERE ${w} ORDER BY ${ord} LIMIT ${PAGE_SIZE} OFFSET ${offset}`
      )
    ])
      .then(([c, r]) => {
        if (mine !== token) return;
        total = c[0]?.n ?? 0;
        rows = r;
      })
      .catch((e) => mine === token && console.error('table query failed', e));
  });

  const num = (n: number | null, d = 2) => (n == null ? '—' : n.toFixed(d));
  const players = (r: Row) =>
    r.min_players == null ? '—' : r.min_players === r.max_players ? `${r.min_players}` : `${r.min_players}–${r.max_players}`;
  const counts = (a: number[] | null) => {
    const arr = a ? Array.from(a) : [];
    return arr.length ? arr.join(', ') : '—';
  };
  const arrow = (c: Col) => (c.key === sortKey ? (desc ? '▼' : '▲') : '');
</script>

<div class="meta">
  <span>{from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()} · sorted by {COLS.find((c) => c.key === sortKey)?.label}</span>
  <span class="pager">
    <button disabled={page === 0} onclick={() => (page = 0)} title="First">«</button>
    <button disabled={page === 0} onclick={() => (page = Math.max(0, page - 1))}>‹ Prev</button>
    <span class="pg tnum">Page {(page + 1).toLocaleString()} / {pages.toLocaleString()}</span>
    <button disabled={page >= pages - 1} onclick={() => (page = Math.min(pages - 1, page + 1))}>Next ›</button>
    <button disabled={page >= pages - 1} onclick={() => (page = pages - 1)} title="Last">»</button>
  </span>
</div>

<div class="tblwrap">
  <table class="tnum">
    <thead>
      <tr>
        {#each COLS as c}
          <th class:num={c.num} class:active={c.key === sortKey}>
            <button onclick={() => sortBy(c)}>{c.label} <span class="ar">{arrow(c)}</span></button>
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each rows as r}
        <tr>
          <td class="nm"><a href="/games/{r.game_id}">{r.name}</a></td>
          <td class="num">{r.year_published ?? '—'}</td>
          <td class="num">{num(r.geek_rating)}</td>
          <td class="num">{num(r.average_rating)}</td>
          <td class="num">{num(r.average_weight)}</td>
          <td class="num">{(r.users_rated ?? 0).toLocaleString()}</td>
          <td>{players(r)}</td>
          <td class="best">{counts(r.best_player_counts)}</td>
          <td>{counts(r.recommended_player_counts)}</td>
        </tr>
      {/each}
      {#if !rows.length}
        <tr><td colspan={COLS.length} class="empty">No games match this scope.</td></tr>
      {/if}
    </tbody>
  </table>
</div>

<style>
  .meta { color: var(--muted-foreground); font-size: 0.78rem; margin-bottom: var(--space-sm); display: flex; align-items: center; justify-content: space-between; gap: var(--space-md); flex-wrap: wrap; }
  .pager { display: inline-flex; align-items: center; gap: .3rem; }
  .pager button { background: var(--card); border: 1px solid var(--border); border-radius: 6px; color: var(--foreground); cursor: pointer; font: inherit; font-size: 0.76rem; padding: .2rem .5rem; }
  .pager button:hover:not(:disabled) { border-color: var(--primary); color: var(--primary); }
  .pager button:disabled { opacity: .4; cursor: default; }
  .pager .pg { padding: 0 .4rem; color: var(--foreground); }
  .tnum { font-variant-numeric: tabular-nums; }
  .tblwrap { max-height: 34rem; overflow: auto; border: 1px solid var(--border); border-radius: var(--radius); }
  table { width: 100%; border-collapse: collapse; font-size: 0.87rem; }
  thead th { text-align: left; border-bottom: 1px solid var(--border); background: var(--card); position: sticky; top: 0; z-index: 1; padding: 0; }
  thead th.num { text-align: right; }
  thead th button { width: 100%; text-align: inherit; background: none; border: none; cursor: pointer; font: inherit; font-size: 0.7rem; text-transform: uppercase; letter-spacing: .05em; color: var(--muted-foreground); font-weight: 600; padding: .5rem .7rem; }
  thead th.active button { color: var(--foreground); }
  thead th button:hover { color: var(--foreground); }
  .ar { font-size: 0.6rem; }
  tbody td { padding: .45rem .7rem; border-bottom: 1px solid var(--border); }
  td.num { text-align: right; }
  td.best { font-weight: 600; color: var(--primary); }
  tbody tr:last-child td { border-bottom: none; }
  tbody tr:hover { background: var(--muted); }
  .nm a { color: var(--primary); text-decoration: none; font-weight: 550; }
  .nm a:hover { text-decoration: underline; }
  .empty { text-align: center; color: var(--muted-foreground); padding: var(--space-lg); }
</style>
