<script lang="ts">
  /**
   * A page's filters beside its results, on a wide screen: a card that collapses to a narrow
   * strip (shadcn's Sidebar, floating variant, `collapsible="icon"`). Explore and the BGG.CON
   * library both use it; phones use `RailSheet` instead.
   *
   * The Sidebar was built to sit against the window edge. This one sits inside the page, under
   * the top nav, so the provider is the frame: it clips, so the card can't hang out past the
   * page, and the card is absolute in it rather than fixed to the window.
   */
  import type { Snippet } from 'svelte';
  import * as Sidebar from '$lib/components/ui/sidebar';
  import FilterSidebarCard from './FilterSidebarCard.svelte';

  let {
    activeCount = 0,
    rail,
    footer,
    children
  }: { activeCount?: number; rail: Snippet; footer?: Snippet; children: Snippet } = $props();
</script>

<!-- The floating strip adds 1rem for padding we don't use, so its icon width is set 1rem under
     the button's footprint: the strip just fits the button. -->
<Sidebar.Provider class="relative h-full min-h-0 gap-(--space-lg) overflow-hidden" style="--sidebar-width-icon: 1.75rem">
  <FilterSidebarCard {activeCount} {footer}>{@render rail()}</FilterSidebarCard>
  <Sidebar.Inset class="min-h-0 bg-transparent">{@render children()}</Sidebar.Inset>
</Sidebar.Provider>
