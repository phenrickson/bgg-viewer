<script lang="ts">
  /**
   * Library / Analytics: the switch between the two BGG.CON pages. The existing
   * SegmentedControl, navigating instead of setting a value.
   */
  import { goto } from '$app/navigation';
  import { SegmentedControl, type SegmentedOption } from '$lib/components/ui/segmented-control';

  type Page = 'library' | 'analytics';
  let { current }: { current: Page } = $props();

  // PLACEHOLDER copy (Phil).
  const OPTIONS: SegmentedOption<Page>[] = [
    { value: 'library', label: 'Library', title: 'The library and what’s available now' },
    { value: 'analytics', label: 'Analytics', title: 'Checkouts over the con and the busiest games' }
  ];
  const HREF: Record<Page, string> = { library: '/bggcon', analytics: '/bggcon/analytics' };
</script>

<SegmentedControl label="BGG.CON pages" size="sm" options={OPTIONS} value={current} onchange={(v) => goto(HREF[v])} />
