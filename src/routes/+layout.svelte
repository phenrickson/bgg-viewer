<script lang="ts">
  import '../app.css';
  import favicon from '$lib/assets/favicon.svg';
  import { ModeWatcher, toggleMode } from 'mode-watcher';
  import { page, navigating } from '$app/stores';
  import GameSearch from '$lib/catalog/GameSearch.svelte';
  import { Container } from '$lib/components/ui/layout';

  let { data, children } = $props();

  /**
   * Game pages load from the warehouse API in a blocking server load, so a click on a cold
   * row does nothing visible until the round-trip returns — the click reads as dropped.
   * Hover preloading (`data-sveltekit-preload-data` in app.html) usually beats the click, but
   * not on a fast click or a cold cache, and that gap is exactly when feedback is needed.
   *
   * Deliberately delayed: a bar that flashes for the 80ms a warm navigation takes is more
   * distracting than no bar at all. It appears only once a navigation has lasted long enough
   * to feel like waiting.
   */
  const SHOW_AFTER_MS = 180;
  let pending = $state(false);

  $effect(() => {
    if (!$navigating) {
      pending = false;
      return;
    }
    const t = setTimeout(() => (pending = true), SHOW_AFTER_MS);
    return () => clearTimeout(t);
  });

  /**
   * A menu, not a row of tabs.
   *
   * Discover, Explore and Upcoming are three views of ONE thing — the same `Scope`, the same
   * in-browser catalog, with "see all N in Explore" as the seam between them — so they belong
   * under one heading rather than taking a top-level slot each. Upcoming is only a universe
   * on that Scope, which is exactly why it is a menu row here and not a route: it had its own
   * `/predictions` page for a while, and that page turned out to be Explore with the dial
   * pre-set and ~200 lines of workspace copied to say so.
   *
   * `/predictions` is deliberately left unclaimed. It is reserved for the modelling room —
   * how the model behaves and how well it has done — which is genuinely different data and
   * will be a sibling of Games when it exists. Collection (your shelf) likewise.
   *
   * A menu rather than a second tab bar for two reasons. A sub-bar is a permanent strip of
   * chrome that is empty on most pages, and — the better reason — a menu row can carry a
   * DESCRIPTION where a tab can only carry a word. "Discover" and "Explore" are near-synonyms
   * in isolation; "answer a few questions, get a shortlist" and "filter and sort the whole
   * catalog" are not. The menu lets the nav say what each view is for instead of assuming
   * the label already means something.
   */
  const path = $derived($page.url.pathname);
  const onExplore = $derived(path.startsWith('/games'));
  const onDiscover = $derived(path.startsWith('/discover'));
  const onWhatsNew = $derived(path.startsWith('/whats-new'));
  const onAbout = $derived(path.startsWith('/about'));
  /**
   * Upcoming is `/games` with the universe dial set, so it lights the same Games trigger —
   * and reads its own menu row as current only when that dial is actually on `upcoming`.
   */
  const onUpcoming = $derived(onExplore && $page.url.searchParams.get('u') === 'upcoming');
  const inGames = $derived(onExplore || onDiscover || onWhatsNew);
  // Home is the fallback, so every other destination must be named here or it lights up Home.
  const onHome = $derived(!inGames && !onAbout);

  let gamesOpen = $state(false);
  let gamesMenu = $state<HTMLElement | null>(null);

  // Any navigation closes it — otherwise the menu hangs open over the page you just chose.
  $effect(() => {
    path;
    gamesOpen = false;
  });

  /** Click-away and Escape, the two ways every menu is expected to close. */
  $effect(() => {
    if (!gamesOpen) return;
    const onDown = (e: MouseEvent) => {
      if (gamesMenu && !gamesMenu.contains(e.target as Node)) gamesOpen = false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') gamesOpen = false;
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  });
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<ModeWatcher />

<div class="app">
  {#if pending}
    <div class="loading" role="status" aria-label="Loading page"></div>
  {/if}
  <!-- The bar's surface spans the window; its contents share the widest content measure, so
       the brand lines up with the page beneath it instead of drifting into the gutter. -->
  <header class="appbar">
    <Container size="wide" class="appbar-inner">
      <a class="brand" href="/">bgg-viewer</a>
      <nav class="mainnav">
        <a href="/" class:active={onHome}>Home</a>

        <div class="menu" bind:this={gamesMenu}>
          <button
            type="button"
            class="trigger"
            class:active={inGames}
            aria-expanded={gamesOpen}
            aria-haspopup="true"
            onclick={() => (gamesOpen = !gamesOpen)}
          >
            Games <span class="caret" aria-hidden="true">▾</span>
          </button>

          {#if gamesOpen}
            <div class="pop" role="menu">
              <a href="/discover" role="menuitem" class:on={onDiscover}>
                <b>Discover</b>
                <span>Answer a few questions, get a shortlist</span>
              </a>
              <a href="/games" role="menuitem" class:on={onExplore && !onUpcoming}>
                <b>Explore</b>
                <span>Filter and sort the whole catalog</span>
              </a>
              <!-- A universe on the same Scope, so it is a row here rather than a route. -->
              <a href="/games?u=upcoming" role="menuitem" class:on={onUpcoming}>
                <b>Upcoming</b>
                <span>What’s coming, and what the model expects of it</span>
              </a>
              <a href="/whats-new" role="menuitem" class:on={onWhatsNew}>
                <b>What's New</b>
                <span>Games recently added to BGG</span>
              </a>
            </div>
          {/if}
        </div>

        <!-- Last, and stays last. Every other item in this row is a dataset — the rated
             catalog, your shelf — and About is the one that explains them rather than being
             one. The modelling room and Collection slot in before it; it can grow its own
             menu (methodology, freshness) without disturbing anything else. -->
        <a href="/about" class:active={onAbout}>About</a>
      </nav>
      {#if data.user}
        <div class="navsearch"><GameSearch compact /></div>
      {/if}
      <nav class="actions">
        {#if data.user}
          <span class="who">{data.user.display_name || data.user.email}</span>
          <form method="POST" action="/logout">
            <button class="link muted" type="submit">Log out</button>
          </form>
        {:else}
          <a class="link" href="/login">Log in</a>
        {/if}
        <button class="toggle" type="button" onclick={toggleMode} aria-label="Toggle light/dark theme">◐</button>
      </nav>
    </Container>
  </header>

  <main class="content">
    {@render children()}
  </main>

  <footer class="appfoot">
    <Container size="wide" class="appfoot-inner">
      <a
        class="bgg-badge"
        href="https://boardgamegeek.com"
        target="_blank"
        rel="noopener noreferrer"
        title="Powered by BoardGameGeek"
      >
        <img
          src="https://cf.geekdo-images.com/HZy35cmzmmyV9BarSuk6ug__medium/img/Lru_FJkj084_7MInilQO4LiiB_U=/fit-in/500x500/filters:no_upscale():strip_icc()/pic7779581.png"
          alt="Powered by BGG"
        />
      </a>
      <p class="disclaimer">Data sourced from BoardGameGeek. Not affiliated with or endorsed by BoardGameGeek.</p>
      <span class="version">v{__APP_VERSION__}</span>
    </Container>
  </footer>
</div>

<style>
  /* A definite shell height, so a page can opt into filling it (Explore's two scrolling
     columns) without reaching for viewport units of its own. `.content` owns the scroll,
     so ordinary document-flow pages still behave normally. */
  .app { height: 100svh; display: flex; flex-direction: column; }

  /* An indeterminate sliver across the top of the shell. Indeterminate rather than a real
     progress value because the wait is one opaque round-trip to the warehouse — a bar that
     invents a percentage is lying about knowledge it doesn't have. */
  .loading {
    position: fixed; inset: 0 0 auto 0; height: 2px; z-index: 50;
    background: color-mix(in oklch, var(--primary) 18%, transparent);
    overflow: hidden;
  }
  .loading::after {
    content: ''; position: absolute; inset: 0;
    background: var(--primary);
    transform-origin: 0 50%;
    animation: slide 1.1s ease-in-out infinite;
  }
  @keyframes slide {
    0%   { transform: translateX(-100%) scaleX(0.4); }
    50%  { transform: translateX(20%) scaleX(0.6); }
    100% { transform: translateX(100%) scaleX(0.4); }
  }
  @media (prefers-reduced-motion: reduce) {
    .loading::after { animation: none; opacity: 0.7; }
  }
  .appbar {
    padding: var(--space-md) var(--space-lg);
    border-bottom: 1px solid var(--border);
    background: var(--card);
  }
  .appbar :global(.appbar-inner) {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }
  .brand { font-weight: 600; color: var(--foreground); text-decoration: none; }
  .mainnav { display: flex; align-items: center; gap: .2rem; margin-left: .4rem; }

  /* One rule for both the links and the menu trigger. They were two parallel rule sets and
     drifted immediately — the button inherited the header's larger base size and rendered
     visibly bigger than "Home" beside it. Same selector, same size, can't drift again. */
  .mainnav a,
  .mainnav .trigger {
    font-family: inherit; font-size: 0.9rem; font-weight: 400; line-height: 1.4;
    color: var(--muted-foreground); text-decoration: none;
    padding: .3rem .6rem; border-radius: 7px;
    background: none; border: none;
  }
  .mainnav a:hover,
  .mainnav .trigger:hover { color: var(--foreground); }
  .mainnav a.active,
  .mainnav .trigger.active { color: var(--foreground); background: var(--muted); font-weight: 550; }

  /* Only what differs from a plain nav link — everything shared lives in the rule above. */
  .menu { position: relative; display: flex; }
  .trigger { display: inline-flex; align-items: center; gap: .3rem; cursor: pointer; }
  .trigger:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
  .caret { font-size: 0.65rem; opacity: .7; }

  .pop {
    position: absolute; top: calc(100% + .4rem); left: 0; z-index: 40;
    display: flex; flex-direction: column;
    min-width: 17rem; padding: .35rem;
    background: var(--card);
    border: 1px solid var(--border); border-radius: var(--radius);
    box-shadow: 0 8px 24px oklch(0 0 0 / 0.28);
  }
  .pop a {
    display: flex; flex-direction: column; gap: .1rem;
    padding: .5rem .6rem; border-radius: 7px;
    text-decoration: none; color: inherit;
  }
  .pop a:hover { background: color-mix(in oklch, var(--primary) 10%, transparent); }
  .pop a.on { background: color-mix(in oklch, var(--primary) 13%, transparent); }
  .pop b { font-size: 0.88rem; font-weight: 600; color: var(--foreground); }
  /* The line that earns the menu: a tab can only carry a word, and "Discover" and "Explore"
     are near-synonyms until something says how they differ. */
  .pop span { font-size: 0.76rem; color: var(--muted-foreground); line-height: 1.35; }
  .navsearch { flex: 1; max-width: 24rem; margin: 0 var(--space-md); }
  @media (max-width: 640px) { .navsearch { display: none; } }
  .actions { display: flex; align-items: center; gap: var(--space-md); margin-left: auto; }
  .actions form { margin: 0; }
  .who { color: var(--muted-foreground); font-size: 0.875rem; }
  .link {
    background: none; border: none; padding: 0; cursor: pointer;
    color: var(--primary); font: inherit; text-decoration: none;
  }
  .link:hover { text-decoration: underline; }
  /* Log out is a low-stakes exit, not a call to action — it shouldn't compete in the same
     orange as Log in and the app's actual CTAs. */
  .link.muted { color: var(--muted-foreground); }
  .link.muted:hover { color: var(--foreground); }
  .toggle {
    border: 1px solid var(--border); background: transparent; color: var(--foreground);
    border-radius: var(--radius); width: 2rem; height: 2rem; cursor: pointer; line-height: 1;
  }
  .content {
    flex: 1 1 auto; min-width: 0; min-height: 0;
    overflow-y: auto;
    container-type: inline-size;
    padding: var(--space-lg);
  }
  .appbar { flex: none; }

  /* Fixed-height sliver, not part of the scrolling content — same reasoning as the appbar. */
  .appfoot { flex: none; border-top: 1px solid var(--border); background: var(--card); }
  .appfoot :global(.appfoot-inner) {
    display: flex; align-items: center; gap: var(--space-md);
    padding: var(--space-sm) var(--space-lg);
  }
  .bgg-badge { flex: none; display: flex; align-items: center; }
  .bgg-badge img { height: 28px; width: auto; opacity: 0.85; }
  .bgg-badge:hover img { opacity: 1; }
  .disclaimer { margin: 0; font-size: 0.75rem; color: var(--muted-foreground); }
  .version {
    margin-left: auto;
    flex: none;
    font-size: 0.7rem;
    font-variant-numeric: tabular-nums;
    color: var(--muted-foreground);
    opacity: 0.7;
  }
</style>
