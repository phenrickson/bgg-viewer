<script lang="ts">
  /**
   * What you've done to the set, as removable chips.
   *
   * The old header printed the scope as a run-on sentence ("Top 10,000 · 2015–2025 ·
   * Economic, Dice Rolling · …"), which told you the state but gave you no way to act on it:
   * to undo one choice you had to remember which of eight rail controls it came from. Each
   * chip carries the patch that clears just itself, so backing out one constraint is a single
   * click, wherever it was set. That's the missing half of the filter → results loop.
   *
   * The universe dial is deliberately not a chip — it has no "off", so it belongs with the
   * count as a statement of what you're looking at.
   */
  import { activeFilters, type Scope } from './scope';

  let {
    scope = $bindable(),
    onclear
  }: { scope: Scope; onclear: () => void } = $props();

  const chips = $derived(activeFilters(scope));
</script>

{#if chips.length}
  <div class="chips">
    <span class="lead">Filters</span>
    {#each chips as c (c.id)}
      <button class="chip" onclick={() => Object.assign(scope, c.patch)} title="Remove this filter">
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
    font-size: 0.66rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 600;
    color: var(--muted-foreground);
    margin-right: 0.15rem;
  }
  .chip {
    display: inline-flex;
    align-items: baseline;
    gap: 0.3rem;
    max-width: 16rem;
    border: 1px solid color-mix(in oklch, var(--primary) 32%, var(--border));
    background: color-mix(in oklch, var(--primary) 9%, transparent);
    border-radius: 999px;
    padding: 0.12rem 0.45rem 0.12rem 0.5rem;
    font: inherit;
    font-size: 0.76rem;
    color: var(--foreground);
    cursor: pointer;
  }
  .chip:hover {
    border-color: var(--primary);
    background: color-mix(in oklch, var(--primary) 16%, transparent);
  }
  .chip:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 1px;
  }
  .kind {
    font-size: 0.66rem;
    color: var(--muted-foreground);
    white-space: nowrap;
  }
  .val {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .x {
    color: var(--muted-foreground);
    font-size: 0.85rem;
    line-height: 1;
  }
  .chip:hover .x {
    color: var(--primary);
  }
  .clear {
    background: none;
    border: none;
    padding: 0.1rem 0.25rem;
    font: inherit;
    font-size: 0.74rem;
    color: var(--muted-foreground);
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .clear:hover {
    color: var(--primary);
  }
</style>
