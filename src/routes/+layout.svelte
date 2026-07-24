<script lang="ts">
  import '../app.css';
  import favicon from '$lib/assets/favicon.svg';
  import { ModeWatcher, toggleMode } from 'mode-watcher';

  let { data, children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<ModeWatcher />

<div class="app">
  <header class="appbar">
    <a class="brand" href="/">bgg-viewer</a>
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
  </header>
  <main class="content">
    {@render children()}
  </main>
</div>

<style>
  .app { min-height: 100svh; display: flex; flex-direction: column; }
  .appbar {
    display: flex; align-items: center; justify-content: space-between;
    padding: var(--space-md) var(--space-lg);
    border-bottom: 1px solid var(--border);
    background: var(--card);
  }
  .brand { font-weight: 600; color: var(--foreground); text-decoration: none; }
  .actions { display: flex; align-items: center; gap: var(--space-md); }
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
    flex: 1; min-width: 0;
    container-type: inline-size;
    padding: var(--space-lg);
  }
</style>
