<script lang="ts">
  /**
   * The filters on a wide screen: a card that collapses to a narrow strip (shadcn's Sidebar,
   * floating variant, `collapsible="icon"`). Open, its header holds the minimize button; shut,
   * the strip holds the expand button and how many filters are on. Phones use `RailSheet`.
   *
   * It sits inside the page, under the top nav, not against the window edge it was built for:
   * the Root is absolute in the provider, and the provider clips, so nothing can hang out past
   * the page.
   *
   * The rail stays mounted while shut (only hidden), so its open sections survive a collapse.
   * PLACEHOLDER copy (Phil): "Filters" and the button labels.
   */
  import type { Snippet } from 'svelte';
  import PanelLeftCloseIcon from '@lucide/svelte/icons/panel-left-close';
  import PanelLeftOpenIcon from '@lucide/svelte/icons/panel-left-open';
  import * as Sidebar from '$lib/components/ui/sidebar';
  import { useSidebar } from '$lib/components/ui/sidebar/context.svelte.js';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';

  let { activeCount = 0, children, footer }: { activeCount?: number; children: Snippet; footer?: Snippet } =
    $props();

  const sidebar = useSidebar();
  const open = $derived(sidebar.state === 'expanded');
</script>

<Sidebar.Root variant="floating" collapsible="icon" class="absolute h-full p-px">
  <Sidebar.Header class="flex-row items-center justify-between group-data-[collapsible=icon]:flex-col">
    <span class="title group-data-[collapsible=icon]:hidden">Filters</span>
    <Button
      variant="ghost"
      size="icon-sm"
      aria-expanded={open}
      aria-label={open ? 'Minimize filters' : 'Show filters'}
      title={open ? 'Minimize filters' : 'Show filters'}
      onclick={() => sidebar.toggle()}
    >
      {#if open}<PanelLeftCloseIcon />{:else}<PanelLeftOpenIcon />{/if}
    </Button>
    {#if !open && activeCount}<Badge>{activeCount}</Badge>{/if}
  </Sidebar.Header>
  <Sidebar.Content class="group-data-[collapsible=icon]:hidden">
    <Sidebar.Group>{@render children()}</Sidebar.Group>
  </Sidebar.Content>
  {#if footer}
    <Sidebar.Footer class="group-data-[collapsible=icon]:hidden">{@render footer()}</Sidebar.Footer>
  {/if}
</Sidebar.Root>

<style>
  /* Same as the rail's own section headings, so the card's title reads as one of them. */
  .title {
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--muted-foreground);
    padding-left: var(--space-sm);
  }
</style>
