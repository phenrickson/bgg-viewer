<script lang="ts">
  /**
   * A collapsible facet group (categories, mechanics, families) whose counts are **scoped**:
   * they answer "what else is in the set I've built", not "what exists in all of BGG". That
   * makes the list double as the set's own composition — which is why there is no longer a
   * separate "top categories / top mechanics" chart competing with it.
   *
   * Only a handful of rows show by default; everything else is reachable by typing, so a
   * 90-value facet costs eight lines of rail instead of ninety. Selected values are pinned to
   * the top so a choice never scrolls out of sight when the counts reshuffle.
   */
  import { query } from '$lib/catalog/catalog.svelte';
  import { facetSearchSql } from '$lib/catalog/aggregates';

  let {
    title,
    column,
    where,
    selected = $bindable(),
    open = false,
    /** Rows shown before "Show more". */
    peek = 8
  }: {
    title: string;
    column: 'categories' | 'mechanics' | 'families';
    where: string;
    selected: string[];
    open?: boolean;
    peek?: number;
  } = $props();

  type Facet = { c: string; n: number };

  let term = $state('');
  let expanded = $state(false);
  let fetched = $state<Facet[]>([]);

  // Fetch a bit past `peek` so "Show more" has something to reveal without a second query.
  const FETCH_LIMIT = 80;

  let token = 0;
  $effect(() => {
    const sql = facetSearchSql(where, column, term, FETCH_LIMIT);
    const mine = ++token;
    query<Facet>(sql)
      .then((r) => mine === token && (fetched = r))
      .catch((e) => console.error(`facet ${column} failed`, e));
  });

  const counts = $derived(new Map(fetched.map((f) => [f.c, f.n])));
  const unselected = $derived(fetched.filter((f) => !selected.includes(f.c)));
  const shown = $derived(expanded || term ? unselected : unselected.slice(0, peek));
  const hiddenCount = $derived(Math.max(0, unselected.length - shown.length));

  function toggle(value: string) {
    selected = selected.includes(value)
      ? selected.filter((v) => v !== value)
      : [...selected, value];
  }
</script>

<details class="grp" {open}>
  <summary>
    <span class="ttl">{title}</span>
    {#if selected.length}<span class="badge tnum">{selected.length}</span>{/if}
    <span class="chev" aria-hidden="true">›</span>
  </summary>

  <div class="body">
    <input
      class="find"
      type="search"
      placeholder="Filter {title.toLowerCase()}…"
      bind:value={term}
      aria-label="Filter {title.toLowerCase()}"
    />

    <div class="list" class:scroll={expanded || !!term}>
      {#each selected as v (v)}
        <label class="fac on">
          <input type="checkbox" checked onchange={() => toggle(v)} />
          <span class="nm">{v}</span>
          <span class="ct tnum">{counts.get(v)?.toLocaleString() ?? ''}</span>
        </label>
      {/each}

      {#each shown as f (f.c)}
        <label class="fac">
          <input type="checkbox" onchange={() => toggle(f.c)} />
          <span class="nm">{f.c}</span>
          <span class="ct tnum">{f.n.toLocaleString()}</span>
        </label>
      {/each}

      {#if !selected.length && !shown.length}
        <p class="none">{term ? 'Nothing matches.' : 'None in this set.'}</p>
      {/if}
    </div>

    {#if hiddenCount > 0 && !term}
      <button class="more" onclick={() => (expanded = true)}>Show {hiddenCount} more</button>
    {:else if expanded && !term}
      <button class="more" onclick={() => (expanded = false)}>Show fewer</button>
    {/if}
  </div>
</details>

<style>
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
  .find {
    width: 100%;
    min-width: 0;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--background);
    color: var(--foreground);
    padding: 0.22rem 0.4rem;
    font: inherit;
    font-size: 0.78rem;
  }
  .find:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 1px;
  }
  .list.scroll {
    max-height: 16rem;
    overflow-y: auto;
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
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .fac .ct {
    color: var(--muted-foreground);
    font-size: 0.7rem;
  }
  .tnum {
    font-variant-numeric: tabular-nums;
  }
  .none {
    margin: 0.2rem 0;
    font-size: 0.76rem;
    color: var(--muted-foreground);
  }
  .more {
    align-self: flex-start;
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    font-size: 0.74rem;
    color: var(--primary);
    cursor: pointer;
  }
  .more:hover {
    text-decoration: underline;
  }
</style>
