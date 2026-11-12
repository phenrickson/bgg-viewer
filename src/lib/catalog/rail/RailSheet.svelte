<script lang="ts">
  /**
   * A page's sidebar on a narrow screen: a bottom sheet you deliberately open, holding the same
   * controls the sidebar holds on a wide one.
   *
   * /games, /map and /lineage each wrote this out (/lineage by copying /map), so it lives here
   * once. The look and the reasons for it are /games':
   *
   * - Bottom, not the sheet's default `side="right"`: a slide-over reads as a secondary panel
   *   beside content (record CRUD), where this needs to read as its own screen you've entered
   *   to adjust the view, the way Filters behaves in most mobile apps.
   * - Short of full height on purpose, 92dvh, so a sliver of the page stays visible behind it;
   *   a totally opaque takeover made the first version feel like leaving the app.
   * - Header at natural height, the body takes what's left and owns its scroll (fill-height
   *   Pattern A), and the footer's one button takes you back to what you were looking at,
   *   saying what you'll see (`done`): "Show 412 games" on /games.
   *
   * The page decides when it's narrow (`narrow`, a `MediaQuery` at its own breakpoint) and
   * renders its sidebar either inline or in here, never both, so a rail that queries (/games'
   * facets against DuckDB) runs once. Widening the window with the sheet open closes it,
   * rather than stranding a modal over the desktop layout.
   */
  import type { Snippet } from 'svelte';
  import * as Sheet from '$lib/components/ui/sheet';
  import { Button } from '$lib/components/ui/button';

  let {
    open = $bindable(false),
    narrow,
    title,
    done,
    children
  }: {
    open?: boolean;
    /** Whether the page is in its narrow layout; the sheet closes when it isn't. */
    narrow: boolean;
    title: string;
    /** The footer button's label: what closing the sheet shows you. */
    done: string;
    children: Snippet;
  } = $props();

  $effect(() => {
    if (!narrow) open = false;
  });
</script>

<Sheet.Root bind:open>
  <Sheet.Content side="bottom" class="flex h-[92dvh] max-h-[92dvh] flex-col p-0">
    <Sheet.Header class="border-b border-border">
      <Sheet.Title>{title}</Sheet.Title>
    </Sheet.Header>
    <div class="body min-h-0 flex-1 overflow-y-auto p-4">
      {@render children()}
    </div>
    <Sheet.Footer class="border-t border-border">
      <Button size="lg" class="w-full" onclick={() => (open = false)}>{done}</Button>
    </Sheet.Footer>
  </Sheet.Content>
</Sheet.Root>

<style>
  .body { display: flex; flex-direction: column; gap: var(--space-md); }
  /* One scroll region, the sheet's: a rail that scrolls itself inside it was the "which way
     does a swipe go" bug of /games' first version. flex: none, because the rail's
     `min-height: 0` let it shrink to the sheet's height and spill over what came after it. */
  .body :global(.rail) { overflow-y: visible; flex: none; }
</style>
