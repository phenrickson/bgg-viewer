<script lang="ts">
  /**
   * `/recommend` — PROTOTYPE of the Recommend tool.
   *
   * Two ways in: "I know a game" (search for a seed) and "Surprise me" (Discover's questions,
   * optionally limited to your shelf, then a random pick from the best matches). Either way
   * the page then shows two lists for the seed and lets you walk: click any name and it
   * becomes the seed, with the path kept as a trail.
   *
   * Where each list comes from — local first, the warehouse only when it has to:
   *
   *   seed on your shelf       On your shelf  → artifact part A (instant)
   *                            Out there      → artifact part C, three catalog styles (instant)
   *   seed a near-miss (in D)  On your shelf  → artifact part D, minus games on the trail
   *   any other seed           On your shelf  → live pooled search, on request (~3–5 s)
   *   seed not on your shelf   Out there      → the catalog-wide precomputed lists
   *
   * The artifact is the per-collection `collection_neighbors` table (see
   * `server/collection-neighbors/`), loaded into DuckDB next to the catalog. Shelf lists are
   * plain similarity for now — a placeholder for the collection-mode profiles still to be
   * tuned; "Surprise me" on a shelf list draws at random from ranks 5–20.
   */
  import { untrack } from 'svelte';
  import { initCatalog, catalog, query, loadArrowTable } from '$lib/catalog/catalog.svelte';
  import { DEFAULT_SCOPE, toWhere, type Scope } from '$lib/catalog/scope';
  import { SIMILAR_PROFILES, SIMILAR_PROFILE_LABELS, type SimilarProfile } from '$lib/game/similar-profiles';
  import DialStrip from '$lib/discover/DialStrip.svelte';
  import GameSearch from '$lib/catalog/GameSearch.svelte';
  import { Container } from '$lib/components/ui/layout';
  import NeighbourList, { type Item } from './NeighbourList.svelte';

  let { data } = $props();

  // --- whose collection -----------------------------------------------------------------
  // Seeded once from the signed-in user; an admin can switch it, so it's state, not derived.
  let username = $state<string>(untrack(() => data.user?.bgg_username ?? ''));
  let adminInput = $state('');
  let art = $state<'none' | 'loading' | 'ready' | 'missing' | 'error'>('none');
  let owned = $state<Set<number>>(new Set());
  let dSeeds = $state<Set<number>>(new Set());

  async function loadCollection(u: string) {
    if (!u) return;
    art = 'loading';
    try {
      await loadArrowTable('collection_neighbors', `/api/collection-neighbors?username=${encodeURIComponent(u)}`);
      const o = await query<{ id: number }>(
        `SELECT DISTINCT seed_id AS id FROM collection_neighbors WHERE part = 'A'
         UNION SELECT DISTINCT neighbor_id FROM collection_neighbors WHERE part = 'A'`
      );
      const d = await query<{ id: number }>(
        `SELECT DISTINCT seed_id AS id FROM collection_neighbors WHERE part = 'D'`
      );
      owned = new Set(o.map((r) => Number(r.id)));
      dSeeds = new Set(d.map((r) => Number(r.id)));
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

  // --- the walk -------------------------------------------------------------------------
  type Step = { id: number; name: string };
  let trail = $state<Step[]>([]);
  const seed = $derived(trail.at(-1) ?? null);
  const seedOwned = $derived(seed != null && owned.has(seed.id));

  function start(id: number, name: string) {
    trail = [{ id, name }];
  }
  function walk(id: number, name: string) {
    const at = trail.findIndex((s) => s.id === id);
    trail = at >= 0 ? trail.slice(0, at + 1) : [...trail, { id, name }];
  }

  // --- hydrate ids from the catalog ------------------------------------------------------
  async function hydrate(list: { id: number; similarity: number }[]): Promise<Item[]> {
    if (!list.length) return [];
    const ids = list.map((x) => x.id).join(',');
    const rows = await query<Omit<Item, 'similarity' | 'rank'>>(
      `SELECT c.game_id, c.name, c.year_published, c.geek_rating, t.thumbnail
       FROM catalog c LEFT JOIN thumbnails t USING (game_id) WHERE c.game_id IN (${ids})`
    );
    const byId = new Map(rows.map((r) => [Number(r.game_id), r]));
    return list.map((x, i) => {
      const r = byId.get(x.id);
      return {
        game_id: x.id,
        name: r?.name ?? `Game #${x.id}`,
        year_published: r?.year_published ?? null,
        geek_rating: r?.geek_rating ?? null,
        thumbnail: r?.thumbnail ?? null,
        similarity: x.similarity,
        rank: i + 1
      };
    });
  }

  /** A part/style list from the local artifact, best first. */
  async function local(part: 'A' | 'C' | 'D', seedId: number, style: string, exclude: number[] = []) {
    const not = exclude.length ? `AND neighbor_id NOT IN (${exclude.join(',')})` : '';
    const rows = await query<{ id: number; similarity: number }>(
      `SELECT neighbor_id AS id, similarity FROM collection_neighbors
       WHERE part = '${part}' AND style = '${style}' AND seed_id = ${seedId} ${not}
       ORDER BY rank`
    );
    return hydrate(rows.map((r) => ({ id: Number(r.id), similarity: Number(r.similarity) })));
  }

  // --- On your shelf ----------------------------------------------------------------------
  let shelf = $state<Item[]>([]);
  let shelfSource = $state<'A' | 'D' | 'live' | 'ask' | 'none'>('none');
  let shelfLoading = $state(false);
  let surprise = $state<number | null>(null);

  // --- Out there --------------------------------------------------------------------------
  let outThere = $state<Record<string, Item[]>>({});
  let outSource = $state<'C' | 'all' | 'none'>('none');
  let outStyle = $state<SimilarProfile>('recommender');
  let outLoading = $state(false);
  let outError = $state<string | null>(null);

  let token = 0;
  $effect(() => {
    const s = seed;
    const isOwned = seedOwned;
    const ready = art === 'ready';
    const mine = ++token;
    surprise = null;
    outError = null;
    if (!s) {
      shelfSource = outSource = 'none';
      return;
    }
    const exclude = trail.map((t) => t.id);

    // shelf
    shelfLoading = true;
    (async () => {
      const part = ready && isOwned ? 'A' : ready && dSeeds.has(s.id) ? 'D' : null;
      const items = part ? (await local(part, s.id, 'shelf', exclude)).slice(0, 20) : [];
      if (mine !== token) return; // a newer seed has taken over
      shelf = items;
      shelfSource = part ?? (ready ? 'ask' : 'none');
      shelfLoading = false;
    })().catch((e) => console.error('shelf list failed', e));

    // out there
    outLoading = true;
    (async () => {
      if (ready && isOwned) {
        const lists: Record<string, Item[]> = {};
        for (const p of SIMILAR_PROFILES) lists[p] = await local('C', s.id, p);
        if (mine !== token) return;
        outThere = lists;
        outSource = 'C';
      } else {
        const res = await fetch(`/api/similar?id=${s.id}&pool=all`);
        if (!res.ok) throw new Error(`similar lists failed (${res.status})`);
        const { profiles } = (await res.json()) as { profiles: Record<string, { id: number; similarity: number }[]> };
        const lists: Record<string, Item[]> = {};
        for (const p of SIMILAR_PROFILES) lists[p] = await hydrate(profiles[p] ?? []);
        if (mine !== token) return;
        outThere = lists;
        outSource = 'all';
      }
      outLoading = false;
    })().catch((e) => {
      if (mine !== token) return;
      outError = String(e instanceof Error ? e.message : e);
      outLoading = false;
    });
  });

  /** Case B: an arbitrary seed against the shelf — a live warehouse query, so on request. */
  async function searchShelfLive() {
    if (!seed || !username) return;
    const mine = token;
    shelfLoading = true;
    try {
      const res = await fetch(
        `/api/similar?id=${seed.id}&pool=collection&username=${encodeURIComponent(username)}`
      );
      if (!res.ok) throw new Error(`live search failed (${res.status})`);
      const { profiles } = (await res.json()) as { profiles: Record<string, { id: number; similarity: number }[]> };
      const exclude = new Set(trail.map((t) => t.id));
      const items = await hydrate((profiles.similar ?? []).filter((x) => !exclude.has(x.id)));
      if (mine !== token) return;
      shelf = items;
      shelfSource = 'live';
    } catch (e) {
      console.error(e);
    } finally {
      if (mine === token) shelfLoading = false;
    }
  }

  const shelfShown = $derived(shelf.slice(0, 10));
  function drawSurprise() {
    const pool = shelf.filter((g) => g.rank >= 5 && g.rank <= 20);
    const from = pool.length ? pool : shelf;
    surprise = from.length ? from[Math.floor(Math.random() * from.length)].game_id : null;
  }
  const surpriseItem = $derived(shelf.find((g) => g.game_id === surprise) ?? null);

  // --- Surprise me entry point ----------------------------------------------------------
  let mode = $state<'know' | 'surprise'>('know');
  let scope = $state<Scope>({ ...DEFAULT_SCOPE, universe: 'rated' });
  let shelfOnly = $state(false);
  let matchCount = $state<number | null>(null);
  let picking = $state(false);

  const poolWhere = $derived(
    `${toWhere(scope)}${shelfOnly && owned.size ? ` AND game_id IN (${[...owned].join(',')})` : ''}`
  );

  $effect(() => {
    if (catalog.status !== 'ready' || mode !== 'surprise') return;
    const where = poolWhere;
    query<{ n: number }>(`SELECT COUNT(*)::INT AS n FROM catalog WHERE ${where}`)
      .then((r) => (matchCount = r[0]?.n ?? 0))
      .catch(() => (matchCount = null));
  });

  /** Random pick from the 100 best-rated matches — a surprise, not a random obscurity. */
  async function pick() {
    picking = true;
    try {
      const r = await query<{ game_id: number; name: string }>(
        `SELECT game_id, name FROM (
           SELECT game_id, name FROM catalog WHERE ${poolWhere}
           ORDER BY geek_rating DESC NULLS LAST LIMIT 100
         ) ORDER BY random() LIMIT 1`
      );
      if (r[0]) start(Number(r[0].game_id), r[0].name);
    } finally {
      picking = false;
    }
  }
</script>

<div class="page">
  <Container size="list">
    <!-- PLACEHOLDER copy (Phil) -->
    <h1>Recommend</h1>
    <p class="lede">PLACEHOLDER: start from a game you know, or let it pick one for you.</p>

    <div class="who">
      {#if username}
        <span>Collection: <b>{username}</b></span>
        {#if art === 'loading'}<span class="dim">loading…</span>
        {:else if art === 'missing'}<span class="warn">no neighbours built for this collection yet</span>
        {:else if art === 'error'}<span class="warn">couldn’t load its neighbours</span>
        {:else if art === 'ready'}<span class="dim">{owned.size} games</span>{/if}
      {:else}
        <span class="dim">No BGG collection linked — shelf lists are off. Link one in <a href="/settings">Settings</a>.</span>
      {/if}
      {#if data.isAdmin}
        <span class="admin">
          <input
            type="text"
            placeholder="any username (admin)"
            bind:value={adminInput}
            onkeydown={(e) => e.key === 'Enter' && adminInput.trim() && (username = adminInput.trim())}
          />
        </span>
      {/if}
    </div>

    <div class="modes" role="tablist">
      <button type="button" role="tab" class:on={mode === 'know'} aria-selected={mode === 'know'} onclick={() => (mode = 'know')}>
        I know a game
      </button>
      <button type="button" role="tab" class:on={mode === 'surprise'} aria-selected={mode === 'surprise'} onclick={() => (mode = 'surprise')}>
        Surprise me
      </button>
    </div>

    {#if mode === 'know'}
      <GameSearch onpick={start} />
    {:else}
      <DialStrip {scope} onpatch={(p) => (scope = { ...scope, ...p })} />
      <div class="pickrow">
        <label class="toggle">
          <input type="checkbox" bind:checked={shelfOnly} disabled={art !== 'ready'} />
          Only games on my shelf
        </label>
        <span class="dim tnum">{matchCount == null ? '' : `${matchCount.toLocaleString()} matches`}</span>
        <button type="button" class="primary" onclick={pick} disabled={picking || catalog.status !== 'ready' || matchCount === 0}>
          {seed && mode === 'surprise' ? 'Pick another' : 'Pick one'}
        </button>
      </div>
    {/if}

    {#if seed}
      <nav class="trail" aria-label="Path">
        {#each trail as step, i (step.id)}
          {#if i > 0}<span class="sep" aria-hidden="true">→</span>{/if}
          <button type="button" class:cur={i === trail.length - 1} onclick={() => walk(step.id, step.name)}>
            {step.name}
          </button>
        {/each}
        <a class="open" href={`/games/${seed.id}`}>open ↗</a>
        {#if seedOwned}<span class="own">on your shelf</span>{/if}
      </nav>

      <div class="cols">
        <section>
          <header>
            <h2>On your shelf</h2>
            <span class="src dim">
              {#if shelfSource === 'A'}from your shelf
              {:else if shelfSource === 'D'}closest on your shelf to this one
              {:else if shelfSource === 'live'}live search
              {/if}
            </span>
          </header>
          {#if !username || art !== 'ready'}
            <p class="msg">Needs a collection with neighbours built.</p>
          {:else if shelfLoading}
            <p class="msg">Looking…</p>
          {:else if shelfSource === 'ask'}
            <p class="msg">
              This game isn’t on your shelf or next to it, so its matches aren’t precomputed.
              <button type="button" class="link" onclick={searchShelfLive}>Search your shelf (live, a few seconds)</button>
            </p>
          {:else if !shelf.length}
            <p class="msg">Nothing on your shelf is close to this one.</p>
          {:else}
            <div class="bar">
              <button type="button" class="link" onclick={drawSurprise}>Surprise me</button>
              {#if surpriseItem}<span class="dim">→ <b>{surpriseItem.name}</b></span>{/if}
            </div>
            <NeighbourList items={surpriseItem && !shelfShown.includes(surpriseItem) ? [...shelfShown, surpriseItem] : shelfShown} {owned} onwalk={walk} highlight={surprise} />
          {/if}
        </section>

        <section>
          <header>
            <h2>{seedOwned ? 'Out there, not on your shelf' : 'Across the catalog'}</h2>
          </header>
          <div class="seg" role="group" aria-label="Style">
            {#each SIMILAR_PROFILES as p (p)}
              <button type="button" class:on={outStyle === p} onclick={() => (outStyle = p)}>
                {SIMILAR_PROFILE_LABELS[p]}
              </button>
            {/each}
          </div>
          {#if outLoading}
            <p class="msg">Looking…</p>
          {:else if outError}
            <p class="msg warn">{outError}</p>
          {:else if !(outThere[outStyle] ?? []).length}
            <p class="msg">No {SIMILAR_PROFILE_LABELS[outStyle]} list for this game.</p>
          {:else}
            <NeighbourList items={outThere[outStyle]} {owned} onwalk={walk} />
          {/if}
        </section>
      </div>
    {/if}
  </Container>
</div>

<style>
  .page { display: flex; flex-direction: column; padding: 0 0 var(--space-xl); }
  h1 {
    font-size: var(--text-display, clamp(1.8rem, 1.1rem + 3vw, 3rem));
    font-weight: 750; letter-spacing: -0.03em; line-height: 1.05; margin: 0;
  }
  .lede { font-size: 1.05rem; color: var(--muted-foreground); margin: 0.6rem 0 var(--space-lg); }
  .dim { color: var(--muted-foreground); }
  .warn { color: var(--destructive, oklch(0.6 0.2 25)); }
  .who {
    display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem;
    font-size: 0.85rem; margin-bottom: var(--space-md);
  }
  .admin input {
    font: inherit; font-size: 0.8rem; padding: 0.2rem 0.45rem; border-radius: 6px;
    border: 1px solid var(--border); background: var(--card); color: var(--foreground);
  }

  .modes { display: inline-flex; gap: 0.25rem; margin-bottom: var(--space-md); padding: 0.2rem; border-radius: 10px; background: var(--muted); }
  .modes button, .seg button {
    font: inherit; font-size: 0.85rem; border: none; background: none; color: var(--muted-foreground);
    padding: 0.35rem 0.8rem; border-radius: 7px; cursor: pointer;
  }
  .modes button.on, .seg button.on { background: var(--card); color: var(--foreground); font-weight: 600; box-shadow: 0 1px 2px oklch(0 0 0 / 0.08); }

  .pickrow { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-md); margin-top: var(--space-md); }
  .toggle { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; }
  .primary {
    font: inherit; font-weight: 600; padding: 0.45rem 1rem; border-radius: 8px; border: none;
    background: var(--primary); color: var(--primary-foreground); cursor: pointer; margin-left: auto;
  }
  .primary:disabled { opacity: 0.5; cursor: default; }

  .trail {
    display: flex; flex-wrap: wrap; align-items: center; gap: 0.35rem;
    margin: var(--space-lg) 0 var(--space-md); font-size: 0.9rem;
  }
  .trail button { all: unset; cursor: pointer; color: var(--muted-foreground); }
  .trail button:hover { color: var(--primary); }
  .trail button.cur { color: var(--foreground); font-weight: 700; font-size: 1.15rem; }
  .trail .sep { color: var(--muted-foreground); }
  .trail .open { font-size: 0.8rem; color: var(--muted-foreground); margin-left: 0.4rem; }
  .own { font-size: 0.75rem; color: var(--primary); font-weight: 600; }

  .cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr)); gap: var(--space-lg); }
  section { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: var(--space-md); min-width: 0; }
  section header { display: flex; align-items: baseline; gap: 0.6rem; margin-bottom: 0.5rem; }
  h2 { font-size: 1rem; font-weight: 700; margin: 0; }
  .src { font-size: 0.75rem; }
  .seg { display: inline-flex; gap: 0.2rem; padding: 0.15rem; border-radius: 8px; background: var(--muted); margin-bottom: 0.5rem; }
  .seg button { font-size: 0.78rem; padding: 0.25rem 0.6rem; }
  .bar { display: flex; align-items: center; gap: 0.5rem; font-size: 0.82rem; margin-bottom: 0.35rem; }
  .msg { font-size: 0.85rem; color: var(--muted-foreground); margin: 0.5rem 0; }
  .link {
    all: unset; cursor: pointer; color: var(--primary); font-weight: 600;
  }
  .link:hover { text-decoration: underline; }
</style>
