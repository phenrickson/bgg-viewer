<script lang="ts">
  let { data } = $props();
  const g = $derived(data.game);

  const num = (n: number | null, digits = 2) =>
    n == null ? '—' : n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const int = (n: number | null) => (n == null ? '—' : Math.round(n).toLocaleString());

  function weightLabel(w: number | null): string {
    if (w == null) return '';
    if (w < 2) return 'Light';
    if (w < 2.5) return 'Medium-light';
    if (w < 3.5) return 'Medium';
    if (w < 4) return 'Medium-heavy';
    return 'Heavy';
  }
  function range(a: number | null, b: number | null, unit = ''): string {
    if (a == null && b == null) return '—';
    if (a === b || b == null) return `${a}${unit}`;
    if (a == null) return `${b}${unit}`;
    return `${a}–${b}${unit}`;
  }
  // BGG descriptions arrive HTML-entity-encoded (&amp;, &#10; newlines, …); decode to text.
  function decode(s: string | null): string {
    if (!s) return '';
    return s
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
      .replace(/&quot;/g, '"')
      .replace(/&(?:#0?39|apos);/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .trim();
  }
  const description = $derived(decode(g.description));
</script>

<svelte:head><title>{g.name} · bgg-viewer</title></svelte:head>

<div class="crumbs"><a href="/">Home</a> ／ <a href="/games">Explore</a> ／ <b>{g.name}</b></div>

<div class="split">
  <!-- identity -->
  <div class="card">
    <div class="info-top">
      {#if g.image}
        <img class="cover" src={g.image} alt="{g.name} box art" loading="lazy" />
      {:else}
        <div class="cover ph">{g.name?.[0] ?? '?'}</div>
      {/if}
      <div>
        <h1 class="title">{g.name} {#if g.year}<span class="yr">{g.year}</span>{/if}</h1>
        {#if g.designers.length}
          <p class="byline">by {g.designers.join(', ')}</p>
        {/if}
        {#if g.publishers.length}
          <p class="pubs">{g.publishers.slice(0, 3).join(' · ')}{g.publishers.length > 3 ? ` · +${g.publishers.length - 3}` : ''}</p>
        {/if}
        <div class="meta-row tnum">
          <div><span>Players</span><b>{range(g.minPlayers, g.maxPlayers)}</b></div>
          <div><span>Play time</span><b>{range(g.minTime, g.maxTime, ' min')}</b></div>
          {#if g.minAge}<div><span>Age</span><b>{g.minAge}+</b></div>{/if}
          <div><span>Weight</span><b>{num(g.weight)} <small>/ 5</small></b></div>
        </div>
      </div>
    </div>

    {#if g.categories.length}
      <p class="sub">Categories</p>
      <div class="chips">{#each g.categories as c}<span class="chip cat">{c}</span>{/each}</div>
    {/if}
    {#if g.mechanics.length}
      <p class="sub">Mechanics</p>
      <div class="chips">{#each g.mechanics as m}<span class="chip">{m}</span>{/each}</div>
    {/if}

    {#if description}
      <p class="sub">About</p>
      <p class="desc">{description}</p>
    {/if}
  </div>

  <!-- KPIs -->
  <div class="kpis">
    <div class="kpi"><div class="v tnum">{num(g.geek)}</div><div class="l">Geek rating</div></div>
    <div class="kpi"><div class="v tnum">{num(g.average)}</div><div class="l">Average</div></div>
    <div class="kpi"><div class="v tnum">{int(g.ratings)}</div><div class="l">Ratings</div></div>
    <div class="kpi"><div class="v tnum">{num(g.weight)} <small>{weightLabel(g.weight)}</small></div><div class="l">Complexity</div></div>
  </div>
</div>

<div class="sections">
  <!-- player counts -->
  <div class="card">
    <p class="sub">Player-count recommendations</p>
    {#if g.playerCounts.length}
      <div class="tnum">
        {#each g.playerCounts as p}
          <div class="pc-row">
            <div class="n">{p.count}</div>
            <div class="pc-bar" title="{p.count}: {num(p.best,0)}% best / {num(p.recommended,0)}% rec">
              <i class="pc-best" style="width:{p.best}%"></i>
              <i class="pc-rec" style="width:{p.recommended}%"></i>
              <i class="pc-not" style="width:{p.notRecommended}%"></i>
            </div>
          </div>
        {/each}
      </div>
      <div class="pc-legend">
        <span><b style="background:var(--color-positive)"></b>Best</span>
        <span><b style="background:var(--chart-2)"></b>Recommended</span>
        <span><b style="background:color-mix(in oklch,var(--color-negative) 55%,var(--muted))"></b>Not recommended</span>
      </div>
      {#if g.bestAt}<p class="best-at">Community says <b>best at {g.bestAt} players</b>.</p>{/if}
    {:else}
      <div class="empty">No player-count votes for this game.</div>
    {/if}
  </div>

  <div>
    <div class="card" style="margin-bottom:var(--space-lg)">
      <p class="sub">Similar games <span class="sub-note">· by embedding distance</span></p>
      {#if g.similar.length}
        <div class="sim">
          {#each g.similar as s}
            <a href="/games/{s.id}">
              <span class="mono">{s.name?.[0] ?? '?'}</span>
              <span><span class="nm">{s.name}</span> {#if s.year}<span class="yr">{s.year}</span>{/if}</span>
              <span class="score">{num(s.similarity)}</span>
            </a>
          {/each}
        </div>
      {:else}
        <div class="empty">No similar games computed.</div>
      {/if}
    </div>

    <div class="card">
      <p class="sub">Model prediction</p>
      {#if g.hasPrediction}
        <div class="empty">Prediction available — rendering comes with the predictions view.</div>
      {:else}
        <div class="empty">No prediction — {g.name} falls outside the model's coverage window.</div>
      {/if}
    </div>
  </div>
</div>

<style>
  .crumbs { font-size: 0.82rem; color: var(--muted-foreground); margin-bottom: var(--space-md); }
  .crumbs a { color: var(--muted-foreground); text-decoration: none; }
  .crumbs a:hover { color: var(--primary); }
  .crumbs b { color: var(--foreground); }
  .tnum { font-variant-numeric: tabular-nums; }

  .split { display: grid; grid-template-columns: 1.55fr 1fr; gap: var(--space-lg); align-items: start; }
  @media (max-width: 720px) { .split { grid-template-columns: 1fr; } }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: var(--space-lg); }

  .info-top { display: flex; gap: var(--space-lg); }
  .cover { width: 128px; flex: none; border-radius: 10px; border: 1px solid var(--border); object-fit: contain; background: var(--muted); }
  .cover.ph { width: 104px; height: 104px;
    background: radial-gradient(circle at 30% 30%, oklch(0.64 0.17 45 / .28), transparent 60%),
      repeating-linear-gradient(60deg, var(--muted) 0 14px, transparent 14px 28px), var(--card);
    display: grid; place-items: center; font-weight: 800; font-size: 2rem; color: var(--primary); letter-spacing: -0.03em; }
  .title { margin: 0; font-size: var(--text-heading); font-weight: 700; letter-spacing: -0.02em; }
  .title .yr { color: var(--muted-foreground); font-weight: 500; }
  .byline { color: var(--muted-foreground); font-size: 0.88rem; margin: .15rem 0 0; }
  .pubs { color: var(--muted-foreground); font-size: 0.78rem; margin: .1rem 0 0; }
  .desc { font-size: 0.86rem; line-height: 1.55; color: var(--foreground); margin: 0;
    white-space: pre-line; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 8; line-clamp: 8; overflow: hidden; }
  .meta-row { display: flex; flex-wrap: wrap; gap: 1.1rem; margin-top: var(--space-md); font-size: 0.85rem; }
  .meta-row div span { color: var(--muted-foreground); display: block; font-size: 0.72rem; text-transform: uppercase; letter-spacing: .05em; }
  .meta-row div b { font-weight: 600; }
  .meta-row small { color: var(--muted-foreground); font-weight: 400; }

  .sub { font-size: 0.72rem; text-transform: uppercase; letter-spacing: .06em; color: var(--muted-foreground); margin: var(--space-md) 0 .5rem; font-weight: 600; }
  .sub-note { text-transform: none; letter-spacing: 0; font-weight: 400; }
  .chips { display: flex; flex-wrap: wrap; gap: .35rem; }
  .chip { font-size: 0.76rem; padding: .2rem .55rem; border-radius: 999px; border: 1px solid var(--border); color: var(--muted-foreground); background: var(--background); }
  .chip.cat { border-color: color-mix(in oklch, var(--primary) 40%, var(--border)); color: var(--primary); }

  .kpis { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-md); }
  .kpi { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: var(--space-md) var(--space-lg); }
  .kpi .v { font-size: 1.5rem; font-weight: 700; letter-spacing: -0.02em; }
  .kpi .v small { font-size: 0.8rem; font-weight: 500; color: var(--muted-foreground); }
  .kpi .l { font-size: 0.72rem; text-transform: uppercase; letter-spacing: .05em; color: var(--muted-foreground); margin-top: .1rem; }

  .sections { display: grid; grid-template-columns: 1.3fr 1fr; gap: var(--space-lg); margin-top: var(--space-lg); }
  @media (max-width: 720px) { .sections { grid-template-columns: 1fr; } }

  .pc-row { display: grid; grid-template-columns: 2.2rem 1fr; align-items: center; gap: .7rem; margin-bottom: .5rem; }
  .pc-row .n { font-weight: 600; font-size: 0.9rem; text-align: right; }
  .pc-bar { display: flex; height: 1.05rem; border-radius: 5px; overflow: hidden; background: var(--muted); }
  .pc-bar i { display: block; height: 100%; }
  .pc-best { background: var(--color-positive); }
  .pc-rec { background: var(--chart-2); }
  .pc-not { background: color-mix(in oklch, var(--color-negative) 55%, var(--muted)); }
  .pc-legend { display: flex; flex-wrap: wrap; gap: 1rem; font-size: 0.75rem; color: var(--muted-foreground); margin-top: .7rem; }
  .pc-legend b { display: inline-block; width: .7rem; height: .7rem; border-radius: 3px; vertical-align: -1px; margin-right: .3rem; }
  .best-at { font-size: 0.85rem; color: var(--muted-foreground); margin-top: .6rem; }
  .best-at b { color: var(--foreground); }

  .sim { display: flex; flex-direction: column; gap: .4rem; }
  .sim a { display: flex; align-items: center; gap: .7rem; padding: .5rem .6rem; border: 1px solid var(--border); border-radius: 8px; text-decoration: none; color: inherit; background: var(--background); }
  .sim a:hover { border-color: var(--primary); }
  .sim .mono { width: 2rem; height: 2rem; border-radius: 6px; background: var(--muted); display: grid; place-items: center; font-weight: 700; color: var(--muted-foreground); flex: none; }
  .sim .nm { font-weight: 550; font-size: 0.9rem; }
  .sim .yr { color: var(--muted-foreground); font-size: 0.78rem; }
  .sim .score { margin-left: auto; font-size: 0.78rem; color: var(--primary); font-weight: 600; }

  .empty { border: 1px dashed var(--border); border-radius: var(--radius); padding: var(--space-lg); text-align: center; color: var(--muted-foreground); font-size: 0.86rem; }
</style>
