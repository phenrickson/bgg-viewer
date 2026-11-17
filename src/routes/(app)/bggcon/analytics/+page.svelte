<script lang="ts">
  /**
   * BGG.CON library analytics: checkouts over the con and the busiest games
   * (spec: docs/superpowers/specs/2026-11-17-bggcon-analytics-design.md; the mockup's layout).
   * The page shows at once; the warehouse data streams in (see +page.server.ts).
   * PLACEHOLDER copy (Phil).
   */
  import { MediaQuery } from 'svelte/reactivity';
  import { Container, Stack } from '$lib/components/ui/layout';
  import AnalyticsView from './AnalyticsView.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const narrowQuery = new MediaQuery('max-width: 40rem');
  const narrow = $derived(narrowQuery.current);
</script>

<svelte:head><title>BGG.CON Analytics · Boardgame-Viz</title></svelte:head>

<Container size="wide">
  <Stack>
    <h1>BGG.CON analytics</h1>
    {#await data.analytics}
      <p class="dim" role="status">Loading the library’s activity…</p>
    {:then analytics}
      <AnalyticsView data={analytics} {narrow} />
    {/await}
  </Stack>
</Container>

<style>
  h1 { margin: 0; padding-top: var(--space-md); font-size: var(--text-heading); }
  .dim { color: var(--muted-foreground); font-size: 0.8rem; margin: 0; }
</style>
