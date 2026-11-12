<script lang="ts">
  /**
   * A library game, opened in place under its row (one at a time, like Recommend's "why"):
   * its availability, what it is, and the games most like it that are in the library, each with
   * its own shelf status and star. Its game page is a link, not the default click.
   *
   * "Like this, in the library" is Recommend's own `rankShelf`, with the library as the shelf.
   */
  import { query, catalog } from '$lib/catalog/catalog.svelte';
  import { fetchVectors, loadedVectors, type VectorSet } from '$lib/recommend/vectors';
  import { rankShelf } from '$lib/recommend/rank';
  import { listSql, type LibraryListRow } from '$lib/bggcon/queries';
  import SimilarRow from '$lib/game/SimilarRow.svelte';
  import ComplexityBadge from '$lib/catalog/encodings/ComplexityBadge.svelte';
  import { boxPlayersLabel } from '$lib/catalog/players';
  import { boxPlaytimeLabel } from '$lib/catalog/playtime';
  import UsersIcon from '@lucide/svelte/icons/users';
  import ClockIcon from '@lucide/svelte/icons/clock';
  import ShelfStatus from './ShelfStatus.svelte';
  import StarButton from './StarButton.svelte';

  let {
    game,
    libraryIds,
    asOf
  }: { game: LibraryListRow; libraryIds: ReadonlySet<number>; asOf: string | null } = $props();

  const LIKE_N = 5;
  let vectors = $state.raw<VectorSet | null>(loadedVectors());
  let likes = $state<(LibraryListRow & { similarity: number })[]>([]);
  let likesState = $state<'loading' | 'ready' | 'none' | 'error'>('loading');

  $effect(() => {
    if (vectors) return;
    fetchVectors()
      .then((v) => (vectors = v))
      .catch((e) => {
        console.error('vectors failed', e);
        likesState = 'error';
      });
  });

  $effect(() => {
    const v = vectors;
    const id = game.game_id;
    catalog.checkedOutVersion; // re-read shelf status when availability refreshes
    if (!v) return;
    const hits = rankShelf(v, id, libraryIds, LIKE_N).similar;
    if (!hits.length) {
      likesState = 'none';
      return;
    }
    const sim = new Map(hits.map((h) => [h.id, h.similarity]));
    query<LibraryListRow>(
      listSql({ mode: 'focus', ids: hits.map((h) => h.id), availableOnly: false, offset: 0, limit: LIKE_N })
    )
      .then((rows) => {
        likes = rows
          .map((r) => ({ ...r, similarity: sim.get(r.game_id) ?? 0 }))
          .sort((a, b) => b.similarity - a.similarity);
        likesState = 'ready';
      })
      .catch((e) => {
        console.error('likes query failed', e);
        likesState = 'error';
      });
  });

  const players = $derived(boxPlayersLabel(game.min_players, game.max_players, true));
  const time = $derived(boxPlaytimeLabel(game.min_playtime, game.max_playtime, true));
  const asOfText = $derived(asOf ? new Date(asOf).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null);
</script>

<div class="panel">
  <div class="col a">
    <span class="lbl">Availability</span>
    <span class="big"><b class="tnum">{Math.max(0, game.available)}</b> of <b class="tnum">{game.copies}</b>
      {game.copies === 1 ? 'copy' : 'copies'} on the shelf</span>
    <span class="note">{#if asOfText}As of {asOfText}{/if}{#if game.play_to_win} · play-to-win{/if}</span>

    <span class="lbl">About</span>
    {#if game.in_catalog}
      <span class="facts">
        <ComplexityBadge weight={game.average_weight} />
        {#if players}<span class="fact" title="Players"><UsersIcon aria-hidden="true" /><span class="sr-only">Players</span>{players}</span>{/if}
        {#if time}<span class="fact" title="Play time"><ClockIcon aria-hidden="true" /><span class="sr-only">Play time</span>{time}</span>{/if}
      </span>
      <a class="link" href="/games/{game.game_id}">Open game page →</a>
    {:else}
      <!-- PLACEHOLDER copy (Phil) -->
      <span class="note">Not in the catalog (below its ratings cutoff), so there's no profile here.</span>
      <a class="link" href="https://boardgamegeek.com/boardgame/{game.game_id}" target="_blank" rel="noopener">View on BGG ↗</a>
    {/if}
  </div>

  <div class="col b">
    <span class="lbl">Like this, in the library</span>
    {#if likesState === 'loading'}
      <span class="note">Finding similar games…</span>
    {:else if likesState === 'none'}
      <span class="note">No similar games in the library to show.</span>
    {:else if likesState === 'error'}
      <span class="note">Couldn't load similar games.</span>
    {:else}
      <div class="likes">
        {#each likes as g (g.game_id)}
          <SimilarRow href="/games/{g.game_id}" name={g.name} year={g.year_published} thumbnail={g.thumbnail}
            similarity={g.similarity} rating={g.average_rating}>
            {#snippet action()}
              <ShelfStatus available={g.available} copies={g.copies} />
              <StarButton id={g.game_id} name={g.name} />
            {/snippet}
          </SimilarRow>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .panel {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-md) var(--space-xl);
    padding: var(--space-md) var(--space-md) var(--space-lg);
    border: 1px solid var(--primary);
    border-top: none;
    border-radius: 0 0 8px 8px;
    background: var(--card);
  }
  .col {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    min-width: 0;
  }
  .col.a { flex: 1 1 14rem; }
  .col.b { flex: 2 1 22rem; }
  .lbl {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 600;
    color: var(--muted-foreground);
  }
  .lbl:not(:first-child) { margin-top: 0.5rem; }
  .big { font-size: 1.05rem; }
  .big b { font-size: 1.3rem; }
  .note {
    font-size: 0.75rem;
    color: var(--muted-foreground);
  }
  .facts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
  }
  .fact {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }
  .fact :global(svg) { width: 0.9rem; height: 0.9rem; }
  .link {
    color: var(--primary);
    font-weight: 600;
    font-size: 0.85rem;
    text-decoration: none;
  }
  .link:hover { text-decoration: underline; }
  .likes {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .tnum { font-variant-numeric: tabular-nums; }
</style>
