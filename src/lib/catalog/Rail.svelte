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
   *   3. **Moved to the shape strip** — year, complexity, rating and ratings count. Ranges are
   *      easier to *see* than to type, so they're brushed on their own distributions; the exact
   *      numbers stay here under "Exact numbers" for typing and for keyboard users.
   *
   * Best-at is the exception that came back: it lived only on the strip, which made the one
   * filter BGG can't do the one filter you had to find in a chart. It now shares the player
   * count row with plays-with behind a mode toggle, and the strip stays a second way in.
   *
   * `<details>` does the collapsing natively, so it's keyboard- and screen-reader-correct
   * with no JS.
   */
  import {
    defaultHurdleFor,
    playerCountModeFor,
    setPlayerCount,
    type PlayerCountMode,
    type Scope
  } from './scope';
  import EntityFilter from './EntityFilter.svelte';
  import FacetList from './FacetList.svelte';
  import ComplexityBands from './ComplexityBands.svelte';

  let {
    scope = $bindable(),
    /** WHERE for the current scope — facet counts are scoped to the set you've built. */
    where
  }: { scope: Scope; where: string } = $props();

  /**
   * In the upcoming universe every numeric filter reads a *predicted* column (see
   * `columnsFor`), so the labels say so. The controls are otherwise identical — the question
   * "complexity 3.0–3.5" is the same one; only the column answering it changes.
   */
  const upcoming = $derived(scope.universe === 'upcoming');
  const pred = $derived(upcoming ? 'predicted ' : '');

  /**
   * Switching universe carries the hurdle floor with it: leaving upcoming and coming back
   * would otherwise land on `null` rather than the default, silently widening the set by
   * ~3,000 placeholder entries.
   */
  function setUniverse(u: Scope['universe']) {
    if (scope.universe === u) return;
    scope = { ...scope, universe: u, hurdleMin: defaultHurdleFor(u) };
  }

  /**
   * The hurdle floor as steps, not a slider. A probability filter doesn't reward fine
   * control — the useful question is "everything / most / only the near-certain", and a free
   * slider invites fiddling with a third decimal that moves the count by four games.
   */
  const HURDLE_STEPS: { label: string; value: number | null }[] = [
    { label: 'Any', value: null },
    { label: '25%+', value: 0.25 },
    { label: '50%+', value: 0.5 },
    { label: '80%+', value: 0.8 }
  ];

  /**
   * Which facet groups are expanded — owned here so `FacetList` can `bind:open` instead of
   * taking `open` as a plain prop.
   *
   * That indirection is the fix for a real bug, not tidiness. `<details {open}>` compiles to
   * `details.open = open()` *inside the component's render effect*, so it re-asserts the prop
   * every time that effect reruns — and the effect reads `term`, the facet's own filter box.
   * Typing a character therefore re-applied `open = false` and slammed the group shut.
   * Categories was immune only because its value was `true`, making the re-assert a no-op.
   * `bind:open` compiles to a property *binding*, which syncs the user's toggle back into
   * state rather than overwriting it on every rerun.
   */
  const facetOpen = $state({
    complexity: true,
    categories: true,
    mechanics: false,
    families: false
  });

  /**
   * One number row, two questions. "Best at N" is the filter BGG itself can't do, and it used
   * to be reachable only by clicking the shape strip — the rail's own note pointed at a chart
   * to find it. A mode toggle puts it here without a second row of numbers.
   *
   * The mode is UI state, not `Scope` state: `players` and `bestAt` stay two fields with their
   * own `p` / `best` params and predicates, so `toWhere`, the URL round-trip and the chips need
   * no changes and existing `?best=4` links keep working.
   */
  let pcMode = $state<PlayerCountMode>(playerCountModeFor(scope));

  /**
   * Mode follows state, so the rail can't claim to be filtering one thing while the other is
   * set — the strip writes `bestAt` directly, and a shared link arrives with it already set.
   * Writes only `pcMode`, never `scope`, so it cannot cycle with the setters below.
   */
  $effect(() => {
    if (scope.bestAt != null) pcMode = 'bestAt';
    else if (scope.players != null) pcMode = 'players';
  });

  function setPcMode(m: PlayerCountMode) {
    if (pcMode === m) return;
    // Carry the picked count across the switch — "best at 2" is the natural follow-up to
    // "plays with 2", and re-picking the same number by hand is busywork. Read the outgoing
    // mode's field *before* reassigning `pcMode`.
    const carried = scope[pcMode];
    pcMode = m;
    scope = { ...scope, ...setPlayerCount(scope, m, carried) };
  }

  const pcValue = $derived(pcMode === 'players' ? scope.players : scope.bestAt);
  const setCount = (n: number) => (scope = { ...scope, ...setPlayerCount(scope, pcMode, n) });
  // Families has its own group and its own badge; counting it here too double-counted a
  // family selection onto the People & publishers badge.
  const entityCount = $derived(
    scope.designers.length + scope.artists.length + scope.publishers.length
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
      scope.geekMin,
      scope.geekMax
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
          onclick={() => setUniverse('top10k')}>Top 10,000</button
        >
        <button
          class:on={scope.universe === 'rated'}
          aria-pressed={scope.universe === 'rated'}
          onclick={() => setUniverse('rated')}>All rated</button
        >
        <button
          class:on={upcoming}
          aria-pressed={upcoming}
          onclick={() => setUniverse('upcoming')}>Upcoming</button
        >
      </div>
      <p class="note">
        {scope.universe === 'top10k'
          ? 'BGG’s ranked top 10,000, by geek rating.'
          : scope.universe === 'rated'
            ? 'Everything with 30+ ratings — about 35,000.'
            : 'Announced for this year or later — about 4,800. Nobody has played these, so every number is the model’s estimate.'}
      </p>
    </div>

    <!-- Only the upcoming universe has a hurdle left to clear; in the rated slices every
         game already did, so the control would filter nothing. -->
    {#if upcoming}
      <div class="grp">
        <span class="lbl">Likely to be rated</span>
        <div class="seg">
          {#each HURDLE_STEPS as s (s.label)}
            <button
              class:on={(scope.hurdleMin ?? null) === s.value}
              aria-pressed={(scope.hurdleMin ?? null) === s.value}
              onclick={() => (scope.hurdleMin = s.value)}>{s.label}</button
            >
          {/each}
        </div>
        <p class="note">
          Most games never gather enough ratings to earn a geek rating. This drops the ones
          the model expects won’t.
        </p>
      </div>
    {/if}

    <div class="grp">
      <span class="lbl">Player count</span>
      <div class="seg two">
        <button
          class:on={pcMode === 'players'}
          aria-pressed={pcMode === 'players'}
          onclick={() => setPcMode('players')}>Plays with</button
        >
        <button
          class:on={pcMode === 'bestAt'}
          aria-pressed={pcMode === 'bestAt'}
          onclick={() => setPcMode('bestAt')}>Best at</button
        >
      </div>
      <div class="seg">
        {#each [1, 2, 3, 4, 5, 6] as n (n)}
          <button class:on={pcValue === n} aria-pressed={pcValue === n} onclick={() => setCount(n)}>
            {n === 6 ? '6+' : n}
          </button>
        {/each}
      </div>
      <p class="note">
        {pcMode === 'players'
          ? 'Supports N at the table.'
          : 'The community voted N the best count — the filter BGG can’t do.'}
      </p>
    </div>

  </div>

  <ComplexityBands bind:selected={scope.weightBands} bind:open={facetOpen.complexity} />

  <FacetList
    title="Categories"
    column="categories"
    {where}
    bind:selected={scope.categories}
    bind:open={facetOpen.categories}
  />
  <FacetList
    title="Mechanics"
    column="mechanics"
    {where}
    bind:selected={scope.mechanics}
    bind:open={facetOpen.mechanics}
  />
  <FacetList
    title="Series & families"
    column="families"
    {where}
    bind:selected={scope.families}
    bind:open={facetOpen.families}
    peek={6}
  />

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
      <p class="note">
        Typed bounds — the same fields the shape strip brushes.{#if upcoming}
          In this universe they read the model’s estimates, since nobody has played these
          games yet.{/if}
      </p>
      <div class="num">
        <span class="lbl sm">Year</span>
        <div class="pair">
          <input type="number" placeholder="from" aria-label="Year from" bind:value={scope.yearMin} />
          <input type="number" placeholder="to" aria-label="Year to" bind:value={scope.yearMax} />
        </div>
      </div>
      <!-- The complexity *range* the strip brushes. The band checkboxes above are a separate,
           coarser filter on the same measure; these are the typed path to a free span. -->
      <div class="num">
        <span class="lbl sm">{pred}Complexity <span class="hint">1–5</span></span>
        <div class="pair">
          <input type="number" step="0.1" min="1" max="5" placeholder="min" aria-label="Complexity min" bind:value={scope.weightMin} />
          <input type="number" step="0.1" min="1" max="5" placeholder="max" aria-label="Complexity max" bind:value={scope.weightMax} />
        </div>
      </div>
      <div class="num">
        <span class="lbl sm">{pred}Average rating</span>
        <div class="pair">
          <input type="number" step="0.1" min="1" max="10" placeholder="min" aria-label="Average rating min" bind:value={scope.ratingMin} />
          <input type="number" step="0.1" min="1" max="10" placeholder="max" aria-label="Average rating max" bind:value={scope.ratingMax} />
        </div>
      </div>
      <div class="num">
        <span class="lbl sm">{pred}Ratings <span class="hint">{upcoming ? 'how many the model expects' : 'how many people rated it'}</span></span>
        <div class="pair">
          <input type="number" step="10" min="0" placeholder="min" aria-label="Minimum number of ratings" bind:value={scope.usersRatedMin} />
          <input type="number" step="10" min="0" placeholder="max" aria-label="Maximum number of ratings" bind:value={scope.usersRatedMax} />
        </div>
      </div>
      <div class="num">
        <!-- A pair, like every other numeric control here. Min-only made a rank BAND
             ("well regarded but outside the famous tier") impossible to state or to clear. -->
        <span class="lbl sm">{pred}Geek rating</span>
        <div class="pair">
          <input type="number" step="0.1" min="1" max="10" placeholder="min" aria-label="Geek rating min" bind:value={scope.geekMin} />
          <input type="number" step="0.1" min="1" max="10" placeholder="max" aria-label="Geek rating max" bind:value={scope.geekMax} />
        </div>
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
