<script lang="ts">
  /**
   * A small discrete distribution you filter by clicking a column — the categorical
   * counterpart to [MiniHistogram](MiniHistogram.svelte). Same two-series idea — a muted
   * universe silhouette behind the solid current scope, both on one scale — but the domain is
   * a fixed list of buckets rather than a continuous axis, so selection is a pick, not a brush.
   *
   * Every column is a real `<button>`, so this one *is* keyboard-reachable.
   */
  import type { ColBin } from './types';
  import { barScale, type ScaleMode } from './scale';

  let {
    bins = [],
    backdrop = [],
    /** Every bucket to draw, in order — including ones with no games in scope. */
    domain,
    selected = null,
    color = 'var(--chart-1)',
    height = 46,
    scaleMode = 'count',
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
    scaleMode?: ScaleMode;
    label?: (v: number) => string;
    title?: (v: number, n: number) => string;
    onpick: (v: number | null) => void;
  } = $props();

  /**
   * Height mapping shared with MiniHistogram — see `scale.ts`.
   *
   * The totals here are *votes*, not games: a game best at both 3 and 4 lands in two buckets.
   * That is the right denominator for "what share of this set's best-at verdicts say 4".
   */
  const at = (s: ColBin[], v: number) => s.find((b) => b.v === v)?.n ?? 0;
  const scale = $derived(barScale([backdrop, bins], scaleMode));
  const backTotal = $derived(scale.totals[0]);
  const binTotal = $derived(scale.totals[1]);
  const pct = (n: number, total: number) =>
    n > 0 ? Math.max(2, scale.frac(n, total) * 100) : 0;
</script>

<div class="mc" style:--h="{height}px" style:--c={color}>
  {#each domain as v (v)}
    {@const n = at(bins, v)}
    <!-- Disabled when empty: picking a bucket with no games could only yield no games. -->
    <button
      class="col"
      class:on={selected === v}
      class:empty={n === 0}
      aria-pressed={selected === v}
      title={title(v, n)}
      disabled={n === 0 && selected !== v}
      onclick={() => onpick(selected === v ? null : v)}
    >
      <span class="plot">
        <i class="back" style:height="{pct(at(backdrop, v), backTotal)}%"></i>
        <i class="fore" style:height="{pct(n, binTotal)}%"></i>
        <!-- The universe's level, kept visible when the scope's share overdraws it. -->
        <i class="backline" style:bottom="{pct(at(backdrop, v), backTotal)}%"></i>
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
  .backline {
    height: 1px;
    border-radius: 0;
    background: color-mix(in oklch, var(--muted-foreground) 62%, transparent);
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
