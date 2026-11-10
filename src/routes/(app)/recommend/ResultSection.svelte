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
   * The list Recommend's answer shows — Recommended, Most similar, Lesser known (the page's
   * picker chooses which), or the one shelf list: an optional heading and blurb, then its games — as tiles or as the game page's similar-games rows (all of them).
   *
   * Each game says what it IS — complexity, players, play time — not what it shares with the
   * seed; the comparison is an action. Clicking a game opens its "why" (the side-by-side
   * analysis) right under it, where the game's art and name link to its page and "Games like this" sits beside them. One open
   * at a time, so the page owns which, via `whyId`. Walking on ("Find games like this") lives in
   * the why only, so a tile does one thing.
   */
  import type { Snippet } from 'svelte';
  import { slide } from 'svelte/transition';
  import { AutoGrid } from '$lib/components/ui/layout';
  import { Button } from '$lib/components/ui/button';
  import GameTile from '$lib/catalog/GameTile.svelte';
  import SimilarRow from '$lib/game/SimilarRow.svelte';
  import { explain, type TagFrequencies } from '$lib/recommend/why';
  import ComplexityBadge from '$lib/catalog/encodings/ComplexityBadge.svelte';
  import { boxPlayersLabel } from '$lib/catalog/players';
  import { boxPlaytimeLabel } from '$lib/catalog/playtime';
  import UsersIcon from '@lucide/svelte/icons/users';
  import ClockIcon from '@lucide/svelte/icons/clock';
  import { similarityPct } from '$lib/game/similarity';
  import WhyMatch from './WhyMatch.svelte';
  import TagChip from '$lib/game/TagChip.svelte';

  let {
    /** Heading and blurb; left out when something above already names the list (the
     *  page's Recommended / Most Similar / Lesser Known picker). */
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
    headEnd,
    /** Beats to wait before the first game rises — the page leads with the chosen game. */
    lead = 0
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
    lead?: number;
  } = $props();

  // --- Rising in: games new on screen rise a beat apart (the app's `.rise-in`) ----------------
  // Decided once, as a game's element is created: a longer list adds its new games without
  // replaying the ones above them, and switching Cards | List lays every game out again, so all
  // of them rise. Games created together share one stagger, which stops after RISE_CAP beats so
  // 50 games don't take seconds to arrive.
  const RISE_CAP = 10;
  let batch = 0;
  let batchOpen = false;
  function rise(node: HTMLElement) {
    if (!batchOpen) {
      batchOpen = true;
      queueMicrotask(() => {
        batch = 0;
        batchOpen = false;
      });
    }
    node.style.setProperty('--rise-i', String(lead + Math.min(batch++, RISE_CAP)));
    node.classList.add('rise-in');
  }

  // --- The why joins the game it's about -----------------------------------------------------
  // The open game's tile reaches down into the panel (see `.cell.open`), the two one outline,
  // like the list tabs open onto their sheet. Where the tile stands over the panel's own corner
  // (first or last column), that corner squares off so the edges run straight on. The panel is
  // the grid item right after the game's cell; checked again whenever its width changes (the
  // grid reflows with it).
  function join(node: HTMLElement) {
    const place = () => {
      const cell = node.previousElementSibling;
      if (!cell) return;
      const t = cell.getBoundingClientRect();
      const p = node.getBoundingClientRect();
      node.toggleAttribute('data-join-start', Math.abs(t.left - p.left) < 2);
      node.toggleAttribute('data-join-end', Math.abs(t.right - p.right) < 2);
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(node);
    return { destroy: () => ro.disconnect() };
  }
  /** How long the why takes to slide open — none for anyone who asks for less motion. */
  let openMs = $state(220);
  let smooth = $state<ScrollBehavior>('smooth');
  $effect(() => {
    try {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        openMs = 0;
        smooth = 'auto';
      }
    } catch {
      // No matchMedia: keep the motion.
    }
  });
  /** Room kept between the open pair and the edges of the screen when scrolling to them. */
  const REVEAL_GAP = 16;
  /** The element that scrolls `el` — the page's own scroll area, or the document. */
  function scrollerOf(el: HTMLElement): HTMLElement {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const o = getComputedStyle(p).overflowY;
      if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight) return p;
    }
    return document.scrollingElement as HTMLElement;
  }
  /**
   * Once open, scroll as little as it takes to show the whole panel — but never so far that the
   * game it's about leaves the top of the screen. A panel too tall for both stops with its game
   * at the top and runs on below. Never scrolls up. (The panel follows its game's cell.)
   */
  function reveal(body: EventTarget & HTMLElement) {
    const panel = body.closest<HTMLElement>('.why');
    const cell = panel?.previousElementSibling;
    if (!panel || !cell) return;
    const scroller = scrollerOf(panel);
    const doc = scroller === document.scrollingElement;
    const view = doc ? { top: 0, bottom: window.innerHeight } : scroller.getBoundingClientRect();
    const short = panel.getBoundingClientRect().bottom + REVEAL_GAP - view.bottom;
    if (short <= 0) return;
    const room = cell.getBoundingClientRect().top - REVEAL_GAP - view.top;
    const by = Math.min(short, room);
    if (by > 0) scroller.scrollBy({ top: by, behavior: smooth });
  }

  // Every game shows, as tiles or as rows (Phil, 2026-11-09: all 10 by default, no "All").
  const shown = $derived(items);
  /** A why is open on one of these games: the rest step back. */
  const focused = $derived(whyId != null && items.some((g) => g.game_id === whyId));
  const whyOf = (g: Item) => explain(seed, g, freq);
  const gameHref = (id: number) => `/games/${id}`;

  // --- What a game shares with the seed, for the list's rows ---------------------------------
  // The why's own shared tags (the model's view: mechanics, categories, kept families), merged
  // and rarest first across kinds, so the most telling overlap leads. The row shows the first
  // three (Phil, 2026-11-10); the why has them all.
  const CHIP_KIND = { mechanics: 'mech', categories: 'cat', families: 'fam' } as const;
  const SHARED_MAX = 3;
  function sharedOf(g: Item) {
    const shared = whyOf(g).shared;
    return (Object.keys(CHIP_KIND) as (keyof typeof CHIP_KIND)[])
      .flatMap((k) => shared[k].map((tag) => ({ kind: CHIP_KIND[k], tag, n: freq[k].get(tag) ?? 0 })))
      .sort((x, y) => x.n - y.n)
      .slice(0, SHARED_MAX);
  }
  /** "an 84% match", "a 72% match": "an" before a number said with a vowel (8, 11, 18, 80s). */
  function matchText(similarity: number): string {
    const pct = Math.round(similarityPct(similarity));
    return `${/^(8|11|18)/.test(String(pct)) ? 'an' : 'a'} ${pct}% match`;
  }
</script>

<section class="sec" class:focused>
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

  <!-- The "why" opens right under the game it's about: after its row in the list, and as a
       full-width grid item after its tile (the grid packs densely, so the tiles after it
       backfill their row and the panel lands under that row). -->
  {#snippet whyPanel(g: Item)}
    <!-- Joined to its game. The box appears at once; its contents slide it open, then the page
         brings the whole of it into view. -->
    <div class="why" data-full use:join>
      <!-- Slides open only: closing is instant, so the tile, the panel and the games around them
           never come apart mid-animation. -->
      <div class="why-body" in:slide|global={{ duration: openMs }} onintroend={(e) => reveal(e.currentTarget)}>
        <div class="why-head">
          <!-- PLACEHOLDER copy (Phil). Muted, with only the game's name at full colour, like the
               page's "Recommended games like …" heading. -->
          <p class="why-title">Why <span class="nm">{g.name}</span> is {matchText(g.similarity)}</p>
          <Button variant="ghost" size="icon-sm" aria-label="Close" onclick={() => onwhy(g.game_id)}>×</Button>
        </div>
        <WhyMatch why={whyOf(g)} {seed} other={g} onwalk={() => onwalk(g.game_id)} />
      </div>
    </div>
  {/snippet}

  {#if display === 'list'}
    <div class="list">
      {#each shown as g, i (g.game_id)}
        <div class="cell" class:open={whyId === g.game_id} use:rise>
        <!-- Its place in the list: the order is the answer (Recommended blends match with
             standing, so it isn't sorted by SIM). -->
        <span class="rank">{i + 1}</span>
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
          {#snippet middle()}
            {@const tags = sharedOf(g)}
            {#if tags.length}
              <span class="shares">{#each tags as t (`${t.kind}:${t.tag}`)}<TagChip kind={t.kind} tag={t.tag} filled link={false} />{/each}</span>
            {/if}
          {/snippet}
        </SimilarRow>
        </div>
        {#if g.game_id === whyId}{@render whyPanel(g)}{/if}
      {/each}
    </div>
  {:else}
    <AutoGrid min="md" gap="md" class="why-grid">
      {#each shown as g, i (g.game_id)}
        <div class="cell" class:open={whyId === g.game_id} use:rise>
        <GameTile
          rank={i + 1}
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
        </GameTile>
        </div>
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
  /* An icon and its number, kept together. Positioned, so its screen-reader label (absolute)
     is placed inside it, not against the page, where it would stretch the document. */
  .sec :global(.fact) { position: relative; display: inline-flex; align-items: center; gap: 0.25rem; white-space: nowrap; }
  .sec :global(.fact svg) { width: 0.85rem; height: 0.85rem; flex: none; }
  /* The list's facts: whole facts wrap, never mid-fact. */
  .row-facts { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 0.2rem 0.6rem; }
  .row-facts > :global(*) { white-space: nowrap; }
  /* The game page's similar-games list: rows a little apart. */
  .list { display: flex; flex-direction: column; gap: 0.4rem; }
  /* Rows on the card surface, like the tiles. (SimilarRow's own background is the page's, for
     the game page, where its rows sit inside a card.) */
  .list :global(.row) { background: var(--card); }
  .sec :global(.why-grid) { grid-auto-flow: row dense; }
  /* Each game's wrapper (it carries the rise-in): the tile or row fills it. */
  .cell { position: relative; display: flex; min-width: 0; }
  .cell > :global(*) { flex: 1; }

  /* ── Rank: the order is the answer ─────────────────────────────────────────────────────── */
  /* The list: a gutter of numbers to the left of the rows. */
  .list .cell { align-items: center; gap: var(--rank-gap); }
  .list { --rank-w: 1.75rem; --rank-gap: 0.6rem; }
  .cell > .rank {
    flex: none;
    width: var(--rank-w);
    text-align: right;
    font-size: 0.9rem;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
    color: var(--muted-foreground);
  }
  /* (The cards carry theirs as a badge on the art's corner: GameTile's `rank`.) */

  /* ── The list's shared tags: one line, as many whole chips as fit ─────────────────────── */
  .shares {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem;
    height: 1.55rem;
    overflow: hidden;
  }
  .shares > :global(*) { white-space: nowrap; }
  /* A long tag ("Players: Games with expansions that change player count") is cut to the width
     of an ordinary one — the full name on hover — so it can't fill the line and look like the
     only thing the games share. */
  .shares > :global(.chip) {
    display: inline-block;
    max-width: 11rem;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* Their own colours, stepped back a little, so a row of them doesn't out-shout the game's
     name and scores. Labels here, not links: the whole row opens the why. */
  .sec .shares > :global(.chip) { opacity: 0.7; }
  .why {
    position: relative;
    padding: var(--space-md); border: 1px solid var(--border); border-radius: var(--radius);
    background: var(--card);
    container-type: inline-size;
  }
  .why-body { display: flex; flex-direction: column; gap: var(--space-sm); }

  /* While a why is open, the other games step back: the open game and its panel are what's
     left at full strength. They stay clickable (another click moves the why to that game), and
     come back on hover so it's clear they still are. */
  /* (On the tile, not the cell: the cell's rise-in holds its own opacity at 1 once it's done.) */
  .cell > :global(*) { transition: opacity 180ms ease; }
  .focused .cell:not(.open) > :global(*) { opacity: 0.35; }
  .focused .cell:not(.open):hover > :global(*) { opacity: 1; }
  @media (prefers-reduced-motion: reduce) { .cell > :global(*) { transition: none; } }

  /* ── The open game joins its why: one outline, as a list tab opens onto its sheet ───────── */
  /* Above the panel, and reaching down across the row gap and onto the panel's top border, so
     its fill covers that stretch of border and the two read as one shape. */
  .cell.open { position: relative; z-index: 1; margin-bottom: calc(-1 * var(--grid-gap) - 1px); }
  /* A tile's outline is a ring, which can't drop a side: the open one draws its other three
     edges in the panel's border colour instead, and squares its bottom corners. */
  .cell.open > :global(.tile) {
    box-shadow: inset 1px 0 0 var(--border), inset -1px 0 0 var(--border), inset 0 1px 0 var(--border);
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
  }
  /* Where the tile stands over the panel's corner, the corner squares off so the edge runs on. */
  /* (Set from script by `join`, so marked global: the compiler can't see them in the markup.) */
  .why:global([data-join-start]) { border-top-left-radius: 0; }
  .why:global([data-join-end]) { border-top-right-radius: 0; }

  /* The list: a row spans the panel's whole width, so the panel tucks up under it and the
     two become one box. */
  .list .cell.open { margin-bottom: 0; }
  .list .why {
    margin-top: calc(-0.4rem - 1px);
    /* Under the row, not the rank gutter. */
    margin-left: calc(var(--rank-w) + var(--rank-gap));
    border-top-left-radius: 0;
    border-top-right-radius: 0;
  }
  .sec .list .cell.open :global(.row) {
    border-bottom-color: var(--card);
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
  }
  .why-title { margin: 0; font-size: 0.95rem; font-weight: 600; color: var(--muted-foreground); }
  .why-title .nm { color: var(--foreground); }
  .why-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-sm); }
</style>
