<script lang="ts">
  /**
   * A small discrete distribution you filter by clicking a column — the categorical
   * counterpart to [MiniHistogram](MiniHistogram.svelte). Same two-series idea (muted
   * universe silhouette behind the solid current scope, each on its own scale, so the
   * comparison is of shape) but the domain is a fixed list of buckets rather than a
   * continuous axis, so selection is a pick, not a brush.
   *
   * Every column is a real `<button>`, so this one *is* keyboard-reachable.
   */
  import type { ColBin } from './types';

  let {
    bins = [],
    backdrop = [],
    /** Every bucket to draw, in order — including ones with no games in scope. */
    domain,
    selected = null,
    color = 'var(--chart-1)',
    height = 46,
    label = (v: number) => String(v),
    title = (v: number, n: number) => `${v}: ${n.toLocaleString()}`,
    onpick
  }: {
    bins?: ColBin[];
    backdrop?: ColBin[];
    domain: number[];
    selected?: number | null;
    color?: string;
    height?: number;
    label?: (v: number) => string;
    title?: (v: number, n: number) => string;
    onpick: (v: number | null) => void;
  } = $props();

  const peak = (s: ColBin[]) => Math.max(1, ...s.map((b) => b.n));
  const at = (s: ColBin[], v: number) => s.find((b) => b.v === v)?.n ?? 0;
  const backPeak = $derived(peak(backdrop));
  const binPeak = $derived(peak(bins));
  const pct = (n: number, max: number) => (n > 0 ? Math.max(2, (n / max) * 100) : 0);
</script>

<div class="mc" style:--h="{height}px" style:--c={color}>
  {#each domain as v (v)}
    {@const n = at(bins, v)}
    <button
      class="col"
      class:on={selected === v}
      class:empty={n === 0}
      aria-pressed={selected === v}
      title={title(v, n)}
      onclick={() => onpick(selected === v ? null : v)}
    >
      <span class="plot">
        <i class="back" style:height="{pct(at(backdrop, v), backPeak)}%"></i>
        <i class="fore" style:height="{pct(n, binPeak)}%"></i>
      </span>
      <span class="lab">{label(v)}</span>
    </button>
  {/each}
</div>

<style>
  .mc {
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
    bottom: 0;
    left: 0;
    right: 0;
    display: block;
    border-radius: 2px 2px 0 0;
  }
  .back {
    background: color-mix(in oklch, var(--muted-foreground) 30%, transparent);
  }
  .fore {
    background: var(--c);
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
  .col:hover .fore {
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
