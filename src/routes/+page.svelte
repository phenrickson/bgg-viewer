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
  import { Container, Split } from '$lib/components/ui/layout';
  import VizOfTheDay from '$lib/landing/VizOfTheDay.svelte';
  import SneakPeek from './SneakPeek.svelte';
  import { dayIndex, pick } from '$lib/landing/rotation';
  import { estimateMs, humanise, DEFAULT_MS } from '$lib/landing/estimate';
  import { landingContent as content } from '$lib/landing/content';

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

  /**
   * One chart for the hero, rotating daily like the old warm gap did — and static, from
   * content.json, for everyone. The catalog is fast now, but a hero that shows a spinner for
   * several seconds before its chart appears is a worse first impression than a chart that
   * is simply there. Orientation does not need this morning's data.
   */
  const heroViz = $derived(pick(content.vizzes, today, 0));

  /**
   * The sneak peek: the highest-rated handful of the featured pool, fixed rather than
   * rotating. A ranking table you can trust to look the same tomorrow reads as data; one
   * that reshuffles reads as decoration.
   */
  const peek = [...content.featured]
    .filter((g) => g.geek != null)
    .sort((a, b) => (b.geek ?? 0) - (a.geek ?? 0))
    .slice(0, 7);

  /**
   * Logged out, every door goes through /login with the room as `next`, so the chip is both
   * the pitch and the delivery: sign in and you land on the exact question you clicked, not
   * a generic home page.
   */
  const gate = (url: string) => (loggedIn ? url : `/login?next=${encodeURIComponent(url)}`);
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

<Container>
  <div class="land">

    <!-- HERO — copy beside a real chart. Modelled on fantasycalc.com: the first thing you see
         is the product's actual output, not an illustration of it. -->
    <Split ratio="half" side="end" at="md" class="hero">
      {#snippet main()}
        <div class="copy">
          <!-- PLACEHOLDER copy -->
          <h1>Explore board games <em>as a set</em>.</h1>
          <p class="lede">Filter, sort and chart every game on BoardGameGeek at once —
            the thing BGG itself can't do.</p>

          <!-- The live count, from the catalog pointer — not a baked figure that drifts. -->
          <p class="count"><strong>{data.gameCount.toLocaleString()}</strong> games · refreshed daily</p>

          <div class="doors">
            <a class="door primary" href={gate('/discover')}>Discover <span class="arw">→</span></a>
            <a class="door" href={gate('/games')}>Explore the catalog <span class="arw">→</span></a>
          </div>

          {#if loggedIn}
            <!-- Phil's call to keep this: it shows the catalog is working. Logged-in only —
                 nothing warms for a visitor who can't load it. -->
            <span class="warming" class:ready={catalog.status === 'ready'}>
              {#if catalog.status === 'ready'}
                <span class="dot"></span> Catalog ready
                {#if !catalog.thumbnailsReady}<span class="dim">· loading art…</span>{/if}
              {:else if catalog.status === 'error'}
                Catalog failed to load
              {:else}
                <span class="spin"></span> Warming the catalog — {wait}
              {/if}
            </span>
          {/if}
        </div>
      {/snippet}
      {#snippet aside()}
        {#if heroViz}
          <div class="heroviz">
            <VizOfTheDay viz={heroViz} eyebrow="From the catalog" />
          </div>
        {/if}
      {/snippet}
    </Split>

    <!-- SNEAK PEEK — real rows, visibly truncated. The most important element on the page. -->
    <SneakPeek games={peek} total={data.gameCount} exploreHref={gate('/games')} {loggedIn} />

    <!-- HOW IT WORKS — PLACEHOLDER copy, two or three sentences on the thesis. -->
    <section class="how">
      <p class="eyebrow">How it works</p>
      <p>Every game on BoardGameGeek, loaded into your browser as one table. Filter by
        mechanics, player count, weight or year; see the shape of the set you've picked; then
        drill into any game. Refreshed from BGG every day.</p>
    </section>

    <!-- TRY A QUESTION — the chips, demoted from hero to a row. They are entry points for
         people who already understand the app; a stranger needs the table above first. -->
    <section class="try">
      <p class="eyebrow">Try a question</p>
      <div class="chips">
        {#each [...simple, ...deeper] as c (c.label)}
          <a class="chip" href={href(c.room, c.scope)}>{c.label} <span class="arw">→</span></a>
        {/each}
      </div>
    </section>

  </div>
</Container>

<style>
  .land { display: flex; flex-direction: column; gap: clamp(2.5rem, 5vw, 4.5rem); padding: clamp(1rem, 3vw, 2.5rem) 0 clamp(3rem, 6vw, 6rem); }

  /* HERO */
  .copy { display: flex; flex-direction: column; gap: .9rem; justify-content: center; height: 100%; }
  h1 { font-size: var(--text-display, clamp(1.8rem, 1.1rem + 3vw, 3rem)); font-weight: 750; letter-spacing: -0.03em; line-height: 1.05; margin: 0; text-wrap: balance; }
  h1 em { font-style: normal; color: var(--primary); }
  .lede { font-size: 1.1rem; color: var(--muted-foreground); max-width: 34rem; margin: 0; }
  .count { font-size: .9rem; color: var(--muted-foreground); margin: 0; }
  .count strong { color: var(--foreground); font-variant-numeric: tabular-nums; }

  .doors { display: flex; flex-wrap: wrap; gap: .6rem; margin-top: .3rem; }
  .door { display: inline-flex; align-items: center; gap: .4rem; text-decoration: none; font-weight: 650; font-size: .95rem;
    padding: .6rem 1rem; border-radius: var(--radius); border: 1px solid color-mix(in oklch, var(--primary) 35%, var(--border));
    color: var(--primary); background: color-mix(in oklch, var(--primary) 8%, var(--card)); }
  .door:hover { background: color-mix(in oklch, var(--primary) 15%, var(--card)); }
  .door.primary { background: var(--primary); color: var(--primary-foreground); border-color: var(--primary); }
  .door.primary:hover { filter: brightness(1.08); }
  .arw { opacity: .7; }

  .heroviz { height: 100%; display: flex; align-items: center; }

  .warming { align-self: flex-start; display: inline-flex; align-items: center; gap: .5rem; font-size: 0.76rem; color: var(--muted-foreground); border: 1px solid var(--border); background: var(--card); border-radius: 999px; padding: .28rem .7rem; }
  .warming.ready { color: var(--foreground); }
  .warming .dim { color: var(--muted-foreground); font-weight: 400; }
  .warming .dot { width: .55rem; height: .55rem; border-radius: 50%; background: var(--color-positive, oklch(0.62 0.14 150)); }
  .warming .spin { width: .8rem; height: .8rem; border-radius: 50%; border: 2px solid color-mix(in oklch, var(--primary) 35%, var(--border)); border-top-color: var(--primary); animation: spin 0.9s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .warming .spin { animation: none; } }

  /* SECTIONS */
  .eyebrow { font-size: 0.72rem; text-transform: uppercase; letter-spacing: .06em; color: var(--muted-foreground); font-weight: 600; margin: 0 0 .55rem; }
  .how p:not(.eyebrow) { font-size: 1.05rem; line-height: 1.55; max-width: 44rem; margin: 0; color: var(--foreground); }

  .chips { display: flex; flex-wrap: wrap; gap: .5rem; }
  .chip { font-size: 0.85rem; padding: .4rem .75rem; border-radius: 999px; border: 1px solid color-mix(in oklch, var(--primary) 35%, var(--border)); color: var(--primary); background: color-mix(in oklch, var(--primary) 8%, var(--card)); text-decoration: none; display: inline-flex; align-items: center; gap: .4rem; }
  .chip:hover { background: color-mix(in oklch, var(--primary) 15%, var(--card)); }
</style>
