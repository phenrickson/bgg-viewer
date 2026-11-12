<script lang="ts">
  /**
   * A library game, opened in place under its row: one line of what the row doesn't already
   * say (players, play time, play-to-win, the game page), then the games most like it in the
   * library, as rows lined up under the table's own columns (`--gl-cols`, set by `GameList`) and
   * drawn with the same pieces: star, art, name, `RatingBar`, `ComplexityMeter`, `ShelfStatus`.
   *
   * "Like this, in the library" is `loadLikes` (Recommend's `rankShelf`, the library as the
   * shelf). Space for them is held from the first draw, so the panel doesn't grow.
   */
  import { untrack } from 'svelte';
  import { catalog } from '$lib/catalog/catalog.svelte';
  import { loadLikes, cachedLikes, type Like } from '$lib/bggcon/likes';
  import type { LibraryListRow } from '$lib/bggcon/queries';
  import RatingBar from '$lib/catalog/encodings/RatingBar.svelte';
  import ComplexityMeter from '$lib/catalog/encodings/ComplexityMeter.svelte';
  import { boxPlayersLabel } from '$lib/catalog/players';
  import { boxPlaytimeLabel } from '$lib/catalog/playtime';
  import ShelfStatus from './ShelfStatus.svelte';
  import StarButton from './StarButton.svelte';

  let {
    game,
    libraryIds,
    /** On a phone the table is cards, with no columns to line up under: rows keep art, name and availability. */
    narrow = false
  }: { game: LibraryListRow; libraryIds: ReadonlySet<number>; narrow?: boolean } = $props();

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

  const facts = $derived(
    [
      boxPlayersLabel(game.min_players, game.max_players, true),
      boxPlaytimeLabel(game.min_playtime, game.max_playtime, true),
      game.play_to_win ? 'Play-to-win' : null
    ].filter(Boolean)
  );
</script>

<div class="panel" class:narrow>
  <p class="line">
    {#if game.in_catalog}
      {#each facts as f, i (i)}<span>{f}</span><span class="sep" aria-hidden="true">·</span>{/each}
      <a class="link" href="/games/{game.game_id}">Open game page →</a>
    {:else}
      <!-- PLACEHOLDER copy (Phil) -->
      <span>Not in the catalog (below its ratings cutoff).</span><span class="sep" aria-hidden="true">·</span>
      <a class="link" href="https://boardgamegeek.com/boardgame/{game.game_id}" target="_blank" rel="noopener">View on BGG ↗</a>
    {/if}
  </p>

  <p class="lbl">Like this, in the library</p>
  <div class="likes">
    {#if likesState === 'loading'}
      <p class="note">Finding similar games…</p>
    {:else if likesState === 'error'}
      <p class="note">Couldn't load similar games.</p>
    {:else if likes.length === 0}
      <p class="note">No similar games in the library to show.</p>
    {:else}
      {#each likes as g (g.game_id)}
        <div class="sim">
          <span class="lead"><StarButton id={g.game_id} name={g.name} /></span>
          {#if g.thumbnail}
            <img class="thumb" src={g.thumbnail} alt="" loading="lazy" aria-hidden="true" />
          {:else}
            <span class="thumb ph" aria-hidden="true">{g.name.charAt(0).toUpperCase()}</span>
          {/if}
          <span class="name">
            <a class="nm" href="/games/{g.game_id}">{g.name}</a>
            <span class="pct tnum" title="similarity">{Math.round(g.similarity * 100)}%</span>
          </span>
          {#if !narrow}
            <span class="gauge"><RatingBar value={g.geek_rating} /></span>
            <span class="gauge"><ComplexityMeter weight={g.average_weight} barHeight="3px" /></span>
          {/if}
          <span class="avail"><ShelfStatus available={g.available} copies={g.copies} /></span>
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  /* Plain, under its row; the list's own divider closes it. */
  .panel {
    padding: 0 0 var(--space-md);
    border-bottom: 1px solid color-mix(in oklch, var(--border) 55%, transparent);
  }
  /* The one line and the label start at the name column: past the star and art tracks. */
  .line,
  .lbl {
    margin: 0;
    padding-left: calc(var(--space-md) + 2.4rem + 1.85rem + 2 * var(--space-md));
    padding-right: var(--space-md);
  }
  .narrow .line,
  .narrow .lbl { padding-left: var(--space-md); }
  .line {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.4rem;
    font-size: 0.8rem;
    color: var(--muted-foreground);
  }
  .sep { opacity: 0.6; }
  .link {
    color: var(--primary);
    font-weight: 600;
    text-decoration: none;
  }
  .link:hover { text-decoration: underline; }
  .lbl {
    margin-top: var(--space-md);
    font-size: 0.66rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 600;
    color: var(--muted-foreground);
  }
  /* Room for five rows from the first draw, so nothing grows when they arrive. */
  .likes { min-height: calc(5 * 2.55rem); }
  .note {
    margin: 0;
    padding: 0.5rem var(--space-md) 0 calc(var(--space-md) + 2.4rem + 1.85rem + 2 * var(--space-md));
    font-size: 0.75rem;
    color: var(--muted-foreground);
  }
  .narrow .note { padding-left: var(--space-md); }

  /* GameList's grid and spacing, so each cell sits under its column. */
  .sim {
    display: grid;
    grid-template-columns: var(
      --gl-cols,
      minmax(2.4rem, max-content) 1.85rem minmax(11rem, 1fr) minmax(4rem, max-content) minmax(4.6rem, max-content) minmax(8rem, max-content)
    );
    align-items: center;
    gap: 0 var(--space-md);
    padding: 0.34rem var(--space-md);
  }
  .narrow .sim { grid-template-columns: minmax(2.4rem, max-content) 1.85rem minmax(0, 1fr) max-content; }
  .sim > * { min-width: 0; }
  .lead { text-align: right; }
  .thumb {
    width: 1.85rem;
    height: 1.85rem;
    border-radius: 6px;
    object-fit: cover;
    background: color-mix(in oklch, var(--muted) 70%, var(--card));
  }
  .thumb.ph {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--muted-foreground);
    font-size: 0.68rem;
    font-weight: 650;
  }
  .name {
    display: flex;
    align-items: baseline;
    gap: 0.45rem;
    min-width: 0;
  }
  .nm {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--foreground);
    text-decoration: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .nm:hover { color: var(--primary); }
  .pct {
    flex: none;
    font-size: 0.72rem;
    color: var(--muted-foreground);
  }
  .gauge {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .tnum { font-variant-numeric: tabular-nums; }
</style>
