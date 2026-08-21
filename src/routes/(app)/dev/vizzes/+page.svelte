<script lang="ts">
  /**
   * Every viz in content.json, stacked in file order, rendered with the same VizOfTheDay used
   * on the real landing page. No rotation, no day-picking — the point is to see the whole batch
   * at once after adding/editing files in scripts/vizzes/, not to preview a single day's pick.
   *
   * Rerun `pnpm landing:content` and reload to see changes — this reads the committed
   * content.json like every other consumer, it doesn't query BigQuery itself.
   */
  import VizOfTheDay from '$lib/landing/VizOfTheDay.svelte';
  import { landingContent } from '$lib/landing/content';
</script>

<svelte:head>
  <title>Viz review — dev only</title>
</svelte:head>

<div class="wrap">
  <header class="page-header">
    <p class="eyebrow">Dev only — never built into production</p>
    <h1>Viz review</h1>
    <p class="sub">
      {landingContent.vizzes.length} vizzes, from <code>content.json</code>
      (built {new Date(landingContent.builtAt).toLocaleString()}).
    </p>
  </header>

  {#each landingContent.vizzes as viz, i (viz.title)}
    <VizOfTheDay {viz} eyebrow="{i + 1} of {landingContent.vizzes.length} — {viz.kind}" />
  {/each}
</div>

<style>
  .wrap {
    max-width: 64rem;
    margin: 0 auto;
    padding: var(--space-lg) var(--space-md) 6rem;
    display: flex;
    flex-direction: column;
    gap: clamp(2.5rem, 5vw, 4.5rem);
  }

  .page-header { border-bottom: 1px solid var(--border); padding-bottom: var(--space-lg); }
  .eyebrow {
    font-size: 0.72rem; text-transform: uppercase; letter-spacing: .06em;
    color: var(--muted-foreground); font-weight: 600; margin: 0 0 .35rem;
  }
  h1 { font-size: clamp(1.5rem, 1.2rem + 1.2vw, 2.25rem); font-weight: 750; margin: 0; }
  .sub { font-size: 0.9rem; color: var(--muted-foreground); margin: .5rem 0 0; }
  .sub code { font-size: 0.85em; }
</style>
