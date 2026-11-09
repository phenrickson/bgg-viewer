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
   * and the trail of games walked through. Each result opens its game page; its match score opens "why";
   * "Games like this" walks on from it. The answer is one list, picked from cards: the three precomputed
   * lists (Recommended, Most similar, Dark horses), or the one shelf list. The question lives in
   * the URL (`?id&from`), so Back steps through the games you've looked at. How an answer is
   * fetched (collection artifact, precomputed lists, the live pooled query) is
   * `$lib/recommend/sources.ts` and never shows as a choice.
   *
   * Every match carries a "why" (`$lib/recommend/why.ts`): what the two games share on the
   * embedding's own inputs.
   */
  import { untrack } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { initCatalog, catalog, query, loadArrowTable } from '$lib/catalog/catalog.svelte';
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
  import {
    sourceFor,
    withoutIds,
    tooThin,
    type Pool,
    type Lists,
    type Hit,
    type SectionKey,
    type Section,
    SECTION_MAX
  } from '$lib/recommend/sources';
  import ResultSection, { type Game, type Item, type Display } from './ResultSection.svelte';

  let { data } = $props();

  // --- whose collection -----------------------------------------------------------------
  // Seeded from the signed-in user; an admin can look at anyone's, so it's state, not derived.
  let username = $state<string>(untrack(() => data.user?.bgg_username ?? ''));
  let adminInput = $state('');
  let art = $state<'none' | 'loading' | 'ready' | 'missing' | 'error'>('none');
  let owned = $state<Set<number>>(new Set());
  let nearMiss = $state<Set<number>>(new Set());
  const hasShelf = $derived(art === 'ready' && owned.size > 0);

  async function loadCollection(u: string) {
    art = 'loading';
    try {
      await loadArrowTable('collection_neighbors', `/api/collection-neighbors?username=${encodeURIComponent(u)}`);
      const o = await query<{ id: number }>(
        `SELECT DISTINCT seed_id AS id FROM collection_neighbors WHERE part = 'A'
         UNION SELECT DISTINCT neighbor_id FROM collection_neighbors WHERE part = 'A'`
      );
      const d = await query<{ id: number }>(`SELECT DISTINCT seed_id AS id FROM collection_neighbors WHERE part = 'D'`);
      owned = new Set(o.map((r) => Number(r.id)));
      nearMiss = new Set(d.map((r) => Number(r.id)));
      art = 'ready';
    } catch (e) {
      art = String(e).includes('(404)') ? 'missing' : 'error';
    }
  }

  $effect(() => {
    initCatalog();
  });
  $effect(() => {
    if (catalog.status === 'ready' && username) loadCollection(username);
  });

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

  // --- the walk ----------------------------------------------------------------------------
  // Where you've been this visit, as a breadcrumb. Walking back to a game cuts the trail there.
  let trail = $state<{ id: number; name: string }[]>([]);
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
      if (!g) return;
      const at = untrack(() => trail.findIndex((s) => s.id === id));
      trail = at >= 0 ? untrack(() => trail.slice(0, at + 1)) : [...untrack(() => trail), { id, name: g.name }];
    });
  });

  // --- the answer --------------------------------------------------------------------------
  let lists = $state<Lists | null>(null);
  let status = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
  let failure = $state('');

  const toStyles = (p: Record<string, Hit[] | undefined>): Lists => ({
    kind: 'styles',
    similar: p.similar ?? [],
    recommender: p.recommender ?? [],
    sicko: p.sicko ?? []
  });

  async function fromApi(id: number, apiPool: 'all' | 'collection' | 'exclude'): Promise<Record<string, Hit[]>> {
    const user = apiPool === 'all' ? '' : `&username=${encodeURIComponent(username)}`;
    const res = await fetch(`/api/similar?id=${id}&pool=${apiPool}${user}`);
    if (!res.ok) throw new Error(`couldn’t load matches (${res.status})`);
    return (await res.json()).profiles;
  }

  async function fromArtifact(part: 'A' | 'C' | 'D', id: number): Promise<Lists> {
    const rows = await query<{ style: string; id: number; similarity: number }>(
      `SELECT style, neighbor_id AS id, similarity FROM collection_neighbors
       WHERE part = '${part}' AND seed_id = ${id} ORDER BY style, rank`
    );
    const by: Record<string, Hit[]> = {};
    for (const r of rows) (by[r.style] ??= []).push({ id: Number(r.id), similarity: Number(r.similarity) });
    return part === 'C' ? toStyles(by) : { kind: 'shelf', list: by.shelf ?? [] };
  }

  let token = 0;
  $effect(() => {
    const id = seedId;
    const p = pool;
    const shelfReady = art === 'ready';
    const isOwned = id != null && owned.has(id);
    const isNear = id != null && nearMiss.has(id);
    if (id == null || catalog.status !== 'ready') return;
    const mine = ++token;
    status = 'loading';
    (async () => {
      const src = sourceFor(p, isOwned, isNear);
      let out: Lists;
      if (src.kind === 'artifact' && shelfReady) out = await fromArtifact(src.part, id);
      else if (src.kind === 'live') out = { kind: 'shelf', list: (await fromApi(id, 'collection')).similar ?? [] };
      else if (src.kind === 'catalog-minus-owned') {
        out = withoutIds(toStyles(await fromApi(id, 'all')), owned);
        if (tooThin(out)) out = withoutIds(toStyles(await fromApi(id, 'exclude')), owned);
      } else out = toStyles(await fromApi(id, 'all'));
      if (mine !== token) return;
      lists = out;
      status = 'ready';
    })().catch((e) => {
      if (mine !== token) return;
      failure = e instanceof Error ? e.message : String(e);
      status = 'error';
    });
  });

  /** The seed and the games already walked through — left out of every answer. */
  const walked = $derived(new Set([...(seedId == null ? [] : [seedId]), ...trail.map((s) => s.id)]));

  // --- Which list: Most Similar / Recommended / Dark Horses ---------------------------------
  // One list at a time, picked from cards above it (Phil, 2026-11-09). The pick is in the URL
  // (`?list=`), like the pool. The shelf pool has one list, so no picker there.
  const LIST_ORDER = ['similar', 'recommender', 'sicko'] as const;
  type ListKey = (typeof LIST_ORDER)[number];
  const DEFAULT_LIST: ListKey = 'recommender';

  /** The answer, minus the seed and the games already walked through. */
  const shown = $derived(lists && seedId != null ? withoutIds(lists, walked) : null);

  /** The list asked for, or — when that one has no games for this seed — the first that does. */
  const listKey = $derived.by((): ListKey => {
    const asked = params.get('list');
    const want = LIST_ORDER.find((k) => k === asked) ?? DEFAULT_LIST;
    if (shown?.kind !== 'styles' || shown[want].length) return want;
    return [DEFAULT_LIST, ...LIST_ORDER].find((k) => shown[k].length) ?? want;
  });

  // PLACEHOLDER copy (Phil): the empty-list line.
  const listOptions = $derived(
    LIST_ORDER.map((k) => {
      const empty = shown?.kind === 'styles' && !shown[k].length;
      return {
        value: k,
        label: SIMILAR_PROFILE_LABELS[k],
        description: empty ? 'No matches for this game.' : SIMILAR_PROFILE_BLURBS[k],
        disabled: empty
      };
    })
  );

  /** The one list the page shows, as a section (empty → none). */
  const sections = $derived.by((): Section[] => {
    if (!shown) return [];
    const s: Section =
      shown.kind === 'shelf'
        ? { key: 'shelf', hits: shown.list.slice(0, SECTION_MAX) }
        : { key: listKey, hits: shown[listKey].slice(0, SECTION_MAX) };
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
  async function walk(id: number) {
    await set({ id });
    window.scrollTo({ top: 0 });
  }

  let rows = $state<Map<number, Game>>(new Map());
  let rowsToken = 0;
  $effect(() => {
    const ids = [...new Set(sections.flatMap((s) => s.hits.map((h) => h.id)))];
    catalog.thumbnailsReady;
    const mine = ++rowsToken;
    games(ids).then((m) => mine === rowsToken && (rows = m));
  });

  const toItems = (hits: Hit[]): Item[] =>
    hits.flatMap((h) => {
      const g = rows.get(h.id);
      return g ? [{ ...g, similarity: h.similarity }] : [];
    });

  // PLACEHOLDER copy (Phil): the shelf section's heading and blurb.
  const SECTION_TEXT: Record<SectionKey, { title: string; blurb: string }> = {
    recommender: { title: SIMILAR_PROFILE_LABELS.recommender, blurb: SIMILAR_PROFILE_BLURBS.recommender },
    similar: { title: SIMILAR_PROFILE_LABELS.similar, blurb: SIMILAR_PROFILE_BLURBS.similar },
    sicko: { title: SIMILAR_PROFILE_LABELS.sicko, blurb: SIMILAR_PROFILE_BLURBS.sicko },
    shelf: { title: 'On your shelf', blurb: 'The games you own closest to this one.' }
  };

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

  // --- Start -------------------------------------------------------------------------------
  /** How many games each Start row offers (the row shows as many as fit, up to this). */
  const SEEDS_PER_ROW = 6;
  /** The favourites row draws from this many of the catalog's best-rated games. */
  const FAVOURITES_FROM = 100;

  /** Ids from a query, as catalog rows in the same order. */
  async function rowsFor(sql: string): Promise<Game[]> {
    const ids = (await query<{ id: number }>(sql)).map((x) => Number(x.id));
    const m = await games(ids);
    return ids.flatMap((id) => m.get(id) ?? []);
  }

  // I want games like…: a random handful of well-known games for everyone, drawn once per
  // visit from the catalog's best-rated — and, with a collection, your top-rated owned games.
  let favourites = $state<Game[]>([]);
  $effect(() => {
    if (catalog.status !== 'ready') return;
    rowsFor(
      `SELECT game_id AS id FROM (
         SELECT game_id FROM catalog WHERE geek_rating IS NOT NULL
         ORDER BY geek_rating DESC LIMIT ${FAVOURITES_FROM}
       ) ORDER BY random() LIMIT ${SEEDS_PER_ROW}`
    )
      .then((g) => (favourites = g))
      .catch((e) => console.error('favourites failed', e));
  });

  let shelfSeeds = $state<Game[]>([]);
  $effect(() => {
    if (!hasShelf) return;
    rowsFor(
      `SELECT game_id AS id FROM catalog WHERE game_id IN (${[...owned].join(',')})
       ORDER BY geek_rating DESC NULLS LAST LIMIT ${SEEDS_PER_ROW}`
    )
      .then((g) => (shelfSeeds = g))
      .catch((e) => console.error('shelf seeds failed', e));
  });

</script>

<svelte:head><title>Recommend · Boardgame-Viz</title></svelte:head>

<div class="page">
  <Container size="list">
    <Stack gap="lg">
      <div class="start">
        <!-- PLACEHOLDER copy (Phil) -->
        <h1>Find your next game</h1>
        <!-- PLACEHOLDER copy (Phil): the subtitle. -->
        <p class="lede">Pick a game you love and find others like it.</p>
      </div>

      <Stack gap="sm">
        <GameSearch onpick={(id) => set({ id })} />

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
        {#if seed}
          {@const sd = seed}
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
        {/if}

        <!-- ── The question: the pool, and where you've walked ───────── -->
        <div class="controls">
          {#if hasShelf}
            <!-- PLACEHOLDER copy (Phil) -->
            <span class="from">from</span>
            <SegmentedControl label="From" size="md" options={POOL_OPTIONS} value={pool} onchange={(v) => set({ from: v })} />
          {/if}
        </div>
        {#if trail.length > 1}
          <nav class="trail" aria-label="Games you have walked through">
            {#each trail as t, i (t.id)}
              {#if i > 0}<span aria-hidden="true">›</span>{/if}
              {#if t.id === seedId}
                <span aria-current="page">{t.name}</span>
              {:else}
                <a href={ask({ id: t.id })}>{t.name}</a>
              {/if}
            {/each}
          </nav>
        {/if}

        <!-- ── Which list ──────────────────────────────────────────────────────── -->
        {#if shown?.kind === 'styles'}
          <SegmentedControl label="Which list" size="md" options={listOptions} value={listKey} onchange={(v) => set({ list: v })} />
        {/if}

        <!-- ── The answer ────────────────────────────────────────────────────── -->
        {#if status === 'error'}
          <p class="msg">{failure}</p>
        {:else if status === 'loading' && !sections.length}
          <p class="msg">Looking…</p>
        {:else if seed && status === 'ready' && !sections.length}
          <p class="msg">PLACEHOLDER: nothing close to this one here.</p>
        {:else if seed}
          {#each sections as s (`${seedId}-${s.key}`)}
            <!-- The picker names the three lists; only the shelf list needs its own heading. -->
            <ResultSection
              title={s.key === 'shelf' ? SECTION_TEXT.shelf.title : ''}
              blurb={s.key === 'shelf' ? SECTION_TEXT.shelf.blurb : ''}
              items={toItems(s.hits)}
              {seed}
              {freq}
              {owned}
              {display}
              markOwned={pool === 'all'}
              {whyId}
              onwhy={toggleWhy}
              onwalk={walk}
            >
              {#snippet headEnd()}
                <SegmentedControl label="Show as" size="sm" options={DISPLAY_OPTIONS} value={display} onchange={setDisplay} />
              {/snippet}
            </ResultSection>
          {/each}
        {/if}
      {/if}

      {#if (username && (art === 'missing' || art === 'error')) || data.isAdmin}
        <!-- Shelf status and the admin's "view as": out of the reading path, at the foot. -->
        <div class="who">
          {#if art === 'missing'}
            <span>PLACEHOLDER: no shelf neighbours built for {username} yet.</span>
          {:else if art === 'error'}
            <span>Couldn’t load {username}’s shelf.</span>
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
  .msg { color: var(--muted-foreground); font-size: 0.9rem; margin: 0; }
  /* The headline is centred; everything under it shares one column (the page's measure), so
     the search and the answer start at one edge. */
  .start {
    display: flex; flex-direction: column; align-items: center; gap: var(--space-md);
    padding-top: var(--space-lg); text-align: center;
  }
  .lede { margin: 0; max-width: 40ch; font-size: 1.05rem; color: var(--muted-foreground); }
  .sub { margin: var(--space-sm) 0 0; font-size: 0.9rem; color: var(--muted-foreground); }
  .about { display: flex; flex-direction: column; gap: var(--space-sm); }
  .by { margin: 0; font-size: 0.95rem; color: var(--muted-foreground); }
  .tags { display: flex; flex-wrap: wrap; gap: 0.35rem; }
  .controls { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-sm); }
  .from { font-size: 0.95rem; color: var(--muted-foreground); }
  .trail {
    display: flex; flex-wrap: wrap; align-items: center; gap: 0.2rem 0.5rem;
    padding: 0 0.25rem; font-size: 0.85rem; color: var(--muted-foreground);
  }
  .trail a { color: inherit; text-decoration: none; }
  .trail a:hover { color: var(--primary); }
  .trail [aria-current] { color: var(--foreground); font-weight: 600; }
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
