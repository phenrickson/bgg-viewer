<script lang="ts">
  /**
   * A library game, opened in place under its row (one at a time, like Recommend's "why"):
   * its availability, what it is, and the games most like it that are in the library, each with
   * its own shelf status and star. Its game page is a link, not the default click.
   *
   * "Like this, in the library" is `loadLikes` (Recommend's `rankShelf`, the library as the
   * shelf). The page looks them up before opening the row, so they're here on the first draw.
   */
  import { untrack } from 'svelte';
  import { catalog } from '$lib/catalog/catalog.svelte';
  import { loadLikes, cachedLikes, type Like } from '$lib/bggcon/likes';
  import type { LibraryListRow } from '$lib/bggcon/queries';
  import SimilarRow from '$lib/game/SimilarRow.svelte';
  import { boxPlayersLabel, compactCounts } from '$lib/catalog/players';
  import { boxPlaytimeLabel } from '$lib/catalog/playtime';
  import ShelfStatus from './ShelfStatus.svelte';
  import StarButton from './StarButton.svelte';

  let {
    game,
    libraryIds,
    asOf
  }: { game: LibraryListRow; libraryIds: ReadonlySet<number>; asOf: string | null } = $props();

  // Each open row mounts its own panel, so the first look-up is read once.
  const first = untrack(() => cachedLikes(game.game_id));
  let likes = $state<Like[]>(first ?? []);
  let likesState = $state<'loading' | 'ready' | 'error'>(first ? 'ready' : 'loading');

  // Again when availability changes, so their shelf status stays current.
  $effect(() => {
    const id = game.game_id;
    catalog.checkedOutVersion;
    loadLikes(id, libraryIds)
      .then((l) => {
        likes = l;
        likesState = 'ready';
      })
      .catch((e) => {
        console.error('similar games failed', e);
        likesState = 'error';
      });
  });

  const players = $derived(boxPlayersLabel(game.min_players, game.max_players, true));
  const time = $derived(boxPlaytimeLabel(game.min_playtime, game.max_playtime));
  const best = $derived(Array.from(game.best_player_counts ?? []));
  const bestLabel = $derived(best.length ? compactCounts(best) : null);
  const rec = $derived(Array.from(game.recommended_player_counts ?? []).filter((n) => !best.includes(n)));
  const recLabel = $derived(rec.length ? compactCounts(rec) : null);
  const asOfText = $derived(asOf ? new Date(asOf).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null);
</script>

<div class="panel">
  <!-- What it is on the left, its copies on the right; the games like it get the full width below. -->
  <div class="top">
    <div class="about">
      {#if game.in_catalog}
        <!-- The game page's facts strip, as it states them there. -->
        <div class="facts tnum">
          {#if players}<div><span>Players</span><b>{players}</b></div>{/if}
          {#if time}<div><span>Play time</span><b>{time}</b></div>{/if}
          {#if bestLabel}<div><span>Best at</span><b class="hl">{bestLabel}</b></div>{/if}
          {#if recLabel}<div><span>Recommended at</span><b>{recLabel}</b></div>{/if}
        </div>
        <a class="link" href="/games/{game.game_id}">Open game page →</a>
      {:else}
        <!-- PLACEHOLDER copy (Phil) -->
        <span class="note">Not in the catalog (below its ratings cutoff), so there's no profile here.</span>
        <a class="link" href="https://boardgamegeek.com/boardgame/{game.game_id}" target="_blank" rel="noopener">View on BGG ↗</a>
      {/if}
    </div>
    <div class="avail">
      <span class="big"><b class="tnum">{Math.max(0, game.available)}</b> of <b class="tnum">{game.copies}</b>
        {game.copies === 1 ? 'copy' : 'copies'} available</span>
      <span class="note">{#if asOfText}As of {asOfText}{/if}{#if game.play_to_win} · play-to-win{/if}</span>
    </div>
  </div>

  <div class="like">
    <span class="lbl">Like this, in the library</span>
    {#if likesState === 'loading'}
      <span class="note">Finding similar games…</span>
    {:else if likesState === 'error'}
      <span class="note">Couldn't load similar games.</span>
    {:else if likes.length === 0}
      <span class="note">No similar games in the library to show.</span>
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
  /*
   * Hangs under its row's title: everything starts at the name column (past the star and art
   * tracks of GameList's row), so the panel reads as that game's, not as a new block. Plain,
   * no tint; the list's own divider closes it.
   */
  .panel {
    --indent: calc(2.4rem + 1.85rem + 2 * var(--space-md));
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    padding: 0.25rem var(--space-md) var(--space-lg) calc(var(--space-md) + var(--indent));
    border-bottom: 1px solid color-mix(in oklch, var(--border) 55%, transparent);
  }
  @container (max-width: 40rem) {
    .panel { padding-left: var(--space-md); }
  }
  .top {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-md) var(--space-xl);
  }
  .about,
  .like {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    min-width: 0;
  }
  .avail {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.2rem;
    text-align: right;
  }
  /* The game page's facts strip (games/[id]/+page.svelte .facts). */
  .facts {
    display: flex;
    flex-wrap: wrap;
    gap: 1.1rem;
    font-size: 0.85rem;
  }
  .facts div span {
    color: var(--muted-foreground);
    display: block;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .facts div b { font-weight: 650; }
  .facts .hl { color: var(--primary); }
  .lbl {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 600;
    color: var(--muted-foreground);
  }
  .big { font-size: 1.05rem; }
  .big b { font-size: 1.3rem; }
  .note {
    font-size: 0.75rem;
    color: var(--muted-foreground);
  }
  .link {
    color: var(--primary);
    font-weight: 600;
    font-size: 0.85rem;
    text-decoration: none;
  }
  .link:hover { text-decoration: underline; }
  /* A reading width, not the panel's: stretched across a wide table the cards opened a gap
     between each name and its badges. Room for five from the first draw (SimilarRow: 2rem
     art + padding and border, 0.35rem apart), so the panel doesn't grow when they arrive. */
  .likes {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    max-width: 38rem;
    min-height: calc(5 * 3.05rem + 4 * 0.35rem);
  }
  .tnum { font-variant-numeric: tabular-nums; }
</style>
