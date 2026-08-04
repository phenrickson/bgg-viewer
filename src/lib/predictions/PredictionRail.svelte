<script lang="ts">
  /**
   * The Predictions rail. Same idiom as Explore's `Rail` — pinned dials on top, collapsed
   * `<details>` groups below — but a different set of controls, because most of Explore's
   * are inapplicable to a game nobody has played yet.
   *
   * What is NOT here, and why: geek rating, average rating and ratings-count bounds all
   * filter on columns that are null for an unreleased game. "Best at N" is a community vote
   * and 68 of 4,842 upcoming games have one, so the flagship filter of the rest of the app
   * is dead weight in this room; "plays with N" (the box's own range, 99.5% populated) does
   * the job instead. Complexity filters on the *predicted* weight, since the actual is
   * missing for roughly three quarters of them.
   *
   * All copy is PLACEHOLDER — Phil writes the final strings.
   */
  import EntityFilter from '$lib/catalog/EntityFilter.svelte';
  import FacetList from '$lib/catalog/FacetList.svelte';
  import { COMPLEXITY_BANDS } from '$lib/discover/dials';
  import { activeBand, bandPatch, type PredictionScope } from './scope';

  let {
    scope = $bindable(),
    /** WHERE for the current scope — facet counts are scoped to the set you've built. */
    where,
    /** Publication years present in the data, descending. Empty until the catalog is ready. */
    years
  }: { scope: PredictionScope; where: string; years: number[] } = $props();

  const band = $derived(activeBand(scope));
  const setPlayers = (n: number) => (scope.players = scope.players === n ? null : n);
  const entityCount = $derived(scope.designers.length + scope.publishers.length);

  /**
   * The hurdle floor, as steps rather than a continuous slider. A probability filter does
   * not reward fine control — the useful question is "everything / most of them / only the
   * near-certain", and a free slider invites fiddling with a third decimal place that
   * changes the count by four games.
   */
  const HURDLE_STEPS: { label: string; value: number | null }[] = [
    { label: 'Any', value: null },
    { label: '25%+', value: 0.25 },
    { label: '50%+', value: 0.5 },
    { label: '80%+', value: 0.8 }
  ];
  const hurdleOn = (v: number | null) => (scope.minHurdle ?? null) === v;
</script>

<aside class="rail">
  <div class="pinned">
    <div class="grp top">
      <span class="lbl">Year</span>
      <div class="seg">
        {#each years as y (y)}
          <button class:on={scope.year === y} aria-pressed={scope.year === y} onclick={() => (scope.year = y)}>
            {y}
          </button>
        {:else}
          <span class="note">Loading…</span>
        {/each}
      </div>
      <p class="note">Games announced for this year. One year at a time.</p>
    </div>

    <div class="grp">
      <span class="lbl">Likely to be rated</span>
      <div class="seg">
        {#each HURDLE_STEPS as s (s.label)}
          <button class:on={hurdleOn(s.value)} aria-pressed={hurdleOn(s.value)} onclick={() => (scope.minHurdle = s.value)}>
            {s.label}
          </button>
        {/each}
      </div>
      <!-- The number is meaningless without this: most BGG entries never gather enough
           ratings to earn a geek rating, so a low chance is ordinary rather than damning. -->
      <p class="note">Most games never gather enough ratings to earn a geek rating. This drops the ones the model expects won’t.</p>
    </div>

    <div class="grp">
      <span class="lbl">Complexity <span class="hint">predicted</span></span>
      <div class="seg wrap">
        {#each COMPLEXITY_BANDS as b (b.label)}
          <button
            class:on={band?.label === b.label}
            aria-pressed={band?.label === b.label}
            onclick={() => (scope = { ...scope, ...bandPatch(scope, b) })}
          >
            {b.label.replace('Medium-', 'Med-')}
          </button>
        {/each}
      </div>
    </div>

    <div class="grp">
      <span class="lbl">Plays with</span>
      <div class="seg">
        {#each [1, 2, 3, 4, 5, 6] as n (n)}
          <button class:on={scope.players === n} aria-pressed={scope.players === n} onclick={() => setPlayers(n)}>
            {n === 6 ? '6+' : n}
          </button>
        {/each}
      </div>
      <p class="note">Supports N at the table — the box’s range, not a community vote.</p>
    </div>
  </div>

  <FacetList title="Categories" column="categories" {where} bind:selected={scope.categories} open />
  <FacetList title="Mechanics" column="mechanics" {where} bind:selected={scope.mechanics} />

  <!-- Open by default, unlike Explore's. For an unannounced game the designer and publisher
       are most of what is known, so this is a primary lens here rather than a specialist one. -->
  <details class="grp people" open>
    <summary>
      <span class="lbl">People &amp; publishers</span>
      {#if entityCount}<span class="badge tnum">{entityCount}</span>{/if}
      <span class="chev" aria-hidden="true">›</span>
    </summary>
    <div class="dbody">
      <EntityFilter label="Designer" column="designers" bind:selected={scope.designers} />
      <EntityFilter label="Publisher" column="publishers" bind:selected={scope.publishers} />
    </div>
  </details>
</aside>

<style>
  /* No card chrome — the rail is a column of controls, not content. Matches Explore's. */
  .rail {
    padding-right: var(--space-sm);
    font-size: 0.85rem;
    overflow-y: auto;
    min-height: 0;
  }
  .pinned {
    display: flex;
    flex-direction: column;
  }

  .grp {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.6rem 0;
    border-top: 1px solid var(--border);
  }
  .grp.top {
    border-top: none;
  }
  .lbl {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted-foreground);
    font-weight: 600;
  }
  .hint {
    text-transform: none;
    letter-spacing: 0;
    font-weight: 400;
  }
  .note {
    margin: 0;
    font-size: 0.7rem;
    color: var(--muted-foreground);
    line-height: 1.35;
    text-transform: none;
    letter-spacing: 0;
    font-weight: 400;
  }

  .seg {
    display: flex;
    gap: 0.25rem;
  }
  .seg.wrap {
    flex-wrap: wrap;
  }
  .seg.wrap button {
    flex: 0 1 auto;
    padding: 0.25rem 0.4rem;
    font-size: 0.74rem;
  }
  .seg button {
    flex: 1;
    min-width: 0;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--background);
    color: var(--muted-foreground);
    padding: 0.25rem 0;
    cursor: pointer;
    font: inherit;
    font-size: 0.8rem;
  }
  .seg button:hover {
    color: var(--foreground);
  }
  .seg button.on {
    border-color: var(--primary);
    color: var(--primary);
    background: color-mix(in oklch, var(--primary) 10%, transparent);
    font-weight: 600;
  }
  .seg button:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 1px;
  }

  details.grp {
    gap: 0;
    padding: 0;
  }
  details.grp summary {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 0;
    cursor: pointer;
    list-style: none;
  }
  details.grp summary::-webkit-details-marker {
    display: none;
  }
  details.grp summary:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
    border-radius: 4px;
  }
  details.grp summary:hover .lbl {
    color: var(--foreground);
  }
  .badge {
    font-size: 0.66rem;
    font-weight: 700;
    color: var(--primary);
    background: color-mix(in oklch, var(--primary) 15%, transparent);
    border-radius: 999px;
    padding: 0.02rem 0.35rem;
    font-variant-numeric: tabular-nums;
  }
  .chev {
    margin-left: auto;
    color: var(--muted-foreground);
    transition: transform 0.15s;
  }
  details[open] > summary .chev {
    transform: rotate(90deg);
  }
  .dbody {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding-bottom: 0.6rem;
  }
</style>
