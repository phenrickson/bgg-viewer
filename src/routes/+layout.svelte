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

  // One flag per destination, because "Home" is no longer simply "not Explore".
  const path = $derived($page.url.pathname);
  const onExplore = $derived(path.startsWith('/games'));
  const onDiscover = $derived(path.startsWith('/discover'));
  const onAbout = $derived(path.startsWith('/about'));
  const onHome = $derived(!onExplore && !onDiscover && !onAbout);
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
        <a href="/discover" class:active={onDiscover}>Discover</a>
        <a href="/games" class:active={onExplore}>Explore</a>
      </nav>
      {#if data.user}
        <div class="navsearch"><GameSearch compact /></div>
      {/if}
      <nav class="actions">
        <!-- Reference, not a destination: it sits with the account actions rather than beside
             Home/Discover/Explore, which are the three rooms the app is actually about. -->
        <a class="sub" href="/about" class:active={onAbout}>About</a>
        {#if data.user}
          <span class="who">{data.user.display_name || data.user.email}</span>
          <form method="POST" action="/logout">
            <button class="link" type="submit">Log out</button>
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
  .mainnav { display: flex; gap: .2rem; margin-left: .4rem; }
  .mainnav a { font-size: 0.9rem; color: var(--muted-foreground); text-decoration: none; padding: .3rem .6rem; border-radius: 7px; }
  .mainnav a:hover { color: var(--foreground); }
  .mainnav a.active { color: var(--foreground); background: var(--muted); font-weight: 550; }
  .navsearch { flex: 1; max-width: 24rem; margin: 0 var(--space-md); }
  @media (max-width: 640px) { .navsearch { display: none; } }
  .actions { display: flex; align-items: center; gap: var(--space-md); margin-left: auto; }
  .actions form { margin: 0; }
  .who { color: var(--muted-foreground); font-size: 0.875rem; }
  .sub {
    font-size: 0.875rem; color: var(--muted-foreground); text-decoration: none;
  }
  .sub:hover { color: var(--foreground); }
  .sub.active { color: var(--foreground); font-weight: 550; }
  .link {
    background: none; border: none; padding: 0; cursor: pointer;
    color: var(--primary); font: inherit; text-decoration: none;
  }
  .link:hover { text-decoration: underline; }
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
</style>
