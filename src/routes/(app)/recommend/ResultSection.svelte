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
   * The list Recommend's answer shows — Recommended, Most similar, Dark horses (the page's
   * picker chooses which), or the one shelf list: an optional heading and blurb, then its games — as tiles or as the game page's similar-games rows (all of them).
   *
   * Each game says what it IS — complexity, players, play time — not what it shares with the
   * seed; the comparison is an action. Clicking a game opens its "why" (the side-by-side
   * analysis) right under it, with "Open game page" and "Games like this" at its head. One open
   * at a time, so the page owns which, via `whyId`. The magnifier on a tile is the shortcut
   * for "Games like this" without opening it.
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
  import ScanSearchIcon from '@lucide/svelte/icons/scan-search';
  import UsersIcon from '@lucide/svelte/icons/users';
  import ClockIcon from '@lucide/svelte/icons/clock';
  import { similarityPct } from '$lib/game/similarity';
  import WhyMatch from './WhyMatch.svelte';

  let {
    /** Heading and blurb; left out when something above already names the list (the
     *  page's Recommended / Most Similar / Dark Horses picker). */
    title = '',
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
    title?: string;
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

  // Every game shows, as tiles or as rows (Phil, 2026-11-09: all 10 by default, no "All").
  const shown = $derived(items);
  const whyOf = (g: Item) => explain(seed, g, freq);
  const gameHref = (id: number) => `/games/${id}`;
</script>

<section class="sec">
  <!-- No header at all when nothing names the list, so it starts right under the picker. -->
  {#if title || blurb || headEnd}
    <header>
      <div>
        {#if title}<h2>{title}</h2>{/if}
        {#if blurb}<p>{blurb}</p>{/if}
      </div>
      {#if headEnd}{@render headEnd()}{/if}
    </header>
  {/if}

  {#snippet factsOf(g: Item)}
    {@const players = boxPlayersLabel(g.min_players, g.max_players, true)}
    {@const time = boxPlaytimeLabel(g.min_playtime, g.max_playtime, true)}
    <ComplexityBadge weight={g.predicted_complexity} />
    {#if players}<span class="fact" title="Players"><UsersIcon aria-hidden="true" /><span class="sr-only">Players</span>{players}</span>{/if}
    {#if time}<span class="fact" title="Play time"><ClockIcon aria-hidden="true" /><span class="sr-only">Play time</span>{time}</span>{/if}
  {/snippet}
  {#snippet gameActions(g: Item)}
    <!-- PLACEHOLDER copy (Phil): the label (tooltip and screen reader). -->
    <Button variant="secondary" size="icon-sm" class="act" title="Games like this" aria-label="Games like this" onclick={() => onwalk(g.game_id)}
      ><ScanSearchIcon /></Button
    >
  {/snippet}

  <!-- The "why" opens right under the game it's about: after its row in the list, and as a
       full-width grid item after its tile (the grid packs densely, so the tiles after it
       backfill their row and the panel lands under that row). -->
  {#snippet whyPanel(g: Item)}
    <div class="why" data-full>
      <div class="why-head">
        <!-- PLACEHOLDER copy (Phil) -->
        <p class="why-title">Why {g.name} is a {Math.round(similarityPct(g.similarity))}% match</p>
        <!-- PLACEHOLDER copy (Phil): both actions. -->
        <div class="why-acts">
          <Button variant="outline" size="sm" href={gameHref(g.game_id)}>Open game page ↗</Button>
          <Button variant="outline" size="sm" onclick={() => onwalk(g.game_id)}>Games like this</Button>
          <Button variant="ghost" size="icon-sm" aria-label="Close" onclick={() => onwhy(g.game_id)}>×</Button>
        </div>
      </div>
      <WhyMatch why={whyOf(g)} {seed} other={g} />
    </div>
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
          onopen={() => onwhy(g.game_id)}
          expanded={whyId === g.game_id}
        >
          <span class="row-facts">
            {#if markOwned && owned.has(g.game_id)}<span class="own">On your shelf</span>{/if}{@render factsOf(g)}
          </span>
          {#snippet action()}{@render gameActions(g)}{/snippet}
        </SimilarRow>
        {#if g.game_id === whyId}{@render whyPanel(g)}{/if}
      {/each}
    </div>
  {:else}
    <AutoGrid min="md" gap="md" class="why-grid">
      {#each shown as g (g.game_id)}
        <GameTile
          href={gameHref(g.game_id)}
          name={g.name}
          year={g.year_published}
          thumbnail={g.thumbnail}
          similarity={g.similarity}
          rating={g.average_rating}
          marker={markOwned && owned.has(g.game_id) ? 'On your shelf' : ''}
          onopen={() => onwhy(g.game_id)}
          expanded={whyId === g.game_id}
        >
          {#snippet facts()}{@render factsOf(g)}{/snippet}
          {#snippet actions()}{@render gameActions(g)}{/snippet}
        </GameTile>
        {#if g.game_id === whyId}{@render whyPanel(g)}{/if}
      {/each}
    </AutoGrid>
  {/if}

</section>

<style>
  .sec { display: flex; flex-direction: column; gap: var(--space-sm); }
  header { display: flex; align-items: flex-end; gap: var(--space-md); }
  header > div { flex: 1; min-width: 0; }
  h2 { font-size: 1.05rem; font-weight: 700; letter-spacing: -0.01em; margin: 0; }
  header p { font-size: 0.85rem; color: var(--muted-foreground); margin: 0.15rem 0 0; }
  .own { color: var(--primary); font-weight: 600; }
  /* A game's two icon actions, on the art's corner: solid enough to read over any cover. */
  .sec :global(.act) { color: var(--foreground); box-shadow: 0 1px 2px oklch(0 0 0 / 0.35); }
  .sec :global(.act:hover), .sec :global(.act[aria-expanded='true']) { color: var(--primary); }
  /* An icon and its number, kept together. Positioned, so its screen-reader label (absolute)
     is placed inside it, not against the page, where it would stretch the document. */
  .sec :global(.fact) { position: relative; display: inline-flex; align-items: center; gap: 0.25rem; white-space: nowrap; }
  .sec :global(.fact svg) { width: 0.85rem; height: 0.85rem; flex: none; }
  /* The list's facts: whole facts wrap, never mid-fact. */
  .row-facts { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 0.2rem 0.6rem; }
  .row-facts > :global(*) { white-space: nowrap; }
  /* The game page's similar-games list: rows a little apart. */
  .list { display: flex; flex-direction: column; gap: 0.4rem; }
  .sec :global(.why-grid) { grid-auto-flow: row dense; }
  .why {
    display: flex; flex-direction: column; gap: var(--space-sm);
    padding: var(--space-md); border: 1px solid var(--border); border-radius: var(--radius);
    background: var(--card);
    container-type: inline-size;
  }
  .why-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-sm); }
  .why-acts { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-xs, 0.4rem); }
  .why-title { margin: 0; font-size: 0.95rem; font-weight: 650; }
</style>
