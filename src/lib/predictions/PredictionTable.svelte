<script lang="ts">
  /**
   * Upcoming games, as a sortable table of what the model expects.
   *
   * Sorting and paging both run in DuckDB, so a sort orders the *whole* scoped set rather
   * than the page on screen. Column keys map to fixed SQL in `SORT_COLUMNS` — never user
   * input.
   *
   * Two marks, one hue, and that is the whole visual vocabulary:
   *
   *   · `.fill` — a magnitude growing from the track's start. Predicted geek rating (higher
   *     is more, and the app already draws geek rating this way in `RatingBar` and
   *     Discover's `GameRow`) and P(hurdle) (a literal 0–1 probability, where empty and
   *     full both mean something).
   *   · `.scale` — a POSITION on a low→high band, drawn as a marker rather than a fill.
   *     Complexity is 1–5 from light to heavy: a fill would read it as "3.4 out of 5", a
   *     proportion of a cap that isn't a cap. Heavier is not more of something, it is
   *     further along.
   *
   * An earlier pass gave three columns three different shapes in three different hues (a
   * bar, a five-segment meter, a second bar) — all encoding magnitude, which is one job and
   * takes one hue. The hue was carrying "which column", which the header and the column
   * position already say, and the row read as a dashboard. Everything here is `--chart-1`,
   * held back toward muted so the marks support the digits instead of competing with them;
   * `--primary` is reserved for the sorted header, so the page reads blue for data and
   * orange for interaction. No status colours: a 43% hurdle is a fact, not an error.
   *
   * All copy is PLACEHOLDER — Phil writes the final strings.
   */
  import { query } from '$lib/catalog/catalog.svelte';
  import { SORT_COLUMNS, toOrderBy, type PredictionScope, type SortKey } from './scope';

  let {
    where,
    scope = $bindable()
  }: { where: string; scope: PredictionScope } = $props();

  type Row = {
    game_id: number;
    name: string;
    year_published: number | null;
    predicted_geek_rating: number | null;
    predicted_rating: number | null;
    predicted_complexity: number | null;
    predicted_users_rated: number | null;
    predicted_hurdle_prob: number | null;
    min_players: number | null;
    max_players: number | null;
    designers: string[] | null;
    publishers: string[] | null;
    categories: string[] | null;
  };

  /**
   * The predicted-geek domain, and why it is not `RatingBar`'s 5.5–8.8.
   *
   * That domain is fixed so a bar means the same thing on every page — a rule worth keeping,
   * but it was set against the rated catalog, which reaches 8.7. Predicted geek rating for
   * upcoming games runs 5.0–6.93 with a median of 5.46, so on 5.5–8.8 more than half this
   * population renders as an empty bar and the whole set is pinned inside the left 43%. The
   * header states this domain rather than leaving it assumed.
   */
  const GEEK_LO = 4.5;
  const GEEK_HI = 7.0;
  /** The 1–5 weight scale, stated for the same reason. */
  const WEIGHT_LO = 1;
  const WEIGHT_HI = 5;

  type Col = {
    key: SortKey;
    label: string;
    /** Stated under the header when this column is the one being sorted by. */
    domain?: string;
    hint?: string;
  };
  const COLS: Col[] = [
    { key: 'year', label: 'Year' },
    { key: 'geek', label: 'P. Geek', domain: `${GEEK_LO}–${GEEK_HI}`, hint: 'predicted geek rating' },
    { key: 'rating', label: 'P. Avg', hint: 'predicted average rating' },
    { key: 'complexity', label: 'P. Complexity', domain: '1–5', hint: 'predicted weight, 1–5' },
    { key: 'hurdle', label: 'P(hurdle)', domain: '0–100%', hint: 'chance it gathers enough ratings to earn a geek rating' },
    { key: 'users', label: 'P. Ratings', hint: 'predicted number of ratings' }
  ];

  const PAGE_SIZE = 100;

  let page = $state(0);
  let rows = $state<Row[]>([]);
  let total = $state(0);
  let loading = $state(true);

  function sortBy(key: SortKey) {
    if (key === scope.sort) scope = { ...scope, desc: !scope.desc };
    // Numbers read high→low; titles read A→Z.
    else scope = { ...scope, sort: key, desc: key !== 'name' };
  }

  const pages = $derived(Math.max(1, Math.ceil(total / PAGE_SIZE)));
  const from = $derived(total === 0 ? 0 : page * PAGE_SIZE + 1);
  const to = $derived(Math.min(total, (page + 1) * PAGE_SIZE));

  // A new filter or sort always drops you back to page 1. This reads where/sort but not
  // `page`, so paging itself doesn't retrigger it — no loop.
  $effect(() => {
    where;
    scope.sort;
    scope.desc;
    page = 0;
  });

  let token = 0;
  $effect(() => {
    const w = where;
    const ord = toOrderBy(scope);
    const offset = page * PAGE_SIZE;
    const mine = ++token;
    loading = true;
    Promise.all([
      query<{ n: number }>(`SELECT COUNT(*)::INT AS n FROM catalog WHERE ${w}`),
      query<Row>(
        `SELECT game_id, name, year_published,
                predicted_geek_rating, predicted_rating, predicted_complexity,
                predicted_users_rated, predicted_hurdle_prob,
                min_players, max_players, designers, publishers, categories
         FROM catalog WHERE ${w} ORDER BY ${ord} LIMIT ${PAGE_SIZE} OFFSET ${offset}`
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
        console.error('prediction table query failed', e);
      });
  });

  const num = (n: number | null, d = 2) => (n == null ? '—' : n.toFixed(d));
  const int = (n: number | null) => (n == null ? '—' : Math.round(n).toLocaleString());
  /** "38%", "5.3%", "<1%" — a rounded "0%" and a rounded "5%" hide the range that matters. */
  function probText(v: number | null): string {
    if (v == null) return '—';
    const pc = v * 100;
    if (pc < 1) return '<1%';
    if (pc < 10) return `${pc.toFixed(1)}%`;
    return `${Math.round(pc)}%`;
  }
  const pct = (v: number | null, lo: number, hi: number) =>
    v == null ? 0 : Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));

  const list = <T,>(a: T[] | null): T[] => (a ? Array.from(a) : []);

  function playerRange(r: Row): string {
    if (r.min_players == null || r.min_players === 0) return '';
    const hi = r.max_players ?? r.min_players;
    return r.min_players === hi ? `${hi}p` : `${r.min_players}–${hi}p`;
  }

  /**
   * "1–4p · Uwe Rosenberg · Lookout Games · Farming, Economic".
   *
   * Publisher earns a place here that it does not have in Explore's row: for a game nobody
   * has played, the designer, the publisher and the categories are the whole of what is
   * known. Publisher is also the most complete field of the three — 99.7% of upcoming games
   * carry one, against 83% for designer — so it is the part most likely to say something.
   *
   * Deliberately builds more than usually fits and lets the cell ellipsis it, so a wide
   * window spends its extra pixels on a second category and a narrow one quietly drops them.
   */
  function meta(r: Row): string {
    const des = list(r.designers);
    const pub = list(r.publishers);
    const cats = list(r.categories);
    const bits = [playerRange(r)];
    if (des.length)
      bits.push(des.length > 2 ? `${des[0]} +${des.length - 1}` : des.join(', '));
    if (pub.length) bits.push(pub[0]);
    if (cats.length) bits.push(cats.slice(0, 2).join(', '));
    return bits.filter(Boolean).join(' · ');
  }
</script>

<div class="bar">
  <span class="pos">
    {#if loading && !rows.length}
      Counting…
    {:else}
      <b class="tnum">{from.toLocaleString()}–{to.toLocaleString()}</b>
      of <b class="tnum">{total.toLocaleString()}</b>
      <span class="dim">· by {SORT_COLUMNS[scope.sort].label} {scope.desc ? 'high→low' : 'low→high'}</span>
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
    <span class="c-name">
      <button class:on={scope.sort === 'name'} onclick={() => sortBy('name')}>
        Game<span class="ar">{scope.sort === 'name' ? (scope.desc ? '▼' : '▲') : ''}</span>
      </button>
    </span>
    {#each COLS as c (c.key)}
      <span class="c-{c.key} r">
        <button class:on={c.key === scope.sort} onclick={() => sortBy(c.key)} title={c.hint ?? `Sort by ${c.label}`}>
          {c.label}<span class="ar">{c.key === scope.sort ? (scope.desc ? '▼' : '▲') : ''}</span>
        </button>
        <!-- A mark means nothing without the scale it sits on, so the domain shows on the
             column being read by. Off the sorted column it would be six lines of scale
             notation nobody asked for. -->
        {#if c.key === scope.sort && c.domain}<span class="dom">{c.domain}</span>{/if}
      </span>
    {/each}
  </div>

  <div class="rows">
    {#each rows as r, i (r.game_id)}
      <a class="row" href="/games/{r.game_id}">
        <span class="rk tnum">{(page * PAGE_SIZE + i + 1).toLocaleString()}</span>

        <span class="c-name">
          <span class="nm">{r.name}</span>
          <span class="mt">{meta(r)}</span>
        </span>

        <span class="c-year r tnum dim">{r.year_published ?? '—'}</span>

        <span class="c-geek r">
          <span class="v tnum">{num(r.predicted_geek_rating)}</span>
          <span class="fill" aria-hidden="true"
            ><i style:width="{pct(r.predicted_geek_rating, GEEK_LO, GEEK_HI)}%"></i></span
          >
        </span>

        <span class="c-rating r tnum dim">{num(r.predicted_rating)}</span>

        <span class="c-complexity r">
          <span class="v tnum">{num(r.predicted_complexity, 1)}</span>
          <span class="scale" aria-hidden="true">
            {#if r.predicted_complexity != null}
              <i style:left="{pct(r.predicted_complexity, WEIGHT_LO, WEIGHT_HI)}%"></i>
            {/if}
          </span>
        </span>

        <span class="c-hurdle r">
          <span class="v tnum">{probText(r.predicted_hurdle_prob)}</span>
          <span class="fill" aria-hidden="true"
            ><i style:width="{(r.predicted_hurdle_prob ?? 0) * 100}%"></i></span
          >
        </span>

        <span class="c-users r tnum dim">{int(r.predicted_users_rated)}</span>
      </a>
    {/each}

    {#if !rows.length && !loading}
      <p class="empty">No upcoming games match this scope. Loosen a filter, or clear one from the bar.</p>
    {/if}
  </div>
</div>

<style>
  .tnum {
    font-variant-numeric: tabular-nums;
  }
  .dim {
    color: var(--muted-foreground);
  }

  .bar {
    display: flex;
    align-items: baseline;
    gap: var(--space-sm);
    flex-wrap: wrap;
    font-size: 0.8rem;
    color: var(--muted-foreground);
    padding-bottom: var(--space-sm);
    flex: none;
  }
  .bar b {
    color: var(--foreground);
  }
  .pager {
    margin-left: auto;
    display: flex;
    gap: 0.25rem;
    align-items: center;
  }
  .pager button {
    font: inherit;
    font-size: 0.76rem;
    color: var(--foreground);
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.1rem 0.45rem;
    cursor: pointer;
  }
  .pager button:hover:not(:disabled) {
    border-color: var(--primary);
    color: var(--primary);
  }
  .pager button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .pg {
    padding: 0 0.25rem;
  }

  .listwrap {
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .rows {
    overflow-y: auto;
    min-height: 0;
  }

  /* `P. Complexity` is the widest header, so it sets the floor for the numeric tracks. */
  .row {
    display: grid;
    grid-template-columns:
      2.6rem minmax(10rem, 1fr) 3.4rem 5rem 4rem 6rem 4.8rem 5rem;
    gap: var(--space-md);
    align-items: center;
    padding: 0.5rem 0.25rem;
    border-bottom: 1px solid var(--border);
    text-decoration: none;
    color: inherit;
  }
  a.row:hover {
    background: var(--muted);
  }
  .head {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--background);
    align-items: end;
    padding-bottom: 0.3rem;
  }
  .head button {
    font: inherit;
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 600;
    color: var(--muted-foreground);
    background: none;
    border: 0;
    padding: 0;
    cursor: pointer;
  }
  .head button:hover {
    color: var(--foreground);
  }
  .head button.on {
    color: var(--primary);
  }
  .head .ar {
    margin-left: 0.2rem;
    font-size: 0.7em;
  }
  .head .dom {
    display: block;
    font-size: 0.62rem;
    color: var(--muted-foreground);
    opacity: 0.75;
    line-height: 1.2;
  }
  .r {
    text-align: right;
  }
  .head .r button {
    float: right;
  }
  .head .r .dom {
    clear: both;
  }

  .rk {
    text-align: right;
    font-size: 0.8rem;
    color: var(--muted-foreground);
  }
  .c-name {
    min-width: 0;
  }
  .nm {
    display: block;
    font-weight: 550;
    font-size: 0.92rem;
    line-height: 1.2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mt {
    display: block;
    font-size: 0.76rem;
    color: var(--muted-foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-top: 0.08rem;
  }

  /* The two marks. One hue for both, held back toward muted — 100 rows of saturated
     colour would read as the content rather than as support for it. */
  .v {
    display: block;
    font-size: 0.86rem;
    font-weight: 600;
    line-height: 1.15;
  }
  .fill {
    display: block;
    height: 3px;
    border-radius: 2px;
    overflow: hidden;
    background: color-mix(in oklch, var(--border) 55%, transparent);
  }
  .fill i {
    display: block;
    height: 100%;
    /* Square at the baseline, rounded at the data end. */
    border-radius: 0 2px 2px 0;
    background: color-mix(in oklch, var(--chart-1) 60%, var(--muted-foreground));
  }
  .scale {
    display: block;
    position: relative;
    height: 9px;
  }
  .scale::before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    height: 3px;
    margin-top: -1.5px;
    border-radius: 2px;
    background: color-mix(in oklch, var(--border) 55%, transparent);
  }
  .scale i {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    border-radius: 1px;
    transform: translateX(-50%);
    background: color-mix(in oklch, var(--chart-1) 60%, var(--muted-foreground));
  }

  .empty {
    color: var(--muted-foreground);
    font-size: 0.88rem;
    padding: var(--space-lg) 0;
  }

  /* Below the numeric columns' natural width, drop the two least load-bearing rather than
     letting every track squeeze to a few pixels. P. Avg and P. Ratings go first: neither
     carries a mark, and both are on the game's detail page in full. */
  @media (max-width: 820px) {
    .row {
      grid-template-columns: 2.2rem minmax(8rem, 1fr) 3.2rem 4.6rem 5.4rem 4.4rem;
    }
    .c-rating,
    .c-users {
      display: none;
    }
  }
</style>
