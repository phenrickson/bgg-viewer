<script lang="ts">
  /**
   * `/recommend` — one tool for finding a game (spec:
   * `docs/superpowers/specs/2026-09-25-recommend-ui-and-why-design.md`).
   *
   * With no seed it's the Start screen: a search, a row of well-known games, and (with a
   * collection) a row of your top-rated owned games.
   *
   * One page, not two: the search stays at the top. Picking a game (or clicking a result)
   * loads its answer underneath, in place — the search box then shows that game and still
   * searches — with the pool ("from my shelf | games I don't own | anywhere"), Surprise me and
   * a List | Cards toggle beneath it. The answer is stacked sections: the three precomputed
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
  import { explain, type TagFrequencies } from '$lib/recommend/why';
  import {
    sourceFor,
    sectionsFor,
    surpriseFrom,
    drawFrom,
    withoutIds,
    tooThin,
    type Pool,
    type Lists,
    type Hit,
    type SectionKey
  } from '$lib/recommend/sources';
  import ResultSection, { type Game, type Item, type Display } from './ResultSection.svelte';
  import WhyMatch from './WhyMatch.svelte';

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

  /** An open Surprise pick (nice-to-have URL state, spec §1). */
  const pickId = $derived(Number(params.get('pick')) || null);

  /**
   * A link to this page with some of the question changed — how every option and walk moves.
   * A new seed closes any open Surprise pick unless the patch says otherwise.
   */
  function ask(patch: { id?: number | null; from?: Pool; pick?: number | null }): string {
    const q = new URLSearchParams(params);
    if ('id' in patch && !('pick' in patch)) q.delete('pick');
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
              c.mechanics, c.categories, c.families, t.thumbnail
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
          families: arr(r.families)
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

  /** The stacked sections. */
  const sections = $derived(lists && seedId != null ? sectionsFor(withoutIds(lists, walked)) : []);

  // --- Surprise me: one game drawn from a wider list, shown above the sections ---------------
  const surprisePool = $derived(lists ? surpriseFrom(withoutIds(lists, walked)) : []);
  let seen = $state<Set<number>>(new Set());
  $effect(() => {
    // A new question starts the draw afresh.
    [seedId, pool];
    seen = new Set();
  });
  function surprise() {
    const r = drawFrom(surprisePool, seen);
    seen = r.seen;
    // Opening pushes a history entry; redrawing replaces it, so Back closes the pick.
    if (r.hit) set({ pick: r.hit.id }, pickId != null);
  }
  let pickGame = $state<Game | null>(null);
  $effect(() => {
    const id = pickId;
    if (id == null || catalog.status !== 'ready') {
      pickGame = null;
      return;
    }
    games([id]).then((m) => id === pickId && (pickGame = m.get(id) ?? null));
  });
  /** The pick's match to the seed — from the list it was drawn from, if it's still there. */
  const pickSim = $derived(
    surprisePool.find((h) => h.id === pickId)?.similarity ??
      sections.flatMap((s) => s.hits).find((h) => h.id === pickId)?.similarity ??
      null
  );

  let rows = $state<Map<number, Game>>(new Map());
  let rowsToken = 0;
  $effect(() => {
    const ids = [...new Set(sections.flatMap((s) => s.hits.map((h) => h.id)))];
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
        <GameSearch onpick={(id) => set({ id })} current={seed ? { name: seed.name, thumbnail: seed.thumbnail } : null} />

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
        {:else}
          <div class="controls">
            {#if hasShelf}
              <!-- PLACEHOLDER copy (Phil) -->
              <span class="from">from</span>
              <SegmentedControl label="From" size="md" options={POOL_OPTIONS} value={pool} onchange={(v) => set({ from: v })} />
            {/if}
            {#if status === 'ready' && surprisePool.length}
              <Button variant="outline" onclick={surprise}>Surprise me</Button>
            {/if}
            <span class="end">
              <SegmentedControl label="Show as" size="sm" options={DISPLAY_OPTIONS} value={display} onchange={setDisplay} />
            </span>
          </div>
          {#if (username && (art === 'missing' || art === 'error')) || data.isAdmin}
            <div class="who">
              {#if art === 'missing'}
                <span>PLACEHOLDER: no shelf neighbours built for {username} yet.</span>
              {:else if art === 'error'}
                <span>Couldn’t load {username}’s shelf.</span>
              {/if}
              {#if data.isAdmin}
                <input
                  class="admin"
                  type="text"
                  placeholder="any username (admin)"
                  bind:value={adminInput}
                  onkeydown={(e) => e.key === 'Enter' && adminInput.trim() && (username = adminInput.trim())}
                />
              {/if}
            </div>
          {/if}
        {/if}
      </Stack>

      {#if seedId != null}
        <!-- ── Surprise me ───────────────────────────────────────────────────── -->
        {#if pickGame && seed}
          {@const g = pickGame}
          <GameHero href="/games/{g.game_id}" name={g.name} image={g.thumbnail} onclose={() => set({ pick: null })}>
            {#snippet meta()}
              {#if g.year_published}<span>{g.year_published}</span>{/if}
              <SimBadges similarity={pickSim} rating={g.average_rating} />
              {#if hasShelf}<span>{owned.has(g.game_id) ? 'On your shelf' : 'Not on your shelf'}</span>{/if}
            {/snippet}
            {#snippet actions()}
              <!-- PLACEHOLDER copy (Phil) -->
              <Button onclick={surprise}>Another one</Button>
              <Button variant="outline" href={ask({ id: g.game_id })}>More like this</Button>
              <Button variant="link" href="/games/{g.game_id}">Open game ↗</Button>
            {/snippet}
            <WhyMatch why={explain(seed, g, freq)} seed={seed.name} other={g.name} />
          </GameHero>
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
            <ResultSection
              title={SECTION_TEXT[s.key].title}
              blurb={SECTION_TEXT[s.key].blurb}
              items={toItems(s.hits)}
              {seed}
              {freq}
              {owned}
              {display}
              markOwned={pool === 'all'}
              hrefFor={(id) => ask({ id })}
            />
          {/each}
        {/if}
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
  .controls { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-sm); }
  .from { font-size: 0.95rem; color: var(--muted-foreground); }
  .end { margin-left: auto; }
  .who { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-sm); font-size: 0.8rem; color: var(--muted-foreground); }
  .admin {
    font: inherit; font-size: 0.78rem; padding: 0.2rem 0.45rem; border-radius: 6px;
    border: 1px solid var(--border); background: var(--card); color: var(--foreground);
  }
</style>
