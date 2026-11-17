<script lang="ts">
  /**
   * BGG.CON library analytics: checkouts over the con and the busiest games
   * (spec: docs/superpowers/specs/2026-11-17-bggcon-analytics-design.md; the mockup's layout).
   * The page and every card show at once, spinning; the warehouse data streams in
   * (see +page.server.ts). PLACEHOLDER copy (Phil).
   */
  import { MediaQuery } from 'svelte/reactivity';
  import { Container, Stack } from '$lib/components/ui/layout';
  import { chicago } from '$lib/bggcon/analytics';
  import AnalyticsView from './AnalyticsView.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const narrowQuery = new MediaQuery('max-width: 40rem');
  const narrow = $derived(narrowQuery.current);

  function asOf(iso: string | null | undefined): string {
    if (!iso) return '';
    const t = chicago(iso);
    return ` · as of ${t.day} ${t.date} Nov, ${t.hour % 12 || 12}:${String(t.minute).padStart(2, '0')} ${t.hour < 12 ? 'AM' : 'PM'}`;
  }
</script>

<svelte:head><title>BGG.CON Analytics · Boardgame-Viz</title></svelte:head>

<div class="page">
  <Container size="wide">
    <Stack gap="md">
      <div>
        <h1>BGG.CON Analytics</h1>
        <p class="lede">
          Checkouts at the con library, Chicago time{#await data.analytics then a}{asOf(a.activity?.as_of)}{/await}
        </p>
      </div>
      {#await data.analytics}
        <AnalyticsView data={null} {narrow} />
      {:then analytics}
        <AnalyticsView data={analytics} {narrow} />
      {/await}
    </Stack>
  </Container>
</div>

<style>
  /* Matches What's New / Discover / About's .page + h1 + .lede exactly. */
  .page {
    padding: 0 0 var(--space-xl);
  }
  h1 {
    font-size: var(--text-display, clamp(1.8rem, 1.1rem + 3vw, 3rem));
    font-weight: 750;
    letter-spacing: -0.03em;
    line-height: 1.05;
    margin: 0;
    text-wrap: balance;
  }
  .lede {
    font-size: 1.1rem;
    color: var(--muted-foreground);
    max-width: 42rem;
    margin: 0.3rem 0 0;
  }
</style>
