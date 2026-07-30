<script lang="ts">
  /**
   * The scope rail — every filter, but ordered so you meet ~4 controls instead of ~40.
   *
   * The old rail showed eight groups at equal weight, including thirty always-open
   * checkboxes; it stood twice as tall as the games it was filtering. The fix is priority,
   * not fewer capabilities:
   *
   *   1. **Always open** — the name search, the universe dial, and player count. The three
   *      things you reach for first, and the ones with no chart to live on.
   *   2. **Collapsed, counted** — categories, mechanics, families, people. A shut `<details>`
   *      with a badge is one line and still says "you have two of these set".
   *   3. **Moved to the shape strip** — year, complexity, rating, ratings count and best-at.
   *      Ranges are easier to *see* than to type, so they're brushed on their own
   *      distributions; the exact numbers stay here under "Exact numbers" for typing and for
   *      keyboard users.
   *
   * `<details>` does the collapsing natively, so it's keyboard- and screen-reader-correct
   * with no JS, and the browser (not us) owns the open/close state.
   */
  import type { Scope } from './scope';
  import EntityFilter from './EntityFilter.svelte';
  import FacetList from './FacetList.svelte';

  let {
    scope = $bindable(),
    /** WHERE for the current scope — facet counts are scoped to the set you've built. */
    where
  }: { scope: Scope; where: string } = $props();

  const setPlayers = (n: number) => (scope.players = scope.players === n ? null : n);
  const entityCount = $derived(
    scope.designers.length + scope.artists.length + scope.publishers.length + scope.families.length
  );
  const exactCount = $derived(
    [
      scope.yearMin,
      scope.yearMax,
      scope.weightMin,
      scope.weightMax,
      scope.ratingMin,
      scope.ratingMax,
      scope.usersRatedMin,
      scope.usersRatedMax,
      scope.geekMin
    ].filter((v) => v != null).length
  );
</script>

<aside class="rail">
  <div class="pinned">
    <label class="find">
      <span class="vh">Search game names in this set</span>
      <input type="search" placeholder="Name contains…" bind:value={scope.q} />
    </label>

    <div class="grp top">
      <span class="lbl">Universe</span>
      <div class="seg two">
        <button
          class:on={scope.universe === 'top10k'}
          aria-pressed={scope.universe === 'top10k'}
          onclick={() => (scope.universe = 'top10k')}>Top 10,000</button
        >
        <button
          class:on={scope.universe === 'rated'}
          aria-pressed={scope.universe === 'rated'}
          onclick={() => (scope.universe = 'rated')}>All rated</button
        >
      </div>
      <p class="note">
        {scope.universe === 'top10k'
          ? 'BGG’s ranked top 10,000, by geek rating.'
          : 'Everything with 30+ ratings — about 35,000.'}
      </p>
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
      <p class="note">Supports N at the table. For <em>best</em> at N, use the shape strip.</p>
    </div>
  </div>

  <FacetList title="Categories" column="categories" {where} bind:selected={scope.categories} open />
  <FacetList title="Mechanics" column="mechanics" {where} bind:selected={scope.mechanics} />
  <FacetList title="Series & families" column="families" {where} bind:selected={scope.families} peek={6} />

  <details class="grp people">
    <summary>
      <span class="lbl">People &amp; publishers</span>
      {#if entityCount}<span class="badge tnum">{entityCount}</span>{/if}
      <span class="chev" aria-hidden="true">›</span>
    </summary>
    <div class="dbody">
      <EntityFilter label="Designer" column="designers" bind:selected={scope.designers} />
      <EntityFilter label="Artist" column="artists" bind:selected={scope.artists} />
      <EntityFilter label="Publisher" column="publishers" bind:selected={scope.publishers} />
    </div>
  </details>

  <details class="grp exact">
    <summary>
      <span class="lbl">Exact numbers</span>
      {#if exactCount}<span class="badge tnum">{exactCount}</span>{/if}
      <span class="chev" aria-hidden="true">›</span>
    </summary>
    <div class="dbody">
      <p class="note">Typed bounds — the same fields the shape strip brushes.</p>
      <div class="num">
        <span class="lbl sm">Year</span>
        <div class="pair">
          <input type="number" placeholder="from" aria-label="Year from" bind:value={scope.yearMin} />
          <input type="number" placeholder="to" aria-label="Year to" bind:value={scope.yearMax} />
        </div>
      </div>
      <div class="num">
        <span class="lbl sm">Complexity <span class="hint">1–5</span></span>
        <div class="pair">
          <input type="number" step="0.1" min="1" max="5" placeholder="min" aria-label="Complexity min" bind:value={scope.weightMin} />
          <input type="number" step="0.1" min="1" max="5" placeholder="max" aria-label="Complexity max" bind:value={scope.weightMax} />
        </div>
      </div>
      <div class="num">
        <span class="lbl sm">Average rating</span>
        <div class="pair">
          <input type="number" step="0.1" min="1" max="10" placeholder="min" aria-label="Average rating min" bind:value={scope.ratingMin} />
          <input type="number" step="0.1" min="1" max="10" placeholder="max" aria-label="Average rating max" bind:value={scope.ratingMax} />
        </div>
      </div>
      <div class="num">
        <span class="lbl sm">Ratings <span class="hint">how many people rated it</span></span>
        <div class="pair">
          <input type="number" step="10" min="0" placeholder="min" aria-label="Minimum number of ratings" bind:value={scope.usersRatedMin} />
          <input type="number" step="10" min="0" placeholder="max" aria-label="Maximum number of ratings" bind:value={scope.usersRatedMax} />
        </div>
      </div>
      <div class="num">
        <span class="lbl sm">Geek rating ≥</span>
        <input type="number" step="0.1" min="1" max="10" placeholder="any" aria-label="Geek rating minimum" bind:value={scope.geekMin} />
      </div>
    </div>
  </details>
</aside>

<style>
  /* No card chrome: the rail is a column of controls, not content. A bordered panel would
     also frame a lot of empty space below the collapsed groups as if something were missing.
     The section rules carry the structure instead. */
  .rail {
    padding-right: var(--space-sm);
    font-size: 0.85rem;
    /* Its own scroll region: a long facet list must never stretch the workspace. */
    overflow-y: auto;
    min-height: 0;
  }
  /* NB: avoid class names that are also Tailwind utilities (`.fixed`, `.grow`, …) — the
     utility layer is global and wins over a component's scoped rule for the same property. */
  .pinned {
    display: flex;
    flex-direction: column;
  }
  /* Positioned so the hidden label anchors here rather than escaping to the page — see the
     note in GameList.svelte, where a hundred of these stretched the document's scroll height. */
  .find {
    position: relative;
  }
  .vh {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .find input {
    width: 100%;
    min-width: 0;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: var(--background);
    color: var(--foreground);
    padding: 0.35rem 0.5rem;
    font: inherit;
    font-size: 0.85rem;
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
  .lbl.sm {
    font-size: 0.68rem;
  }
  .hint,
  .note {
    text-transform: none;
    letter-spacing: 0;
    font-weight: 400;
  }
  .note {
    margin: 0;
    font-size: 0.7rem;
    color: var(--muted-foreground);
    line-height: 1.35;
  }
  .note em {
    font-style: italic;
  }

  .seg {
    display: flex;
    gap: 0.25rem;
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
  .seg.two button {
    font-size: 0.78rem;
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

  /* The two hand-rolled <details> groups match FacetList's chrome. */
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
  }
  .chev {
    margin-left: auto;
    color: var(--muted-foreground);
    transition: transform 0.12s ease;
  }
  details.grp[open] .chev {
    transform: rotate(90deg);
  }
  @media (prefers-reduced-motion: reduce) {
    .chev {
      transition: none;
    }
  }
  .dbody {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding-bottom: 0.6rem;
  }
  .num {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .pair {
    display: flex;
    gap: 0.4rem;
  }
  input[type='number'] {
    width: 100%;
    min-width: 0;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--background);
    color: var(--foreground);
    padding: 0.28rem 0.4rem;
    font: inherit;
    font-size: 0.8rem;
  }
  input:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 1px;
  }
  .tnum {
    font-variant-numeric: tabular-nums;
  }
</style>
