<script lang="ts">
  /**
   * Year, with steppers — the control for *walking* the catalog by era.
   *
   * Both other paths to a year filter make you re-specify it on every move: the strip's brush is
   * a drag across ~130 bins (one pixel is about a year), and the typed pair means editing two
   * fields to say "2019". Neither lets you see 2019, then 2020, then 2021 with everything else
   * held still, which is the actual task.
   *
   * `‹` `›` shift the whole window, so one rule covers both shapes: a single year walks a year
   * at a time, and a brushed span slides while keeping its width. Nothing is discarded and there
   * is no mode to be in — see `stepYear`.
   */
  import { stepYear, type Scope } from './scope';

  let {
    scope = $bindable(),
    open = $bindable(false),
    /** Selectable range. Defaults span the catalog; `hi` allows announced-but-unreleased years. */
    bounds = { lo: 1900, hi: new Date().getFullYear() + 4 }
  }: {
    scope: Scope;
    open?: boolean;
    bounds?: { lo: number; hi: number };
  } = $props();

  /** The most recent year is the useful place to start walking from. */
  const START = new Date().getFullYear();

  const step = (d: number) => (scope = { ...scope, ...stepYear(scope, d, bounds, START) });
  const clear = () => (scope = { ...scope, yearMin: null, yearMax: null });

  /** What the group's badge and summary say: one year, a span, or an open end. */
  const label = $derived(
    scope.yearMin == null && scope.yearMax == null
      ? ''
      : scope.yearMin == null
        ? `up to ${scope.yearMax}`
        : scope.yearMax == null
          ? `${scope.yearMin}+`
          : scope.yearMin === scope.yearMax
            ? String(scope.yearMin)
            : `${scope.yearMin}–${scope.yearMax}`
  );
</script>

<details class="grp" bind:open>
  <summary>
    <span class="ttl">Year</span>
    {#if label}<span class="badge tnum">{label}</span>{/if}
    <span class="chev" aria-hidden="true">›</span>
  </summary>

  <div class="body">
    <div class="stepper">
      <button type="button" onclick={() => step(-1)} aria-label="Previous year">‹</button>
      <span class="now tnum" aria-live="polite">{label || 'Any year'}</span>
      <button type="button" onclick={() => step(1)} aria-label="Next year">›</button>
    </div>

    <div class="pair">
      <input
        type="number"
        placeholder="from"
        aria-label="Year from"
        min={bounds.lo}
        max={bounds.hi}
        bind:value={scope.yearMin}
      />
      <input
        type="number"
        placeholder="to"
        aria-label="Year to"
        min={bounds.lo}
        max={bounds.hi}
        bind:value={scope.yearMax}
      />
    </div>

    {#if label}
      <button class="clear" type="button" onclick={clear}>Clear year</button>
    {/if}
  </div>
</details>

<style>
  /* Chrome matched to the facet groups, so this is one more group rather than a new species. */
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
    gap: 0.35rem;
  }

  /* The walk. Wide arrows and a roomy readout: this is the control you click repeatedly. */
  .stepper {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  .stepper button {
    width: 1.9rem;
    flex: none;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--background);
    color: var(--muted-foreground);
    padding: 0.2rem 0;
    font: inherit;
    font-size: 0.95rem;
    line-height: 1;
    cursor: pointer;
  }
  .stepper button:hover {
    border-color: var(--primary);
    color: var(--primary);
  }
  .stepper button:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 1px;
  }
  .now {
    flex: 1;
    text-align: center;
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--foreground);
  }

  .pair {
    display: flex;
    gap: 0.25rem;
  }
  .pair input {
    flex: 1;
    min-width: 0;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--background);
    color: var(--foreground);
    padding: 0.2rem 0.35rem;
    font: inherit;
    font-size: 0.78rem;
  }
  .pair input:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 1px;
  }

  .clear {
    align-self: flex-start;
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    font-size: 0.74rem;
    color: var(--primary);
    cursor: pointer;
  }
  .clear:hover {
    text-decoration: underline;
  }
</style>
