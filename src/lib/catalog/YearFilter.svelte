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
    <div class="seg">
      <button type="button" onclick={() => step(-1)} aria-label="Previous year">‹</button>
      <span class="now tnum" class:set={!!label} aria-live="polite">{label || 'Any year'}</span>
      <button type="button" onclick={() => step(1)} aria-label="Next year">›</button>
      {#if label}
        <button type="button" class="x" onclick={clear} aria-label="Clear year">✕</button>
      {/if}
    </div>

    <p class="note">
      Steps one year at a time. A brushed range slides and keeps its width. Type an exact span
      under Exact numbers.
    </p>
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

  /* Deliberately the same measurements as the rail's `.seg` rows (Universe, Player count), so
     the stepper reads as one of that family rather than a bespoke widget. */
  .seg {
    display: flex;
    gap: 0.25rem;
  }
  .seg button {
    flex: none;
    width: 1.75rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--background);
    color: var(--muted-foreground);
    padding: 0.25rem 0;
    cursor: pointer;
    font: inherit;
    font-size: 0.8rem;
    line-height: 1.2;
  }
  .seg button:hover {
    border-color: var(--primary);
    color: var(--primary);
  }
  .seg button:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 1px;
  }

  /* The readout takes the slack, framed like a button so the row reads as one control. */
  .now {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid transparent;
    border-radius: 6px;
    padding: 0.25rem 0;
    font-size: 0.8rem;
    line-height: 1.2;
    color: var(--muted-foreground);
  }
  .now.set {
    border-color: var(--primary);
    color: var(--primary);
    background: color-mix(in oklch, var(--primary) 10%, transparent);
    font-weight: 600;
  }

  .x {
    font-size: 0.7rem;
  }
  .x:hover {
    border-color: var(--destructive, var(--primary));
    color: var(--destructive, var(--primary));
  }

  .note {
    margin: 0;
    font-size: 0.7rem;
    color: var(--muted-foreground);
    line-height: 1.35;
  }
</style>
