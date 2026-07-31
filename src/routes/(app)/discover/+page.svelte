<script lang="ts">
  /**
   * Discover — the step between the front door and the workshop.
   *
   * Explore can answer anything but shows you a rail of twelve controls to do it. Discover
   * asks three coarse questions and hands back a readable list. It is the same `Scope`
   * underneath, which is why "see all N in Explore" is a link and not a translation: the
   * user carries their question into the bigger room instead of restating it.
   *
   * Copy is PLACEHOLDER — Phil writes the final strings.
   */
  import { onMount } from 'svelte';
  import { replaceState } from '$app/navigation';
  import { page } from '$app/stores';
  import { initCatalog, catalog, query } from '$lib/catalog/catalog.svelte';
  import {
    DEFAULT_SCOPE,
    scopeToParams,
    toWhere,
    activeFilters,
    type Scope
  } from '$lib/catalog/scope';
  import DialStrip from '$lib/discover/DialStrip.svelte';
  import GameRow from '$lib/discover/GameRow.svelte';
  import { discoverScopeFromParams, DISCOVER_LIMIT } from '$lib/discover/dials';
  import type { DiscoverGame } from '$lib/discover/types';
  import { Container } from '$lib/components/ui/layout';

  /**
   * Discover defaults to the whole rated population rather than the top-10k slice, so that
   * with nothing selected the page reads as "top rated, all-time" — the same promise the
   * landing page's chip of that name makes.
   */
  const DISCOVER_DEFAULT: Scope = { ...DEFAULT_SCOPE, universe: 'rated' };

  let scope = $state<Scope>(DISCOVER_DEFAULT);
  let rows = $state<DiscoverGame[]>([]);
  let total = $state(0);
  let loading = $state(true);
  let failed = $state(false);

  onMount(() => {
    const params = $page.url.searchParams;
    scope = discoverScopeFromParams(params);
    initCatalog();
  });

  /** Apply a dial's patch: update state, then mirror it into the URL. */
  function patch(p: Partial<Scope>) {
    scope = { ...scope, ...p };
    const qs = scopeToParams(scope).toString();
    replaceState(qs ? `?${qs}` : location.pathname, {});
  }

  const exploreHref = $derived(`/games?${scopeToParams(scope).toString()}`);

  /**
   * Filters Discover has no dial for — a year bound or a designer carried in on a URL. They
   * are honoured by the query and shown here read-only, because silently dropping a filter
   * would make the count a lie. Editing them is what Explore is for.
   */
  const extraFilters = $derived(
    activeFilters(scope).filter(
      (f) => !['category', 'mechanic', 'best at', 'complexity'].includes(f.kind)
    )
  );

  let token = 0;
  $effect(() => {
    if (catalog.status !== 'ready') return;
    const where = toWhere(scope);
    const mine = ++token;
    loading = true;
    failed = false;
    Promise.all([
      query<{ n: number }>(`SELECT COUNT(*)::INT AS n FROM catalog WHERE ${where}`),
      query<DiscoverGame>(
        `SELECT game_id, name, year_published, geek_rating, average_weight,
                best_player_counts, recommended_player_counts, categories
         FROM catalog WHERE ${where}
         ORDER BY geek_rating DESC NULLS LAST, game_id
         LIMIT ${DISCOVER_LIMIT}`
      )
    ])
      .then(([c, r]) => {
        if (mine !== token) return;
        total = c[0]?.n ?? 0;
        rows = r;
        loading = false;
      })
      .catch((e) => {
        if (mine !== token) return;
        // Clear rather than leave a stale set sitting under a new selection.
        rows = [];
        total = 0;
        failed = true;
        loading = false;
        console.error('discover query failed', e);
      });
  });
</script>

<svelte:head><title>Discover · bgg-viewer</title></svelte:head>

<Container size="content">
  <div class="page">
    <!-- PLACEHOLDER copy -->
    <h1>Find your next <em>game night</em>.</h1>
    <p class="lede">Answer as few or as many as you like — the list below narrows as you go.</p>

    <DialStrip {scope} onpatch={patch} />

    <div class="results">
      <div class="head">
        <span class="count">
          {#if catalog.status !== 'ready' || (loading && !rows.length)}
            Finding games…
          {:else if total === 0}
            No matches
          {:else}
            Showing <b>{Math.min(total, DISCOVER_LIMIT)}</b>
            of <b>{total.toLocaleString()}</b>
            {total === 1 ? 'match' : 'matches'}
            <span class="dim">· top rated first</span>
          {/if}
        </span>

        {#if extraFilters.length}
          <span class="extras">
            {#each extraFilters as f (f.id)}
              <button type="button" class="ext" onclick={() => patch(f.patch)}>
                <span class="dim">{f.kind}</span> {f.label} <span class="x">×</span>
              </button>
            {/each}
          </span>
        {/if}
      </div>

      <div class="listwrap">
        {#if catalog.status === 'error' || failed}
          <p class="msg">
            Couldn’t load the catalog.
            <button type="button" class="retry" onclick={() => initCatalog()}>Try again</button>
          </p>
        {:else if catalog.status !== 'ready'}
          <p class="msg">Warming the catalog…</p>
        {:else if !rows.length && !loading}
          <p class="msg">No games match all of these. Try turning one of the chips off.</p>
        {:else}
          <div class="rows">
            {#each rows as g (g.game_id)}
              <GameRow game={g} />
            {/each}
          </div>
        {/if}
      </div>
    </div>

    <!-- The end of Discover's arc, not a utility link. Built like the landing page's door,
         so Home → Discover → Explore reads as one journey with a handoff at each step. -->
    <a class="door" href={exploreHref}>
      <span class="door-t">Want to go deeper? <span class="arw">→</span></span>
      <span class="door-p">
        {#if total > DISCOVER_LIMIT}
          Open all {total.toLocaleString()} in Explore — filter, sort, and see the shape of the set.
        {:else}
          Open this set in Explore — filter, sort, and see the shape of the whole catalog.
        {/if}
      </span>
    </a>
  </div>
</Container>

<style>
  /* Content-driven, not fill-height. Bounding the list to DISCOVER_LIMIT rows made the
     internal scroll pointless — 25 rows is content, so the page just flows and the document
     scrolls, which is also what lets the door at the foot be reached by scrolling to the end
     rather than hiding below a nested scroller. */
  .page {
    display: flex; flex-direction: column;
    gap: var(--space-lg); padding: clamp(1rem, 3vw, 2.5rem) 0 var(--space-xl);
  }

  /* Matches the landing page's hero, so the two pages read as one voice. */
  h1 {
    font-size: var(--text-display, clamp(1.8rem, 1.1rem + 3vw, 3rem));
    font-weight: 750; letter-spacing: -0.03em; line-height: 1.05;
    margin: 0; text-wrap: balance;
  }
  h1 em { font-style: normal; color: var(--primary); }
  .lede {
    font-size: 1.1rem; color: var(--muted-foreground); max-width: 40rem;
    margin: -0.4rem 0 var(--space-sm);
  }

  .results { display: flex; flex-direction: column; }

  .head {
    display: flex; align-items: center; gap: var(--space-md); flex-wrap: wrap;
    font-size: 0.8rem; color: var(--muted-foreground); margin-bottom: var(--space-sm);
  }
  .count b { color: var(--foreground); font-weight: 650; font-variant-numeric: tabular-nums; }
  .dim { color: var(--muted-foreground); }

  .extras { display: inline-flex; gap: 0.35rem; flex-wrap: wrap; }
  .ext {
    font: inherit; font-size: 0.74rem; cursor: pointer;
    padding: 0.1rem 0.45rem; border-radius: 999px;
    border: 1px solid var(--border); background: var(--card); color: var(--foreground);
  }
  .ext:hover { border-color: var(--primary); color: var(--primary); }
  .ext .x { opacity: 0.6; }

  /* Sizes to its rows. With the set bounded there is no internal scroll to manage, so a
     five-result answer is five rows tall — never a screen of empty bordered card, which
     reads as "something failed to load" rather than "here are your five games". */
  .listwrap {
    border: 1px solid var(--border); border-radius: var(--radius);
    background: var(--card); overflow: hidden;
  }

  .msg {
    padding: var(--space-xl) var(--space-lg); text-align: center;
    color: var(--muted-foreground); font-size: 0.88rem;
  }
  .retry {
    font: inherit; margin-left: 0.4rem; cursor: pointer;
    background: none; border: none; color: var(--primary); text-decoration: underline;
  }

  /* Lifted from the landing page's `.door`, deliberately: the same affordance in the same
     shape, so "the way onward" looks identical wherever you meet it. */
  .door {
    display: flex; flex-direction: column; gap: 0.25rem;
    text-decoration: none; color: inherit;
    background: color-mix(in oklch, var(--primary) 10%, var(--card));
    border: 1px solid color-mix(in oklch, var(--primary) 35%, var(--border));
    border-radius: var(--radius); padding: var(--space-lg);
    margin-top: var(--space-sm);
  }
  .door:hover {
    background: color-mix(in oklch, var(--primary) 16%, var(--card));
    border-color: var(--primary);
  }
  .door-t {
    font-size: 1.05rem; font-weight: 700; letter-spacing: -0.01em; color: var(--primary);
  }
  .door-t .arw { opacity: 0.7; }
  .door-p { font-size: 0.86rem; color: var(--muted-foreground); }
</style>
