<script lang="ts">
  /**
   * The dashboard's list: Recommend's rows (`SimilarRow` with `onopen`), paged and sorted in
   * DuckDB the way `GameList` is, so a sort or "available first" covers the whole set and only
   * one page is drawn. Clicking a game opens it in place (`GamePanel`), one at a time.
   */
  import { query, catalog } from '$lib/catalog/catalog.svelte';
  import { listSql, countSql, type ListArgs, type LibraryListRow } from '$lib/bggcon/queries';
  import SimilarRow from '$lib/game/SimilarRow.svelte';
  import SimBadges from '$lib/game/SimBadges.svelte';
  import Pager from '$lib/catalog/Pager.svelte';
  import ComplexityBadge from '$lib/catalog/encodings/ComplexityBadge.svelte';
  import { boxPlayersLabel } from '$lib/catalog/players';
  import { boxPlaytimeLabel } from '$lib/catalog/playtime';
  import UsersIcon from '@lucide/svelte/icons/users';
  import ClockIcon from '@lucide/svelte/icons/clock';
  import ShelfStatus from './ShelfStatus.svelte';
  import StarButton from './StarButton.svelte';
  import GamePanel from './GamePanel.svelte';

  let {
    args,
    libraryIds,
    asOf,
    empty
  }: { args: ListArgs; libraryIds: ReadonlySet<number>; asOf: string | null; empty: string } = $props();

  const PAGE_SIZE = 50;
  let page = $state(0);
  let rows = $state<LibraryListRow[]>([]);
  let total = $state(0);
  let loading = $state(true);
  let openId = $state<number | null>(null);

  // A new question starts at page one.
  $effect(() => {
    JSON.stringify(args);
    page = 0;
  });

  let token = 0;
  $effect(() => {
    const a = $state.snapshot(args) as ListArgs;
    const offset = page * PAGE_SIZE;
    catalog.checkedOutVersion; // availability refreshed: re-sort and re-count
    catalog.thumbnailsReady;
    const mine = ++token;
    loading = true;
    Promise.all([
      query<{ n: number }>(countSql(a)),
      query<LibraryListRow>(listSql({ ...a, offset, limit: PAGE_SIZE }))
    ])
      .then(([c, r]) => {
        if (mine !== token) return;
        total = c[0]?.n ?? 0;
        rows = r;
        loading = false;
      })
      .catch((e) => {
        if (mine !== token) return;
        loading = false;
        console.error('library list query failed', e);
      });
  });

  const pages = $derived(Math.max(1, Math.ceil(total / PAGE_SIZE)));
</script>

<div class="list">
  {#if pages > 1}
    <div class="bar">
      <span class="dim tnum">{(page * PAGE_SIZE + 1).toLocaleString()}–{Math.min(total, (page + 1) * PAGE_SIZE).toLocaleString()} of {total.toLocaleString()}</span>
      <Pager bind:page {pages} />
    </div>
  {/if}

  {#if !loading && rows.length === 0}
    <p class="empty">{empty}</p>
  {/if}

  {#each rows as g (g.game_id)}
    {@const open = openId === g.game_id}
    <div class="item" class:open>
      <SimilarRow
        href={g.in_catalog ? `/games/${g.game_id}` : `https://boardgamegeek.com/boardgame/${g.game_id}`}
        name={g.name}
        year={g.year_published}
        thumbnail={g.thumbnail}
        onopen={() => (openId = open ? null : g.game_id)}
        expanded={open}
        badges={false}
      >
        {#snippet lead()}<StarButton id={g.game_id} name={g.name} />{/snippet}
        {#if g.in_catalog}
          {@const players = boxPlayersLabel(g.min_players, g.max_players, true)}
          {@const time = boxPlaytimeLabel(g.min_playtime, g.max_playtime, true)}
          <span class="facts">
            <ComplexityBadge weight={g.average_weight} />
            {#if players}<span class="fact"><UsersIcon aria-hidden="true" /><span class="sr-only">Players</span>{players}</span>{/if}
            {#if time}<span class="fact"><ClockIcon aria-hidden="true" /><span class="sr-only">Play time</span>{time}</span>{/if}
          </span>
        {:else}
          <span class="dim">BGG {g.game_id} · not in the catalog</span>
        {/if}
        {#snippet middle()}
          <!-- Beside the name, not at the far edge: on a wide screen the eye shouldn't have to
               cross the row to connect a game with whether it's on the shelf (Phil). -->
          <span class="status">
            {#if g.in_catalog}<SimBadges rating={g.average_rating} />{/if}
            <ShelfStatus available={g.available} copies={g.copies} />
          </span>
        {/snippet}
      </SimilarRow>
      {#if open}
        <GamePanel game={g} {libraryIds} {asOf} />
      {/if}
    </div>
  {/each}

  {#if pages > 1}
    <div class="foot"><Pager bind:page {pages} touch /></div>
  {/if}
</div>

<style>
  /* Capped, like Recommend's list: on a wide screen the rows would otherwise stretch empty
     to the far edge. */
  .list {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    max-width: 64rem;
  }
  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
    flex-wrap: wrap;
    font-size: 0.8rem;
  }
  .foot {
    display: flex;
    justify-content: center;
    padding-top: var(--space-md);
  }
  /* The open row joins the panel under it. */
  .item.open :global(.row) {
    border-color: var(--primary);
    border-radius: 8px 8px 0 0;
  }
  .facts {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }
  .fact {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
  }
  .fact :global(svg) { width: 0.8rem; height: 0.8rem; }
  /* Rating beside the name; availability at the row's right edge. */
  .status {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
  }
  .status :global(.shelf) {
    margin-left: auto;
  }
  .dim { color: var(--muted-foreground); }
  .tnum { font-variant-numeric: tabular-nums; }
  .empty {
    margin: 0;
    padding: var(--space-lg);
    border: 1px dashed var(--border);
    border-radius: 8px;
    color: var(--muted-foreground);
  }
</style>
