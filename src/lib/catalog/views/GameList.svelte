<script lang="ts">
  /**
   * The games in scope — the answer to "find board games matching my criteria".
   *
   * Deliberately a list of links laid out on a grid, not a `<table>`: rows are two lines
   * (title, then the context that tells you what the game *is*), the whole row is one click
   * target, and three columns carry a visual encoding rather than a bare number —
   *
   *   · geek rating → a bar on a fixed domain, so ratings are comparable down the column
   *     and across pages at a glance instead of digit-by-digit;
   *   · complexity → a five-segment meter, matching the 1–5 weight scale it measures;
   *   · best/recommended-at → the numerals 1–6 themselves, emphasised by how the community
   *     voted. Self-labelling, so it needs no legend, and it turns the flagship feature from
   *     the cryptic "2, 3" of a spreadsheet cell into something scannable.
   *
   * Sorting and paging both run in DuckDB, so a sort orders the *whole* scoped set, not the
   * page on screen. Column keys map to fixed SQL expressions — never user input.
   */
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
    designers: string[] | null;
    categories: string[] | null;
  };

  type Col = { key: string; label: string; align: 'l' | 'r'; sql: string; hint?: string };
  const COLS: Col[] = [
    { key: 'name', label: 'Game', align: 'l', sql: 'lower(name)' },
    { key: 'year', label: 'Year', align: 'r', sql: 'year_published' },
    { key: 'geek', label: 'Geek', align: 'l', sql: 'geek_rating', hint: 'BGG’s ranked rating' },
    { key: 'rating', label: 'Avg', align: 'r', sql: 'average_rating', hint: 'raw average rating' },
    { key: 'weight', label: 'Complexity', align: 'l', sql: 'average_weight', hint: 'weight, 1–5' },
    { key: 'best', label: 'Best at', align: 'l', sql: 'best_player_counts[1]', hint: 'bold = best · mid = also recommended' },
    { key: 'rated', label: 'Ratings', align: 'r', sql: 'users_rated' }
  ];
  const PAGE_SIZE = 100;

  /**
   * Fixed domain for the rating bar. Geek rating is Bayesian, so it is squeezed into roughly
   * 5.5–8.7 — scaling to the page's own range instead would make every page look the same
   * and break comparison between them.
   */
  const GEEK_LO = 5.5;
  const GEEK_HI = 8.8;

  /** How many player counts the best-at strip shows before collapsing to "+". */
  const PIP_MAX = 6;

  let sortKey = $state('geek');
  let desc = $state(true);
  let page = $state(0);
  let rows = $state<Row[]>([]);
  let total = $state(0);
  let loading = $state(true);

  function sortBy(c: Col) {
    if (c.key === sortKey) desc = !desc;
    else {
      sortKey = c.key;
      desc = c.key !== 'name'; // numbers read high→low, titles A→Z
    }
  }

  const sortCol = $derived(COLS.find((c) => c.key === sortKey) ?? COLS[2]);
  const pages = $derived(Math.max(1, Math.ceil(total / PAGE_SIZE)));
  const from = $derived(total === 0 ? 0 : page * PAGE_SIZE + 1);
  const to = $derived(Math.min(total, (page + 1) * PAGE_SIZE));

  // A new filter or sort always drops you back to page 1. This reads where/sort but not
  // page, so paging itself doesn't retrigger it — no loop.
  $effect(() => {
    where;
    sortKey;
    desc;
    page = 0;
  });

  let token = 0;
  $effect(() => {
    const w = where;
    const ord = `${sortCol.sql} ${desc ? 'DESC' : 'ASC'} NULLS LAST`;
    const offset = page * PAGE_SIZE;
    const mine = ++token;
    loading = true;
    Promise.all([
      query<{ n: number }>(`SELECT COUNT(*)::INT AS n FROM catalog WHERE ${w}`),
      query<Row>(
        `SELECT game_id, name, year_published, geek_rating, average_rating,
                average_weight, users_rated, min_players, max_players,
                best_player_counts, recommended_player_counts, designers, categories
         FROM catalog WHERE ${w} ORDER BY ${ord}, game_id LIMIT ${PAGE_SIZE} OFFSET ${offset}`
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
        console.error('game list query failed', e);
      });
  });

  const num = (n: number | null, d = 2) => (n == null ? '—' : n.toFixed(d));
  const list = <T,>(a: T[] | null): T[] => (a ? Array.from(a) : []);
  const geekPct = (g: number | null) =>
    g == null ? 0 : Math.max(0, Math.min(100, ((g - GEEK_LO) / (GEEK_HI - GEEK_LO)) * 100));
  /** Fill of the i-th (0-based) segment of the 1–5 complexity meter. */
  const segPct = (w: number | null, i: number) =>
    w == null ? 0 : Math.max(0, Math.min(1, w - i)) * 100;

  function playerRange(r: Row): string {
    if (r.min_players == null) return '';
    const hi = r.max_players ?? r.min_players;
    return r.min_players === hi ? `${hi}p` : `${r.min_players}–${hi}p`;
  }

  /** "1–4p · Stefan Feld · Economic, Dice" — what the game *is*, under its title. */
  function meta(r: Row): string {
    const des = list(r.designers);
    const cats = list(r.categories);
    const bits = [playerRange(r)];
    if (des.length) bits.push(des.length > 2 ? `${des[0]} +${des.length - 1}` : des.join(', '));
    if (cats.length) bits.push(cats.slice(0, 2).join(', '));
    return bits.filter(Boolean).join(' · ');
  }

  function pipTitle(r: Row): string {
    const b = list(r.best_player_counts);
    const rec = list(r.recommended_player_counts).filter((n) => !b.includes(n));
    if (!b.length && !rec.length) return 'no player-count votes';
    const parts = [];
    if (b.length) parts.push(`best at ${b.join(', ')}`);
    if (rec.length) parts.push(`also recommended at ${rec.join(', ')}`);
    return parts.join('; ');
  }
</script>

<div class="bar">
  <span class="pos">
    {#if loading && !rows.length}
      Counting…
    {:else}
      <b class="tnum">{from.toLocaleString()}–{to.toLocaleString()}</b>
      of <b class="tnum">{total.toLocaleString()}</b>
      <span class="dim">· by {sortCol.label} {desc ? 'high→low' : 'low→high'}</span>
    {/if}
  </span>
  {#if pages > 1}
    <span class="pager">
      <button disabled={page === 0} onclick={() => (page = 0)} title="First page">«</button>
      <button disabled={page === 0} onclick={() => (page = Math.max(0, page - 1))}>‹ Prev</button>
      <span class="pg tnum">{(page + 1).toLocaleString()} / {pages.toLocaleString()}</span>
      <button disabled={page >= pages - 1} onclick={() => (page = Math.min(pages - 1, page + 1))}>Next ›</button>
      <button disabled={page >= pages - 1} onclick={() => (page = pages - 1)} title="Last page">»</button>
    </span>
  {/if}
</div>

<div class="listwrap">
  <div class="head row">
    <span class="rk">#</span>
    {#each COLS as c (c.key)}
      <span class="c-{c.key}" class:r={c.align === 'r'}>
        <button class:on={c.key === sortKey} onclick={() => sortBy(c)} title={c.hint ?? `Sort by ${c.label}`}>
          {c.label}<span class="ar">{c.key === sortKey ? (desc ? '▼' : '▲') : ''}</span>
        </button>
      </span>
    {/each}
  </div>

  <div class="rows">
    {#each rows as r, i (r.game_id)}
      {@const best = list(r.best_player_counts)}
      {@const rec = list(r.recommended_player_counts)}
      <a class="row" href="/games/{r.game_id}">
        <span class="rk tnum">{(page * PAGE_SIZE + i + 1).toLocaleString()}</span>

        <span class="c-name">
          <span class="nm">{r.name}</span>
          <span class="mt">{meta(r)}</span>
        </span>

        <span class="c-year r tnum">{r.year_published ?? '—'}</span>

        <span class="c-geek">
          <span class="gv tnum">{num(r.geek_rating)}</span>
          <span class="gbar"><i style:width="{geekPct(r.geek_rating)}%"></i></span>
        </span>

        <span class="c-rating r tnum dim">{num(r.average_rating)}</span>

        <span class="c-weight">
          <span class="meter" aria-hidden="true">
            {#each [0, 1, 2, 3, 4] as i (i)}
              <i><b style:width="{segPct(r.average_weight, i)}%"></b></i>
            {/each}
          </span>
          <span class="wv tnum">{num(r.average_weight, 1)}</span>
        </span>

        <span class="c-best" title={pipTitle(r)}>
          <!-- Numerals styled by vote are a visual encoding; screen readers get the prose. -->
          <span class="vh">{pipTitle(r)}</span>
          <span class="pips" aria-hidden="true">
            {#each Array.from({ length: PIP_MAX }, (_, k) => k + 1) as n (n)}
              <span class="pip" class:best={best.includes(n)} class:rec={!best.includes(n) && rec.includes(n)}>{n}</span>
            {/each}
            <span class="pip more" class:vis={best.concat(rec).some((n) => n > PIP_MAX)}>+</span>
          </span>
        </span>

        <span class="c-rated r tnum dim">{(r.users_rated ?? 0).toLocaleString()}</span>
      </a>
    {/each}

    {#if !rows.length && !loading}
      <p class="empty">No games match this scope. Loosen a filter above, or clear one from the bar.</p>
    {/if}
  </div>
</div>

<style>
  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
    flex-wrap: wrap;
    font-size: 0.78rem;
    color: var(--muted-foreground);
    margin-bottom: var(--space-sm);
  }
  .pos b {
    color: var(--foreground);
    font-weight: 650;
  }
  .dim {
    color: var(--muted-foreground);
  }
  .tnum {
    font-variant-numeric: tabular-nums;
  }
  .pager {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }
  .pager button {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--foreground);
    cursor: pointer;
    font: inherit;
    font-size: 0.76rem;
    padding: 0.15rem 0.5rem;
  }
  .pager button:hover:not(:disabled) {
    border-color: var(--primary);
    color: var(--primary);
  }
  .pager button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .pager .pg {
    padding: 0 0.35rem;
    color: var(--foreground);
  }

  .listwrap {
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex: 1;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--card);
    overflow: hidden;
  }
  .rows {
    overflow-y: auto;
    min-height: 0;
    flex: 1;
  }

  /* One grid template shared by the header and every row, so they can't drift. */
  .row {
    display: grid;
    grid-template-columns:
      2.6rem minmax(9rem, 1fr) 3rem 4.6rem 2.8rem 5.2rem 5.6rem 4.4rem;
    align-items: center;
    gap: 0 var(--space-md);
    padding: 0.34rem var(--space-md);
  }
  .head {
    border-bottom: 1px solid var(--border);
    background: var(--card);
    padding-top: 0.3rem;
    padding-bottom: 0.3rem;
    position: sticky;
    top: 0;
    z-index: 1;
  }
  .head span {
    min-width: 0;
    font-size: 0.66rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted-foreground);
    font-weight: 600;
  }
  .head button {
    max-width: 100%;
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    color: inherit;
    cursor: pointer;
    text-align: inherit;
  }
  .head span.r {
    text-align: right;
  }
  .head button:hover,
  .head button.on {
    color: var(--foreground);
  }
  .head .ar {
    font-size: 0.55rem;
    margin-left: 0.15rem;
  }

  a.row {
    text-decoration: none;
    color: inherit;
    border-bottom: 1px solid color-mix(in oklch, var(--border) 55%, transparent);
  }
  a.row:last-child {
    border-bottom: none;
  }
  a.row:hover {
    background: color-mix(in oklch, var(--primary) 7%, transparent);
  }
  a.row:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: -2px;
  }
  a.row > span {
    min-width: 0;
  }
  .rk {
    text-align: right;
    font-size: 0.72rem;
    color: var(--muted-foreground);
  }
  .r {
    text-align: right;
  }

  .c-name {
    display: flex;
    flex-direction: column;
    line-height: 1.25;
  }
  .c-name .nm {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  a.row:hover .nm {
    color: var(--primary);
  }
  .c-name .mt {
    font-size: 0.72rem;
    color: var(--muted-foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .c-year,
  .c-rating,
  .c-rated {
    font-size: 0.78rem;
  }

  /* Rating: the number leads, the bar makes the column comparable at a glance. */
  .c-geek .gv {
    display: block;
    font-size: 0.85rem;
    font-weight: 600;
    line-height: 1.15;
  }
  .gbar {
    display: block;
    height: 3px;
    border-radius: 2px;
    background: color-mix(in oklch, var(--border) 80%, transparent);
    overflow: hidden;
  }
  .gbar i {
    display: block;
    height: 100%;
    background: var(--chart-1);
    border-radius: 2px;
  }

  /* Complexity: five segments for the 1–5 scale it measures. */
  .c-weight {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .meter {
    display: flex;
    gap: 1.5px;
    flex: 1;
    min-width: 0;
  }
  .meter i {
    flex: 1;
    height: 0.55rem;
    border-radius: 1.5px;
    background: color-mix(in oklch, var(--border) 80%, transparent);
    overflow: hidden;
  }
  .meter b {
    display: block;
    height: 100%;
    background: var(--chart-4);
  }
  .c-weight .wv {
    font-size: 0.74rem;
    color: var(--muted-foreground);
  }

  /* Best/recommended-at: the numerals are their own legend. */
  .pips {
    display: flex;
    gap: 0.1rem;
    font-variant-numeric: tabular-nums;
  }
  .vh {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .pip {
    flex: 1;
    text-align: center;
    font-size: 0.72rem;
    line-height: 1.3;
    border-radius: 3px;
    /* "Not recommended" still has to be *perceivable*, not just dimmer than the rest —
       especially on a light background, where 45% all but disappeared. */
    color: color-mix(in oklch, var(--muted-foreground) 60%, transparent);
  }
  .pip.rec {
    color: var(--foreground);
  }
  .pip.best {
    color: var(--primary);
    font-weight: 750;
    background: color-mix(in oklch, var(--primary) 13%, transparent);
  }
  .pip.more {
    visibility: hidden;
    flex: 0 0 0.6rem;
  }
  .pip.more.vis {
    visibility: visible;
  }

  .empty {
    padding: var(--space-xl) var(--space-lg);
    text-align: center;
    color: var(--muted-foreground);
    font-size: 0.88rem;
  }

  /* Narrow canvases drop the least load-bearing numbers rather than squeezing everything. */
  @container (max-width: 62rem) {
    .row {
      grid-template-columns: 2.6rem minmax(8rem, 1fr) 3rem 4.6rem 5.2rem 5.6rem;
    }
    .c-rating,
    .c-rated {
      display: none;
    }
  }
</style>
