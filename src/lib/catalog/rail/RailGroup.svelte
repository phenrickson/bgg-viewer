<script lang="ts">
  /**
   * A collapsible rail section — the uppercase heading, the count badge, the chevron, the
   * divider above.
   *
   * This chrome had been written out four times (`FacetList`, `YearFilter`,
   * `ComplexityBands`, `Rail`'s own two groups) before anything needed a fifth. The copies
   * had already drifted — two of them called the heading `.ttl` and one called it `.lbl` —
   * which is the usual way this ends: nobody changes all four, and the rail stops looking
   * like one thing.
   *
   * Presentation only. It takes a title, an optional badge and its open state; it knows
   * nothing about `Scope`, DuckDB or the map's `ViewState`, which is what lets a rail over
   * any state model use it.
   *
   * `open` is `$bindable`, and callers must use `bind:open` rather than `<details {open}>`.
   * The latter compiles to `details.open = open()` *inside the render effect*, so it
   * re-asserts the prop every time that effect reruns — typing in a filter box inside the
   * group would slam it shut. That was a real bug in `FacetList`; see the note in
   * `Rail.svelte`.
   */
  import type { Snippet } from 'svelte';

  let {
    title,
    /** Shown as a pill when truthy — how many of this group's controls are set. */
    badge = null,
    open = $bindable(false),
    /** No divider above: the first group in a rail. */
    top = false,
    children
  }: {
    title: string;
    badge?: string | number | null;
    open?: boolean;
    top?: boolean;
    children: Snippet;
  } = $props();
</script>

<details class="grp" class:top bind:open>
  <summary>
    <span class="ttl">{title}</span>
    {#if badge}<span class="badge tnum">{badge}</span>{/if}
    <span class="chev" aria-hidden="true">›</span>
  </summary>
  <div class="body">
    {@render children()}
  </div>
</details>

<style>
  .grp {
    border-top: 1px solid var(--border);
  }
  .grp.top {
    border-top: none;
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
  .tnum {
    font-variant-numeric: tabular-nums;
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
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding-bottom: 0.6rem;
  }
</style>
