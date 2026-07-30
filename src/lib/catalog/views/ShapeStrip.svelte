<script lang="ts">
  /**
   * The shape of the current set, always on, directly above the games.
   *
   * This replaces the old Table|Summary lens. The lens made the set's shape something you
   * had to *leave the games to see*, so in practice nobody saw it; stacking full-height
   * chart panels above the table instead buried the games. A ~5rem strip is small enough to
   * read as part of the header and still carries five distributions — and, crucially, the
   * charts are the *controls*: drag a histogram to set that range, click a best-at column to
   * pick it. So the space earns its keep twice, and the rail loses six number inputs.
   *
   * Each chart draws the whole universe as a muted silhouette behind the current scope, so
   * every filter answers "which slice did I just take, and is it shaped like the catalog?".
   * `Taller` swaps in a reading height for the same five charts — one control, nothing hidden.
   *
   * `Count | Share` picks what bar height *means*, and the choice is exposed rather than
   * guessed at because neither answer is universally right (see `charts/scale.ts`). Count is
   * the default: heights are games, so your set sits inside the catalog's curve and filtering
   * on the axis you are looking at lands the coloured bars exactly on the grey ones. Its cost
   * is that a small scope flattens to the 1px floor — measured at 40 games in the top 10,000 —
   * which is when Share, renormalising each series, is the one that can still be read.
   */
  import { query } from '$lib/catalog/catalog.svelte';
  import {
    summarySql,
    ratingHistogramSql,
    complexityHistogramSql,
    ratingsCountHistogramSql,
    gamesPerYearSql,
    bestAtDistributionSql,
    RATING_BIN,
    WEIGHT_BIN,
    RATINGS_LOG_BIN,
    YEAR_DISPLAY_FLOOR,
    type Summary,
    type Bin,
    type YearCount,
    type PlayerCountBin
  } from '$lib/catalog/aggregates';
  import MiniHistogram from '$lib/charts/MiniHistogram.svelte';
  import MiniColumns from '$lib/charts/MiniColumns.svelte';
  import type { HistBin } from '$lib/charts/types';
  import type { ScaleMode } from '$lib/charts/scale';
  import { compactCount, niceCount, type Scope } from '$lib/catalog/scope';

  let {
    where,
    baseWhere,
    scope = $bindable()
  }: { where: string; baseWhere: string; scope: Scope } = $props();

  /** Player counts the best-at picker always offers, present in scope or not. */
  const BEST_AT_DOMAIN = [1, 2, 3, 4, 5, 6, 7, 8];

  type Shape = {
    rating: HistBin[];
    weight: HistBin[];
    /** Bucket values are log10(users_rated) — see RATINGS_LOG_BIN. */
    votes: HistBin[];
    year: HistBin[];
    bestAt: PlayerCountBin[];
  };
  const EMPTY: Shape = { rating: [], weight: [], votes: [], year: [], bestAt: [] };

  async function loadShape(w: string): Promise<Shape> {
    const [rating, weight, votes, year, bestAt] = await Promise.all([
      query<Bin>(ratingHistogramSql(w)),
      query<Bin>(complexityHistogramSql(w)),
      query<Bin>(ratingsCountHistogramSql(w)),
      query<YearCount>(gamesPerYearSql(w, YEAR_DISPLAY_FLOOR)),
      query<PlayerCountBin>(bestAtDistributionSql(w))
    ]);
    return {
      rating: rating.map((b) => ({ v: b.bucket, n: b.n })),
      weight: weight.map((b) => ({ v: b.bucket, n: b.n })),
      votes: votes.map((b) => ({ v: b.bucket, n: b.n })),
      year: year.map((b) => ({ v: b.year, n: b.n })),
      bestAt
    };
  }

  /** log10 value → a readable count ("3.0" → "1k"), for the ratings axis and its tooltip. */
  const fromLog = (v: number) => compactCount(Math.pow(10, v));
  /** Scope count → log10 for drawing, and back again (snapped) when the brush commits. */
  const toLog = (n: number | null) => (n == null || n <= 0 ? null : Math.log10(n));

  let shape = $state<Shape>(EMPTY);
  let backdrop = $state<Shape>(EMPTY);
  let summary = $state<Summary | null>(null);
  let tall = $state(false);
  let scaleMode = $state<ScaleMode>('count');

  // The backdrop only depends on the universe dial, so it survives every other filter change.
  let baseToken = 0;
  $effect(() => {
    const w = baseWhere;
    const mine = ++baseToken;
    loadShape(w)
      .then((s) => mine === baseToken && (backdrop = s))
      .catch((e) => console.error('backdrop shape failed', e));
  });

  let token = 0;
  $effect(() => {
    const w = where;
    const mine = ++token;
    Promise.all([loadShape(w), query<Summary>(summarySql(w))])
      .then(([s, sum]) => {
        if (mine !== token) return;
        shape = s;
        summary = sum[0] ?? null;
      })
      .catch((e) => mine === token && console.error('scope shape failed', e));
  });

  const H = $derived(tall ? 104 : 40);

  const one = (n: number) => n.toFixed(1);
  const two = (n: number | null | undefined) => (n == null ? '—' : n.toFixed(2));
  const int = (n: number) => String(Math.round(n));
  function weightWord(w: number | null | undefined): string {
    if (w == null) return '';
    if (w < 2) return 'light';
    if (w < 2.5) return 'medium-light';
    if (w < 3.5) return 'medium';
    if (w < 4) return 'medium-heavy';
    return 'heavy';
  }

  /** The player count most of this set is best at — the strip's one categorical headline. */
  const modalBestAt = $derived.by(() => {
    let top: PlayerCountBin | null = null;
    for (const b of shape.bestAt) if (!top || b.n > top.n) top = b;
    return top?.count ?? null;
  });

  const ends = (bins: HistBin[], step: number, fmt: (n: number) => string) => {
    if (!bins.length) return null;
    const vs = bins.map((b) => b.v);
    return [fmt(Math.min(...vs)), fmt(Math.max(...vs) + step)] as const;
  };
  const ratingEnds = $derived(ends(backdrop.rating.length ? backdrop.rating : shape.rating, RATING_BIN, one));
  const weightEnds = $derived(ends(backdrop.weight.length ? backdrop.weight : shape.weight, WEIGHT_BIN, one));
  const votesEnds = $derived(
    ends(backdrop.votes.length ? backdrop.votes : shape.votes, RATINGS_LOG_BIN, fromLog)
  );
  const yearEnds = $derived(ends(backdrop.year.length ? backdrop.year : shape.year, 1, int));
</script>

<section class="strip" class:tall>
  <div class="shead">
    <span class="ttl">Shape of this set <span class="hint">— drag a chart to filter</span></span>
    <div class="ctrls">
      <!-- Height means one thing at a time, and which one is a real choice — see scale.ts. -->
      <div class="seg" role="group" aria-label="Bar height">
        <button
          class:on={scaleMode === 'count'}
          aria-pressed={scaleMode === 'count'}
          title="Bar height is the number of games, on one scale for both series — your set sits inside the catalog's curve."
          onclick={() => (scaleMode = 'count')}>Count</button
        >
        <button
          class:on={scaleMode === 'share'}
          aria-pressed={scaleMode === 'share'}
          title="Bar height is each bin's share of its own set — use it when your set is too small to see against the catalog."
          onclick={() => (scaleMode = 'share')}>Share</button
        >
      </div>
      <button class="taller" onclick={() => (tall = !tall)} aria-pressed={tall}>
        {tall ? 'Shorter' : 'Taller'}
      </button>
    </div>
  </div>

  <div class="cells">
    <div class="cell">
      <div class="chead">
        <b class="tnum">{two(summary?.median_rating)}</b>
        <span class="lab">median rating</span>
      </div>
      <MiniHistogram
        bins={shape.rating}
        backdrop={backdrop.rating}
        binWidth={RATING_BIN}
        min={scope.ratingMin}
        max={scope.ratingMax}
        height={H}
        {scaleMode}
        color="var(--chart-1)"
        label="average rating distribution"
        format={one}
        onbrush={(lo, hi) => {
          scope.ratingMin = lo;
          scope.ratingMax = hi;
        }}
      />
      {#if ratingEnds}
        <div class="axis"><span>{ratingEnds[0]}</span><span>{ratingEnds[1]}</span></div>
      {/if}
    </div>

    <div class="cell">
      <div class="chead">
        <b class="tnum">{two(summary?.median_weight)}</b>
        <span class="lab">median complexity <span class="dim">{weightWord(summary?.median_weight)}</span></span>
      </div>
      <MiniHistogram
        bins={shape.weight}
        backdrop={backdrop.weight}
        binWidth={WEIGHT_BIN}
        min={scope.weightMin}
        max={scope.weightMax}
        height={H}
        {scaleMode}
        color="var(--chart-4)"
        label="complexity distribution"
        format={one}
        onbrush={(lo, hi) => {
          scope.weightMin = lo;
          scope.weightMax = hi;
        }}
      />
      {#if weightEnds}
        <div class="axis"><span>{weightEnds[0]}</span><span>{weightEnds[1]}</span></div>
      {/if}
    </div>

    <div class="cell">
      <div class="chead">
        <b class="tnum">{summary?.median_year ? int(summary.median_year) : '—'}</b>
        <span class="lab">median year <span class="dim">{YEAR_DISPLAY_FLOOR}+ shown</span></span>
      </div>
      <MiniHistogram
        bins={shape.year}
        backdrop={backdrop.year}
        binWidth={1}
        maxEdge="inclusive"
        min={scope.yearMin}
        max={scope.yearMax}
        height={H}
        {scaleMode}
        color="var(--chart-2)"
        label="games per year"
        format={int}
        onbrush={(lo, hi) => {
          scope.yearMin = lo;
          scope.yearMax = hi;
        }}
      />
      {#if yearEnds}
        <div class="axis"><span>{yearEnds[0]}</span><span>{yearEnds[1]}</span></div>
      {/if}
    </div>

    <!-- How widely known, as opposed to how highly rated: the axis that separates a hit from
         a curiosity, and the reason "minimum ratings" is a filter people reach for. -->
    <div class="cell">
      <div class="chead">
        <b class="tnum">{summary?.median_users_rated ? compactCount(summary.median_users_rated) : '—'}</b>
        <span class="lab">median # ratings <span class="dim">log scale</span></span>
      </div>
      <MiniHistogram
        bins={shape.votes}
        backdrop={backdrop.votes}
        binWidth={RATINGS_LOG_BIN}
        min={toLog(scope.usersRatedMin)}
        max={toLog(scope.usersRatedMax)}
        height={H}
        {scaleMode}
        color="var(--chart-3)"
        label="ratings-count distribution"
        format={fromLog}
        onbrush={(lo, hi) => {
          scope.usersRatedMin = lo == null ? null : niceCount(Math.pow(10, lo));
          scope.usersRatedMax = hi == null ? null : niceCount(Math.pow(10, hi));
        }}
      />
      {#if votesEnds}
        <div class="axis"><span>{votesEnds[0]}</span><span>{votesEnds[1]}</span></div>
      {/if}
    </div>

    <div class="cell">
      <div class="chead">
        <b class="tnum">{modalBestAt ?? '—'}</b>
        <span class="lab">most often best at <span class="dim">click to filter</span></span>
      </div>
      <MiniColumns
        bins={shape.bestAt.map((b) => ({ v: b.count, n: b.n }))}
        backdrop={backdrop.bestAt.map((b) => ({ v: b.count, n: b.n }))}
        domain={BEST_AT_DOMAIN}
        selected={scope.bestAt}
        height={H}
        {scaleMode}
        color="var(--chart-5)"
        title={(v, n) => `best at ${v} players — ${n.toLocaleString()} games in scope`}
        onpick={(v) => (scope.bestAt = v)}
      />
    </div>
  </div>
</section>

<style>
  .strip {
    flex: none; /* never squeezed when the games list is taller than the workspace */
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--card);
    padding: 0.5rem var(--space-md) 0.45rem;
  }
  .shead {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-md);
    margin-bottom: 0.35rem;
  }
  .ttl {
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 600;
    color: var(--muted-foreground);
  }
  .ttl .hint {
    text-transform: none;
    letter-spacing: 0;
    font-weight: 400;
  }
  /* NB: not `.grow` — that is a Tailwind utility (`flex-grow: 1`) and would stretch it. */
  .ctrls {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }
  .seg {
    display: flex;
    gap: 0.15rem;
    background: var(--muted);
    border-radius: 7px;
    padding: 0.1rem;
  }
  .seg button {
    border: none;
    background: none;
    border-radius: 5px;
    color: var(--muted-foreground);
    font: inherit;
    font-size: 0.7rem;
    padding: 0.08rem 0.4rem;
    cursor: pointer;
  }
  .seg button.on {
    background: var(--card);
    color: var(--foreground);
    font-weight: 600;
  }
  .seg button:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 1px;
  }
  .taller {
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--background);
    color: var(--muted-foreground);
    font: inherit;
    font-size: 0.72rem;
    padding: 0.1rem 0.45rem;
    cursor: pointer;
  }
  .taller:hover {
    border-color: var(--primary);
    color: var(--primary);
  }

  /* Widths follow bin count: 58 years need room, 8 player counts do not. */
  .cells {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr 1.3fr 0.8fr;
    gap: var(--space-md) var(--space-lg);
  }
  @media (max-width: 1280px) {
    .cells {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
  @media (max-width: 860px) {
    .cells {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 560px) {
    .cells {
      grid-template-columns: 1fr;
    }
  }
  .cell {
    min-width: 0;
    position: relative;
  }
  .chead {
    display: flex;
    align-items: baseline;
    gap: 0.35rem;
    margin-bottom: 0.15rem;
    min-width: 0;
  }
  .chead b {
    font-size: 1.05rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.1;
  }
  .chead .lab {
    font-size: 0.68rem;
    color: var(--muted-foreground);
    line-height: 1.2;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chead .dim {
    opacity: 0.72;
  }
  .tnum {
    font-variant-numeric: tabular-nums;
  }
  .axis {
    display: flex;
    justify-content: space-between;
    font-size: 0.62rem;
    color: var(--muted-foreground);
    font-variant-numeric: tabular-nums;
    line-height: 1;
    margin-top: 0.1rem;
  }
</style>
