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
  /** How a section shows its games: tiles, or the game page's similar-games rows. */
  export type Display = 'cards' | 'list';
</script>

<script lang="ts">
  /**
   * One stacked section of Recommend's answer — Recommended, Most similar, Dark horses, or the
   * one shelf list: a heading and blurb, then its games — as tiles (the first few, "All" for
   * the rest) or as the game page's similar-games rows (all of them).
   *
   * Each game does three things, kept apart: the game itself opens its page; its match score
   * opens "why" (one at a time across the page, so the page owns which, via `whyId`; the panel
   * opens under the section holding that game); "Games like this" walks on from it.
   */
  import type { Snippet } from 'svelte';
  import { AutoGrid } from '$lib/components/ui/layout';
  import { Button } from '$lib/components/ui/button';
  import GameTile from '$lib/catalog/GameTile.svelte';
  import SimilarRow from '$lib/game/SimilarRow.svelte';
  import { explain, whyLine, type TagFrequencies } from '$lib/recommend/why';
  import { similarityPct } from '$lib/game/similarity';
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
    display = 'cards',
    whyId,
    onwhy,
    onwalk,
    /** The game whose art is mid-walk into the hero (named for the view transition). */
    walking = null,
    /** Extra controls at the end of the header (the page puts Cards | List on the first). */
    headEnd
  }: {
    title: string;
    blurb?: string;
    items: Item[];
    seed: Game;
    freq: TagFrequencies;
    owned: Set<number>;
    markOwned?: boolean;
    display?: Display;
    whyId: number | null;
    onwhy: (id: number) => void;
    onwalk: (id: number) => void;
    walking?: number | null;
    headEnd?: Snippet;
  } = $props();

  let all = $state(false);
  // A list is compact enough to show every game; tiles show a few until "All".
  const shown = $derived(display === 'list' || all ? items : items.slice(0, TILES_SHOWN));
  const whyOf = (g: Item) => explain(seed, g, freq);
  const open = $derived(items.find((g) => g.game_id === whyId) ?? null);
  const gameHref = (id: number) => `/games/${id}`;
</script>

<section class="sec">
  <header>
    <div>
      <h2>{title}</h2>
      {#if blurb}<p>{blurb}</p>{/if}
    </div>
    {#if display === 'cards' && items.length > TILES_SHOWN}
      <!-- PLACEHOLDER copy (Phil) -->
      <Button variant="link" size="sm" onclick={() => (all = !all)}>{all ? 'Fewer' : `All ${items.length}`}</Button>
    {/if}
    {#if headEnd}{@render headEnd()}{/if}
  </header>

  {#snippet whyText(g: Item)}
    {#if markOwned && owned.has(g.game_id)}<span class="own">On your shelf</span> · {/if}{whyLine(whyOf(g)).join(' · ')}
  {/snippet}
  {#snippet walkButton(g: Item)}
    <!-- PLACEHOLDER copy (Phil) -->
    <Button variant="link" size="xs" class="walk" onclick={() => onwalk(g.game_id)}>Games like this</Button>
  {/snippet}

  {#if display === 'list'}
    <div class="list">
      {#each shown as g (g.game_id)}
        <SimilarRow
          href={gameHref(g.game_id)}
          name={g.name}
          year={g.year_published}
          thumbnail={g.thumbnail}
          similarity={g.similarity}
          rating={g.average_rating}
          onsim={() => onwhy(g.game_id)}
          simOpen={whyId === g.game_id}
        >
          {@render whyText(g)}
          {#snippet action()}{@render walkButton(g)}{/snippet}
        </SimilarRow>
      {/each}
    </div>
  {:else}
    <AutoGrid min="md" gap="md">
      {#each shown as g (g.game_id)}
        <GameTile
          href={gameHref(g.game_id)}
          name={g.name}
          year={g.year_published}
          thumbnail={g.thumbnail}
          similarity={g.similarity}
          rating={g.average_rating}
          onsim={() => onwhy(g.game_id)}
          simOpen={whyId === g.game_id}
          artTransition={walking === g.game_id ? 'seed-art' : null}
        >
          {#snippet line()}{@render whyText(g)}{/snippet}
          {#snippet actions()}{@render walkButton(g)}{/snippet}
        </GameTile>
      {/each}
    </AutoGrid>
  {/if}

  {#if open}
    <div class="why">
      <div class="why-head">
        <!-- PLACEHOLDER copy (Phil) -->
        <p class="why-title">Why {open.name} is a {Math.round(similarityPct(open.similarity))}% match</p>
        <Button variant="ghost" size="icon-sm" aria-label="Close" onclick={() => onwhy(open.game_id)}>×</Button>
      </div>
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
  /* "Games like this": quiet until pointed at, so a page of them doesn't shout. */
  .sec :global(.walk) { height: auto; padding: 0; color: var(--muted-foreground); }
  .sec :global(.walk:hover) { color: var(--primary); }
  /* The game page's similar-games list: rows a little apart. */
  .list { display: flex; flex-direction: column; gap: 0.4rem; }
  .why {
    display: flex; flex-direction: column; gap: var(--space-sm);
    padding: var(--space-md); border: 1px solid var(--border); border-radius: var(--radius);
    background: var(--card);
  }
  .why-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-sm); }
  .why-title { margin: 0; font-size: 0.95rem; font-weight: 650; }
</style>
