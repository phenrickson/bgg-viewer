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

  /**
   * How many more rows each "scroll to the end" pull adds.
   *
   * Discover opens on DISCOVER_LIMIT because it is a recommendation, not a result set — but
   * refusing to go further made the bound feel like a wall. Appending in pages keeps the
   * opening screen calm while letting someone who is genuinely browsing keep going.
   *
   * Progressive rather than rendering everything: one chip can match ~3,000 games (Party,
   * Co-op and best-at-2 all do) and no filters at all matches 30,811. At roughly fifteen DOM
   * nodes a row that is 45,000 nodes for one chip and ~460,000 for none — a long synchronous
   * layout on every single chip click, since each toggle rebuilds the list. This way the cost
   * is proportional to what has actually been scrolled past.
   */
  const PAGE = 50;

  /** How many rows the query currently asks for. Reset to DISCOVER_LIMIT on every scope change. */
  let limit = $state(DISCOVER_LIMIT);
  /** The sentinel below the list; when it comes into view, pull the next page. */
  let sentinel = $state<HTMLElement | null>(null);
  /** The scrolling panel — the observer's root, since the list scrolls inside it, not the page. */
  let listwrap = $state<HTMLElement | null>(null);

  const hasMore = $derived(rows.length < total);

  // A new scope is a new question — start it at the opening bound rather than however far the
  // last one had been scrolled.
  $effect(() => {
    scope;
    limit = DISCOVER_LIMIT;
  });

  $effect(() => {
    if (!sentinel || !listwrap || !hasMore || loading) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) limit += PAGE;
      },
      // Rooted on the panel, not the viewport — the list scrolls inside it, so a
      // viewport-rooted observer would fire once and then never again. The margin starts the
      // next page a panel-height early, so rows are usually there before the scroll reaches
      // them.
      { root: listwrap, rootMargin: '400px' }
    );
    io.observe(sentinel);
    return () => io.disconnect();
  });

  let token = 0;
  $effect(() => {
    if (catalog.status !== 'ready') return;
    const where = toWhere(scope);
    const n = limit;
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
         LIMIT ${n}`
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

<!-- ONE measure, so everything shares a left edge.
     An earlier pass put the hero in `prose` and the list in a wider container, meaning to
     make the results "step out". With a short headline above a full-width card the two
     margins just read as misalignment — the page wobbled instead of stepping. The landing
     page is calm precisely because every element starts at the same x. -->
<div class="page">
  <Container size="list">
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
            Showing <b>{rows.length.toLocaleString()}</b>
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

      <div class="listwrap" bind:this={listwrap}>
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
          <!-- One heading for the three fixed columns every row repeats, rather than each row
               spelling out "BEST" / "ALSO GOOD" / "RATING" beside its own numbers. Column
               widths and the narrow-container collapse mirror GameRow.svelte's `.row` grid
               exactly, so the heading always sits over the values it names. -->
          <div class="collhead" aria-hidden="true">
            <span></span><span></span><span></span>
            <span>Best</span><span>Also good</span><span>Rating</span>
          </div>
          <div class="rows">
            {#each rows as g, i (g.game_id)}
              <GameRow game={g} rank={i + 1} />
            {/each}
          </div>
          {#if hasMore}
            <div class="more" bind:this={sentinel}>
              {loading ? 'Loading more…' : `${(total - rows.length).toLocaleString()} more`}
            </div>
          {/if}
        {/if}
      </div>
    </div>

    <!-- Directly under the table, where the games end. Below the scrollytelling it competed
         with the scroll and retreated further with every page of rows appended; here the
         handoff to Explore sits exactly where someone finishes with the list. -->
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
  </Container>
</div>

<style>
  /* Content-driven, not fill-height. Bounding the list to DISCOVER_LIMIT rows made the
     internal scroll pointless — 25 rows is content, so the page just flows and the document
     scrolls, which is also what lets the door at the foot be reached by scrolling to the end
     rather than hiding below a nested scroller. */
  .page {
    display: flex; flex-direction: column;
    /* No top padding: the app shell's `.content` already pads every page, and adding a
       viewport-scaled clamp on top of it stacked to ~4.5rem of nothing above the headline on
       a wide window. Bottom padding stays, so the last element isn't flush to the scroll end. */
    gap: var(--space-xl); padding: 0 0 var(--space-xl);
  }
  /* The results sit further from the questions than the questions do from each other, so
     the step out to the wider measure lands as a section break rather than a wobble. */

  /* Matches the landing page's hero, so the two pages read as one voice. */
  h1 {
    font-size: var(--text-display, clamp(1.8rem, 1.1rem + 3vw, 3rem));
    font-weight: 750; letter-spacing: -0.03em; line-height: 1.05;
    margin: 0; text-wrap: balance;
  }
  h1 em { font-style: normal; color: var(--primary); }
  .lede {
    font-size: 1.1rem; color: var(--muted-foreground); max-width: 40rem;
    /* Sits under its own headline (0.6rem), then a full gap before the questions begin, so
       the hero reads as one block rather than as the first item in a flat list. */
    margin: 0.6rem 0 var(--space-xl);
  }

  /* Sits further from the questions than they do from each other, so stepping out to the
     wider measure lands as a section break rather than a wobble. */
  /* The answer, set apart from the questions.
     `.page`'s gap does not reach here — everything below the hero lives inside the
     Container, so the hero, the dials and this block are siblings *within* it, not flex
     children of `.page`. The break has to be stated on the element itself. */
  .results {
    display: flex; flex-direction: column;
    margin-top: var(--space-xl); margin-bottom: var(--space-lg);
  }

  /* Belongs to the list beneath it, not to the chips above — hence tight below, and the
     `.page` gap doing the separating above. */
  .head {
    display: flex; align-items: center; gap: var(--space-md); flex-wrap: wrap;
    font-size: 0.8rem; color: var(--muted-foreground); margin-bottom: 0.55rem;
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

  /* A window onto a longer list, not the list itself.
     Capped at six rows and scrolling internally, so the games can run to thousands while the
     PAGE keeps scrolling past them to the distributions below. Letting the list grow the page
     instead meant anything under it was unreachable on a large set — and the door retreated
     further with every row appended.
     `max-height`, not `height`: a five-result answer is still five rows tall rather than a
     screen of empty bordered card, which reads as "something failed to load". */
  .listwrap {
    /* ~12 rows at 3.75rem each. 24rem was tried first and showed five and a sliver, which
       read as cramped rather than as a window onto more. Twelve gives the list real presence
       while still leaving the distributions in view below it on an ordinary screen. */
    max-height: 45rem; overflow-y: auto;
    border: 1px solid var(--border); border-radius: var(--radius);
    background: var(--card);
    /* Anchoring stops the viewport jumping when a page of rows is appended above the fold. */
    overflow-anchor: auto;
  }

  /* Same six-way split as GameRow's `.row`, so "Best" / "Also good" / "Rating" sit directly
     over the values they name. Sticky, since the panel scrolls internally and the heading is
     exactly the thing that should still be on screen once the first rows have scrolled past. */
  .collhead {
    display: grid;
    grid-template-columns: 2rem 3.5rem minmax(0, 1fr) 4.5rem 5.5rem 4.5rem;
    gap: 0 var(--space-md);
    padding: 0.4rem var(--space-md);
    position: sticky; top: 0; z-index: 1;
    background: var(--card);
    border-bottom: 1px solid var(--border);
  }
  .collhead span {
    font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em;
    color: var(--muted-foreground); white-space: nowrap;
  }
  /* Matches `.rate`'s own centering on the game rows below — everything else in that row
     is left-aligned, so only the Rating heading needs to say otherwise. */
  .collhead span:nth-child(6) { text-align: center; }
  /* Mirrors GameRow's own `@container (max-width: 34rem)` step: the "Also good" column drops
     and the row narrows to five slots, so the heading has to narrow in step or it drifts out
     of register with what is actually underneath it. */
  @container (max-width: 34rem) {
    .collhead {
      grid-template-columns: 2rem 3.5rem minmax(0, 1fr) 4.5rem 4.5rem;
    }
    .collhead span:nth-child(5) { display: none; }
  }

  .msg {
    padding: var(--space-xl) var(--space-lg); text-align: center;
    color: var(--muted-foreground); font-size: 0.88rem;
  }

  /* Both the "N more" note and the scroll target that pulls the next page. */
  .more {
    padding: var(--space-md); text-align: center;
    font-size: 0.78rem; color: var(--muted-foreground);
    border-top: 1px solid color-mix(in oklch, var(--border) 55%, transparent);
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
