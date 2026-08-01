<script lang="ts">
  /**
   * Landing — the front door. Orients the user, warms the in-browser catalog in the
   * background, and offers entry points that work immediately: a game name search
   * (type-ahead over the catalog once warm) and example-query chips that deep-link into a
   * pre-scoped Explore. Copy is PLACEHOLDER — Phil writes the final strings.
   */
  import { onMount } from 'svelte';
  import { initCatalog, catalog } from '$lib/catalog/catalog.svelte';
  import { DEFAULT_SCOPE, scopeToParams, type Scope } from '$lib/catalog/scope';
  import GameSearch from '$lib/catalog/GameSearch.svelte';
  import { Container } from '$lib/components/ui/layout';

  // Kick the catalog warm in the background so Explore is ready when the user arrives there.
  onMount(() => {
    initCatalog();
  });

  const href = (room: 'discover' | 'games', overrides: Partial<Scope>) =>
    `/${room}?${scopeToParams({ ...DEFAULT_SCOPE, ...overrides }).toString()}`;

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
  const chips: { label: string; room: 'discover' | 'games'; scope: Partial<Scope> }[] = [
    // Answerable with Discover's three dials.
    { label: 'Best at 2 players', room: 'discover', scope: { bestAt: 2 } },
    { label: 'Best at 6 players', room: 'discover', scope: { bestAt: 6 } },
    { label: 'Light party games', room: 'discover', scope: { categories: ['Party Game'], weightMax: 2.0 } },
    { label: 'Co-op for 4', room: 'discover', scope: { mechanics: ['Cooperative Game'], bestAt: 4 } },
    // Need controls only Explore has (year, ratings count, universe).
    { label: 'Heavyweights since 2015', room: 'games', scope: { weightMin: 3.5, yearMin: 2015 } },
    { label: 'Released 2024 onward', room: 'games', scope: { yearMin: 2024 } },
    /*
     * Thresholds measured, not guessed: geek rating is Bayesian, so a game with few ratings
     * is pulled hard toward the mean and simply cannot reach a high one. `geekMin: 7.5` with
     * `usersRatedMax: 2000` — the obvious-looking pair — returns exactly ZERO games, because
     * the two conditions exclude each other by construction. 6.5 / 5,000 returns 502.
     */
    { label: 'Hidden gems', room: 'games', scope: { geekMin: 6.5, usersRatedMax: 5000 } }
  ];
</script>

<svelte:head><title>bgg-viewer</title></svelte:head>

<Container size="prose">
    <div class="land">
    <span class="warming" class:ready={catalog.status === 'ready'}>
      {#if catalog.status === 'ready'}
        <span class="dot"></span> Catalog ready · {catalog.count.toLocaleString()} games
      {:else if catalog.status === 'error'}
        Catalog failed to load
      {:else}
        <span class="spin"></span> Warming the catalog…
      {/if}
    </span>

    <!-- PLACEHOLDER copy -->
    <h1>Explore board games <em>as a set</em>.</h1>
    <p class="lede">Looking for a game? Search, filter, and visualize the
      the world of board games in your browser.</p>

    <div class="search"><GameSearch /></div>

    <p class="try">Try a query</p>
    <div class="chips">
      {#each chips as c}
        <a class="chip" href={href(c.room, c.scope)}>{c.label} <span class="arw">→</span></a>
      {/each}
    </div>

    <!-- One live door, made to look like one. The three unbuilt ideas were four equal cards,
         so three quarters of the landing page advertised things that don't work yet; as a row
         of muted pills they still say where this is going without competing for the click. -->
    <a class="door" href="/games">
      <span class="door-t">Explore the catalog <span class="arw">→</span></span>
      <span class="door-p">Filter to a set, see its shape, then drill into any game.</span>
    </a>

    <p class="soon-lead">Coming next</p>
    <ul class="soon">
      <li><b>Upcoming predictions</b><span>What the model expects for games not yet rated.</span></li>
      <li><b>Similarity map</b><span>Find games near one you love, by embedding distance.</span></li>
      <li><b>Your collection</b><span>Bring your own shelf into the same lenses.</span></li>
    </ul>
    </div>
</Container>

<style>
  .land { padding: clamp(1rem, 3vw, 2.5rem) 0; }

  .warming { display: inline-flex; align-items: center; gap: .5rem; font-size: 0.76rem; color: var(--muted-foreground); border: 1px solid var(--border); background: var(--card); border-radius: 999px; padding: .28rem .7rem; }
  .warming.ready { color: var(--foreground); }
  .warming .dot { width: .55rem; height: .55rem; border-radius: 50%; background: var(--color-positive, oklch(0.62 0.14 150)); }
  .warming .spin { width: .8rem; height: .8rem; border-radius: 50%; border: 2px solid color-mix(in oklch, var(--primary) 35%, var(--border)); border-top-color: var(--primary); animation: spin 0.9s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .warming .spin { animation: none; } }

  h1 { font-size: var(--text-display, clamp(1.8rem, 1.1rem + 3vw, 3rem)); font-weight: 750; letter-spacing: -0.03em; line-height: 1.05; margin: 1.1rem 0 .5rem; text-wrap: balance; }
  h1 em { font-style: normal; color: var(--primary); }
  .lede { font-size: 1.1rem; color: var(--muted-foreground); max-width: 40rem; margin: 0; }

  .search { margin: 1.6rem 0 .5rem; max-width: 34rem; }

  .try { font-size: 0.72rem; text-transform: uppercase; letter-spacing: .06em; color: var(--muted-foreground); font-weight: 600; margin: 1.6rem 0 .55rem; }
  .chips { display: flex; flex-wrap: wrap; gap: .5rem; margin-bottom: 2.2rem; }
  .chip { font-size: 0.85rem; padding: .4rem .75rem; border-radius: 999px; border: 1px solid color-mix(in oklch, var(--primary) 35%, var(--border)); color: var(--primary); background: color-mix(in oklch, var(--primary) 8%, var(--card)); text-decoration: none; display: inline-flex; align-items: center; gap: .4rem; }
  .chip:hover { background: color-mix(in oklch, var(--primary) 15%, var(--card)); }
  .chip .arw { opacity: .6; }

  .door { display: flex; flex-direction: column; gap: .25rem; text-decoration: none; color: inherit;
    background: color-mix(in oklch, var(--primary) 10%, var(--card));
    border: 1px solid color-mix(in oklch, var(--primary) 35%, var(--border));
    border-radius: var(--radius); padding: var(--space-lg); }
  .door:hover { background: color-mix(in oklch, var(--primary) 16%, var(--card)); border-color: var(--primary); }
  .door-t { font-size: 1.05rem; font-weight: 700; letter-spacing: -0.01em; color: var(--primary); }
  .door-t .arw { opacity: .7; }
  .door-p { font-size: 0.86rem; color: var(--muted-foreground); }

  .soon-lead { font-size: 0.72rem; text-transform: uppercase; letter-spacing: .06em; color: var(--muted-foreground); font-weight: 600; margin: 1.8rem 0 .55rem; }
  .soon { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); gap: var(--space-md); }
  .soon li { display: flex; flex-direction: column; gap: .15rem; border-top: 1px solid var(--border); padding-top: .5rem; }
  .soon b { font-size: 0.85rem; font-weight: 600; color: var(--muted-foreground); }
  .soon span { font-size: 0.78rem; color: var(--muted-foreground); opacity: .75; line-height: 1.35; }
</style>
