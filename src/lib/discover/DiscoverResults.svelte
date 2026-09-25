<script lang="ts">
  /**
   * The games that answer Discover's questions — a readable list, top rated first, paged in as
   * you scroll, with a door to Explore for the same set. Recommend's "Help me find a game"
   * shows it under the questions ("See all matches"); it was Discover's page before Discover
   * folded into Recommend.
   *
   * It is the same `Scope` as Explore underneath, which is why "open in Explore" is a link and
   * not a translation. `extraWhere` narrows it further (Recommend's "Where from?").
   *
   * Copy is PLACEHOLDER — Phil writes the final strings.
   */
  import { initCatalog, catalog, query } from '$lib/catalog/catalog.svelte';
  import { scopeToParams, toWhere, activeFilters, type Scope } from '$lib/catalog/scope';
  import GameRow from './GameRow.svelte';
  import { DISCOVER_LIMIT } from './dials';
  import type { DiscoverGame } from './types';

  let {
    scope,
    extraWhere = '',
    onpatch
  }: {
    scope: Scope;
    /** More SQL, ANDed onto the scope's WHERE. */
    extraWhere?: string;
    onpatch: (patch: Partial<Scope>) => void;
  } = $props();

  let rows = $state<DiscoverGame[]>([]);
  let total = $state(0);
  let loading = $state(true);
  let failed = $state(false);

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

  /**
   * Whether the list is currently a window onto a longer list, or just the list.
   *
   * `.listwrap` caps itself at 45rem and scrolls internally, which is right on a desktop: the
   * games can run to thousands while the page keeps scrolling past them to the door below. On
   * a phone that cap is taller than the whole viewport, so the panel became a scroll region
   * nested inside the document's own — you swipe, the page moves, you swipe again over the
   * list and the page stops moving. Explore hit the same thing. Below 40rem the panel stops
   * capping itself (see the CSS) and the document does all the scrolling.
   *
   * The observer has to follow: it is rooted on the panel, and a root that doesn't scroll
   * always contains the sentinel, so it would fire immediately and keep firing — pulling every
   * page at once. `null` roots it on the viewport, which is what is actually scrolling there.
   */
  let narrow = $state(false);
  $effect(() => {
    const mq = window.matchMedia('(max-width: 40rem)');
    const sync = () => (narrow = mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  });

  // A new scope is a new question — start it at the opening bound rather than however far the
  // last one had been scrolled.
  $effect(() => {
    scope;
    extraWhere;
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
      { root: narrow ? null : listwrap, rootMargin: '400px' }
    );
    io.observe(sentinel);
    return () => io.disconnect();
  });

  let token = 0;
  $effect(() => {
    if (catalog.status !== 'ready') return;
    // Read so a thumbnails load after first render re-runs this query and repaints rows
    // with real art — the LEFT JOIN itself is unconditional (see catalog.svelte.ts), this
    // is only what makes the *second* pass happen once there's something new to show.
    catalog.thumbnailsReady;
    const where = `${toWhere(scope)}${extraWhere ? ` AND ${extraWhere}` : ''}`;
    const n = limit;
    const mine = ++token;
    loading = true;
    failed = false;
    Promise.all([
      query<{ n: number }>(`SELECT COUNT(*)::INT AS n FROM catalog WHERE ${where}`),
      query<DiscoverGame>(
        `SELECT c.game_id, c.name, c.year_published, c.geek_rating, c.average_weight,
                c.best_player_counts, c.recommended_player_counts, c.categories, t.thumbnail
         FROM catalog c LEFT JOIN thumbnails t USING (game_id)
         WHERE ${where}
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
              <button type="button" class="ext" onclick={() => onpatch(f.patch)}>
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
          <div class="collhead" class:cards={narrow} aria-hidden="true">
            <span></span><span></span><span></span>
            <span>Best</span><span>Also good</span><span>Complexity</span><span>Rating</span>
          </div>
          <div class="rows">
            {#each rows as g, i (g.game_id)}
              <GameRow game={g} rank={i + 1} card={narrow} />
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

<style>
  /* The page around it sets the gap from the questions above. */
  .results {
    display: flex; flex-direction: column;
    margin-bottom: var(--space-lg);
  }

  /* Belongs to the list beneath it, not to the chips above — hence tight below. */
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
    /*
     * The rows and the column heading size themselves against THIS panel, not the app shell.
     * Without it the nearest container is `.content`, which is the full window width — so a
     * row bounded to the 64rem `list` measure was answering questions about a 112rem shell,
     * and the two only agreed by coincidence at certain window sizes.
     */
    container-type: inline-size;
  }

  /* One scroll, not two. See `narrow` in the script for why the observer moves with it. */
  @media (max-width: 40rem) {
    .listwrap { max-height: none; overflow-y: visible; }
  }

  /* Same six-way split as GameRow's `.row`, so "Best" / "Also good" / "Rating" sit directly
     over the values they name. Sticky, since the panel scrolls internally and the heading is
     exactly the thing that should still be on screen once the first rows have scrolled past. */
  .collhead {
    display: grid;
    grid-template-columns: 2rem 3.5rem minmax(0, 1fr) 4.5rem 5.5rem 4.5rem 4.5rem;
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
  /* Matches `.cplx`/`.rate`'s own centering on the game rows below — everything else in that
     row is left-aligned, so only these two headings need to say otherwise. */
  .collhead span:nth-child(6),
  .collhead span:nth-child(7) { text-align: center; }
  /* Mirrors GameRow's own `@container (max-width: 34rem)` step: the "Also good" column drops
     and the row narrows to six slots, so the heading has to narrow in step or it drifts out
     of register with what is actually underneath it. */
  @container (max-width: 34rem) {
    .collhead {
      grid-template-columns: 2rem 3.5rem minmax(0, 1fr) 4.5rem 4.5rem 4.5rem;
    }
    .collhead span:nth-child(5) { display: none; }
  }
  /* A card has no columns for a heading to sit over, so the heading goes and each card labels
     its own numbers instead. Keyed off the same `narrow` the rows are, rather than a container
     query of its own — a heading that outlives the columns it names is worse than no heading. */
  .collhead.cards { display: none; }

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
