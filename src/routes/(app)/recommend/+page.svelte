<script lang="ts">
  /**
   * `/recommend` — one question, one answer.
   *
   * With no seed it's the Start screen: "Games like…" (search, or one of your top owned games),
   * or Surprise me (a random pick from Discover's questions, optionally only your shelf).
   *
   * With a seed the question reads as a sentence — Games like [seed] from [pool] — with
   * Best match | Surprise me under it, and the page shows the one answer those options ask
   * for. The options are the interface: they live in the URL (`?id&from&mode`), results link
   * to the same page with a new seed, and whatever pool/mode you last picked stays picked as
   * you walk. How an answer is fetched (collection artifact, precomputed lists, the live
   * pooled query) is `$lib/recommend/sources.ts` and never shows as a choice.
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
  import SegGroup from '$lib/catalog/rail/SegGroup.svelte';
  import DialStrip from '$lib/discover/DialStrip.svelte';
  import SimilarRow from '$lib/game/SimilarRow.svelte';
  import { similarityPct, similarityColor } from '$lib/game/similarity';
  import { Button } from '$lib/components/ui/button';
  import { Container, Stack, Split, AutoGrid } from '$lib/components/ui/layout';
  import { explain, whyLine, type TagFrequencies, type WhyRow } from '$lib/recommend/why';
  import {
    sourceFor,
    listFor,
    withoutIds,
    tooThin,
    type Pool,
    type Mode,
    type Lists,
    type Hit
  } from '$lib/recommend/sources';
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
    return p === 'unowned' || p === 'all' ? p : 'shelf';
  });
  const mode = $derived<Mode>(params.get('mode') === 'surprise' ? 'surprise' : 'best');

  /** A link to this page with some of the question changed — how every option and walk moves. */
  function ask(patch: { id?: number | null; from?: Pool; mode?: Mode }): string {
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
  type Game = WhyRow & {
    game_id: number;
    name: string;
    year_published: number | null;
    average_rating: number | null;
    thumbnail: string | null;
  };
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
  type Item = Game & { similarity: number };
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

  /** The one list this question shows — minus the seed and the games already walked through. */
  const hits = $derived.by(() => {
    if (!lists || seedId == null) return [];
    const walked = new Set([seedId, ...trail.map((s) => s.id)]);
    return listFor(withoutIds(lists, walked), mode);
  });

  let items = $state<Item[]>([]);
  let itemsToken = 0;
  $effect(() => {
    const h = hits;
    const mine = ++itemsToken;
    games(h.map((x) => x.id)).then((m) => {
      if (mine !== itemsToken) return;
      items = h.flatMap((x) => {
        const g = m.get(x.id);
        return g ? [{ ...g, similarity: x.similarity }] : [];
      });
    });
  });

  const why = (g: Item) => (seed ? explain(seed, g, freq) : null);
  let openWhy = $state<number | null>(null);

  // --- Surprise me (with a seed): one draw from the wider list ------------------------------
  let drawn = $state<number | null>(null);
  let seen = $state<Set<number>>(new Set());
  $effect(() => {
    // A new question starts a new draw.
    [seedId, pool, mode];
    drawn = null;
    seen = new Set();
  });
  $effect(() => {
    // Draw when there's nothing drawn yet — or when what was drawn isn't in the list any
    // more (the list arrived after the mode or pool changed).
    const stale = drawn == null || !items.some((g) => g.game_id === drawn);
    if (mode === 'surprise' && items.length && stale) untrack(draw);
  });
  function draw() {
    const fresh = items.filter((g) => !seen.has(g.game_id));
    const from = fresh.length ? fresh : items;
    if (!fresh.length) seen = new Set();
    const g = from[Math.floor(Math.random() * from.length)];
    drawn = g?.game_id ?? null;
    if (g) seen = new Set([...seen, g.game_id]);
  }
  const pick = $derived(items.find((g) => g.game_id === drawn) ?? null);

  // --- Start: shelf seeds and "pick one for me" ---------------------------------------------
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
  let matchCount = $state<number | null>(null);
  let startPick = $state<Game | null>(null);

  const startWhere = $derived(
    `${toWhere(scope)}${shelfOnly && hasShelf ? ` AND game_id IN (${[...owned].join(',')})` : ''}`
  );
  $effect(() => {
    if (catalog.status !== 'ready' || seedId != null) return;
    const where = startWhere;
    query<{ n: number }>(`SELECT COUNT(*)::INT AS n FROM catalog WHERE ${where}`)
      .then((r) => (matchCount = r[0]?.n ?? 0))
      .catch(() => (matchCount = null));
  });

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

  // PLACEHOLDER copy (Phil): option labels, headings, context lines, empty/loading states.
  const POOL_OPTIONS: { value: Pool; label: string }[] = [
    { value: 'shelf', label: 'my shelf' },
    { value: 'unowned', label: 'games I don’t own' },
    { value: 'all', label: 'anywhere' }
  ];
  const MODE_OPTIONS: { value: Mode; label: string }[] = [
    { value: 'best', label: 'Best match' },
    { value: 'surprise', label: 'Surprise me' }
  ];
  const context = $derived(
    pool === 'shelf' ? `From your ${owned.size} games` : pool === 'unowned' ? 'From games you don’t own' : 'From the whole catalog'
  );
</script>

<svelte:head><title>Recommend · bgg-viewer</title></svelte:head>

<div class="page">
  <Container size="list">
    <Stack gap="lg">
      {#if seedId == null}
        <!-- ── Start ─────────────────────────────────────────────────────────────── -->
        <header>
          <!-- PLACEHOLDER copy (Phil) -->
          <h1>Games like…</h1>
          <p class="lede">PLACEHOLDER: start from a game you love, or let it pick one for you.</p>
        </header>

        <Stack gap="sm">
          <GameSearch onpick={(id) => set({ id, mode: 'best' })} />
          {#if shelfSeeds.length}
            <div class="seeds">
              <span class="dim">From your shelf:</span>
              {#each shelfSeeds as s (s.id)}
                <Button variant="outline" size="sm" href={ask({ id: s.id, mode: 'best' })}>{s.name}</Button>
              {/each}
            </div>
          {/if}
        </Stack>

        <div class="or" aria-hidden="true"><span>or</span></div>

        <Stack gap="sm">
          <div class="surprise-row">
            <Button size="lg" onclick={pickForMe} disabled={catalog.status !== 'ready' || matchCount === 0}>
              {startPick ? 'Another one' : 'Surprise me'}
            </Button>
            <label class="check">
              <input type="checkbox" bind:checked={shelfOnly} disabled={!hasShelf} />
              Only games on my shelf
            </label>
            <Button variant="ghost" size="sm" aria-expanded={narrow} onclick={() => (narrow = !narrow)}>
              Narrow it down {narrow ? '▴' : '▾'}
            </Button>
            {#if matchCount != null}<span class="dim tnum">{matchCount.toLocaleString()} matches</span>{/if}
          </div>
          {#if narrow}
            <DialStrip {scope} onpatch={(p) => (scope = { ...scope, ...p })} />
          {/if}
        </Stack>

        {#if startPick}
          {@render hero(startPick, null)}
        {/if}
      {:else}
        <!-- ── The question ──────────────────────────────────────────────────────── -->
        <header class="q">
          {#if trail.length > 1}
            <nav class="trail" aria-label="Path">
              {#each trail.slice(0, -1) as step (step.id)}
                <a href={ask({ id: step.id })}>{step.name}</a><span class="sep" aria-hidden="true">→</span>
              {/each}
            </nav>
          {/if}
          <div class="sentence">
            <span>Games like</span>
            <Button variant="outline" href={ask({ id: null })} class="seed-btn">
              {seed?.name ?? '…'} <span class="dim">change</span>
            </Button>
            {#if hasShelf}
              <span>from</span>
              <div class="pool">
                <SegGroup ariaLabel="From" options={POOL_OPTIONS} value={pool} onchange={(v) => set({ from: v })} />
              </div>
            {/if}
          </div>
          <div class="modes-row">
            <div class="modes">
              <SegGroup ariaLabel="Mode" options={MODE_OPTIONS} value={mode} onchange={(v) => set({ mode: v })} />
            </div>
            <span class="dim">{hasShelf ? context : ''}</span>
            {#if seed}<a class="open" href="/games/{seed.game_id}">Open {seed.name} ↗</a>{/if}
          </div>
          <div class="who">
            {#if !username}
              <span class="dim">PLACEHOLDER: link a BGG collection in <a href="/settings">Settings</a> to search your shelf.</span>
            {:else if art === 'loading'}
              <span class="dim">Loading {username}’s shelf…</span>
            {:else if art === 'missing'}
              <span class="dim">PLACEHOLDER: no shelf neighbours built for {username} yet.</span>
            {:else if art === 'error'}
              <span class="dim">Couldn’t load {username}’s shelf.</span>
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
        {#if status === 'loading' && !items.length}
          <p class="msg">Looking…</p>
        {:else if status === 'error'}
          <p class="msg">{failure}</p>
        {:else if !items.length}
          <p class="msg">PLACEHOLDER: nothing close to this one here.</p>
        {:else if mode === 'best'}
          <ol class="list" aria-busy={status === 'loading'}>
            {#each items as g (g.game_id)}
              {@const w = why(g)}
              <li>
                <div class="line">
                  <SimilarRow
                    href={ask({ id: g.game_id })}
                    name={g.name}
                    year={g.year_published}
                    thumbnail={g.thumbnail}
                    similarity={g.similarity}
                    rating={g.average_rating}
                  >
                    {#if pool === 'all' && owned.has(g.game_id)}<b class="own">on your shelf</b> · {/if}{w ? whyLine(w).join(' · ') : ''}
                  </SimilarRow>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-expanded={openWhy === g.game_id}
                    onclick={() => (openWhy = openWhy === g.game_id ? null : g.game_id)}>Why?</Button
                  >
                </div>
                {#if openWhy === g.game_id && w && seed}
                  <div class="whybox"><WhyMatch why={w} seed={seed.name} other={g.name} /></div>
                {/if}
              </li>
            {/each}
          </ol>
        {:else if pick}
          {@render hero(pick, pick.similarity)}
          {#if items.length > 1}
            <section>
              <h2 class="sec">PLACEHOLDER: Also in the draw</h2>
              <AutoGrid min="lg" gap="sm">
                {#each items.filter((g) => g.game_id !== pick.game_id) as g (g.game_id)}
                  <SimilarRow
                    href={ask({ id: g.game_id, mode: 'best' })}
                    name={g.name}
                    year={g.year_published}
                    thumbnail={g.thumbnail}
                    similarity={g.similarity}
                    rating={g.average_rating}
                  />
                {/each}
              </AutoGrid>
            </section>
          {/if}
        {/if}
      {/if}
    </Stack>
  </Container>
</div>

<!-- One game, large: the Surprise pick, with or without a seed to match it against. -->
{#snippet hero(g: Game, similarity: number | null)}
  {@const w = seed && similarity != null ? explain(seed, g, freq) : null}
  <section class="hero">
    <Split ratio="aside-narrow">
      {#snippet aside()}
        <a class="art" href="/games/{g.game_id}" aria-label={g.name}>
          {#if g.thumbnail}<img src={g.thumbnail} alt="" loading="lazy" decoding="async" />{/if}
        </a>
      {/snippet}
      {#snippet main()}
        <div class="hero-body">
          <p class="eyebrow">PLACEHOLDER: Try</p>
          <h2><a href="/games/{g.game_id}">{g.name}</a></h2>
          <p class="meta">
            {#if g.year_published}<span>{g.year_published}</span>{/if}
            {#if similarity != null && seed}
              <span class="match" style:color={similarityColor(similarity)}
                >{Math.round(similarityPct(similarity))}% like {seed.name}</span
              >
            {/if}
            {#if hasShelf}<span>{owned.has(g.game_id) ? 'on your shelf' : 'not on your shelf'}</span>{/if}
          </p>
          <div class="actions">
            <Button onclick={() => (seedId == null ? pickForMe() : draw())}>Another one</Button>
            <Button variant="outline" href={ask({ id: g.game_id, mode: 'best' })}>More like this</Button>
            <Button variant="link" href="/games/{g.game_id}">Open game ↗</Button>
          </div>
          {#if w && seed}
            <WhyMatch why={w} seed={seed.name} other={g.name} />
          {/if}
        </div>
      {/snippet}
    </Split>
  </section>
{/snippet}

<style>
  .page { display: flex; flex-direction: column; padding: 0 0 var(--space-xl); }

  /* Matches Discover's and the landing page's hero, so the pages read as one voice. */
  h1 {
    font-size: var(--text-display, clamp(1.8rem, 1.1rem + 3vw, 3rem));
    font-weight: 750; letter-spacing: -0.03em; line-height: 1.05; margin: 0; text-wrap: balance;
  }
  .lede { font-size: 1.1rem; color: var(--muted-foreground); max-width: 40rem; margin: 0.6rem 0 0; }
  .dim { color: var(--muted-foreground); }
  .tnum { font-variant-numeric: tabular-nums; }
  .msg { color: var(--muted-foreground); font-size: 0.9rem; margin: 0; }

  .seeds { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; font-size: 0.85rem; }
  .or {
    display: flex; align-items: center; gap: var(--space-md);
    color: var(--muted-foreground); font-size: 0.85rem;
  }
  .or::before, .or::after { content: ''; flex: 1; height: 1px; background: var(--border); }
  .surprise-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-md); font-size: 0.9rem; }
  .check { display: inline-flex; align-items: center; gap: 0.4rem; }

  /* ── the question ── */
  .q { display: flex; flex-direction: column; gap: var(--space-sm); }
  .trail { display: flex; flex-wrap: wrap; gap: 0.35rem; font-size: 0.8rem; }
  .trail a { color: var(--muted-foreground); text-decoration: none; }
  .trail a:hover { color: var(--primary); }
  .trail .sep { color: var(--muted-foreground); }
  .sentence {
    display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem;
    font-size: var(--text-heading, clamp(1.25rem, 1rem + 1vw, 1.75rem));
    font-weight: 700; letter-spacing: -0.02em;
  }
  .sentence :global(.seed-btn) { font-size: inherit; font-weight: 700; height: auto; padding-block: 0.2rem; }
  .sentence :global(.seed-btn .dim) { font-size: 0.8rem; font-weight: 500; }
  /* SegGroup's buttons share the row equally; give each group a width to share. */
  .pool { width: min(100%, 24rem); font-weight: 500; letter-spacing: 0; }
  .modes { width: min(100%, 15rem); }
  .modes-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-md); font-size: 0.85rem; }
  .open { margin-left: auto; color: var(--primary); text-decoration: none; font-weight: 600; }
  .open:hover { text-decoration: underline; }
  .who { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-sm); font-size: 0.8rem; }
  .who a { color: var(--primary); }
  .admin {
    font: inherit; font-size: 0.78rem; padding: 0.2rem 0.45rem; border-radius: 6px;
    border: 1px solid var(--border); background: var(--card); color: var(--foreground);
  }

  /* ── the answer ── */
  .list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; }
  .line { display: flex; align-items: center; gap: 0.4rem; }
  .line > :global(a) { flex: 1; }
  .own { color: var(--primary); font-weight: 600; }
  .whybox {
    margin: 0.4rem 0 0.2rem 2.6rem; padding: var(--space-md);
    border: 1px solid var(--border); border-radius: 8px; background: var(--card);
  }

  .hero {
    padding: var(--space-lg); border: 1px solid var(--border); border-radius: 12px; background: var(--card);
    container-type: inline-size;
  }
  /* A fixed 4:3 box, so a slow or missing image never reflows the section — the same
     treatment as the landing page's featured game. `contain`, not `cover`: BGG thumbnails
     are landscape and a square crop slices the box art. */
  .art {
    display: block; aspect-ratio: 4 / 3; border-radius: 10px; overflow: hidden;
    background: color-mix(in oklch, var(--muted) 70%, var(--card));
  }
  .art img { width: 100%; height: 100%; object-fit: contain; display: block; }
  .hero-body { display: flex; flex-direction: column; gap: var(--space-sm); }
  .eyebrow {
    font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--muted-foreground); font-weight: 600; margin: 0;
  }
  .hero h2 {
    font-size: var(--text-display, clamp(1.8rem, 1.1rem + 3vw, 3rem));
    font-weight: 750; letter-spacing: -0.03em; line-height: 1.05; margin: 0; text-wrap: balance;
  }
  .hero h2 a { color: inherit; text-decoration: none; }
  .hero h2 a:hover { color: var(--primary); }
  .meta { display: flex; flex-wrap: wrap; gap: 0.3rem 0.9rem; margin: 0; color: var(--muted-foreground); font-size: 0.95rem; }
  .match { font-weight: 700; }
  .actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-sm); margin-bottom: var(--space-sm); }

  .sec {
    font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--muted-foreground); font-weight: 600; margin: 0 0 var(--space-sm);
  }
</style>
