<script lang="ts">
  import '../app.css';
  import favicon from '$lib/assets/favicon.svg';
  import { ModeWatcher, toggleMode } from 'mode-watcher';
  import { page } from '$app/stores';
  import GameSearch from '$lib/catalog/GameSearch.svelte';
  import { Container } from '$lib/components/ui/layout';

  let { data, children } = $props();

  // Three-way, because "Home" is no longer simply "not Explore".
  const path = $derived($page.url.pathname);
  const onExplore = $derived(path.startsWith('/games'));
  const onDiscover = $derived(path.startsWith('/discover'));
  const onHome = $derived(!onExplore && !onDiscover);
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<ModeWatcher />

<div class="app">
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
