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
  import { catalog, query } from '$lib/catalog/catalog.svelte';
  import RatingBar from '$lib/catalog/encodings/RatingBar.svelte';
  import PlayerPips from '$lib/catalog/encodings/PlayerPips.svelte';
  import ComplexityMeter from '$lib/catalog/encodings/ComplexityMeter.svelte';
  import type { Scope } from '$lib/catalog/scope';

  let { where, universe = 'top10k' }: { where: string; universe?: Scope['universe'] } = $props();

  /**
   * The upcoming universe reads the model's estimates rather than what happened — the same
   * switch `columnsFor` makes for the filters, applied to the columns on screen. Two column
   * sets in one table rather than a second table: the paging, the sorting-in-DuckDB and the
   * row chrome are identical, and only what each cell reads differs.
   */
  const upcoming = $derived(universe === 'upcoming');

  /**
   * The predicted-geek domain, and why it is not `RatingBar`'s 5.5–8.8.
   *
   * That domain is fixed so a bar means the same thing on every page — a rule worth keeping,
   * but it was set against the rated catalog, which reaches 8.7. Predicted geek rating for
   * upcoming games runs 5.0–6.93 with a median of 5.46, so on 5.5–8.8 more than half this
   * population would render as an empty bar and the whole set would sit inside the left 43%.
   * The header states the domain when you are sorting by it, rather than leaving it assumed.
   */
  const PRED_GEEK_LO = 4.5;
  const PRED_GEEK_HI = 7.0;

  type Row = {
    game_id: number;
    name: string;
    /** From the separate thumbnails artifact — NULL until it has loaded, or if a game has none. */
    thumbnail: string | null;
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
    publishers: string[] | null;
    categories: string[] | null;
    predicted_geek_rating: number | null;
    predicted_rating: number | null;
    predicted_complexity: number | null;
    predicted_users_rated: number | null;
    predicted_hurdle_prob: number | null;
  };

  type Col = { key: string; label: string; align: 'l' | 'r'; sql: string; hint?: string; domain?: string };
  const COLS_RATED: Col[] = [
    { key: 'name', label: 'Game', align: 'l', sql: 'lower(name)' },
    { key: 'year', label: 'Year', align: 'r', sql: 'year_published' },
    { key: 'geek', label: 'Geek', align: 'l', sql: 'geek_rating', hint: 'BGG’s ranked rating' },
    { key: 'rating', label: 'Avg', align: 'r', sql: 'average_rating', hint: 'raw average rating' },
    { key: 'weight', label: 'Complexity', align: 'l', sql: 'average_weight', hint: 'weight, 1–5' },
    { key: 'best', label: 'Best at', align: 'l', sql: 'best_player_counts[1]', hint: 'bold = best · mid = also recommended' },
    { key: 'rated', label: 'Ratings', align: 'r', sql: 'users_rated' }
  ];
  /**
   * `Best at` has no upcoming counterpart and is dropped rather than translated: it is a
   * community vote, and 68 of 4,842 upcoming games have one because nobody has played them.
   * P(hurdle) takes the slot — the chance a game ever gathers enough ratings to be ranked at
   * all, which is the thing that explains why a strong-looking row is not.
   */
  const COLS_UPCOMING: Col[] = [
    { key: 'name', label: 'Game', align: 'l', sql: 'lower(name)' },
    { key: 'year', label: 'Year', align: 'r', sql: 'year_published' },
    { key: 'geek', label: 'P. Geek', align: 'l', sql: 'predicted_geek_rating', hint: 'predicted geek rating', domain: `${PRED_GEEK_LO}–${PRED_GEEK_HI}` },
    { key: 'rating', label: 'P. Avg', align: 'r', sql: 'predicted_rating', hint: 'predicted average rating' },
    { key: 'weight', label: 'P. Complexity', align: 'l', sql: 'predicted_complexity', hint: 'predicted weight, 1–5', domain: '1–5' },
    { key: 'hurdle', label: 'P(hurdle)', align: 'l', sql: 'predicted_hurdle_prob', hint: 'chance it gathers enough ratings to earn a geek rating', domain: '0–100%' },
    { key: 'rated', label: 'P. Ratings', align: 'r', sql: 'predicted_users_rated' }
  ];
  const COLS = $derived(upcoming ? COLS_UPCOMING : COLS_RATED);
  const PAGE_SIZE = 100;

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

  // Falls back to the geek column when the key isn't in this universe's set — switching to
  // Upcoming while sorted by `best` would otherwise leave `sortCol` undefined mid-query.
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
    // Read so a thumbnails load after first render re-runs this query and repaints rows
    // with real art — the LEFT JOIN itself is unconditional (see catalog.svelte.ts), this
    // is only what makes the *second* pass happen once there's something new to show.
    catalog.thumbnailsReady;
    loading = true;
    Promise.all([
      query<{ n: number }>(`SELECT COUNT(*)::INT AS n FROM catalog WHERE ${w}`),
      query<Row>(
        `SELECT c.game_id, c.name, c.year_published, c.geek_rating, c.average_rating,
                c.average_weight, c.users_rated, c.min_players, c.max_players,
                c.best_player_counts, c.recommended_player_counts,
                c.designers, c.publishers, c.categories,
                c.predicted_geek_rating, c.predicted_rating, c.predicted_complexity,
                c.predicted_users_rated, c.predicted_hurdle_prob, t.thumbnail
         FROM catalog c LEFT JOIN thumbnails t USING (game_id)
         WHERE ${w} ORDER BY ${ord}, game_id LIMIT ${PAGE_SIZE} OFFSET ${offset}`
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

  function playerRange(r: Row): string {
    if (r.min_players == null) return '';
    const hi = r.max_players ?? r.min_players;
    return r.min_players === hi ? `${hi}p` : `${r.min_players}–${hi}p`;
  }

  /**
   * "1–4p · Stefan Feld · Economic, Dice" — what the game *is*, under its title.
   *
   * Deliberately builds more than usually fits and lets the cell ellipsis it. That makes the
   * line self-adjusting: a wide window spends its extra pixels on a third category and the
   * rest of the design credit, a narrow one quietly drops them, and neither needs a
   * breakpoint or a second render path.
   */
  function meta(r: Row): string {
    const des = list(r.designers);
    const cats = list(r.categories);
    const bits = [playerRange(r)];
    if (des.length) bits.push(des.length > 3 ? `${des.slice(0, 2).join(', ')} +${des.length - 2}` : des.join(', '));
    // Publisher earns a place only in the upcoming universe. For a game nobody has played,
    // the designer, the publisher and the categories are the whole of what is known — and
    // publisher is the most complete of the three (99.7% against 83% for designer). In the
    // rated universes the ratings say more than the imprint does, and it is one bit too many.
    if (upcoming) {
      const pub = list(r.publishers);
      if (pub.length) bits.push(pub[0]);
    }
    if (cats.length) bits.push(cats.slice(0, upcoming ? 2 : 3).join(', '));
    return bits.filter(Boolean).join(' · ');
  }

  /** "38%", "5.3%", "<1%" — a rounded "0%" and a rounded "5%" hide the range that matters. */
  function probText(v: number | null): string {
    if (v == null) return '—';
    const pc = v * 100;
    if (pc < 1) return '<1%';
    if (pc < 10) return `${pc.toFixed(1)}%`;
    return `${Math.round(pc)}%`;
  }
  /** Fill of the predicted-geek bar, as a percentage of its stated domain. */
  const pct = (v: number | null, lo: number, hi: number) =>
    v == null ? 0 : Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));

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
  <div class="head row" class:pred={upcoming}>
    <span class="rk">#</span>
    <span class="c-thumb" aria-hidden="true"></span>
    {#each COLS as c (c.key)}
      <span class="c-{c.key}" class:r={c.align === 'r'}>
        <button class:on={c.key === sortKey} onclick={() => sortBy(c)} title={c.hint ?? `Sort by ${c.label}`}>
          {c.label}<span class="ar">{c.key === sortKey ? (desc ? '▼' : '▲') : ''}</span>
        </button>
        <!-- A mark means nothing without the scale it sits on, so the domain shows on the
             column being read by. On every column it would be a row of scale notation
             nobody asked for. -->
        {#if c.key === sortKey && c.domain}<span class="dom">{c.domain}</span>{/if}
      </span>
    {/each}
  </div>

  <div class="rows">
    {#each rows as r, i (r.game_id)}
      <a class="row" class:pred={upcoming} href="/games/{r.game_id}">
        <span class="rk tnum">{(page * PAGE_SIZE + i + 1).toLocaleString()}</span>

        {#if r.thumbnail}
          <img class="c-thumb" src={r.thumbnail} alt="" loading="lazy" aria-hidden="true" />
        {:else}
          <!-- Same single-letter placeholder What's New already uses at this row density. -->
          <span class="c-thumb ph" aria-hidden="true">{r.name.charAt(0).toUpperCase()}</span>
        {/if}

        <span class="c-name">
          <span class="nm">{r.name}</span>
          <span class="mt">{meta(r)}</span>
        </span>

        <span class="c-year r tnum">{r.year_published ?? '—'}</span>

        {#if upcoming}
          <!-- Each cell wears the encoding its rated twin already wears, so a reader learns
               each measure once: a bar for the rating, the five-segment meter for complexity.
               The only thing that changes between universes is which column is read. The bar's
               domain is the exception, and it is stated in the header rather than assumed —
               `RatingBar`'s 5.5–8.8 was set against a catalog that reaches 8.7, and this
               population tops out at 6.93. -->
          <span class="c-geek">
            <span class="pv tnum">{num(r.predicted_geek_rating)}</span>
            <span class="fill" aria-hidden="true"
              ><i style:width="{pct(r.predicted_geek_rating, PRED_GEEK_LO, PRED_GEEK_HI)}%"></i></span
            >
          </span>

          <span class="c-rating r tnum dim">{num(r.predicted_rating)}</span>

          <!-- The SAME five-segment meter the rated universe uses, pointed at the predicted
               column. It is the same measure on the same 1-5 scale, so it gets the same
               encoding — a second one invented for this room would mean a reader had to
               learn complexity twice. -->
          <span class="c-weight">
            <ComplexityMeter weight={r.predicted_complexity} height="0.55rem" />
            <span class="wv tnum">{num(r.predicted_complexity, 1)}</span>
          </span>

          <!-- The same bar as predicted geek, in a narrower slot. The column inherited
               ~5.6rem from `Best at`'s six numerals, which is more than "97%" and a track
               need; the surplus goes to the game's name, where publisher and categories
               were truncating mid-word. -->
          <span class="c-hurdle">
            <span class="pv tnum">{probText(r.predicted_hurdle_prob)}</span>
            <span class="fill" aria-hidden="true"
              ><i style:width="{(r.predicted_hurdle_prob ?? 0) * 100}%"></i></span
            >
          </span>

          <span class="c-rated r tnum dim">{r.predicted_users_rated == null ? '—' : Math.round(r.predicted_users_rated).toLocaleString()}</span>
        {:else}
          <span class="c-geek"><RatingBar value={r.geek_rating} /></span>

          <span class="c-rating r tnum dim">{num(r.average_rating)}</span>

          <span class="c-weight">
            <ComplexityMeter weight={r.average_weight} height="0.55rem" />
            <span class="wv tnum">{num(r.average_weight, 1)}</span>
          </span>

          <span class="c-best">
            <PlayerPips best={r.best_player_counts} recommended={r.recommended_player_counts} />
          </span>

          <span class="c-rated r tnum dim">{(r.users_rated ?? 0).toLocaleString()}</span>
        {/if}
      </a>
    {/each}

    {#if !rows.length && !loading}
      <p class="empty">No games match this scope. Loosen a filter above, or clear one from the bar.</p>
    {/if}
  </div>
</div>

<style>
  /* `flex: none` on everything above the list, so shrinking the workspace squeezes the rows
     rather than crushing the count, the pager or the charts. */
  .bar {
    flex: none;
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

  /* Grows to its rows, then stops at the space available — `flex: 1` instead would stretch a
     five-result panel to the full viewport, leaving a screen of empty bordered card that
     reads as "something failed to load". `0 1 auto` sizes to content but still shrinks (and
     hands the overflow to `.rows`) once the list is longer than the workspace. */
  .listwrap {
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex: 0 1 auto;
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

  /* One grid template shared by the header and every row, so they can't drift.
     Every column takes a share of the surplus — `minmax(floor, Nfr)` — rather than a fixed
     rem. With the title column as the only `1fr` it swallowed *all* the extra width on a wide
     screen: at 2400px that left ~1000px of nothing between a game's name and its numbers,
     which were crammed against the right edge. Spreading the surplus turns the same width into
     ordinary table spacing, and the weights keep the proportions roughly as they are at
     laptop width. */
  .row {
    display: grid;
    grid-template-columns:
      minmax(2.4rem, 0.25fr)
      1.85rem
      minmax(11rem, 3.2fr)
      minmax(3rem, 0.45fr)
      minmax(4.6rem, 0.7fr)
      minmax(2.8rem, 0.45fr)
      minmax(5.2rem, 0.9fr)
      minmax(5.6rem, 0.9fr)
      minmax(4.4rem, 0.6fr);
    align-items: center;
    gap: 0 var(--space-md);
    padding: 0.34rem var(--space-md);
  }
  /* Fixed at What's New's own dense-table size — Discover's 3.5rem card art would swamp a
     row this compact. Same footprint for the real image and the placeholder, so a
     background thumbnails load never reflows the row it fills in. */
  .c-thumb {
    width: 1.85rem; height: 1.85rem; border-radius: 6px; flex: none;
    object-fit: cover;
    background: color-mix(in oklch, var(--muted) 70%, var(--card));
  }
  .c-thumb.ph {
    display: flex; align-items: center; justify-content: center;
    color: var(--muted-foreground); font-size: 0.68rem; font-weight: 650;
  }
  .head .c-thumb { background: none; }
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

  /* The encodings are capped, so a wide column gives them breathing room rather than
     stretching them: a 290px five-segment meter reads as decoration, not as a 1-5 scale. */
  .c-weight {
    max-width: 7rem;
  }

  /* Complexity: five segments for the 1–5 scale it measures — see ComplexityMeter.svelte. */
  .c-weight {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .c-weight :global(.meter) {
    flex: 1;
    min-width: 0;
  }
  .c-weight .wv {
    font-size: 0.74rem;
    color: var(--muted-foreground);
  }

  /* ---- the upcoming universe's two marks ------------------------------------------------
     One hue for both, held back toward muted: a hundred rows of saturated colour reads as
     the content rather than as support for it. `--primary` stays reserved for the sorted
     header, so the table reads blue for data and orange for interaction. */
  .pv {
    display: block;
    font-size: 0.82rem;
    font-weight: 600;
    line-height: 1.15;
  }
  /* A magnitude growing from the track's start. */
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
  /* The upcoming grid differs from the rated one in a single slot: `Best at` carries six
     numerals and their emphasis, P(hurdle) carries "97%". Narrowing it and spending the
     surplus on the name is what stops "Industry / Manufacturin…" mid-word. */
  .row.pred {
    grid-template-columns:
      minmax(2.4rem, 0.25fr)
      1.85rem
      minmax(11rem, 4.1fr)
      minmax(3rem, 0.45fr)
      minmax(4.6rem, 0.7fr)
      minmax(2.8rem, 0.45fr)
      minmax(5.2rem, 0.9fr)
      minmax(4.2rem, 0.55fr)
      minmax(4.4rem, 0.6fr);
  }
  .head .dom {
    display: block;
    font-size: 0.6rem;
    text-transform: none;
    letter-spacing: 0;
    font-weight: 400;
    opacity: 0.75;
    line-height: 1.2;
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
      grid-template-columns:
        minmax(2.4rem, 0.25fr)
        1.85rem
        minmax(8rem, 3.2fr)
        minmax(3rem, 0.45fr)
        minmax(4.6rem, 0.7fr)
        minmax(5.2rem, 0.9fr)
        minmax(5.6rem, 0.9fr);
    }
    .row.pred {
      grid-template-columns:
        minmax(2.4rem, 0.25fr)
        1.85rem
        minmax(8rem, 4.1fr)
        minmax(3rem, 0.45fr)
        minmax(4.6rem, 0.7fr)
        minmax(5.2rem, 0.9fr)
        minmax(4.2rem, 0.55fr);
    }
    .c-rating,
    .c-rated {
      display: none;
    }
  }
</style>
