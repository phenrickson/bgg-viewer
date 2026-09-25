<script lang="ts" module>
  import type { WhyRow } from '$lib/recommend/why';

  /** A game as the Recommend page shows it: a catalog row, plus its match to the seed. */
  export type Game = WhyRow & {
    game_id: number;
    name: string;
    year_published: number | null;
    average_rating: number | null;
    thumbnail: string | null;
  };
  export type Item = Game & { similarity: number };
</script>

<script lang="ts">
  /**
   * One stacked section of Recommend's answer — Recommended, Most similar, Dark horses, or the
   * one shelf list: a heading and blurb, the first few matches as tiles, "All" to show the rest,
   * and the full "why" for a tile opening under the section.
   */
  import { AutoGrid } from '$lib/components/ui/layout';
  import { Button } from '$lib/components/ui/button';
  import GameTile from '$lib/catalog/GameTile.svelte';
  import { explain, whyLine, type TagFrequencies } from '$lib/recommend/why';
  import WhyMatch from './WhyMatch.svelte';

  /** Tiles shown before "All". */
  const TILES_SHOWN = 4;

  let {
    title,
    blurb = '',
    items,
    seed,
    freq,
    /** Games on the reader's shelf — marked on each tile when `markOwned`. */
    owned,
    markOwned = false,
    hrefFor
  }: {
    title: string;
    blurb?: string;
    items: Item[];
    seed: Game;
    freq: TagFrequencies;
    owned: Set<number>;
    markOwned?: boolean;
    hrefFor: (id: number) => string;
  } = $props();

  let all = $state(false);
  let openWhy = $state<number | null>(null);
  const shown = $derived(all ? items : items.slice(0, TILES_SHOWN));
  const whyOf = (g: Item) => explain(seed, g, freq);
  const open = $derived(items.find((g) => g.game_id === openWhy) ?? null);
</script>

<section class="sec">
  <header>
    <div>
      <h2>{title}</h2>
      {#if blurb}<p>{blurb}</p>{/if}
    </div>
    {#if items.length > TILES_SHOWN}
      <!-- PLACEHOLDER copy (Phil) -->
      <Button variant="link" size="sm" onclick={() => (all = !all)}>{all ? 'Fewer' : `All ${items.length}`}</Button>
    {/if}
  </header>

  <AutoGrid min="md" gap="md">
    {#each shown as g (g.game_id)}
      <GameTile
        href={hrefFor(g.game_id)}
        name={g.name}
        year={g.year_published}
        thumbnail={g.thumbnail}
        similarity={g.similarity}
        rating={g.average_rating}
      >
        {#snippet line()}
          {#if markOwned && owned.has(g.game_id)}<span class="own">On your shelf</span> · {/if}{whyLine(whyOf(g)).join(' · ')}
          <Button
            variant="link"
            size="xs"
            class="why-btn"
            aria-expanded={openWhy === g.game_id}
            onclick={() => (openWhy = openWhy === g.game_id ? null : g.game_id)}
          >
            {openWhy === g.game_id ? 'Hide why' : 'Why?'}
          </Button>
        {/snippet}
      </GameTile>
    {/each}
  </AutoGrid>

  {#if open}
    <div class="why">
      <!-- PLACEHOLDER copy (Phil) -->
      <p class="why-title">Why {open.name} is like {seed.name}</p>
      <WhyMatch why={whyOf(open)} seed={seed.name} other={open.name} />
    </div>
  {/if}
</section>

<style>
  .sec { display: flex; flex-direction: column; gap: var(--space-sm); }
  header { display: flex; align-items: flex-end; gap: var(--space-md); }
  header > div { flex: 1; min-width: 0; }
  h2 { font-size: 1.05rem; font-weight: 700; letter-spacing: -0.01em; margin: 0; }
  header p { font-size: 0.85rem; color: var(--muted-foreground); margin: 0.15rem 0 0; }
  .own { color: var(--primary); font-weight: 600; }
  /* The link button sits inline at the end of the one-line why, not on a row of its own. */
  .sec :global(.why-btn) { height: auto; padding: 0 0 0 0.25rem; vertical-align: baseline; }
  .why {
    display: flex; flex-direction: column; gap: var(--space-sm);
    padding: var(--space-md); border: 1px solid var(--border); border-radius: var(--radius);
    background: var(--card);
  }
  .why-title { margin: 0; font-size: 0.9rem; font-weight: 650; }
</style>
