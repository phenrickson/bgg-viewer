<script lang="ts">
  /**
   * One chart, as a full-width section down the foot of the landing page.
   *
   * Styled as an editorial section rather than a card: a hairline rule, an eyebrow, a large
   * title, and the plot running the full measure. A bordered box would read as a widget
   * parked on the page; this reads as something to scroll through, which is what it is for.
   *
   * Reuses [Scatter](../charts/Scatter.svelte), which is deliberately display-only — no
   * hit-testing, no tooltip, because these plots illustrate a claim rather than serving as a
   * way to find a game. Exactly the contract a landing section wants. Columns are drawn
   * inline: `MiniColumns` is a 46px filter control built around `onpick`, and this needs
   * neither the interaction nor the size.
   *
   * Copy is PLACEHOLDER — Phil writes the final strings.
   */
  import Scatter from '$lib/charts/Scatter.svelte';
  import { reveal } from './reveal';
  import type { Viz } from './types';

  let {
    viz,
    eyebrow,
    onprev,
    onnext
  }: { viz: Viz; eyebrow: string; onprev?: () => void; onnext?: () => void } = $props();

  const HEIGHT = 360;

  /** Column geometry as percentages, so the bars reflow with the section. */
  const cols = $derived.by(() => {
    if (viz.kind !== 'columns') return [];
    const max = Math.max(1, ...viz.bins.map(([, n]) => n));
    const every = viz.tickEvery ?? Math.ceil(viz.bins.length / 8);
    const dp = viz.precision ?? 0;
    return viz.bins.map(([v, n], i) => ({
      v,
      n,
      h: (n / max) * 100,
      // Labelled by INDEX, not value. Labelling on `v % 5` works for years and produces
      // nothing at all for a rating axis running 3.0–9.5 in half-points.
      label: i % every === 0 || i === viz.bins.length - 1 ? v.toFixed(dp) : ''
    }));
  });

  /** Horizontal bars, widths relative to the largest. */
  const rows = $derived.by(() => {
    if (viz.kind !== 'bars') return [];
    const max = Math.max(1, ...viz.bars.map((b) => b.value));
    return viz.bars.map((b) => ({ ...b, w: (b.value / max) * 100 }));
  });
</script>

<section class="sec" use:reveal aria-label={viz.title}>
  <header>
    <div class="titles">
      <p class="eyebrow">{eyebrow}</p>
      <h2>{viz.title}</h2>
      <p class="note">{viz.note}</p>
    </div>
    {#if onprev || onnext}
      <div class="nav">
        <button type="button" onclick={onprev} aria-label="Previous chart">←</button>
        <button type="button" onclick={onnext} aria-label="Next chart">→</button>
      </div>
    {/if}
  </header>

  {#if viz.kind === 'scatter'}
    <Scatter
      points={viz.points.map(([x, y]) => ({ x, y }))}
      xLabel={viz.xLabel}
      yLabel={viz.yLabel}
      height={HEIGHT}
      jitterX={0.04}
    />
  {:else if viz.kind === 'columns'}
    <div class="cols" style="height: {HEIGHT}px" role="img"
         aria-label="{viz.yLabel} by {viz.xLabel}">
      {#each cols as c (c.v)}
        <div class="col">
          <div class="bar" style="height: {c.h}%" title="{c.v}: {c.n.toLocaleString()}"></div>
          <span class="tick">{c.label}</span>
        </div>
      {/each}
    </div>
  {:else}
    <ul class="bars" aria-label="{viz.yLabel} by {viz.xLabel}">
      {#each rows as b (b.label)}
        <li>
          <span class="blabel" title={b.label}>{b.label}</span>
          <span class="track"><span class="fill" style="width: {b.w}%"></span></span>
          <span class="bval">{b.value.toLocaleString()}</span>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .sec { border-top: 1px solid var(--border); padding-top: var(--space-lg); }

  header { display: flex; align-items: start; gap: var(--space-lg); margin-bottom: var(--space-lg); }
  .titles { min-width: 0; }

  .eyebrow {
    font-size: 0.72rem; text-transform: uppercase; letter-spacing: .06em;
    color: var(--muted-foreground); font-weight: 600; margin: 0 0 .35rem;
  }
  h2 {
    font-size: var(--text-heading, clamp(1.25rem, 1rem + 1vw, 1.75rem));
    font-weight: 750; letter-spacing: -0.02em; margin: 0; text-wrap: balance;
  }
  .note {
    font-size: 0.9rem; color: var(--muted-foreground); margin: .4rem 0 0;
    line-height: 1.45; max-width: 44rem;
  }

  .nav { display: flex; gap: .3rem; margin-left: auto; flex: none; }
  .nav button {
    width: 2rem; height: 2rem; line-height: 1; border-radius: var(--radius);
    border: 1px solid var(--border); background: var(--card);
    color: var(--muted-foreground); cursor: pointer;
  }
  .nav button:hover { color: var(--foreground); border-color: var(--primary); }

  .cols { display: flex; align-items: end; gap: 3px; }
  .col { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: end; height: 100%; }
  .bar { background: var(--chart-1); border-radius: 3px 3px 0 0; min-height: 1px; }
  .bar:hover { background: var(--primary); }

  /* `overflow: visible` is load-bearing: a column is ~10px wide and "2005" is ~24px, so
     clipping to the column turned every label into "20". Only every fifth bucket is
     labelled, leaving ~5 columns of room to spill into without colliding. */
  .tick {
    font-size: 0.65rem; color: var(--muted-foreground); text-align: center;
    margin-top: .4rem; height: .9rem; overflow: visible; white-space: nowrap;
  }

  /* Grid rather than flex: the three columns must align across every row, and a label
     column sized to its longest entry (`max-content`, capped) is what keeps the tracks
     starting at the same x — the thing that makes a ranking readable at a glance. */
  .bars { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .5rem; }
  .bars li {
    display: grid; grid-template-columns: minmax(0, min(14rem, 32%)) 1fr auto;
    align-items: center; gap: var(--space-md);
  }
  .blabel {
    font-size: 0.85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .track { background: var(--muted); border-radius: 999px; height: .7rem; overflow: hidden; }
  .fill { display: block; height: 100%; background: var(--chart-1); border-radius: 999px; }
  .bars li:hover .fill { background: var(--primary); }
  .bval { font-size: 0.8rem; color: var(--muted-foreground); font-variant-numeric: tabular-nums; }
</style>
