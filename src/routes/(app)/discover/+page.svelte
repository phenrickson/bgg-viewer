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
    scopeFromParams,
    scopeToParams,
    toWhere,
    activeFilters,
    type Scope
  } from '$lib/catalog/scope';
  import DialStrip from '$lib/discover/DialStrip.svelte';
  import GameRow from '$lib/discover/GameRow.svelte';
  import { discoverScopeFromParams } from '$lib/discover/dials';
  import type { DiscoverGame } from '$lib/discover/types';
  import { Container } from '$lib/components/ui/layout';

  /**
   * How many games Discover will show before the only way further is Explore. Discover is a
   * sampler, not a result set; the count and the hand-off tell the truth about the rest.
   */
  const LIMIT = 200;

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
    scope = discoverScopeFromParams(params, scopeFromParams(params));
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
         LIMIT ${LIMIT}`
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

<div class="page">
  <Container size="wide">
    <DialStrip {scope} onpatch={patch} />
  </Container>

  <Container size="wide" class="listcontainer">
    <div class="head">
      <span class="count">
        {#if catalog.status !== 'ready' || (loading && !rows.length)}
          Finding games…
        {:else}
          <b>{total.toLocaleString()}</b>
          {total === 1 ? 'game' : 'games'}
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

      {#if total > 0}
        <a class="all" href={exploreHref}>See all {total.toLocaleString()} in Explore →</a>
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
  </Container>
</div>

<style>
  /* Fill-height: the shell owns the only viewport height, this page fills it and lets the
     list scroll inside. No `vh` here. */
  .page {
    display: flex; flex-direction: column; min-height: 0; flex: 1;
    gap: var(--space-lg); padding: var(--space-lg) 0;
  }
  .page :global(.listcontainer) {
    display: flex; flex-direction: column; min-height: 0; flex: 1;
  }

  .head {
    flex: none; display: flex; align-items: center; gap: var(--space-md); flex-wrap: wrap;
    font-size: 0.8rem; color: var(--muted-foreground); margin-bottom: var(--space-sm);
  }
  .count b { color: var(--foreground); font-weight: 650; font-variant-numeric: tabular-nums; }
  .dim { color: var(--muted-foreground); }
  .all { margin-left: auto; color: var(--primary); text-decoration: none; font-weight: 550; }
  .all:hover { text-decoration: underline; }

  .extras { display: inline-flex; gap: 0.35rem; flex-wrap: wrap; }
  .ext {
    font: inherit; font-size: 0.74rem; cursor: pointer;
    padding: 0.1rem 0.45rem; border-radius: 999px;
    border: 1px solid var(--border); background: var(--card); color: var(--foreground);
  }
  .ext:hover { border-color: var(--primary); color: var(--primary); }
  .ext .x { opacity: 0.6; }

  /* `0 1 auto`, never `1`: a five-result set must size to its five rows. Stretching it to
     fill the workspace leaves a screen of empty bordered card, which reads as "something
     failed to load" rather than "here are your five games". */
  .listwrap {
    display: flex; flex-direction: column; min-height: 0; flex: 0 1 auto;
    border: 1px solid var(--border); border-radius: var(--radius);
    background: var(--card); overflow: hidden;
  }
  .rows { overflow-y: auto; min-height: 0; flex: 1; }

  .msg {
    padding: var(--space-xl) var(--space-lg); text-align: center;
    color: var(--muted-foreground); font-size: 0.88rem;
  }
  .retry {
    font: inherit; margin-left: 0.4rem; cursor: pointer;
    background: none; border: none; color: var(--primary); text-decoration: underline;
  }
</style>
