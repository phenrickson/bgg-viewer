<script lang="ts" module>
  import type { WhyRow } from '$lib/recommend/why';

  /** A game as the Recommend page shows it: a catalog row, plus its match to the seed. */
  export type Game = WhyRow & {
    game_id: number;
    name: string;
    year_published: number | null;
    average_rating: number | null;
    designers: readonly string[] | null;
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
   * Each game says what it IS — complexity, players, play time — not what it shares with the
   * seed; the comparison is an action. Three things, kept apart: the game opens its page; "Why
   * this match" opens the side-by-side analysis (one at a time across the page, so the page
   * owns which, via `whyId`; it opens under the section holding that game); "Games like this"
   * walks on from it.
   */
  import type { Snippet } from 'svelte';
  import { AutoGrid } from '$lib/components/ui/layout';
  import { Button } from '$lib/components/ui/button';
  import GameTile from '$lib/catalog/GameTile.svelte';
  import SimilarRow from '$lib/game/SimilarRow.svelte';
  import { explain, type TagFrequencies } from '$lib/recommend/why';
  import ComplexityBadge from '$lib/catalog/encodings/ComplexityBadge.svelte';
  import { boxPlayersLabel } from '$lib/catalog/players';
  import { boxPlaytimeLabel } from '$lib/catalog/playtime';
  import InfoIcon from '@lucide/svelte/icons/info';
  import ScanSearchIcon from '@lucide/svelte/icons/scan-search';
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

  {#snippet factsOf(g: Item)}
    <ComplexityBadge weight={g.predicted_complexity} />
    {#each [boxPlayersLabel(g.min_players, g.max_players), boxPlaytimeLabel(g.min_playtime, g.max_playtime)].filter(Boolean) as f (f)}
      <span>{f}</span>
    {/each}
  {/snippet}
  {#snippet gameActions(g: Item)}
    <!-- PLACEHOLDER copy (Phil): both labels (tooltip and screen reader). -->
    <Button
      variant="ghost"
      size="icon-xs"
      class="act"
      title="Why this match"
      aria-label="Why this match"
      aria-expanded={whyId === g.game_id}
      onclick={() => onwhy(g.game_id)}><InfoIcon /></Button
    >
    <Button variant="ghost" size="icon-xs" class="act" title="Games like this" aria-label="Games like this" onclick={() => onwalk(g.game_id)}
      ><ScanSearchIcon /></Button
    >
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
        >
          <span class="row-facts">
            {#if markOwned && owned.has(g.game_id)}<span class="own">On your shelf</span>{/if}{@render factsOf(g)}
          </span>
          {#snippet action()}{@render gameActions(g)}{/snippet}
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
          marker={markOwned && owned.has(g.game_id) ? 'On your shelf' : ''}
        >
          {#snippet facts()}{@render factsOf(g)}{/snippet}
          {#snippet actions()}{@render gameActions(g)}{/snippet}
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
  /* A game's two icon actions: quiet until pointed at (or open), so a page of them doesn't shout. */
  .sec :global(.act) { color: var(--muted-foreground); }
  .sec :global(.act:hover), .sec :global(.act[aria-expanded='true']) { color: var(--primary); }
  /* The list's facts: whole facts wrap, never mid-fact. */
  .row-facts { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 0.2rem 0.6rem; }
  .row-facts > :global(*) { white-space: nowrap; }
  /* The game page's similar-games list: rows a little apart. */
  .list { display: flex; flex-direction: column; gap: 0.4rem; }
  .why {
    display: flex; flex-direction: column; gap: var(--space-sm);
    padding: var(--space-md); border: 1px solid var(--border); border-radius: var(--radius);
    background: var(--card);
    container-type: inline-size;
  }
  .why-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-sm); }
  .why-title { margin: 0; font-size: 0.95rem; font-weight: 650; }
</style>
