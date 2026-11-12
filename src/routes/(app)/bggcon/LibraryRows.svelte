<script lang="ts">
  /**
   * The dashboard's list (agreed from a mockup, 2026-11-12): one row per game in a column capped
   * near 56rem, so nothing strands at the far edge of a wide screen. A row: star, art, name and
   * year; under them complexity, players, play time and Best at; then the rating and the
   * game's availability in their own columns. A row with every copy out is tinted.
   *
   * Paged and sorted in DuckDB (`$lib/bggcon/queries`), so sorting covers the whole set and only
   * one page is drawn. A click opens the game under its row (`GamePanel`), one at a time.
   * `title` turns it into one of the "Group by status" sections.
   */
  import { query, catalog } from '$lib/catalog/catalog.svelte';
  import { listSql, countSql, type ListArgs, type LibraryListRow } from '$lib/bggcon/queries';
  import Pager from '$lib/catalog/Pager.svelte';
  import ComplexityBadge from '$lib/catalog/encodings/ComplexityBadge.svelte';
  import PlayerPips from '$lib/catalog/encodings/PlayerPips.svelte';
  import { boxPlayersLabel } from '$lib/catalog/players';
  import { boxPlaytimeLabel } from '$lib/catalog/playtime';
  import { ratingColor } from '$lib/game/similarity';
  import UsersIcon from '@lucide/svelte/icons/users';
  import ClockIcon from '@lucide/svelte/icons/clock';
  import Availability from './Availability.svelte';
  import StarButton from './StarButton.svelte';
  import GamePanel from './GamePanel.svelte';

  let {
    args,
    libraryIds,
    asOf,
    empty,
    title = null,
    header = true
  }: {
    args: ListArgs;
    libraryIds: ReadonlySet<number>;
    asOf: string | null;
    empty: string;
    /** A section heading (Group by status). Without one, it's the plain list. */
    title?: string | null;
    header?: boolean;
  } = $props();

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
    catalog.checkedOutVersion; // availability refreshed: re-read
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
  const toggle = (id: number) => (openId = openId === id ? null : id);
  /** A whole-row click opens, except on the row's own buttons and links. */
  const rowClick = (id: number) => (e: MouseEvent) => {
    if (!(e.target as Element).closest('a, button')) toggle(id);
  };
</script>

<section class="list">
  {#if title}
    <h3 class="grouphd">{title} <span class="n tnum">{loading && !rows.length ? '…' : total.toLocaleString()}</span></h3>
  {/if}

  {#if pages > 1}
    <div class="bar">
      <span class="dim tnum">{(page * PAGE_SIZE + 1).toLocaleString()}–{Math.min(total, (page + 1) * PAGE_SIZE).toLocaleString()} of {total.toLocaleString()}</span>
      <Pager bind:page {pages} />
    </div>
  {/if}

  {#if !loading && rows.length === 0}
    <p class="empty">{empty}</p>
  {:else}
    <div class="rows">
      {#if header}
        <div class="row head" aria-hidden="true">
          <span></span><span></span><span>Game</span><span class="c-rate">Rating</span><span class="c-avail">Availability</span>
        </div>
      {/if}
      {#each rows as g (g.game_id)}
        {@const open = openId === g.game_id}
        {@const players = boxPlayersLabel(g.min_players, g.max_players, true)}
        {@const time = boxPlaytimeLabel(g.min_playtime, g.max_playtime, true)}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div class="row" class:allout={g.available <= 0} class:open onclick={rowClick(g.game_id)}>
          <StarButton id={g.game_id} name={g.name} />
          {#if g.thumbnail}
            <img class="art" src={g.thumbnail} alt="" loading="lazy" />
          {:else}
            <span class="art ph" aria-hidden="true">{g.name.charAt(0).toUpperCase()}</span>
          {/if}
          <span class="txt">
            <button type="button" class="nm" aria-expanded={open} onclick={() => toggle(g.game_id)}>
              {g.name}{#if g.year_published} <span class="yr">{g.year_published}</span>{/if}
            </button>
            {#if g.in_catalog}
              <span class="facts">
                <ComplexityBadge weight={g.average_weight} />
                {#if players}<span class="fact"><UsersIcon aria-hidden="true" /><span class="sr-only">Players</span>{players}</span>{/if}
                {#if time}<span class="fact"><ClockIcon aria-hidden="true" /><span class="sr-only">Play time</span>{time}</span>{/if}
                {#if g.best_player_counts?.length}
                  <span class="fact best">Best <PlayerPips best={g.best_player_counts} recommended={g.recommended_player_counts} compact /></span>
                {/if}
              </span>
            {:else}
              <span class="facts">BGG {g.game_id} · not in the catalog</span>
            {/if}
          </span>
          <span class="c-rate tnum" style:color={ratingColor(g.average_rating)}>
            {g.in_catalog && g.average_rating != null ? g.average_rating.toFixed(1) : '—'}
          </span>
          <span class="c-avail"><Availability available={g.available} copies={g.copies} /></span>
        </div>
        {#if open}<GamePanel id={g.game_id} {libraryIds} {asOf} />{/if}
      {/each}
    </div>
  {/if}

  {#if pages > 1}
    <div class="foot"><Pager bind:page {pages} touch /></div>
  {/if}
</section>

<style>
  .list {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    max-width: 56rem;
  }
  .grouphd {
    margin: var(--space-sm) 0 0;
    font-size: 0.95rem;
    font-weight: 650;
  }
  .grouphd .n {
    font-weight: 400;
    font-size: 0.8rem;
    color: var(--muted-foreground);
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
  .rows {
    border-top: 1px solid var(--border);
  }
  .row {
    display: grid;
    grid-template-columns: 2rem 2.4rem minmax(0, 1fr) 2.8rem 10rem;
    gap: 0 0.75rem;
    align-items: center;
    padding: 0.45rem 0.5rem;
    border-bottom: 1px solid color-mix(in oklch, var(--border) 55%, transparent);
    cursor: pointer;
  }
  .row:hover,
  .row.open {
    background: color-mix(in oklch, var(--primary) 7%, transparent);
  }
  .row.allout {
    background: color-mix(in oklch, var(--status-warn) 10%, transparent);
  }
  .row.head {
    cursor: default;
    padding-block: 0.25rem;
    font-size: 0.72rem;
    color: var(--muted-foreground);
    border-bottom-color: var(--border);
  }
  .row.head:hover { background: none; }
  .art {
    width: 2.4rem;
    height: 2.4rem;
    border-radius: 6px;
    object-fit: cover;
    background: var(--muted);
  }
  .art.ph {
    display: grid;
    place-items: center;
    font-weight: 700;
    color: var(--muted-foreground);
  }
  .txt {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    min-width: 0;
  }
  .nm {
    border: none;
    background: none;
    padding: 0;
    font: inherit;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
    color: var(--foreground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
  .nm:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
    border-radius: 3px;
  }
  .row:hover .nm { color: var(--primary); }
  .yr {
    font-weight: 400;
    font-size: 0.8rem;
    color: var(--muted-foreground);
  }
  .facts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem 0.6rem;
    font-size: 0.75rem;
    color: var(--muted-foreground);
  }
  .fact {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
  }
  .fact :global(svg) { width: 0.8rem; height: 0.8rem; }
  .c-rate {
    font-size: 0.85rem;
    font-weight: 700;
    text-align: right;
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
  /* Phone: the rating drops and availability moves under the name. */
  @media (max-width: 560px) {
    .row { grid-template-columns: 2rem 2.4rem minmax(0, 1fr); row-gap: 0.3rem; }
    .c-rate { display: none; }
    .c-avail { grid-column: 3; }
    .row.head { display: none; }
  }
</style>
