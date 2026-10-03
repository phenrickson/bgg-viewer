<script lang="ts">
  import { page } from '$app/state';
  import { Container } from '$lib/components/ui/layout';
  import type { Snippet } from 'svelte';
  import type { LayoutData } from './$types';

  let { data, children }: { data: LayoutData; children: Snippet } = $props();
</script>

<Container>
  <nav class="admin-nav" aria-label="Admin">
    <span class="tag">Admin</span>
    {#each data.sections as s (s.href)}
      <a href={s.href} class:active={page.url.pathname.startsWith(s.href)}>{s.label}</a>
    {/each}
  </nav>
</Container>

{@render children()}

<style>
  .admin-nav { display: flex; align-items: center; gap: 0.25rem; flex-wrap: wrap; padding-top: var(--space-md); }
  .tag { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--primary); border: 1px solid var(--primary); border-radius: 999px; padding: 0.05rem 0.5rem; margin-right: 0.5rem; }
  a { font-size: 0.88rem; color: var(--muted-foreground); text-decoration: none; padding: 0.3rem 0.6rem; border-radius: 7px; }
  a.active { color: var(--foreground); background: var(--muted); font-weight: 550; }
</style>
