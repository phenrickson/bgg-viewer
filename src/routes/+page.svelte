<script lang="ts">
  /**
   * Landing — the front door, and (logged in) the room where the catalog warms.
   *
   * Lives at the route root, OUTSIDE the `(app)` group, on purpose: `(app)`'s layout guard
   * redirects every request without a session to /login, and for a long time that included
   * this page — so a stranger arriving at the site was asked to sign in without ever being
   * shown what they would be signing in for. Everything else stays behind that guard; only
   * the front door moved.
   *
   * Nothing here needs the catalog. The content is static and build-time (content.json), so
   * a logged-out visitor downloads no data and costs nothing per visit. Only a logged-in
   * user kicks off the catalog load, and the doors carry `?next=` when logged out so signing
   * in lands you on exactly the question you clicked.
   *
   * This page exists because every other view blocks on the in-browser catalog (~5 MB into
   * DuckDB). It renders cold, kicks off that load, and offers entry points that are pure
   * links so they work before it finishes.
   *
   * Those entry points are the query chips, and they are the whole hero. A name-search box
   * used to lead the page, which was backwards twice over: it answers "what is this game
   * called", not the "find me games like X" this page is about, and it duplicated the search
   * that sits in the header of every page anyway.
   *
   * Copy is PLACEHOLDER — Phil writes the final strings.
   */
  import { onMount } from 'svelte';
  import { initCatalog, catalog } from '$lib/catalog/catalog.svelte';
  import { DEFAULT_SCOPE, scopeToParams, type Scope } from '$lib/catalog/scope';
  import { Container } from '$lib/components/ui/layout';
  import WarmGap from '$lib/landing/WarmGap.svelte';
  import Showcase from './Showcase.svelte';
  import { dayIndex } from '$lib/landing/rotation';
  import { estimateMs, humanise, DEFAULT_MS } from '$lib/landing/estimate';
  import { landingContent as content } from '$lib/landing/content';
  import { gate as gateFor } from '$lib/landing/gate';

  /** `user` comes from the root layout's server load — the same `locals` the guard reads. */
  let { data } = $props();
  const loggedIn = $derived(Boolean(data.user));

  /**
   * How long to tell the user this will take. Read on mount rather than at module scope
   * because it touches `localStorage`, which does not exist during SSR — and read BEFORE
   * `initCatalog()`, since that call is what overwrites the sample we want to quote.
   */
  let wait = $state(humanise(DEFAULT_MS));

  // Kick the catalog warm in the background so Explore is ready when the user arrives there.
  // Logged out, don't: /api/catalog would 401 and the page would announce "Catalog failed to
  // load" at a visitor who hasn't done anything wrong. There is nothing to warm for them.
  onMount(() => {
    if (!loggedIn) return;
    wait = humanise(estimateMs());
    initCatalog();
  });

  /**
   * The warm-gap content. Imported, not fetched: the gap it fills begins the moment this
   * page finishes rendering, so anything needing a round-trip would arrive after the problem
   * it solves. It is also why this survives a cold container — the bytes are already here
   * while the server is still building the catalog and cannot answer anything promptly.
   */
  const today = dayIndex();

  /** See `$lib/landing/gate.ts` — bound to this page's auth state. */
  const gate = (url: string) => gateFor(loggedIn, url);
  const href = (room: 'discover' | 'games', overrides: Partial<Scope>) =>
    gate(`/${room}?${scopeToParams({ ...DEFAULT_SCOPE, ...overrides }).toString()}`);

  /**
   * Each chip goes to the room that can actually hold its question.
   *
   * A scope Discover has no dial for still *filters* correctly there, but it arrives as a
   * read-only context chip the user cannot adjust — so sending "heavyweights since 2015" to
   * Discover drops someone into a page whose three controls are all irrelevant to what they
   * just asked. Those belong in Explore, where year and complexity are real controls.
   *
   * The split doubles as the site's own explanation of the two rooms: simple questions land
   * somewhere simple, precise ones land in the workshop.
   *
   * Labels are placeholder.
   */
  type Chip = { label: string; room: 'discover' | 'games'; scope: Partial<Scope> };

  /**
   * Answerable with Discover's three dials, so each one arrives with its chip already
   * selected and the other two dials free to adjust.
   *
   * Every count below was measured against the catalog, not estimated — see the note on
   * `Hidden gems` for why that matters.
   */
  const simple: Chip[] = [
    { label: 'Family friendly', room: 'discover', scope: { weightMax: 2.0, bestAt: 4 } }, // 2,106
    { label: 'Good for couples', room: 'discover', scope: { bestAt: 2, weightMax: 2.0, categories: ['Abstract Strategy']} },
    { label: 'Co-op for 4', room: 'discover', scope: { mechanics: ['Cooperative Game'], bestAt: 4 } }, // 477
    { label: 'Best at 2', room: 'discover', scope: { bestAt: 2 } }, // 3,715
    { label: 'Light party games', room: 'discover', scope: { categories: ['Party Game'], weightMax: 2.0 } }, // 2,772
    { label: 'Big group', room: 'discover', scope: { bestAt: 6 } }, // 916
    /* Straight onto Discover's "Heavy" band, so the chip arrives with that dial lit. The
       earlier "Heavy euros" pinned a category to the weight and found only 354. */
    { label: 'Something heavy', room: 'discover', scope: { weightMin: 3.5 } } // 1,570
  ];

  /**
   * Need a control Discover does not have — a year bound, a ratings-count cap — so they open
   * in Explore, where those are real inputs rather than read-only context chips.
   */
  const deeper: Chip[] = [
    { label: 'Heavyweights since 2015', room: 'games', scope: { weightMin: 3.5, yearMin: 2015 } }, // 824
    { label: 'Released 2024 onward', room: 'games', scope: { yearMin: 2024 } }, // 2,971
    /*
     * "Gem" = ranked well but outside the famous tier, so this is a RANK BAND: positions
     * ~1,000–2,000 by geek rating, which in the current catalog is 6.278 ≤ geek < 6.671.
     * `Scope` has no rank field, so the band is expressed as the geek-rating cutoffs at those
     * ranks; they drift slightly as the catalog refreshes, which is fine for a suggestion.
     *
     * Two earlier attempts were wrong. `geekMin: 7.5, usersRatedMax: 2000` returns exactly
     * ZERO — geek rating is Bayesian, so a thinly-rated game is pulled toward the mean and
     * cannot reach 7.5; the conditions exclude each other by construction. And "outside the
     * top 1,000" ALONE returns 28,349, i.e. nearly everything, because it is only an upper
     * bound — without a floor, "gem" means nothing.
     */
    { label: 'Hidden gems', room: 'games', scope: { geekMin: 6.278, geekMax: 6.671 } }, // 1,000
    /* geekMin 7.5 over the same window returns 30 — too thin to be worth a chip. 7 gives 150. */
    { label: 'Modern classics', room: 'games', scope: { geekMin: 7, yearMin: 2000 } }, // 150
    /* 6.3 rather than a higher floor: the pre-2000 catalog is small and its ratings sit lower,
       so 6.5 finds only 53. At 6.3 it is 94 — El Grande, Tigris & Euphrates, Ra. */
    { label: 'Old but great', room: 'games', scope: { geekMin: 6.3, yearMax: 1999 } }, // 94
    { label: 'Wildly popular', room: 'games', scope: { usersRatedMin: 25000 } } // 157
  ];
</script>

<svelte:head><title>bgg-viewer</title></svelte:head>

<Container size="prose">
    <div class="land">
    <!-- The pill says roughly HOW LONG, not merely that something is happening: a bounded
         wait is a categorically different experience from an indefinite one, and it costs
         one string. The number is the median of this browser's own past loads (see
         estimate.ts), so it describes the machine actually doing the waiting rather than a
         figure measured somewhere else.

         No game count while warming: `content.stats.games` is a static number baked into
         content.json at some point in the past, and the catalog gains new games every day
         (What's New adds ~195/week) — so it drifts from the real count and had visibly
         disagreed with `catalog.count` a few seconds later, on the same page. The count
         belongs only in the ready state, where it's the live, authoritative number. -->
    {#if loggedIn}
    <span class="warming" class:ready={catalog.status === 'ready'}>
      {#if catalog.status === 'ready'}
        <span class="dot"></span> Catalog ready · {catalog.count.toLocaleString()} games
        <!-- Thumbnails load in the background after the catalog itself, and were otherwise
             invisible — there was no way to tell "still loading" from "quietly failed"
             short of the network tab. Only shown for the gap; once art has loaded, the box
             art appearing on the games below is its own confirmation and this line adds
             nothing further. -->
        {#if !catalog.thumbnailsReady}
          <span class="dim">· loading art…</span>
        {/if}
      {:else if catalog.status === 'error'}
        Catalog failed to load
      {:else}
        <span class="spin"></span> Warming the catalog — {wait}
      {/if}
    </span>
    {/if}

    <!-- PLACEHOLDER copy -->
    <h1>Explore board games <em>as a set</em>.</h1>
    <p class="lede">Looking for a game? Search, filter, and visualize the
      world of board games in your browser.</p>

    <!-- Same sections, ordered by who is looking.

         The chips were the hero because they were the only thing that worked before the
         catalog loaded; that constraint is gone, and judged fresh there is no single right
         headline. A stranger's first question is "what is this" — the screenshots answer it
         in a glance, and thirteen phrases like "Hidden gems" only mean something after that.
         A member already knows what this is; for them the chips are the fastest thing on
         the page, one click into a scoped room, and three large frames in the way is the
         old mistake of making the page worse for the people who use it.

         So: logged out, show the thing, then the questions. Logged in, launchers first,
         previews behind them. One {#if} around the order; the parts are identical.

         Two chip groups, because the split teaches the app's structure without a word of
         prose about it: simple questions open the simple room, precise ones the workshop. -->
    {#snippet chips()}
      <section class="block">
        <p class="try">Start simple</p>
        <div class="chips">
          {#each simple as c (c.label)}
            <a class="chip" href={href(c.room, c.scope)}>{c.label} <span class="arw">→</span></a>
          {/each}
        </div>

        <p class="try">Go deeper</p>
        <div class="chips">
          {#each deeper as c (c.label)}
            <a class="chip" href={href(c.room, c.scope)}>{c.label} <span class="arw">→</span></a>
          {/each}
        </div>
      </section>
    {/snippet}

    {#snippet showcase()}
      <section class="block">
        <Showcase {gate} />
      </section>
    {/snippet}

    {#if loggedIn}
      {@render chips()}
      {@render showcase()}
    {:else}
      {@render showcase()}
      {@render chips()}
    {/if}

    <!-- Then a taste of the data behind the app, for everyone: one chart, one game. Inside
         the hero's own `prose` measure, not a wider one — a foot that runs wider than the
         copy above it makes the page look like two pages stitched together. -->
    <section class="block rotation">
      <WarmGap {content} day={today} slots={2} />
    </section>
    </div>
</Container>

<style>
  .land { padding: clamp(1rem, 3vw, 2.5rem) 0; }

  .warming { display: inline-flex; align-items: center; gap: .5rem; font-size: 0.76rem; color: var(--muted-foreground); border: 1px solid var(--border); background: var(--card); border-radius: 999px; padding: .28rem .7rem; }
  .warming.ready { color: var(--foreground); }
  /* Quieter than the ready state around it — a transient aside, not a second headline. */
  .warming .dim { color: var(--muted-foreground); font-weight: 400; }
  .warming .dot { width: .55rem; height: .55rem; border-radius: 50%; background: var(--color-positive, oklch(0.62 0.14 150)); }
  .warming .spin { width: .8rem; height: .8rem; border-radius: 50%; border: 2px solid color-mix(in oklch, var(--primary) 35%, var(--border)); border-top-color: var(--primary); animation: spin 0.9s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .warming .spin { animation: none; } }

  h1 { font-size: var(--text-display, clamp(1.8rem, 1.1rem + 3vw, 3rem)); font-weight: 750; letter-spacing: -0.03em; line-height: 1.05; margin: 1.1rem 0 .5rem; text-wrap: balance; }
  h1 em { font-style: normal; color: var(--primary); }
  .lede { font-size: 1.1rem; color: var(--muted-foreground); max-width: 40rem; margin: 0; }


  /* Tight to its own chips, roomy above — so each eyebrow reads as heading the group beneath
     it rather than floating between two. The last group carries the gap to the foot. */
  .try { font-size: 0.72rem; text-transform: uppercase; letter-spacing: .06em; color: var(--muted-foreground); font-weight: 600; margin: 1.6rem 0 .55rem; }
  .block > .try:first-child { margin-top: 0; }
  .chips { display: flex; flex-wrap: wrap; gap: .5rem; }
  .chip { font-size: 0.85rem; padding: .4rem .75rem; border-radius: 999px; border: 1px solid color-mix(in oklch, var(--primary) 35%, var(--border)); color: var(--primary); background: color-mix(in oklch, var(--primary) 8%, var(--card)); text-decoration: none; display: inline-flex; align-items: center; gap: .4rem; }
  .chip:hover { background: color-mix(in oklch, var(--primary) 15%, var(--card)); }
  .chip .arw { opacity: .6; }

  /* Each block is a destination you scroll to; the last one leaves air at the end. */
  .block { margin-top: clamp(2.5rem, 5vw, 4.5rem); }
  .rotation { padding-bottom: clamp(3rem, 6vw, 6rem); }

</style>
