<script lang="ts">
  /**
   * What you've done to the year, as removable chips — the same affordance as Explore's
   * `FilterChips` and deliberately the same shape on screen.
   *
   * A sibling rather than a reuse: `FilterChips` binds Explore's `Scope` and calls that
   * module's `activeFilters`, so sharing it would mean widening a shipped component's API
   * and touching the Explore page to match. If a third room ever needs chips, the right move
   * is to lift both onto a `chips[] + onpatch()` contract and let each room supply its own
   * `activeFilters` — not to keep adding copies.
   *
   * The year dial is deliberately not a chip: it has no "off" state, so clearing it would
   * leave the page with no population at all. It belongs with the count as a statement of
   * what you're looking at.
   */
  import { activeFilters, type PredictionScope } from './scope';

  let {
    scope = $bindable(),
    onclear
  }: { scope: PredictionScope; onclear: () => void } = $props();

  const chips = $derived(activeFilters(scope));
</script>

{#if chips.length}
  <div class="chips">
    <span class="lead">Filters</span>
    {#each chips as c (c.id)}
      <button class="chip" onclick={() => (scope = { ...scope, ...c.patch })} title="Remove this filter">
        <span class="kind">{c.kind}</span>
        <span class="val">{c.label}</span>
        <span class="x" aria-hidden="true">×</span>
      </button>
    {/each}
    <button class="clear" onclick={onclear}>Clear all</button>
  </div>
{/if}

<style>
  .chips {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.3rem;
  }
  .lead {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted-foreground);
    font-weight: 600;
    margin-right: 0.15rem;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font: inherit;
    font-size: 0.74rem;
    color: var(--foreground);
    background: var(--muted);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 0.1rem 0.3rem 0.1rem 0.5rem;
    cursor: pointer;
  }
  .chip:hover {
    border-color: var(--primary);
  }
  .chip:hover .x {
    color: var(--primary);
    opacity: 1;
  }
  .chip:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 1px;
  }
  .kind {
    color: var(--muted-foreground);
  }
  .x {
    opacity: 0.5;
    padding: 0 0.15rem;
  }
  .clear {
    font: inherit;
    font-size: 0.74rem;
    color: var(--muted-foreground);
    background: none;
    border: 0;
    padding: 0.1rem 0.25rem;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .clear:hover {
    color: var(--foreground);
  }
</style>
