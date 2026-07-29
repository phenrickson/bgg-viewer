<script lang="ts">
  /**
   * Landing — the front door. Orients the user, warms the in-browser catalog in the
   * background, and offers entry points that work immediately: a game name search
   * (type-ahead over the catalog once warm) and example-query chips that deep-link into a
   * pre-scoped Explore. Copy is PLACEHOLDER — Phil writes the final strings.
   */
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { initCatalog, query, catalog } from '$lib/catalog/catalog.svelte';
  import { DEFAULT_SCOPE, scopeToParams, type Scope } from '$lib/catalog/scope';

  // Kick the catalog warm in the background so Explore is ready when the user arrives there.
  onMount(() => {
    initCatalog();
  });

  const exploreHref = (overrides: Partial<Scope>) =>
    `/games?${scopeToParams({ ...DEFAULT_SCOPE, ...overrides }).toString()}`;

  // Example queries — each deep-links into a pre-scoped Explore. Labels are placeholder.
  const chips: { label: string; scope: Partial<Scope> }[] = [
    { label: 'Best at 2 players', scope: { bestAt: 2 } },
    { label: 'Best at 6 players', scope: { bestAt: 6 } },
    { label: 'Heavyweights since 2015', scope: { weightMin: 3.5, yearMin: 2015 } },
    { label: 'Top rated, all-time', scope: { universe: 'rated' } },
    { label: 'Released 2024 onward', scope: { yearMin: 2024 } }
  ];

  // Game name search → detail. Works once the catalog is warm (the onMount warm above).
  type Hit = { game_id: number; name: string; year_published: number | null };
  let q = $state('');
  let hits = $state<Hit[]>([]);
  let active = $state(false);
  let token = 0;

  $effect(() => {
    const term = q.trim();
    if (term.length < 2 || catalog.status !== 'ready') {
      hits = [];
      return;
    }
    const mine = ++token;
    const esc = term.replace(/'/g, "''");
    query<Hit>(
      `SELECT game_id, name, year_published FROM catalog
       WHERE name ILIKE '%${esc}%' ORDER BY geek_rating DESC NULLS LAST LIMIT 8`
    )
      .then((rows) => mine === token && (hits = rows))
      .catch((e) => console.error('search failed', e));
  });

  const open = (id: number) => goto(`/games/${id}`);
</script>

<svelte:head><title>bgg-viewer</title></svelte:head>

<div class="land">
  <span class="warming" class:ready={catalog.status === 'ready'}>
    {#if catalog.status === 'ready'}
      <span class="dot"></span> Catalog ready · {catalog.count.toLocaleString()} games
    {:else if catalog.status === 'error'}
      Catalog failed to load
    {:else}
      <span class="spin"></span> Warming the catalog…
    {/if}
  </span>

  <!-- PLACEHOLDER copy -->
  <h1>Explore board games <em>as a set</em>.</h1>
  <p class="lede">[Placeholder lede — Phil writes copy.] Search, filter, and visualize the
    whole catalog in your browser — including the recommended and best player counts BGG
    can't sort by.</p>

  <div class="search">
    <div class="box">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m21 21-4.3-4.3"></path></svg>
      <input
        type="text"
        placeholder={catalog.status === 'ready' ? 'Jump to a game…' : 'Warming the catalog…'}
        bind:value={q}
        onfocus={() => (active = true)}
        onblur={() => setTimeout(() => (active = false), 120)}
      />
    </div>
    {#if active && hits.length}
      <ul class="menu">
        {#each hits as h}
          <li>
            <button onmousedown={() => open(h.game_id)}>
              <span class="nm">{h.name}</span>
              {#if h.year_published}<span class="yr tnum">{h.year_published}</span>{/if}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <p class="try">Try a query</p>
  <div class="chips">
    {#each chips as c}
      <a class="chip" href={exploreHref(c.scope)}>{c.label} <span class="arw">→</span></a>
    {/each}
  </div>

  <div class="entries">
    <a class="entry" href="/games">
      <b>Explore the catalog <span class="tag ready">ready</span></b>
      <p>Filter to a set, then see it as charts and a table.</p>
    </a>
    <span class="entry dim">
      <b>Upcoming predictions <span class="tag soon">soon</span></b>
      <p>What the model expects for games not yet rated.</p>
    </span>
    <span class="entry dim">
      <b>Similarity map <span class="tag soon">soon</span></b>
      <p>Find games near one you love, by embedding distance.</p>
    </span>
    <span class="entry dim">
      <b>Your collection <span class="tag soon">soon</span></b>
      <p>Bring your own shelf into the same lenses.</p>
    </span>
  </div>
</div>

<style>
  .land { max-width: 52rem; margin: 0 auto; padding: clamp(1rem, 3vw, 2.5rem) 0; }
  .tnum { font-variant-numeric: tabular-nums; }

  .warming { display: inline-flex; align-items: center; gap: .5rem; font-size: 0.76rem; color: var(--muted-foreground); border: 1px solid var(--border); background: var(--card); border-radius: 999px; padding: .28rem .7rem; }
  .warming.ready { color: var(--foreground); }
  .warming .dot { width: .55rem; height: .55rem; border-radius: 50%; background: var(--color-positive, oklch(0.62 0.14 150)); }
  .warming .spin { width: .8rem; height: .8rem; border-radius: 50%; border: 2px solid color-mix(in oklch, var(--primary) 35%, var(--border)); border-top-color: var(--primary); animation: spin 0.9s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .warming .spin { animation: none; } }

  h1 { font-size: var(--text-display, clamp(1.8rem, 1.1rem + 3vw, 3rem)); font-weight: 750; letter-spacing: -0.03em; line-height: 1.05; margin: 1.1rem 0 .5rem; text-wrap: balance; }
  h1 em { font-style: normal; color: var(--primary); }
  .lede { font-size: 1.1rem; color: var(--muted-foreground); max-width: 40rem; margin: 0; }

  .search { position: relative; margin: 1.6rem 0 .5rem; max-width: 34rem; }
  .box { display: flex; align-items: center; gap: .6rem; background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: .7rem .9rem; color: var(--muted-foreground); }
  .box input { flex: 1; min-width: 0; border: none; background: none; color: var(--foreground); font: inherit; font-size: 1rem; }
  .box input:focus { outline: none; }
  .menu { position: absolute; z-index: 10; top: calc(100% + 4px); left: 0; right: 0; margin: 0; padding: .25rem; list-style: none; background: var(--card); border: 1px solid var(--border); border-radius: 10px; box-shadow: 0 10px 24px oklch(0 0 0 / .14); max-height: 20rem; overflow: auto; }
  .menu button { display: flex; align-items: center; gap: .5rem; width: 100%; text-align: left; background: none; border: none; border-radius: 6px; padding: .45rem .5rem; font: inherit; color: var(--foreground); cursor: pointer; }
  .menu button:hover { background: var(--muted); }
  .menu .nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 550; }
  .menu .yr { color: var(--muted-foreground); font-size: 0.82rem; }

  .try { font-size: 0.72rem; text-transform: uppercase; letter-spacing: .06em; color: var(--muted-foreground); font-weight: 600; margin: 1.6rem 0 .55rem; }
  .chips { display: flex; flex-wrap: wrap; gap: .5rem; margin-bottom: 2.2rem; }
  .chip { font-size: 0.85rem; padding: .4rem .75rem; border-radius: 999px; border: 1px solid color-mix(in oklch, var(--primary) 35%, var(--border)); color: var(--primary); background: color-mix(in oklch, var(--primary) 8%, var(--card)); text-decoration: none; display: inline-flex; align-items: center; gap: .4rem; }
  .chip:hover { background: color-mix(in oklch, var(--primary) 15%, var(--card)); }
  .chip .arw { opacity: .6; }

  .entries { display: grid; grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr)); gap: var(--space-md); }
  .entry { text-align: left; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: var(--space-lg); text-decoration: none; color: inherit; display: flex; flex-direction: column; gap: .3rem; }
  .entry:not(.dim):hover { border-color: var(--primary); }
  .entry.dim { opacity: .6; }
  .entry b { font-size: 0.95rem; font-weight: 650; display: flex; align-items: center; gap: .4rem; }
  .entry p { margin: 0; font-size: 0.82rem; color: var(--muted-foreground); }
  .tag { font-size: 0.62rem; text-transform: uppercase; letter-spacing: .05em; padding: .05rem .35rem; border-radius: 5px; font-weight: 600; }
  .tag.ready { background: color-mix(in oklch, var(--color-positive, oklch(0.62 0.14 150)) 20%, transparent); color: var(--color-positive, oklch(0.62 0.14 150)); }
  .tag.soon { background: var(--muted); color: var(--muted-foreground); }
</style>
