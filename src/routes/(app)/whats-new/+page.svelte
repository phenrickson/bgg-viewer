<script lang="ts">
  import { Container, Stack } from '$lib/components/ui/layout';
  import { hurdleTier } from '$lib/monitoring/hurdleTier';
  import type { NewGameRow } from '$lib/server/warehouse';
  import type { PageData } from './$types';
  import Trend from './Trend.svelte';
  import GameCard from '$lib/catalog/GameCard.svelte';

  let { data }: { data: PageData } = $props();

  const RANGES = [7, 30, 365] as const;

  const absoluteFmt = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });

  /**
   * Games land in daily batches, so a 7-day window is mostly identical absolute
   * timestamps repeated dozens of times — the one column this page exists to show
   * ends up carrying the least information on the screen. Relative time reads
   * faster and stops repeating itself; the exact timestamp is still one hover away.
   */
  function formatSeen(iso: string): string {
    const then = new Date(iso).getTime();
    const hours = (Date.now() - then) / 3_600_000;
    if (hours < 1) return 'just now';
    if (hours < 24) return `${Math.floor(hours)}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    return absoluteFmt.format(then);
  }

  /** "38%", "5.3%", "<1%" — a rounded "0%" hides the range that matters. Mirrors
   *  GameList.svelte's probText exactly. */
  function probText(v: number | null): string {
    if (v == null) return '—';
    const pc = v * 100;
    if (pc < 1) return '<1%';
    if (pc < 10) return `${pc.toFixed(1)}%`;
    return `${Math.round(pc)}%`;
  }

  type SortKey = 'name' | 'year' | 'added' | 'hurdle';
  const SORTERS: Record<SortKey, (g: NewGameRow) => number | string> = {
    name: (g) => g.name.toLowerCase(),
    year: (g) => g.year_published ?? -Infinity,
    added: (g) => g.first_seen,
    hurdle: (g) => g.predicted_hurdle_prob ?? -1
  };

  // Everything the API already loaded for this window is sorted here, in the
  // browser — no re-query per click, since the whole result set is already in hand.
  let sortKey = $state<SortKey>('added');
  let desc = $state(true);
  let page = $state(0);

  function sortBy(key: SortKey) {
    if (key === sortKey) {
      desc = !desc;
    } else {
      sortKey = key;
      desc = key !== 'name'; // name defaults A→Z; every other column defaults high→low
    }
    page = 0;
  }

  const sorted = $derived(
    [...data.games].sort((a, b) => {
      const av = SORTERS[sortKey](a);
      const bv = SORTERS[sortKey](b);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return desc ? -cmp : cmp;
    })
  );

  /**
   * A separate, explicit filter — unlike the badge (which only ever adds emphasis,
   * never hides a row), reaching for this toggle is a deliberate choice to narrow
   * the list, and that's fine: it's a different action than the passive badge.
   */
  type TierFilter = 'all' | 'standout' | 'promising';
  let tierFilter = $state<TierFilter>('all');
  // Plural for the filter toggle/empty-state ("Likely Hits" narrows to a category);
  // singular for the per-row badge ("Likely Hit" describes that one game).
  const FILTER_LABELS: Record<TierFilter, string> = { all: 'All', standout: 'Likely Hits', promising: 'Ones to Watch' };
  const BADGE_LABELS: Record<'standout' | 'promising', string> = { standout: 'Likely Hit', promising: 'One to Watch' };

  const filtered = $derived(
    tierFilter === 'all' ? sorted : sorted.filter((g) => hurdleTier(g.predicted_hurdle_prob) === tierFilter)
  );

  // A day-range or tier-filter change narrows/widens the set, so reset back to page
  // 1 — otherwise switching filters could strand you on a page past the new end.
  $effect(() => {
    data.days;
    tierFilter;
    page = 0;
  });

  const arrow = (key: SortKey) => (key === sortKey ? (desc ? '▼' : '▲') : '');

  /** The labels the sort control shows, and the order it offers them in. */
  const SORT_LABELS: Record<SortKey, string> = {
    added: 'Added',
    hurdle: 'P(hurdle)',
    name: 'Game',
    year: 'Year'
  };

  /**
   * Cards below 40rem, the same threshold and the same reason as Explore and Discover: five
   * columns with a fixed colgroup want about 35rem before the game's name gets anything, and a
   * phone has 21. It was scrolling sideways inside a page that scrolls down.
   *
   * `matchMedia` rather than a container query — see `GameCard.svelte`. A breakpoint would mean
   * one element carrying the table's markup and the card's at once, with CSS choosing which
   * half is real.
   */
  let narrow = $state(false);
  $effect(() => {
    const mq = window.matchMedia('(max-width: 40rem)');
    const sync = () => (narrow = mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  });

  // Paginated client-side, same shape as GameList.svelte's own pager — a table meant
  // to be scanned needs a bounded page, not a page that grows without end as the
  // window widens (365 days can be thousands of rows).
  const PAGE_SIZE = 50;
  const pageCount = $derived(Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
  const pageRows = $derived(filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE));
  const rangeFrom = $derived(filtered.length ? page * PAGE_SIZE + 1 : 0);
  const rangeTo = $derived(Math.min(filtered.length, (page + 1) * PAGE_SIZE));
</script>

<svelte:head><title>What's New · bgg-viewer</title></svelte:head>

<div class="page">
  <Container size="list">
    <Stack gap="md">
      <div>
        <h1>What's New</h1>
        <p class="lede">Games recently added to BGG.</p>
      </div>

      <div class="toolbar">
        <div class="seg" role="group" aria-label="Time range">
          {#each RANGES as r (r)}
            <a href="?days={r}" class:on={data.days === r}>{r} days</a>
          {/each}
        </div>
        <div class="seg" role="group" aria-label="Hurdle status">
          {#each Object.entries(FILTER_LABELS) as [key, label] (key)}
            <button type="button" class:on={tierFilter === key} onclick={() => (tierFilter = key as TierFilter)}>
              {label}
            </button>
          {/each}
        </div>
      </div>

      <Trend rows={filtered} days={data.days} />

      <div class="bar">
        <span class="pos">
          {#if filtered.length}
            <b class="tnum">{rangeFrom.toLocaleString()}–{rangeTo.toLocaleString()}</b>
            of <b class="tnum">{filtered.length.toLocaleString()}</b>
          {:else}
            0 games
          {/if}
        </span>
        <!-- The column headers ARE the sort control, and the cards have no headers — so on
             narrow it has to live somewhere else or sorting becomes unreachable. A native
             select is the right size for a thumb and brings its own platform picker. Same
             shape as Explore's list, which lost its headers the same way. -->
        {#if narrow}
          <span class="sortbar">
            <label class="vh" for="wn-sort">Sort by</label>
            <select id="wn-sort" bind:value={sortKey} onchange={() => (page = 0)}>
              {#each Object.entries(SORT_LABELS) as [key, label] (key)}
                <option value={key}>{label}</option>
              {/each}
            </select>
            <button
              type="button"
              class="dir"
              onclick={() => (desc = !desc)}
              aria-label={desc ? 'Sort ascending' : 'Sort descending'}
              title={desc ? 'High to low' : 'Low to high'}>{desc ? '▼' : '▲'}</button
            >
          </span>
        {/if}
        {#if pageCount > 1}
          <span class="pager">
            <button disabled={page === 0} onclick={() => (page = 0)} title="First page">«</button>
            <button disabled={page === 0} onclick={() => (page = Math.max(0, page - 1))}>‹ Prev</button>
            <span class="pg tnum">{(page + 1).toLocaleString()} / {pageCount.toLocaleString()}</span>
            <button disabled={page >= pageCount - 1} onclick={() => (page = Math.min(pageCount - 1, page + 1))}>Next ›</button>
            <button disabled={page >= pageCount - 1} onclick={() => (page = pageCount - 1)} title="Last page">»</button>
          </span>
        {/if}
      </div>

      <div class="tablewrap" class:cards={narrow}>
        {#if narrow}
          {#each pageRows as g (g.game_id)}
            {@const tier = hurdleTier(g.predicted_hurdle_prob)}
            <GameCard href="/games/{g.game_id}">
              {#snippet art()}
                {#if g.thumbnail}
                  <img src={g.thumbnail} alt="" loading="lazy" aria-hidden="true" />
                {:else}
                  <span class="ph" aria-hidden="true">{g.name.charAt(0).toUpperCase()}</span>
                {/if}
              {/snippet}
              {#snippet identity()}
                <span class="nm">{g.name}</span>
                <span class="mt">{g.year_published ?? '—'}</span>
              {/snippet}
              {#snippet stats()}
                <!-- The three columns the table keeps once Year has moved up into the line
                     above: when it turned up, how likely it is to be rated at all, and what
                     that adds up to. Status carries no label — the pill says its own name,
                     and an empty cell under a "STATUS" heading reads as missing data rather
                     than as "this one is neither". -->
                <span class="stat">
                  <span class="stat-lbl">Added</span>
                  <span class="sv tnum" title={absoluteFmt.format(new Date(g.first_seen))}
                    >{formatSeen(g.first_seen)}</span
                  >
                </span>
                <span class="stat">
                  <span class="stat-lbl">P(hurdle)</span>
                  <span class="sv tnum">{probText(g.predicted_hurdle_prob)}</span>
                </span>
                <span class="stat">
                  {#if tier}<span class="tag {tier}">{BADGE_LABELS[tier]}</span>{/if}
                </span>
              {/snippet}
            </GameCard>
          {/each}
        {:else}
        <table>
          <colgroup>
            <col />
            <col style="width: 4.5rem" />
            <col style="width: 6rem" />
            <col style="width: 5.5rem" />
            <col style="width: 7.5rem" />
          </colgroup>
          <thead>
            <tr>
              <th>
                <button class:on={sortKey === 'name'} onclick={() => sortBy('name')}>
                  Game<span class="ar">{arrow('name')}</span>
                </button>
              </th>
              <th class="r">
                <button class:on={sortKey === 'year'} onclick={() => sortBy('year')}>
                  Year<span class="ar">{arrow('year')}</span>
                </button>
              </th>
              <th class="r">
                <button class:on={sortKey === 'added'} onclick={() => sortBy('added')}>
                  Added<span class="ar">{arrow('added')}</span>
                </button>
              </th>
              <th class="r">
                <button class:on={sortKey === 'hurdle'} onclick={() => sortBy('hurdle')}>
                  P(hurdle)<span class="ar">{arrow('hurdle')}</span>
                </button>
              </th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {#each pageRows as g (g.game_id)}
              {@const tier = hurdleTier(g.predicted_hurdle_prob)}
              <tr>
                <td>
                  <a class="game" href="/games/{g.game_id}">
                    <span class="thumb" aria-hidden="true">
                      {#if g.thumbnail}
                        <img src={g.thumbnail} alt="" loading="lazy" />
                      {:else}
                        {g.name.charAt(0).toUpperCase()}
                      {/if}
                    </span>
                    <span class="name">{g.name}</span>
                  </a>
                </td>
                <td class="r tnum">{g.year_published ?? '—'}</td>
                <td class="r tnum" title={absoluteFmt.format(new Date(g.first_seen))}>
                  {formatSeen(g.first_seen)}
                </td>
                <td class="r tnum">{probText(g.predicted_hurdle_prob)}</td>
                <td>
                  {#if tier}
                    <span class="tag {tier}">{BADGE_LABELS[tier]}</span>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
        {/if}

        {#if !filtered.length}
          <p class="empty">
            {tierFilter === 'all'
              ? 'No games added in this window. Try a longer range above.'
              : `No games tagged "${FILTER_LABELS[tierFilter]}" in this window.`}
          </p>
        {/if}
      </div>
    </Stack>
  </Container>
</div>

<style>
  /* Matches Discover/About's .page + h1 + .lede exactly, so this page reads as part
     of the same app rather than a bolted-on tool. */
  .page {
    padding: 0 0 var(--space-xl);
  }
  h1 {
    font-size: var(--text-display, clamp(1.8rem, 1.1rem + 3vw, 3rem));
    font-weight: 750;
    letter-spacing: -0.03em;
    line-height: 1.05;
    margin: 0;
    text-wrap: balance;
  }
  .lede {
    font-size: 1.1rem;
    color: var(--muted-foreground);
    max-width: 42rem;
    margin: 0.3rem 0 0;
  }
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--space-md);
  }
  /* Matches Rail.svelte's .seg exactly — the same segmented-control convention used
     for universe/player-count toggles elsewhere in the app. */
  .seg {
    display: inline-flex;
    gap: 0.25rem;
  }
  .seg a,
  .seg button {
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--background);
    color: var(--muted-foreground);
    padding: 0.25rem 0.9rem;
    font: inherit;
    font-size: 0.8rem;
    text-decoration: none;
    cursor: pointer;
  }
  .seg a:hover,
  .seg button:hover {
    color: var(--foreground);
  }
  .seg a.on,
  .seg button.on {
    border-color: var(--primary);
    color: var(--primary);
    background: color-mix(in oklch, var(--primary) 10%, transparent);
    font-weight: 600;
  }
  .seg a:focus-visible,
  .seg button:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 1px;
  }
  /* Touch sizing: padding AND type together, not min-height alone. Raising only the height
     gave tall boxes with tiny text floating in them — a desktop control in a bigger box.
     A touch control should look touch-sized. Desktop density is left alone. */
  @media (max-width: 40rem) {
    .seg a,
    .seg button {
      padding: 0.65rem 1rem;
      font-size: 0.9rem;
      display: inline-flex;
      align-items: center;
    }
  }

  /* Position + pager, matching GameList.svelte's own .bar exactly. */
  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
    flex-wrap: wrap;
    font-size: 0.78rem;
    color: var(--muted-foreground);
  }
  .pos b {
    color: var(--foreground);
    font-weight: 650;
  }
  .pager {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }
  .pager button {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--foreground);
    cursor: pointer;
    font: inherit;
    font-size: 0.76rem;
    padding: 0.15rem 0.5rem;
  }
  .pager button:hover:not(:disabled) {
    border-color: var(--primary);
    color: var(--primary);
  }
  .pager button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .pager .pg {
    padding: 0 0.35rem;
    color: var(--foreground);
  }

  /* Wide content scrolls in its own box — the page itself never scrolls horizontally. */
  .tablewrap {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow-x: auto;
    background: var(--card);
  }
  /* Cards are already bounded by the panel's width; there is nothing to scroll sideways, and
     leaving the axis scrollable makes a horizontal swipe wobble the list for no reason. */
  .tablewrap.cards { overflow-x: visible; }

  /* Screen-reader-only, for the sort select's label. */
  .vh {
    position: absolute; width: 1px; height: 1px;
    overflow: hidden; clip-path: inset(50%); white-space: nowrap;
  }
  .sortbar { display: inline-flex; gap: 0.35rem; align-items: center; }
  .sortbar select {
    border: 1px solid var(--border); border-radius: 6px;
    background: var(--background); color: var(--foreground);
    font: inherit; font-size: 0.9rem; padding: 0.5rem 0.5rem;
  }
  .sortbar .dir {
    border: 1px solid var(--border); border-radius: 6px;
    background: var(--background); color: var(--muted-foreground);
    font: inherit; font-size: 0.8rem; padding: 0.5rem 0.7rem; cursor: pointer;
  }

  /* A card's stat values. GameCard styles the labels; what sits under them is the caller's. */
  .sv { font-size: 0.85rem; font-weight: 600; color: var(--foreground); }
  /* Fixed layout + a colgroup means every row is the same height regardless of
     which games land on a given page — nothing about the table should visibly
     resize as you paginate or re-sort. */
  table {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
  }
  th,
  td {
    padding: 0.4rem var(--space-md);
    text-align: left;
    border-bottom: 1px solid var(--border);
    overflow: hidden;
  }
  tbody tr:last-child td {
    border-bottom: none;
  }
  tbody tr:hover {
    background: color-mix(in oklch, var(--primary) 8%, transparent);
  }
  .r {
    text-align: right;
  }
  .tnum {
    font-variant-numeric: tabular-nums;
  }

  /* Column headers — matches GameList.svelte's .head convention exactly. Typography
     lives on `th` itself so a static label (Status, non-sortable) and a sortable
     `<button>` header look identical; only the button adds pointer/hover/active,
     which is correct — Status isn't interactive and shouldn't look like it is. */
  thead {
    background: var(--card);
  }
  th {
    font-size: 0.66rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 600;
    color: var(--muted-foreground);
  }
  th button {
    max-width: 100%;
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    color: inherit;
    text-transform: inherit;
    letter-spacing: inherit;
    cursor: pointer;
    text-align: inherit;
  }
  th button:hover,
  th button.on {
    color: var(--foreground);
  }
  .ar {
    font-size: 0.55rem;
    margin-left: 0.15rem;
  }

  .game {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    min-width: 0;
    text-decoration: none;
    color: inherit;
  }
  .game:hover .name {
    color: var(--primary);
  }
  .thumb {
    flex: none;
    width: 1.85rem;
    height: 1.85rem;
    border-radius: 6px;
    background: var(--muted);
    color: var(--muted-foreground);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.7rem;
    font-weight: 600;
    overflow: hidden;
  }
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .name {
    flex: 1 1 auto;
    min-width: 0;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Status: its own column, not mixed into P(hurdle) — mixing them meant most rows
     were a plain right-aligned number and a few rows also grew a pill next to it,
     which broke the column from reading as a clean, consistent numeric list. */
  .tag {
    display: inline-flex;
    align-items: center;
    line-height: 1;
    font-size: 0.62rem;
    font-weight: 600;
    padding: 0.3rem 0.45rem;
    border-radius: 999px;
    white-space: nowrap;
  }
  .tag.standout {
    background: var(--color-positive);
    color: oklch(0.99 0.01 80);
  }
  .tag.promising {
    background: color-mix(in oklch, var(--color-positive) 16%, transparent);
    color: var(--color-positive);
    border: 1px solid color-mix(in oklch, var(--color-positive) 45%, transparent);
  }

  .empty {
    padding: var(--space-lg);
    text-align: center;
    color: var(--muted-foreground);
  }
</style>
