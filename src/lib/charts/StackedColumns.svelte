<script lang="ts">
  /**
   * A two-series stacked sibling of [MiniColumns](MiniColumns.svelte) — same discrete-domain,
   * click-to-filter grammar (one real `<button>` per bucket, whole column is the click target),
   * but each column stacks two disjoint counts instead of drawing one foreground series over a
   * muted backdrop silhouette. There is deliberately no backdrop here: a third silhouette layer
   * behind two already-stacked foreground segments is too much to read in a chart this small,
   * and the two segments already carry their own comparison (see the explore player-count
   * charts design doc).
   */
  import type { ColBin } from './types';
  import type { ScaleMode } from './scale';

  let {
    /** Bottom segment. */
    bins = [],
    /** Top segment — stacked on `bins`. Disjoint from it, so heights sum without double count. */
    bins2 = [],
    /** Every bucket to draw, in order — including ones with no games in scope. */
    domain,
    selected = null,
    colors = ['var(--chart-1)', 'var(--chart-2)'],
    height = 46,
    scaleMode = 'count',
    label = (v: number) => String(v),
    title = (v: number, n1: number, n2: number) => `${v}: ${(n1 + n2).toLocaleString()}`,
    onpick
  }: {
    bins?: ColBin[];
    bins2?: ColBin[];
    domain: number[];
    selected?: number | null;
    colors?: [string, string];
    height?: number;
    scaleMode?: ScaleMode;
    label?: (v: number) => string;
    title?: (v: number, n1: number, n2: number) => string;
    onpick: (v: number | null) => void;
  } = $props();

  const at = (s: ColBin[], v: number) => s.find((b) => b.v === v)?.n ?? 0;
  const stackTotal = (v: number) => at(bins, v) + at(bins2, v);

  /**
   * Scaled so the TWO STACKED segments sum to at most 100% of the plot height — unlike
   * MiniColumns' `barScale`, which scales two *independent* series (foreground + backdrop)
   * against each series' own peak. Reusing that here would size each segment against its own
   * peak and let a stack's total height exceed the plot (a real bug: found via `just dev` —
   * tall columns rendered past the container and over the title). `count` scales against the
   * tallest *stack total*; `share` scales each bin's share of the grand total against the
   * largest such share — the stacked analogue of `barScale`'s two modes.
   */
  const grand = $derived(domain.reduce((sum, v) => sum + stackTotal(v), 0));
  const peak = $derived(Math.max(...domain.map(stackTotal), 1));
  const maxShare = $derived(
    Math.max(...domain.map((v) => (grand > 0 ? stackTotal(v) / grand : 0)), Number.EPSILON)
  );
  const pct = (n: number): number => {
    if (n <= 0) return 0;
    const frac = scaleMode === 'share' ? (grand > 0 ? n / grand / maxShare : 0) : n / peak;
    return Math.max(2, frac * 100);
  };
</script>

<div class="sc" style:--h="{height}px" style:--c1={colors[0]} style:--c2={colors[1]}>
  {#each domain as v (v)}
    {@const n1 = at(bins, v)}
    {@const n2 = at(bins2, v)}
    <!-- Disabled when empty: picking a bucket with no games could only yield no games. -->
    <button
      class="col"
      class:on={selected === v}
      class:empty={n1 === 0 && n2 === 0}
      aria-pressed={selected === v}
      title={title(v, n1, n2)}
      disabled={n1 === 0 && n2 === 0 && selected !== v}
      onclick={() => onpick(selected === v ? null : v)}
    >
      <span class="plot">
        <i class="seg2" style:height="{pct(n2)}%" style:bottom="{pct(n1)}%"></i>
        <i class="seg1" style:height="{pct(n1)}%"></i>
      </span>
      <span class="lab">{label(v)}</span>
    </button>
  {/each}
</div>

<style>
  .sc {
    display: flex;
    align-items: flex-end;
    gap: 0.18rem;
  }
  .col {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0;
    border: none;
    background: none;
    font: inherit;
    cursor: pointer;
    border-radius: 4px;
  }
  .plot {
    position: relative;
    display: block;
    height: var(--h);
  }
  .plot i {
    position: absolute;
    left: 0;
    right: 0;
    display: block;
    border-radius: 2px 2px 0 0;
  }
  .seg1 {
    bottom: 0;
    background: var(--c1);
  }
  .seg2 {
    background: var(--c2);
  }
  .lab {
    font-size: 0.66rem;
    color: var(--muted-foreground);
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }
  .col:hover .lab,
  .col.on .lab {
    color: var(--foreground);
  }
  .col:hover .seg1,
  .col:hover .seg2 {
    filter: brightness(1.15);
  }
  /* Selection is marked by a tinted well + a bold label, not colour alone. */
  .col.on {
    background: color-mix(in oklch, var(--primary) 14%, transparent);
    outline: 1px solid color-mix(in oklch, var(--primary) 45%, transparent);
  }
  .col.on .lab {
    font-weight: 700;
    color: var(--primary);
  }
  .col.empty {
    cursor: default;
  }
  .col:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 1px;
  }
</style>
