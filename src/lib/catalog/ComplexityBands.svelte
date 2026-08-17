<script lang="ts">
  /**
   * Complexity as checkboxes over named bands, shaped like the facet groups beside it.
   *
   * Weight is the one numeric measure people already discuss in words — "medium-heavy", not
   * "3.0 to 3.5" — so the bands are the vocabulary, and a `<details>` of checkboxes is the same
   * control the rail already uses for categories and mechanics. Checking two bands ORs them, so
   * "light or heavy, nothing in between" is a real selection rather than a range that quietly
   * swallows the middle.
   *
   * The shape strip still brushes a free complexity range into `weightMin`/`weightMax`; that
   * filter is untouched by this one and the two AND together like any other pair.
   */
  import { COMPLEXITY_BANDS } from './scope';

  let {
    selected = $bindable(),
    open = $bindable(false)
  }: {
    /** Checked band numbers, 1-indexed into `COMPLEXITY_BANDS`. */
    selected: number[];
    open?: boolean;
  } = $props();

  function toggle(i: number) {
    selected = selected.includes(i)
      ? selected.filter((b) => b !== i)
      : [...selected, i].sort();
  }

  /** "1.0–2.0" etc., so the words stay checkable against the numbers behind them. */
  const bounds = (min: number | null, max: number | null) =>
    min == null ? `under ${max?.toFixed(1)}` : max == null ? `${min.toFixed(1)}+` : `${min.toFixed(1)}–${max.toFixed(1)}`;
</script>

<details class="grp" bind:open>
  <summary>
    <span class="ttl">Complexity</span>
    {#if selected.length}<span class="badge tnum">{selected.length}</span>{/if}
    <span class="chev" aria-hidden="true">›</span>
  </summary>

  <div class="body">
    {#each COMPLEXITY_BANDS as b, i (b.label)}
      {@const n = i + 1}
      <label class="fac" class:on={selected.includes(n)}>
        <input type="checkbox" checked={selected.includes(n)} onchange={() => toggle(n)} />
        <span class="nm">{b.label}</span>
        <span class="ct tnum">{bounds(b.min, b.max)}</span>
      </label>
    {/each}
  </div>
</details>

<style>
  /* Chrome matched to FacetList's, so this reads as another group in the same rail rather
     than a new kind of control. */
  .grp {
    border-top: 1px solid var(--border);
  }
  summary {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 0;
    cursor: pointer;
    list-style: none;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  summary:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
    border-radius: 4px;
  }
  .ttl {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted-foreground);
    font-weight: 600;
  }
  summary:hover .ttl {
    color: var(--foreground);
  }
  .badge {
    font-size: 0.66rem;
    font-weight: 700;
    color: var(--primary);
    background: color-mix(in oklch, var(--primary) 15%, transparent);
    border-radius: 999px;
    padding: 0.02rem 0.35rem;
  }
  .chev {
    margin-left: auto;
    color: var(--muted-foreground);
    transition: transform 0.12s ease;
  }
  .grp[open] .chev {
    transform: rotate(90deg);
  }
  @media (prefers-reduced-motion: reduce) {
    .chev {
      transition: none;
    }
  }

  .body {
    padding-bottom: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }
  .fac {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.1rem 0;
    cursor: pointer;
    font-size: 0.82rem;
  }
  .fac:hover .nm {
    color: var(--primary);
  }
  .fac.on .nm {
    font-weight: 600;
  }
  .fac .nm {
    flex: 1;
    min-width: 0;
  }
  /* The numeric bounds, dimmer than the word — they verify the label, they aren't the label. */
  .fac .ct {
    color: var(--muted-foreground);
    font-size: 0.7rem;
  }
  .tnum {
    font-variant-numeric: tabular-nums;
  }
</style>
