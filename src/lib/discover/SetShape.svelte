<script lang="ts">
  /**
   * What the current set looks like — the shape of the answer the three questions produced.
   *
   * Three distributions, one per dial, each drawn twice: the whole rated population as a
   * muted silhouette behind the current set in colour. The backdrop is the point. On its own
   * a histogram of the answer says "here are some ratings"; against the population it says
   * "you have taken the heavy end", which is the fact a coarse three-chip filter can't
   * otherwise tell you about itself.
   *
   * Read-only, deliberately. `MiniHistogram` and `MiniColumns` both brush/pick to filter on
   * Explore, and wiring that here would hand Discover a fourth, finer control — the exact
   * failure mode this page exists to avoid. They take no-op handlers and are marked
   * `aria-hidden`: the numbers they encode are already stated by the count line and the rows,
   * so nothing is lost to a reader who can't see them.
   *
   * Best-at is the one distribution Explore's shape strip does not draw, and the most useful
   * of the three here — it answers "is this category actually any good at my table size?"
   */
  import { query } from '$lib/catalog/catalog.svelte';
  import { toWhere, universeWhere, type Scope } from '$lib/catalog/scope';
  import {
    ratingHistogramSql,
    complexityHistogramSql,
    bestAtDistributionSql,
    RATING_BIN,
    WEIGHT_BIN
  } from '$lib/catalog/aggregates';
  import MiniHistogram from '$lib/charts/MiniHistogram.svelte';
  import MiniColumns from '$lib/charts/MiniColumns.svelte';
  import type { HistBin, ColBin } from '$lib/charts/types';

  let { scope }: { scope: Scope } = $props();

  type Row = { bucket: number; n: number };
  type BestRow = { count: number; n: number };

  let rating = $state<HistBin[]>([]);
  let ratingBg = $state<HistBin[]>([]);
  let weight = $state<HistBin[]>([]);
  let weightBg = $state<HistBin[]>([]);
  let best = $state<ColBin[]>([]);
  let bestBg = $state<ColBin[]>([]);
  let ready = $state(false);

  /** Player counts drawn, whether or not any game in scope is best at them. */
  const BEST_DOMAIN = [1, 2, 3, 4, 5, 6, 7, 8];

  const bins = (rows: Row[]): HistBin[] => rows.map((r) => ({ v: r.bucket, n: r.n }));
  const cols = (rows: BestRow[]): ColBin[] => rows.map((r) => ({ v: r.count, n: r.n }));

  /**
   * The backdrop is the universe alone — every dial dropped. It only changes when the
   * universe does, which on Discover is never, so it is fetched in the same pass and simply
   * recomputed; six small aggregates over 35k rows land in well under 100ms.
   */
  let token = 0;
  $effect(() => {
    const w = toWhere(scope);
    const u = universeWhere(scope);
    const mine = ++token;
    Promise.all([
      query<Row>(ratingHistogramSql(w)),
      query<Row>(ratingHistogramSql(u)),
      query<Row>(complexityHistogramSql(w)),
      query<Row>(complexityHistogramSql(u)),
      query<BestRow>(bestAtDistributionSql(w)),
      query<BestRow>(bestAtDistributionSql(u))
    ])
      .then(([r, rb, c, cb, b, bb]) => {
        if (mine !== token) return;
        rating = bins(r);
        ratingBg = bins(rb);
        weight = bins(c);
        weightBg = bins(cb);
        best = cols(b);
        bestBg = cols(bb);
        ready = true;
      })
      .catch((e) => {
        if (mine !== token) return;
        console.error('set shape query failed', e);
      });
  });

  /** Read-only: the charts require handlers, and these decline to do anything. */
  const noBrush = () => {};
  const noPick = () => {};
</script>

{#if ready}
  <section class="shape">
    <h2>What this set looks like</h2>
    <p class="sub">
      Your games in colour, against every rated game in grey.
    </p>

    <div class="grid" aria-hidden="true">
      <div class="cell">
        <span class="lbl">Rating</span>
        <MiniHistogram
          bins={rating}
          backdrop={ratingBg}
          binWidth={RATING_BIN}
          color="var(--chart-1)"
          height={54}
          label="rating distribution"
          format={(n) => n.toFixed(1)}
          onbrush={noBrush}
        />
      </div>

      <div class="cell">
        <span class="lbl">Complexity</span>
        <MiniHistogram
          bins={weight}
          backdrop={weightBg}
          binWidth={WEIGHT_BIN}
          color="var(--chart-4)"
          height={54}
          label="complexity distribution"
          format={(n) => n.toFixed(1)}
          onbrush={noBrush}
        />
      </div>

      <div class="cell">
        <span class="lbl">Best at</span>
        <MiniColumns
          bins={best}
          backdrop={bestBg}
          domain={BEST_DOMAIN}
          color="var(--chart-2)"
          height={54}
          label={(v) => String(v)}
          title={(v, n) => `best at ${v}: ${n.toLocaleString()} games`}
          onpick={noPick}
        />
      </div>
    </div>
  </section>
{/if}

<style>
  .shape { display: flex; flex-direction: column; gap: 0.35rem; }
  h2 {
    font-size: 1.05rem; font-weight: 600; letter-spacing: -0.01em;
    color: var(--foreground); margin: 0;
  }
  .sub { font-size: 0.85rem; color: var(--muted-foreground); margin: 0 0 var(--space-sm); }

  /* Reflows to one column on a narrow canvas without a breakpoint. */
  .grid {
    display: grid; gap: var(--space-lg);
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
  }
  .cell { display: flex; flex-direction: column; gap: 0.3rem; min-width: 0; }
  .lbl {
    font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em;
    color: var(--muted-foreground); font-weight: 600;
  }

  /* The charts are decorative here — no brushing, so nothing invites a click. */
  .cell :global(svg) { cursor: default; }
</style>
