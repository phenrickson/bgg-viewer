<script lang="ts">
  /**
   * `/recommend` — one tool for finding a game (spec:
   * `docs/superpowers/specs/2026-09-25-recommend-ui-and-why-design.md`).
   *
   * With no seed it's the Start screen: a search, a row of well-known games, and (with a
   * collection) a row of your top-rated owned games.
   *
   * One page, not two: the search stays at the top, always just a search. Picking a game loads
   * its answer underneath, in place: the game itself (a hero: what it is, a link to its page),
   * then the question's controls — the pool ("from my shelf | games I don't own | anywhere")
   * and the list picker. Each result opens its game page; its match score opens "why";
   * "Games like this" walks on from it. The answer is one list, picked from cards: the three precomputed
   * lists (Recommended, Most similar, Lesser known), or the one shelf list. The question lives in
   * the URL (`?id&from`), so Back steps through the games you've looked at. How an answer is
   * fetched (collection artifact, precomputed lists, the live pooled query) is
   * `$lib/recommend/sources.ts` and never shows as a choice.
   *
   * Every match carries a "why" (`$lib/recommend/why.ts`): what the two games share on the
   * embedding's own inputs.
   */
  import { untrack, tick } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { initCatalog, catalog, query } from '$lib/catalog/catalog.svelte';
  import GameSearch from '$lib/catalog/GameSearch.svelte';
  import GameHero from '$lib/catalog/GameHero.svelte';
  import GameTileRow from '$lib/catalog/GameTileRow.svelte';
  import { Button } from '$lib/components/ui/button';
  import { SegmentedControl } from '$lib/components/ui/segmented-control';
  import { Container, Stack } from '$lib/components/ui/layout';
  import { SIMILAR_PROFILE_LABELS, SIMILAR_PROFILE_BLURBS } from '$lib/game/similar-profiles';
  import SimBadges from '$lib/game/SimBadges.svelte';
  import type { TagFrequencies } from '$lib/recommend/why';
  import ComplexityBadge from '$lib/catalog/encodings/ComplexityBadge.svelte';
  import TagChip from '$lib/game/TagChip.svelte';
  import { boxPlayersLabel } from '$lib/catalog/players';
  import { boxPlaytimeLabel } from '$lib/catalog/playtime';
  import { fetchVectors, type VectorSet } from '$lib/recommend/vectors';
  import { rankCatalog, rankShelf } from '$lib/recommend/rank';
  import {
    withoutIds,
    type Pool,
    type Lists,
    type Hit,
    type Section,
  } from '$lib/recommend/sources';
  import ResultSection, { type Game, type Item, type Display } from './ResultSection.svelte';

  let { data } = $props();

  // --- whose collection -----------------------------------------------------------------
  // Seeded from the signed-in user; an admin can look at anyone's, so it's state, not derived.
  let username = $state<string>(untrack(() => data.user?.bgg_username ?? ''));
  let adminInput = $state('');
  /** The collection's owned ids, as synced into the warehouse (`/api/collection`). */
  let ownedIds = $state<number[]>([]);
  let collection = $state<'none' | 'loading' | 'ready' | 'syncing' | 'missing' | 'error'>('none');

  // An admin's view-as on a username the warehouse hasn't seen: sync it, then ask again every
  // POLL_MS until its games land, for at most POLL_FOR_MS (spec §4).
  const POLL_MS = 5_000;
  const POLL_FOR_MS = 180_000;
  let collectionToken = 0;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;

  async function readOwned(u: string): Promise<number[]> {
    const res = await fetch(`/api/collection?username=${encodeURIComponent(u)}`);
    if (!res.ok) throw new Error(`couldn’t load the collection (${res.status})`);
    return ((await res.json()).game_ids as number[]).map(Number);
  }

  /** Load `u`'s collection. A newer call wins: an older one's late answer is dropped, and
   *  nothing of the previous collection survives the switch (spec §6.2–6.3). */
  async function loadCollection(u: string) {
    const mine = ++collectionToken;
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
    ownedIds = [];
    shelfIds = [];
    collection = 'loading';
    try {
      const ids = await readOwned(u);
      if (mine !== collectionToken) return;
      if (ids.length) {
        ownedIds = ids;
        collection = 'ready';
        return;
      }
      if (!data.isAdmin) {
        collection = 'missing';
        return;
      }
      collection = 'syncing';
      const res = await fetch(`/api/collection/sync?username=${encodeURIComponent(u)}`, { method: 'POST' });
      if (mine !== collectionToken) return;
      // The sync couldn't start (no service configured, or BGG refused): nothing to wait for.
      if (!res.ok || !(await res.json()).synced) {
        if (mine === collectionToken) collection = 'missing';
        return;
      }
      if (mine !== collectionToken) return;
      const until = Date.now() + POLL_FOR_MS;
      const poll = async () => {
        if (mine !== collectionToken) return;
        try {
          const got = await readOwned(u);
          if (mine !== collectionToken) return;
          if (got.length) {
            ownedIds = got;
            collection = 'ready';
            return;
          }
        } catch {
          // Keep asking until the time runs out.
        }
        // A newer load owns the timer and the status now.
        if (mine !== collectionToken) return;
        if (Date.now() >= until) collection = 'missing';
        else pollTimer = setTimeout(poll, POLL_MS);
      };
      pollTimer = setTimeout(poll, POLL_MS);
    } catch (e) {
      if (mine !== collectionToken) return;
      console.error('collection failed', e);
      collection = 'error';
    }
  }

  $effect(() => {
    initCatalog();
  });
  $effect(() => {
    if (catalog.status === 'ready' && username) loadCollection(username);
  });
  $effect(() => () => {
    if (pollTimer) clearTimeout(pollTimer);
  });

  // --- every game's vector: every pool ranks from these ---------------------------------------
  // Loaded in the background once the catalog is in, for everyone. Raw state: ~38k vectors,
  // never mutated, so no deep proxy.
  let vectors = $state.raw<VectorSet | null>(null);
  let vectorsState = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
  $effect(() => {
    if (catalog.status !== 'ready' || untrack(() => vectorsState) !== 'idle') return;
    vectorsState = 'loading';
    fetchVectors()
      .then((v) => {
        vectors = v;
        vectorsState = 'ready';
      })
      .catch((e) => {
        console.error('vectors failed', e);
        vectorsState = 'error';
      });
  });

  /** Owned games the browser can rank: in the collection AND in the artifact. Games outside it
   *  (fewer than 30 ratings, not upcoming) are left out everywhere on the page (decision 2). */
  const owned = $derived(vectors ? new Set(ownedIds.filter((id) => vectors!.index.has(id))) : new Set<number>());
  /** A collection is linked: the pool control shows. */
  const hasShelf = $derived(ownedIds.length > 0);

  // --- tag frequencies, for rarest-first and the model's 10-game floor --------------------
  let freq = $state<TagFrequencies>({ mechanics: new Map(), categories: new Map(), families: new Map() });
  $effect(() => {
    if (catalog.status !== 'ready') return;
    const col = (k: string) =>
      `SELECT '${k}' AS k, t AS tag, COUNT(*)::INT AS n FROM (SELECT unnest(${k}) AS t FROM catalog) GROUP BY t`;
    query<{ k: keyof TagFrequencies; tag: string; n: number }>(
      [col('mechanics'), col('categories'), col('families')].join(' UNION ALL ')
    )
      .then((rows) => {
        const f: TagFrequencies = { mechanics: new Map(), categories: new Map(), families: new Map() };
        for (const r of rows) (f[r.k] as Map<string, number>).set(r.tag, Number(r.n));
        freq = f;
      })
      .catch((e) => console.error('tag counts failed (why falls back to unfiltered tags)', e));
  });

  // --- the question, from the URL ---------------------------------------------------------
  const params = $derived($page.url.searchParams);
  const seedId = $derived(Number(params.get('id')) || null);
  const pool = $derived.by((): Pool => {
    const p = params.get('from');
    if (!hasShelf) return 'all';
    // Anywhere unless you ask for your collection: the shelf is an option, never the default.
    return p === 'shelf' || p === 'unowned' ? p : 'all';
  });

  /**
   * A link to this page with some of the question changed — how every option and walk moves.
   */
  function ask(patch: { id?: number | null; from?: Pool; list?: string }): string {
    const q = new URLSearchParams(params);
    // A new game starts on the default list (Recommended), not the last one picked.
    if ('id' in patch && !('list' in patch)) q.delete('list');
    for (const [k, v] of Object.entries(patch)) {
      if (v == null) q.delete(k);
      else q.set(k, String(v));
    }
    const s = q.toString();
    return `/recommend${s ? `?${s}` : ''}`;
  }
  const set = (patch: Parameters<typeof ask>[0], replaceState = false) =>
    goto(ask(patch), { keepFocus: true, noScroll: true, replaceState });

  // --- catalog rows ------------------------------------------------------------------------
  const arr = (v: unknown): string[] | null => (v == null ? null : Array.from(v as ArrayLike<string>));

  async function games(ids: number[]): Promise<Map<number, Game>> {
    if (!ids.length) return new Map();
    const rows = await query<Record<string, unknown>>(
      `SELECT c.game_id, c.name, c.year_published, c.average_rating, c.predicted_complexity,
              c.min_players, c.max_players, c.min_playtime, c.max_playtime,
              c.mechanics, c.categories, c.families, c.designers, t.thumbnail
       FROM catalog c LEFT JOIN thumbnails t USING (game_id)
       WHERE c.game_id IN (${ids.join(',')})`
    );
    const num = (v: unknown) => (v == null ? null : Number(v));
    return new Map(
      rows.map((r) => {
        const g: Game = {
          game_id: Number(r.game_id),
          name: String(r.name),
          year_published: num(r.year_published),
          average_rating: num(r.average_rating),
          thumbnail: (r.thumbnail as string | null) ?? null,
          predicted_complexity: num(r.predicted_complexity),
          min_players: num(r.min_players),
          max_players: num(r.max_players),
          min_playtime: num(r.min_playtime),
          max_playtime: num(r.max_playtime),
          mechanics: arr(r.mechanics),
          categories: arr(r.categories),
          families: arr(r.families),
          designers: arr(r.designers)
        };
        return [g.game_id, g];
      })
    );
  }

  // --- the chosen game ---------------------------------------------------------------------
  // Walking from game to game is the URL's history: Back steps through it (Phil, 2026-11-09:
  // no breadcrumb trail).
  let seed = $state<Game | null>(null);
  $effect(() => {
    const id = seedId;
    // Box art loads after the catalog: read the seed again once it's in.
    catalog.thumbnailsReady;
    if (catalog.status !== 'ready' || id == null) {
      seed = null;
      return;
    }
    games([id]).then((m) => {
      const g = m.get(id) ?? null;
      if (id !== seedId) return;
      seed = g;
    });
  });

  // --- How many per list: a per-browser preference, like Cards | List ----------------------
  const COUNT_KEY = 'recommend.count';
  const COUNTS = [10, 25, 50] as const;
  let count = $state<number>(10);
  $effect(() => {
    try {
      const v = Number(localStorage.getItem(COUNT_KEY));
      if ((COUNTS as readonly number[]).includes(v)) count = v;
    } catch {
      // Storage unavailable; 10 it is.
    }
  });
  function setCount(v: number) {
    count = v;
    try {
      localStorage.setItem(COUNT_KEY, String(v));
    } catch {
      // Not remembered this time; the choice still applies on the page.
    }
  }
  // --- the answer --------------------------------------------------------------------------
  let lists = $state<Lists | null>(null);
  let status = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
  let failure = $state('');

  const toStyles = (p: Record<string, Hit[] | undefined>): Lists => ({
    similar: p.similar ?? [],
    recommender: p.recommender ?? [],
    sicko: p.sicko ?? []
  });

  /** Where the answer on screen came from: ranked here, or the warehouse's stored top 10. */
  let listsSource = $state<'local' | 'warehouse'>('local');

  /** *Anywhere*'s backup, while the vectors load or if they fail: the precomputed lists from
   *  the game's warehouse document (10 per list). */
  async function fromApi(id: number): Promise<Record<string, Hit[]>> {
    const res = await fetch(`/api/similar?id=${id}&pool=all`);
    if (!res.ok) throw new Error(`couldn’t load matches (${res.status})`);
    return (await res.json()).profiles;
  }

  /** Which question (`seed|pool|count`) `lists` answers — so a new question never shows the last
   *  one's answer as if it were current. */
  let listsFor = $state('');

  /** Beats the answer waits before rising: a new game leads with its own panel, then its
   *  matches; the same game asked differently (pool, how many) just shows the new matches. */
  const NEW_GAME_LEAD = 2;
  let lead = $state(0);
  let answeredId: number | null = null;

  let token = 0;
  $effect(() => {
    const id = seedId;
    const p = pool;
    const n = count;
    if (id == null || catalog.status !== 'ready') return;
    const mine = ++token;
    status = 'loading';
    const done = (out: Lists, from: 'local' | 'warehouse') => {
      lists = out;
      listsSource = from;
      listsFor = `${id}|${p}|${n}`;
      lead = id !== answeredId ? NEW_GAME_LEAD : 0;
      answeredId = id;
      status = 'ready';
    };
    if (p === 'all') {
      // Ranked here once the vectors are in. Until then (or if they fail) the warehouse answers;
      // the vectors landing later never replace an answer already on screen, so it's untracked.
      const v = untrack(() => vectors);
      if (v) return done(rankCatalog(v, id, new Set(), n), 'local');
      (async () => {
        const out = toStyles(await fromApi(id));
        if (mine === token) done(out, 'warehouse');
      })().catch((e) => {
        if (mine !== token) return;
        failure = e instanceof Error ? e.message : String(e);
        status = 'error';
      });
      return;
    }
    if (vectorsState === 'error') {
      // PLACEHOLDER copy (Phil)
      failure = 'Couldn’t load your shelf.';
      status = 'error';
      return;
    }
    if (!vectors) return; // stays loading until the vectors land
    done(p === 'shelf' ? rankShelf(vectors, id, owned, n) : rankCatalog(vectors, id, owned, n), 'local');
  });

  // --- Which list: Most Similar / Recommended / Lesser Known ---------------------------------
  // One list at a time, picked from cards above it (Phil, 2026-11-09). The pick is in the URL
  // (`?list=`), like the pool. Every pool answers with the same three lists.
  const LIST_ORDER = ['recommender', 'similar', 'sicko'] as const;
  type ListKey = (typeof LIST_ORDER)[number];
  const DEFAULT_LIST: ListKey = 'recommender';

  /** The answer, minus the seed itself. */
  const shown = $derived(lists && seedId != null ? withoutIds(lists, new Set([seedId])) : null);

  /** The list asked for, or — when that one has no games for this seed — the first that does. */
  const listKey = $derived.by((): ListKey => {
    const asked = params.get('list');
    const want = LIST_ORDER.find((k) => k === asked) ?? DEFAULT_LIST;
    if (!shown || shown[want].length) return want;
    return [DEFAULT_LIST, ...LIST_ORDER].find((k) => shown[k].length) ?? want;
  });

  // PLACEHOLDER copy (Phil): the empty-list line.
  const listOptions = $derived(
    LIST_ORDER.map((k) => {
      const empty = !!shown && !shown[k].length;
      return {
        value: k,
        label: SIMILAR_PROFILE_LABELS[k],
        description: empty ? 'No matches for this game.' : SIMILAR_PROFILE_BLURBS[k],
        disabled: empty
      };
    })
  );

  // PLACEHOLDER copy (Phil): the heading over the answer, naming what the tiles are.

  /** The one list the page shows, as a section (empty → none). */
  const sections = $derived.by((): Section[] => {
    if (!shown) return [];
    const s: Section = { key: listKey, hits: shown[listKey] };
    return s.hits.length ? [s] : [];
  });

  // --- Why: one open at a time, across every section -----------------------------------------
  let whyId = $state<number | null>(null);
  const toggleWhy = (id: number) => (whyId = whyId === id ? null : id);
  $effect(() => {
    // A new seed closes it.
    seedId;
    whyId = null;
  });

  // --- The walk: "Games like this" -----------------------------------------------------------
  // --- Showing that the answer changed ------------------------------------------------------
  // Answers land in milliseconds, so a change is easy to miss. While one is on its way the
  // current tiles dim (and stop taking clicks); when it lands its games rise in a beat apart —
  // after the chosen game's own panel, for a new game (the app's `.rise-in`, as Start's rows
  // load). Motion answers the reader's own click, and is off under prefers-reduced-motion.
  let reduceMotion = $state(false);
  $effect(() => {
    try {
      reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      // No matchMedia: keep the motion.
    }
  });
  /** The tiles on screen answer some other question (or a newer one is loading). */
  const pending = $derived(status === 'loading' || listsFor !== `${seedId}|${pool}|${count}`);
  /** Changes whenever a different list shows (game, pool or tab) — lays it out afresh, so all
   *  its games rise. Not how many: a longer list keeps its games and only the new ones rise. */
  const answerKey = $derived(`${listsFor.split('|').slice(0, 2).join('|')}|${listKey}`);

  /** The top of the chosen game, so a new pick happens where you're looking. */
  let chosenTop = $state<HTMLElement | null>(null);

  /** Pick a game — from the search, or "Games like this". (Start tiles are links, at the top already.) */
  async function pick(id: number) {
    await set({ id });
    await tick();
    chosenTop?.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
  }
  const walk = pick;

  let rows = $state<Map<number, Game>>(new Map());
  let rowsToken = 0;
  $effect(() => {
    // Every list in the answer, not just the one on screen: switching tabs then swaps between
    // games already loaded, instead of collapsing the sheet while the new ones are looked up.
    const all: Hit[] = shown ? LIST_ORDER.flatMap((k) => shown[k]) : [];
    const ids = [...new Set(all.map((h) => h.id))];
    catalog.thumbnailsReady;
    const mine = ++rowsToken;
    games(ids).then((m) => mine === rowsToken && (rows = m));
  });

  const toItems = (hits: Hit[]): Item[] =>
    hits.flatMap((h) => {
      const g = rows.get(h.id);
      return g ? [{ ...g, similarity: h.similarity }] : [];
    });

  /** Categories, and mechanics, shown on the chosen game: the first few of each. */
  const SEED_TAGS = 4;

  // PLACEHOLDER copy (Phil): the pool labels.
  const POOL_OPTIONS: { value: Pool; label: string }[] = [
    { value: 'shelf', label: 'my shelf' },
    { value: 'unowned', label: 'games I don’t own' },
    { value: 'all', label: 'anywhere' }
  ];

  // --- List or cards: a per-browser preference ---------------------------------------------
  const DISPLAY_KEY = 'recommend.display';
  let display = $state<Display>('cards');
  $effect(() => {
    try {
      const v = localStorage.getItem(DISPLAY_KEY);
      if (v === 'list' || v === 'cards') display = v;
    } catch {
      // Storage can be unavailable (private windows, blocked site data); cards it is.
    }
  });
  function setDisplay(v: Display) {
    display = v;
    try {
      localStorage.setItem(DISPLAY_KEY, v);
    } catch {
      // Not remembered this time; the choice still applies on the page.
    }
  }
  // PLACEHOLDER copy (Phil)
  const DISPLAY_OPTIONS: { value: Display; label: string }[] = [
    { value: 'cards', label: 'Cards' },
    { value: 'list', label: 'List' }
  ];

  // --- How many per list: the control (options follow the answer's source) --------------
  /** The warehouse stores 10 per list, so with its answer on screen more can't be had. */
  const COUNT_OPTIONS = $derived(
    COUNTS.map((n) => ({ value: n, label: String(n), disabled: listsSource === 'warehouse' && n > 10 }))
  );
  const countShown = $derived(listsSource === 'warehouse' ? 10 : count);

  // --- Start -------------------------------------------------------------------------------
  /** How many games each Start row offers (the row shows as many as fit, up to this). */
  const SEEDS_PER_ROW = 6;
  /** The favourites row draws from this many of the catalog's best-rated games. */
  const FAVOURITES_FROM = 100;

  // Each Start row is two steps: which games (once), then their catalog rows. Box art lands
  // after the catalog, so only the second step re-runs when it does — the row fills in with
  // the same games instead of re-drawing (the favourites are random).

  /** Ids from a query, in its order. */
  async function idsFor(sql: string): Promise<number[]> {
    return (await query<{ id: number }>(sql)).map((x) => Number(x.id));
  }

  /** Catalog rows for `ids`, in the same order. */
  async function inOrder(ids: number[]): Promise<Game[]> {
    const m = await games(ids);
    return ids.flatMap((id) => m.get(id) ?? []);
  }

  // I want games like…: a random handful of well-known games for everyone, drawn once per
  // visit from the catalog's best-rated — and, with a collection, your top-rated owned games.
  let favouriteIds = $state.raw<number[]>([]);
  $effect(() => {
    if (catalog.status !== 'ready') return;
    idsFor(
      `SELECT game_id AS id FROM (
         SELECT game_id FROM catalog WHERE geek_rating IS NOT NULL
         ORDER BY geek_rating DESC LIMIT ${FAVOURITES_FROM}
       ) ORDER BY random() LIMIT ${SEEDS_PER_ROW}`
    )
      .then((ids) => (favouriteIds = ids))
      .catch((e) => console.error('favourites failed', e));
  });

  let favourites = $state.raw<Game[]>([]);
  $effect(() => {
    const ids = favouriteIds;
    catalog.thumbnailsReady;
    inOrder(ids)
      .then((g) => ids === favouriteIds && (favourites = g))
      .catch((e) => console.error('favourites failed', e));
  });

  let shelfIds = $state.raw<number[]>([]);
  let shelfToken = 0;
  $effect(() => {
    // Only games the shelf pools can answer for (in the artifact). A newer collection (or none)
    // drops an older query's late answer, so a switched-away shelf never comes back.
    const mine = ++shelfToken;
    if (!owned.size) return;
    idsFor(
      `SELECT game_id AS id FROM catalog WHERE game_id IN (${[...owned].join(',')})
       ORDER BY geek_rating DESC NULLS LAST LIMIT ${SEEDS_PER_ROW}`
    )
      .then((ids) => mine === shelfToken && (shelfIds = ids))
      .catch((e) => console.error('shelf seeds failed', e));
  });

  let shelfSeeds = $state.raw<Game[]>([]);
  $effect(() => {
    const ids = shelfIds;
    catalog.thumbnailsReady;
    inOrder(ids)
      .then((g) => ids === shelfIds && (shelfSeeds = g))
      .catch((e) => console.error('shelf seeds failed', e));
  });

</script>

<svelte:head><title>Recommend · Boardgame-Viz</title></svelte:head>

<div class="page">
  <Container size="list">
    <Stack gap="lg">
      <div class="start">
        <!-- PLACEHOLDER copy (Phil) -->
        <h1>Like a game? Find its <em>neighbors</em></h1>
        <!-- PLACEHOLDER copy (Phil): the subtitle. -->
        <p class="lede">Pick a game you love and find others like it.</p>
      </div>

      <Stack gap="sm">
        <!-- PLACEHOLDER copy (Phil): the vectors' loading line, after "Warming the catalog…". -->
        <GameSearch onpick={pick} busy={vectorsState === 'loading' ? 'Warming the game vectors…' : undefined} />

        {#if seedId == null}
          <!-- PLACEHOLDER copy (Phil): both row labels. -->
          {#if favourites.length}
            <p class="sub">Or start from a favourite</p>
            <GameTileRow label="Favourites" games={favourites} hrefFor={(id) => ask({ id })} rise />
          {/if}
          {#if shelfSeeds.length}
            <p class="sub">Or start from your shelf</p>
            <GameTileRow label="Your shelf" games={shelfSeeds} hrefFor={(id) => ask({ id })} rise />
          {/if}
        {/if}
      </Stack>

      {#if seedId != null}
        <!-- ── The chosen game ─────────────────────────────────────────────────── -->
        <!-- Each section is a small label tight on its box: "Selected game", then "Games like …". -->
        <Stack gap="sm">
          <!-- PLACEHOLDER copy (Phil) -->
          <h2 class="question chosen-top" bind:this={chosenTop}>Selected game</h2>
          {#if seed}
            {@const sd = seed}
            <!-- A new game's panel rises first; its matches follow (`lead`). Keyed on the game,
                 so its box art landing later doesn't replay it. -->
            {#key sd.game_id}
            <div class="rise-in">
            <GameHero href="/games/{sd.game_id}" name={sd.name} image={sd.thumbnail} compact>
              {#snippet meta()}
                {#if sd.year_published}<span>{sd.year_published}</span>{/if}
                <SimBadges rating={sd.average_rating} />
                <ComplexityBadge weight={sd.predicted_complexity} />
                {#each [boxPlayersLabel(sd.min_players, sd.max_players), boxPlaytimeLabel(sd.min_playtime, sd.max_playtime)].filter(Boolean) as f (f)}<span>{f}</span>{/each}
              {/snippet}
              <!-- PLACEHOLDER copy (Phil): "by". -->
              <div class="about">
                {#if sd.designers?.length}
                  <p class="by">by {sd.designers.slice(0, 3).join(', ')}{sd.designers.length > 3 ? ` +${sd.designers.length - 3}` : ''}</p>
                {/if}
                {#if sd.categories?.length || sd.mechanics?.length}
                  <div class="tags">
                    {#each (sd.categories ?? []).slice(0, SEED_TAGS) as t (t)}<TagChip kind="cat" tag={t} />{/each}
                    {#each (sd.mechanics ?? []).slice(0, SEED_TAGS) as t (t)}<TagChip kind="mech" tag={t} />{/each}
                  </div>
                {/if}
              </div>
            </GameHero>
            </div>
            {/key}
          {/if}
        </Stack>

        <!-- Question and answer as one block, on one medium rhythm. -->
        <!-- The question sits close on the sheet it describes; the page's gap above it keeps it
             clear of the chosen game. -->
        <Stack gap="sm">
          <!-- ── The question: what the tiles are, and the pool ──────────────────────── -->
          <!-- The heading and the pool are one question: "Recommended games like X from …". -->
          <div class="controls">
            {#if seed}
              <!-- PLACEHOLDER copy (Phil). Fixed: the tabs and the pool control say which list. -->
              <h2 class="question">Games like{" "}<span class="seed-name">{seed.name}</span></h2>
            {/if}
            {#if hasShelf}
              <!-- PLACEHOLDER copy (Phil) -->
              <span class="from">from</span>
              <SegmentedControl label="From" size="md" options={POOL_OPTIONS} value={pool} onchange={(v) => set({ from: v })} />
            {/if}
            <SegmentedControl class="show-as" label="Show as" size="md" options={DISPLAY_OPTIONS} value={display} onchange={setDisplay} />
            <SegmentedControl label="How many" size="md" options={COUNT_OPTIONS} value={countShown} onchange={setCount} />
          </div>

          <!-- The tabs and their sheet are one piece: the chosen tab opens into the sheet below. -->
          <div class="tabbed">
            <!-- ── Which list ──────────────────────────────────────────────────────── -->
            {#if shown}
              <SegmentedControl label="Which list" size="md" options={listOptions} value={listKey} onchange={(v) => set({ list: v })} />
            {/if}

            <div class="sheet" class:open={!!shown}>
              <!-- ── The answer ────────────────────────────────────────────────────── -->
              {#if status === 'error'}
                <p class="msg">{failure}</p>
              {:else if pending && !sections.length}
                <p class="msg">Loading…</p>
              {:else if seed && !pending && !sections.length}
                <p class="msg">PLACEHOLDER: nothing close to this one here.</p>
              {:else if seed}
                {#key answerKey}
                <div class="answer" class:pending aria-busy={pending} inert={pending}>
                {#each sections as s (`${seedId}-${s.key}`)}
                  <!-- The heading above names the list (and the picker which one), so no title here. -->
                  <ResultSection
                    items={toItems(s.hits)}
                    {seed}
                    {freq}
                    {owned}
                    {display}
                    markOwned={pool === 'all'}
                    {whyId}
                    onwhy={toggleWhy}
                    onwalk={walk}
                    {lead}
                  />
                {/each}
                </div>
                {/key}
              {/if}
            </div>
          </div>
        </Stack>
      {/if}

      {#if (username && (collection === 'syncing' || collection === 'missing' || collection === 'error')) || data.isAdmin}
        <!-- Shelf status and the admin's "view as": out of the reading path, at the foot. -->
        <div class="who">
          <!-- PLACEHOLDER copy (Phil): the three collection states. -->
          {#if collection === 'syncing'}
            <span>Fetching {username}’s collection from BGG…</span>
          {:else if collection === 'missing'}
            <span>Couldn’t get {username}’s collection — try again later.</span>
          {:else if collection === 'error'}
            <span>Couldn’t load {username}’s collection.</span>
          {/if}
          {#if data.isAdmin}
            <label class="as">
              <span>Admin: view as</span>
              <input
                class="admin"
                type="text"
                placeholder="any username"
                bind:value={adminInput}
                onkeydown={(e) => e.key === 'Enter' && adminInput.trim() && (username = adminInput.trim())}
              />
            </label>
          {/if}
        </div>
      {/if}
    </Stack>
  </Container>
</div>

<style>
  .page { display: flex; flex-direction: column; padding: 0 0 var(--space-xl); }
  h1 {
    font-size: var(--text-display, clamp(1.8rem, 1.1rem + 3vw, 3rem));
    font-weight: 750; letter-spacing: -0.03em; line-height: 1.05; margin: 0;
  }
  /* One word in the accent, as Discover's and the landing page's titles do. */
  h1 em { font-style: normal; color: var(--primary); }
  .msg { color: var(--muted-foreground); font-size: 0.9rem; margin: 0; }
  /* While a new answer is on its way, the old one steps back. */
  .answer { transition: opacity 120ms ease; }
  .answer.pending { opacity: 0.45; }
  @media (prefers-reduced-motion: reduce) { .answer { transition: none; } }
  /* The list's tabs and the sheet they open onto. With no tabs (the shelf pool) the sheet is
     just the list. */
  .tabbed { display: flex; flex-direction: column; }
  .sheet.open {
    padding: var(--space-md);
    border: 1px solid var(--border);
    border-top: none;
    border-radius: 0 0 var(--radius) var(--radius);
  }
  .chosen-top { scroll-margin-top: var(--space-md); }
  /* The page's title, set as the app's other pages set theirs (Discover, What's New): left-aligned
     over left-aligned content, the subtitle tight under it. */
  .start {
    display: flex; flex-direction: column; gap: 0.4rem;
    padding-top: var(--space-lg);
  }
  .lede { margin: 0; max-width: 42rem; font-size: 1.1rem; color: var(--muted-foreground); }
  .sub { margin: var(--space-sm) 0 0; font-size: 0.9rem; color: var(--muted-foreground); }
  .about { display: flex; flex-direction: column; gap: var(--space-sm); }
  .by { margin: 0; font-size: 0.95rem; color: var(--muted-foreground); }
  .tags { display: flex; flex-wrap: wrap; gap: 0.35rem; }
  /* A label for the answer, clearly below the chosen game's name — not a size in between. */
  .question {
    margin: 0;
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--muted-foreground);
  }
  .question .seed-name { color: var(--foreground); }
  .controls { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-sm); }
  .controls :global(.show-as) { margin-left: auto; }
  /* "from" is part of the heading's sentence: the same size and weight as its muted words. */
  .from { font-size: 0.9rem; font-weight: 600; color: var(--muted-foreground); }
  .who {
    display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-sm);
    margin-top: var(--space-lg); padding-top: var(--space-md); border-top: 1px solid var(--border);
    font-size: 0.8rem; color: var(--muted-foreground);
  }
  .as { display: inline-flex; align-items: center; gap: var(--space-xs); }
  .admin {
    font: inherit; font-size: 0.78rem; padding: 0.2rem 0.45rem; border-radius: 6px;
    border: 1px solid var(--border); background: var(--card); color: var(--foreground);
  }
</style>
