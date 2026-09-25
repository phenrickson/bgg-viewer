<script lang="ts">
  /**
   * `/recommend` — one tool for finding a game (spec:
   * `docs/superpowers/specs/2026-09-25-recommend-ui-and-why-design.md`).
   *
   * With no seed it's the Start screen. (Being rebuilt: steps 4–5 of the plan.)
   *
   * With a seed the question heads the page — Games like [seed] from [pool] — and the answer
   * is stacked sections: the three precomputed lists (Recommended, Most similar, Dark horses),
   * or the one shelf list. The question lives in the URL (`?id&from`); tiles link to this page
   * with a new seed, and the pool you last picked stays picked as you walk. How an answer is
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
  import { DEFAULT_SCOPE, toWhere, type Scope } from '$lib/catalog/scope';
  import GameSearch from '$lib/catalog/GameSearch.svelte';
  import GameHero from '$lib/catalog/GameHero.svelte';
  import DialStrip from '$lib/discover/DialStrip.svelte';
  import { Button } from '$lib/components/ui/button';
  import { SegmentedControl } from '$lib/components/ui/segmented-control';
  import { Container, Stack } from '$lib/components/ui/layout';
  import { SIMILAR_PROFILE_LABELS, SIMILAR_PROFILE_BLURBS } from '$lib/game/similar-profiles';
  import type { TagFrequencies } from '$lib/recommend/why';
  import {
    sourceFor,
    sectionsFor,
    withoutIds,
    tooThin,
    type Pool,
    type Lists,
    type Hit,
    type SectionKey
  } from '$lib/recommend/sources';
  import ResultSection, { type Game, type Item } from './ResultSection.svelte';

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
    return p === 'unowned' || p === 'all' ? p : 'shelf';
  });

  /** A link to this page with some of the question changed — how every option and walk moves. */
  function ask(patch: { id?: number | null; from?: Pool }): string {
    const q = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null) q.delete(k);
      else q.set(k, String(v));
    }
    const s = q.toString();
    return `/recommend${s ? `?${s}` : ''}`;
  }
  const set = (patch: Parameters<typeof ask>[0]) => goto(ask(patch), { keepFocus: true, noScroll: true });

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

  /** The stacked sections, minus the seed and the games already walked through. */
  const sections = $derived.by(() => {
    if (!lists || seedId == null) return [];
    return sectionsFor(withoutIds(lists, new Set([seedId, ...trail.map((s) => s.id)])));
  });

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

  // --- Start (rebuilt in steps 4–5) ---------------------------------------------------------
  let shelfSeeds = $state<{ id: number; name: string }[]>([]);
  $effect(() => {
    if (!hasShelf) return;
    query<{ id: number; name: string }>(
      `SELECT game_id AS id, name FROM catalog WHERE game_id IN (${[...owned].join(',')})
       ORDER BY geek_rating DESC NULLS LAST LIMIT 3`
    ).then((r) => (shelfSeeds = r.map((x) => ({ id: Number(x.id), name: x.name }))));
  });

  let scope = $state<Scope>({ ...DEFAULT_SCOPE, universe: 'rated' });
  let shelfOnly = $state(false);
  let narrow = $state(false);
  let startPick = $state<Game | null>(null);
  const startWhere = $derived(
    `${toWhere(scope)}${shelfOnly && hasShelf ? ` AND game_id IN (${[...owned].join(',')})` : ''}`
  );

  /** A random pick from the 100 best-rated matches — a surprise, not a random obscurity. */
  async function pickForMe() {
    const r = await query<{ id: number }>(
      `SELECT game_id AS id FROM (
         SELECT game_id FROM catalog WHERE ${startWhere} ORDER BY geek_rating DESC NULLS LAST LIMIT 100
       ) ORDER BY random() LIMIT 1`
    );
    const id = r[0] ? Number(r[0].id) : null;
    startPick = id == null ? null : ((await games([id])).get(id) ?? null);
  }
  $effect(() => {
    if (seedId != null) startPick = null;
  });
</script>

<svelte:head><title>Recommend · bgg-viewer</title></svelte:head>

<div class="page">
  <Container size="list">
    <Stack gap="lg">
      {#if seedId == null}
        <!-- ── Start (being rebuilt: plan steps 4–5) ─────────────────────────────── -->
        <!-- PLACEHOLDER copy (Phil) -->
        <h1>Games like…</h1>
        <GameSearch onpick={(id) => set({ id })} />
        {#if shelfSeeds.length}
          <div class="seeds">
            {#each shelfSeeds as s (s.id)}
              <Button variant="outline" size="sm" href={ask({ id: s.id })}>{s.name}</Button>
            {/each}
          </div>
        {/if}
        <div class="seeds">
          <Button onclick={pickForMe} disabled={catalog.status !== 'ready'}>Surprise me</Button>
          <label class="check"><input type="checkbox" bind:checked={shelfOnly} disabled={!hasShelf} /> Only games on my shelf</label>
          <Button variant="ghost" size="sm" onclick={() => (narrow = !narrow)}>Narrow it down</Button>
        </div>
        {#if narrow}<DialStrip {scope} onpatch={(p) => (scope = { ...scope, ...p })} />{/if}
        {#if startPick}
          {@const g = startPick}
          <GameHero href="/games/{g.game_id}" name={g.name} image={g.thumbnail}>
            {#snippet meta()}{#if g.year_published}<span>{g.year_published}</span>{/if}{/snippet}
            {#snippet actions()}
              <Button onclick={pickForMe}>Another one</Button>
              <Button variant="outline" href={ask({ id: g.game_id })}>More like this</Button>
              <Button variant="link" href="/games/{g.game_id}">Open game ↗</Button>
            {/snippet}
          </GameHero>
        {/if}
      {:else}
        <!-- ── The question ──────────────────────────────────────────────────────── -->
        <header class="q">
          {#if trail.length > 1}
            <nav class="trail" aria-label="Path">
              {#each trail.slice(0, -1) as step (step.id)}
                <a href={ask({ id: step.id })}>{step.name}</a><span aria-hidden="true">→</span>
              {/each}
            </nav>
          {/if}
          <div class="sentence">
            <!-- PLACEHOLDER copy (Phil): the sentence's words. -->
            <span>Games like</span>
            <span class="seed">
              {#if seed?.thumbnail}
                <a href="/games/{seed.game_id}" class="seed-art" aria-label="Open {seed.name}"><img src={seed.thumbnail} alt="" /></a>
              {/if}
              <Button variant="outline" size="lg" href={ask({ id: null })} class="seed-btn">
                {seed?.name ?? '…'} <span class="change">change</span>
              </Button>
            </span>
            {#if hasShelf}
              <span>from</span>
              <SegmentedControl label="From" size="md" options={POOL_OPTIONS} value={pool} onchange={(v) => set({ from: v })} />
            {/if}
          </div>
          <div class="who">
            {#if !username}
              <span>PLACEHOLDER: link a BGG collection in <a href="/settings">Settings</a> to search your shelf.</span>
            {:else if art === 'loading'}
              <span>Loading {username}’s shelf…</span>
            {:else if art === 'missing'}
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
        </header>

        <!-- ── The answer ────────────────────────────────────────────────────────── -->
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
  .seeds { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-sm); font-size: 0.9rem; }
  .check { display: inline-flex; align-items: center; gap: 0.4rem; }

  .q { display: flex; flex-direction: column; gap: var(--space-sm); }
  .trail { display: flex; flex-wrap: wrap; gap: 0.35rem; font-size: 0.8rem; color: var(--muted-foreground); }
  .trail a { color: inherit; text-decoration: none; }
  .trail a:hover { color: var(--primary); }
  .sentence {
    display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem;
    font-size: var(--text-heading, clamp(1.25rem, 1rem + 1vw, 1.75rem));
    font-weight: 700; letter-spacing: -0.02em;
  }
  .seed { display: inline-flex; align-items: center; gap: 0.5rem; }
  .seed-art img { display: block; height: 2.5rem; width: auto; max-width: 3.5rem; border-radius: 5px; }
  /* The seed reads at the sentence's size; Button's `lg` is a control size, not a headline. */
  .sentence :global(.seed-btn) { font-size: inherit; font-weight: 700; height: auto; padding-block: 0.25rem; }
  .change { font-size: 0.8rem; font-weight: 500; color: var(--muted-foreground); }
  .who { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-sm); font-size: 0.8rem; color: var(--muted-foreground); }
  .who a { color: var(--primary); }
  .admin {
    font: inherit; font-size: 0.78rem; padding: 0.2rem 0.45rem; border-radius: 6px;
    border: 1px solid var(--border); background: var(--card); color: var(--foreground);
  }
</style>
