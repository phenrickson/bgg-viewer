<script lang="ts">
  /**
   * What the numbers on the rows above actually mean.
   *
   * Scrolling past the games leads here, and the reward for scrolling is understanding rather
   * than more games. Each section opens with the question a reader actually asks — "what is a
   * game's rating?" — and answers it with a distribution over the WHOLE catalog. That is the
   * load-bearing distinction from an earlier attempt at this block, which charted the current
   * filtered set against the population: that characterises your query, which is Explore's
   * job. These charts illustrate how the measures themselves behave, so they do not move when
   * you change a chip.
   *
   * Read-only throughout. Both chart components brush or pick to filter on Explore; here they
   * take no-op handlers, because a control hidden below an explainer is a control nobody finds
   * and a fourth dial is what Discover exists to avoid.
   *
   * COPY IS PLACEHOLDER — Phil writes the prose. The structure, the queries and the charts are
   * real; every `[...]` is a slot.
   */
  import { query } from '$lib/catalog/catalog.svelte';
  import { DEFAULT_SCOPE, toWhere } from '$lib/catalog/scope';
  import {
    ratingHistogramSql,
    complexityHistogramSql,
    bestAtDistributionSql,
    RATING_BIN,
    WEIGHT_BIN
  } from '$lib/catalog/aggregates';
  import { COMPLEXITY_BANDS } from '$lib/discover/dials';
  import MiniHistogram from '$lib/charts/MiniHistogram.svelte';
  import MiniColumns from '$lib/charts/MiniColumns.svelte';
  import type { HistBin, ColBin } from '$lib/charts/types';

  type Row = { bucket: number; n: number };
  type BestRow = { count: number; n: number };
  type Summary = { total: number; median_geek: number | null; median_rating: number | null };

  let avg = $state<HistBin[]>([]);
  let geek = $state<HistBin[]>([]);
  let weight = $state<HistBin[]>([]);
  let best = $state<ColBin[]>([]);
  let summary = $state<Summary | null>(null);
  let ready = $state(false);

  const BEST_DOMAIN = [1, 2, 3, 4, 5, 6, 7, 8];
  const bins = (rows: Row[]): HistBin[] => rows.map((r) => ({ v: r.bucket, n: r.n }));

  /**
   * Geek rating, bucketed the same way as average rating so the two can share one frame. There
   * is no `geekHistogramSql` in aggregates.ts because Explore's shape strip never needed one —
   * it charts average rating. This section exists precisely to put the two side by side.
   */
  const geekHistogramSql = (where: string): string =>
    `SELECT (floor(geek_rating / ${RATING_BIN}) * ${RATING_BIN}) AS bucket, COUNT(*)::INT AS n
     FROM catalog WHERE ${where} AND geek_rating > 0
     GROUP BY bucket ORDER BY bucket`;

  /** The whole rated population — deliberately NOT the current scope. */
  const ALL = toWhere({ ...DEFAULT_SCOPE, universe: 'rated' });

  $effect(() => {
    Promise.all([
      query<Row>(ratingHistogramSql(ALL)),
      query<Row>(geekHistogramSql(ALL)),
      query<Row>(complexityHistogramSql(ALL)),
      query<BestRow>(bestAtDistributionSql(ALL)),
      query<Summary>(
        `SELECT COUNT(*)::INT AS total,
                median(geek_rating) FILTER (WHERE geek_rating > 0) AS median_geek,
                median(average_rating) FILTER (WHERE average_rating > 0) AS median_rating
         FROM catalog WHERE ${ALL}`
      )
    ])
      .then(([a, g, c, b, s]) => {
        avg = bins(a);
        geek = bins(g);
        weight = bins(c);
        best = b.map((r) => ({ v: r.count, n: r.n }));
        summary = s[0] ?? null;
        ready = true;
      })
      .catch((e) => console.error('how-it-works query failed', e));
  });

  const noBrush = () => {};
  const noPick = () => {};
  const n = (v: number | null | undefined, d = 1) => (v == null ? '—' : v.toFixed(d));
</script>

{#if ready}
  <section class="how">
    <header>
      <h2>How these numbers work</h2>
      <!-- PLACEHOLDER -->
      <p class="lede">The data comes from BoardGameGeek, a website operating a database on virtually every board game ever created, with reviews and ratings from thousands of game enthusiasts around the world.</p>
    </header>

    <!-- 1 ------------------------------------------------------------------------------ -->
    <article>
      <h3>What is a game's rating?</h3>
      <div class="body">
        <div class="prose">
          <!-- PLACEHOLDER -->
          <p>Everyone rates games on a 1–10 scale, and the average rating for a game tells you something about how good it is. 
            
            But, there's a problem with the plain average: what if only a handful of people have reviewed a game? 
            An average rating of 9.7 from ten reviews doesn't mean much; 
            on the other hand, an average rating of 8.5 from 50,000 reviews offers some strong evidence that a game is pretty good. </p>
          <p>[In order to rank games, BGG uses something known as Bayesian averaging. Every game receives thousands of dummy ratings, so that every game starts at the same baseline rating (5.5). 
            Only when a game starts to receive enough reviews will its Geek rating begin to change, as the user ratings start to overtake the dummy ratings.]</p>
          {#if summary}
            <p class="stat">
              Median average rating <b>{n(summary.median_rating, 2)}</b> ·
              median geek rating <b>{n(summary.median_geek, 2)}</b>
            </p>
          {/if}
        </div>
        <figure aria-hidden="true">
          <MiniHistogram
            bins={geek}
            backdrop={avg}
            binWidth={RATING_BIN}
            color="var(--chart-1)"
            height={110}
            label="geek rating against average rating"
            format={(v) => v.toFixed(1)}
            onbrush={noBrush}
          />
          <figcaption>
            <span class="key back"></span> Average rating
            <span class="key fore"></span> Geek rating
            <!-- PLACEHOLDER -->
            <span class="note">[One line: the squeeze is the dummy votes doing their work.]</span>
          </figcaption>
        </figure>
      </div>
    </article>

    <!-- 2 ------------------------------------------------------------------------------ -->
    <article>
      <h3>How heavy is it?</h3>
      <div class="body">
        <div class="prose">
          <!-- PLACEHOLDER -->
          <p>[Complexity — “weight” on BGG — is also a community vote, on a 1–5 scale, and it
            measures how much game there is to learn and hold in your head rather than how good
            it is. Note that it is voted by far fewer people than the rating.]</p>
          <p>[Explain the bands used on the rows above, and that the scale is lopsided: most
            games sit low, so “Heavy” is rarer than an even 1–5 split would suggest.]</p>
        </div>
        <figure aria-hidden="true">
          <MiniHistogram
            bins={weight}
            binWidth={WEIGHT_BIN}
            color="var(--chart-4)"
            height={110}
            label="complexity distribution across the catalog"
            format={(v) => v.toFixed(1)}
            onbrush={noBrush}
          />
          <figcaption class="bands">
            {#each COMPLEXITY_BANDS as b (b.label)}
              <span class="band">{b.label}<i>{b.min ?? '<'}{b.min != null && b.max != null ? '–' : ''}{b.max ?? '+'}</i></span>
            {/each}
          </figcaption>
        </figure>
      </div>
    </article>

    <!-- 3 ------------------------------------------------------------------------------ -->
    <article>
      <h3>How many people should play?</h3>
      <div class="body">
        <div class="prose">
          <!-- PLACEHOLDER -->
          <p>[The box says 2–6. The community says something more useful: for each player
            count, they vote best / recommended / not recommended, and those verdicts often
            disagree sharply with the box.]</p>
          <p>[This is the thing BGG itself cannot sort by, and the reason the “How many
            players?” question above filters on <em>best at</em> rather than on the printed
            range.]</p>
        </div>
        <figure aria-hidden="true">
          <MiniColumns
            bins={best}
            domain={BEST_DOMAIN}
            color="var(--chart-2)"
            height={110}
            label={(v) => String(v)}
            title={(v, c) => `best at ${v}: ${c.toLocaleString()} games`}
            onpick={noPick}
          />
          <figcaption>
            <!-- PLACEHOLDER -->
            <span class="note">[One line on the shape — where the catalog's verdicts pile
              up.]</span>
          </figcaption>
        </figure>
      </div>
    </article>
  </section>
{/if}

<style>
  .how { display: flex; flex-direction: column; gap: var(--space-xl); }

  header { display: flex; flex-direction: column; gap: 0.4rem; }
  h2 {
    font-size: var(--text-heading, clamp(1.3rem, 1rem + 1.2vw, 1.9rem));
    font-weight: 700; letter-spacing: -0.02em; margin: 0; color: var(--foreground);
  }
  .lede { font-size: 1rem; color: var(--muted-foreground); margin: 0; max-width: 42rem; }

  article { display: flex; flex-direction: column; gap: var(--space-sm); }
  h3 {
    font-size: 1.05rem; font-weight: 600; letter-spacing: -0.01em; margin: 0;
    color: var(--foreground);
  }

  /* Prose beside its chart on a wide canvas, stacked when there isn't room — a container
     query, so it responds to the column it is in rather than to the window. */
  .body {
    display: grid; gap: var(--space-lg);
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
    align-items: start;
  }
  .prose { display: flex; flex-direction: column; gap: 0.7rem; }
  .prose p { margin: 0; font-size: 0.92rem; line-height: 1.55; color: var(--muted-foreground); }
  .prose em { font-style: normal; color: var(--foreground); font-weight: 600; }

  .stat { font-size: 0.85rem !important; }
  .stat b { color: var(--foreground); font-variant-numeric: tabular-nums; }

  figure { margin: 0; display: flex; flex-direction: column; gap: 0.5rem; min-width: 0; }
  figcaption {
    display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem;
    font-size: 0.74rem; color: var(--muted-foreground);
  }
  .key {
    width: 0.7rem; height: 0.7rem; border-radius: 2px; display: inline-block;
  }
  .key.back { background: color-mix(in oklch, var(--muted-foreground) 40%, transparent); }
  .key.fore { background: var(--chart-1); margin-left: 0.6rem; }
  .note { flex-basis: 100%; }

  /* The five bands named under the complexity chart, so "Heavy" is located on the axis
     rather than merely defined in the prose. */
  .bands { gap: 0.9rem; }
  .band { display: inline-flex; gap: 0.25rem; align-items: baseline; }
  .band i {
    font-style: normal; font-variant-numeric: tabular-nums;
    color: color-mix(in oklch, var(--muted-foreground) 70%, transparent);
  }
</style>
