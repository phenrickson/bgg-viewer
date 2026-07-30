<script lang="ts">
  /**
   * One game — the third step of the loop, and the one that has to hand you back out again.
   *
   * Reading order follows what you actually want after clicking a row: *is this the game I
   * meant* (cover, title, byline) → *how good and how heavy* (the stat strip) → *does it work
   * at my table* (the player-count chart, the thing BGG can't sort by and so the reason this
   * page exists) → *what is it like* (about, categories) → *what else is like it* (similar).
   *
   * "Back to results" carries the Explore scope you came from, held in sessionStorage by the
   * Explore page. Without it, backing out of a game dropped you on an unfiltered /games and
   * you had to rebuild the set — which broke the "and do it again for other games" half of
   * the loop far more than anything on this page.
   */
  import { onMount } from 'svelte';
  import { catalog, query } from '$lib/catalog/catalog.svelte';
  import { decodeEntities } from '$lib/utils/html-entities';
  import { Container } from '$lib/components/ui/layout';

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
  const description = $derived(decodeEntities(g.description));
  /** Long enough that clamping it actually hides something worth a button. */
  const CLAMP_AT = 620;
  let showAll = $state(false);

  // --- back out ------------------------------------------------------------------------
  // Written by the Explore page on every scope change; absent on a deep link or a fresh tab.
  let backQs = $state('');
  onMount(() => {
    try {
      backQs = sessionStorage.getItem('explore:qs') ?? '';
    } catch {
      // storage disabled — fall through to a bare /games
    }
  });
  const backHref = $derived(backQs ? `/games?${backQs}` : '/games');

  // --- where this sits in the catalog --------------------------------------------------
  // A bare 8.31 means nothing to anyone who doesn't know the scale. Rank does. Computed from
  // the in-browser catalog *only if it is already warm* (you came via Explore or the search)
  // — worth a sentence, not worth pulling a megabyte on a deep link.
  let rank = $state<{ pos: number; of: number } | null>(null);
  $effect(() => {
    const geek = Number(g.geek);
    if (catalog.status !== 'ready' || !Number.isFinite(geek) || geek <= 0) return;
    query<{ pos: number; of: number }>(
      `SELECT (COUNT(*) FILTER (WHERE geek_rating > ${geek}) + 1)::INT AS pos,
              COUNT(*) FILTER (WHERE geek_rating > 0)::INT AS of
       FROM catalog WHERE users_rated >= 30`
    )
      .then((r) => (rank = r[0] ?? null))
      .catch((e) => console.error('rank lookup failed', e));
  });

  /** The community's pick, so the chart can mark its own answer. */
  const bestRow = $derived(g.bestAt);

  /**
   * How stale this is. Ratings and weights move, and a page that shows four decimal-place
   * numbers without saying when it looked is quietly overclaiming.
   */
  const freshness = $derived.by(() => {
    if (!g.lastUpdated) return null;
    const t = new Date(g.lastUpdated);
    if (Number.isNaN(t.getTime())) return null;
    return t.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  });
</script>

<svelte:head><title>{g.name} · bgg-viewer</title></svelte:head>

<Container size="content">
  <div class="nav">
    <a class="back" href={backHref}>
      <span aria-hidden="true">←</span>
      {backQs ? 'Back to results' : 'Explore all games'}
    </a>
    <span class="crumbs">
      <!-- A companion tool should point at its source of truth, not pretend to be it. -->
      <a
        class="bgg"
        href="https://boardgamegeek.com/boardgame/{g.id}"
        target="_blank"
        rel="noopener noreferrer">View on BGG <span aria-hidden="true">↗</span></a
      >
      <span class="sep">·</span>
      <a href="/">Home</a> ／ <a href={backHref}>Explore</a> ／ <b>{g.name}</b>
    </span>
  </div>

  <!-- hero: identity + the four numbers -->
  <section class="hero card">
    <div class="idw">
      {#if g.image}
        <img class="cover" src={g.image} alt="{g.name} box art" loading="lazy" />
      {:else}
        <div class="cover ph">{g.name?.[0] ?? '?'}</div>
      {/if}
      <div class="id">
        <h1 class="title">{g.name} {#if g.year}<span class="yr">{g.year}</span>{/if}</h1>
        {#if g.designers.length}<p class="byline">by {g.designers.join(', ')}</p>{/if}
        {#if g.artists.length}
          <p class="pubs">art by {g.artists.slice(0, 3).join(', ')}{g.artists.length > 3
              ? ` +${g.artists.length - 3}`
              : ''}</p>
        {/if}
        {#if g.publishers.length}
          <p class="pubs">{g.publishers.slice(0, 3).join(' · ')}{g.publishers.length > 3 ? ` · +${g.publishers.length - 3}` : ''}</p>
        {/if}
        <div class="facts tnum">
          <div><span>Players</span><b>{range(g.minPlayers, g.maxPlayers)}</b></div>
          <div><span>Play time</span><b>{range(g.minTime, g.maxTime, ' min')}</b></div>
          {#if g.minAge}<div><span>Age</span><b>{g.minAge}+</b></div>{/if}
          {#if bestRow}<div><span>Best at</span><b class="hl">{bestRow}</b></div>{/if}
        </div>
      </div>
    </div>

    <div class="stats">
      <div class="stat"><div class="v tnum">{num(g.geek)}</div><div class="l">Geek rating</div></div>
      <div class="stat"><div class="v tnum">{num(g.average)}</div><div class="l">Average</div></div>
      <div class="stat"><div class="v tnum">{int(g.ratings)}</div><div class="l">Ratings</div></div>
      <div class="stat">
        <div class="v tnum">{num(g.weight, 1)}<small>/5</small></div>
        <div class="l">{weightLabel(g.weight) || 'Complexity'}</div>
        {#if g.weightVotes}<div class="of">from {int(g.weightVotes)} votes</div>{/if}
      </div>
      {#if rank}
        <p class="rank">
          Ranked <b class="tnum">#{rank.pos.toLocaleString()}</b> of
          <span class="tnum">{rank.of.toLocaleString()}</span> rated games by geek rating.
        </p>
      {/if}
    </div>
  </section>

  <div class="cols">
    <div class="stack">
      <!-- the differentiator, high on the page -->
      <section class="card">
        <p class="sub">Player counts <span class="sub-note">· how the community voted</span></p>
        {#if g.playerCounts.length}
          <div class="pcs tnum">
            {#each g.playerCounts as p (p.count)}
              <div class="pc" class:top={p.count === bestRow}>
                <div class="n">{p.count}</div>
                <div class="pc-bar" title="{p.count}: {num(p.best, 0)}% best, {num(p.recommended, 0)}% recommended">
                  <i class="pc-best" style:width="{p.best}%"></i>
                  <i class="pc-rec" style:width="{p.recommended}%"></i>
                  <i class="pc-not" style:width="{p.notRecommended}%"></i>
                </div>
                <div class="pct">
                  {Math.round(p.best + p.recommended)}<small>%</small>
                  {#if p.votes}<span class="votes tnum">{int(p.votes)}</span>{/if}
                </div>
              </div>
            {/each}
          </div>
          <div class="legend">
            <span><b class="sw best"></b>Best</span>
            <span><b class="sw rec"></b>Recommended</span>
            <span><b class="sw not"></b>Not recommended</span>
            <!-- Two different questions, so say which is which: the ★ row is the most-voted
                 *best* count, while the % answers the broader "does it work at N at all". -->
            <span class="note">% = best or recommended · grey = votes cast · ★ = most voted best</span>
          </div>
          {#if bestRow}
            <p class="verdict">Plays best with <b>{bestRow}</b>.</p>
          {/if}
        {:else}
          <div class="empty">No player-count votes for this game.</div>
        {/if}
      </section>

      {#if description}
        <section class="card">
          <p class="sub">About</p>
          <p class="desc" class:clamped={!showAll && description.length > CLAMP_AT}>{description}</p>
          {#if description.length > CLAMP_AT}
            <button class="link" onclick={() => (showAll = !showAll)}>
              {showAll ? 'Show less' : 'Read more'}
            </button>
          {/if}
        </section>
      {/if}

      {#if g.categories.length || g.mechanics.length || g.families.length}
        <section class="card">
          {#if g.categories.length}
            <p class="sub">Categories</p>
            <div class="chips">{#each g.categories as c (c)}<a class="chip cat" href="/games?cats={encodeURIComponent(c)}">{c}</a>{/each}</div>
          {/if}
          {#if g.mechanics.length}
            <p class="sub">Mechanics</p>
            <div class="chips">{#each g.mechanics as m (m)}<a class="chip" href="/games?mechs={encodeURIComponent(m)}">{m}</a>{/each}</div>
          {/if}
          <!-- Families were in the warehouse payload and on this page nowhere at all, even
               though Explore already filters on them — so a series was a dead end here. -->
          {#if g.families.length}
            <p class="sub">Series &amp; families</p>
            <div class="chips">
              {#each g.families as f (f)}
                <a class="chip" href="/games?fam={encodeURIComponent(f)}">{f}</a>
              {/each}
            </div>
          {/if}
        </section>
      {/if}
    </div>

    <div class="stack">
      <section class="card">
        <p class="sub">Similar games <span class="sub-note">· by embedding distance</span></p>
        {#if g.similar.length}
          <div class="sim">
            {#each g.similar as s (s.id)}
              <a href="/games/{s.id}">
                <span class="mono">{s.name?.[0] ?? '?'}</span>
                <span class="nmw"><span class="nm">{s.name}</span> {#if s.year}<span class="yr">{s.year}</span>{/if}</span>
                <span class="score tnum">{num(s.similarity)}</span>
              </a>
            {/each}
          </div>
        {:else}
          <div class="empty">No similar games computed.</div>
        {/if}
      </section>

      <section class="card">
        <p class="sub">Model prediction</p>
        {#if g.hasPrediction}
          <div class="empty">Prediction available — rendering comes with the predictions view.</div>
        {:else}
          <div class="empty">No prediction — {g.name} falls outside the model’s coverage window.</div>
        {/if}
      </section>
    </div>
  </div>

  {#if freshness}
    <p class="fresh">Warehouse data for this game last refreshed {freshness}.</p>
  {/if}
</Container>

<style>
  .tnum {
    font-variant-numeric: tabular-nums;
  }
  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space-lg);
  }

  /* Back out first, breadcrumb second: leaving is the common action, not orienting. */
  .nav {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-lg);
    flex-wrap: wrap;
    margin-bottom: var(--space-md);
  }
  .back {
    display: inline-flex;
    align-items: baseline;
    gap: 0.4rem;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--primary);
    text-decoration: none;
    border: 1px solid color-mix(in oklch, var(--primary) 32%, var(--border));
    background: color-mix(in oklch, var(--primary) 8%, transparent);
    border-radius: 999px;
    padding: 0.2rem 0.7rem;
  }
  .back:hover {
    background: color-mix(in oklch, var(--primary) 16%, transparent);
  }
  .crumbs {
    font-size: 0.8rem;
    color: var(--muted-foreground);
    display: inline-flex;
    align-items: baseline;
    gap: 0.3rem;
    flex-wrap: wrap;
  }
  .crumbs .bgg {
    color: var(--primary);
  }
  .crumbs .bgg:hover {
    text-decoration: underline;
  }
  .crumbs .sep {
    opacity: 0.5;
  }
  .fresh {
    margin: var(--space-lg) 0 0;
    font-size: 0.72rem;
    color: var(--muted-foreground);
    opacity: 0.75;
  }
  /* Sample size sits under its stat as its own line: inline, it wrapped mid-phrase and left
     the separator stranded on the label. */
  .stat .of {
    font-size: 0.62rem;
    color: var(--muted-foreground);
    opacity: 0.75;
    line-height: 1.2;
    margin-top: 0.05rem;
  }
  .pc .votes {
    display: block;
    font-size: 0.62rem;
    opacity: 0.65;
    line-height: 1.1;
  }
  .crumbs a {
    color: var(--muted-foreground);
    text-decoration: none;
  }
  .crumbs a:hover {
    color: var(--primary);
  }
  .crumbs b {
    color: var(--foreground);
    font-weight: 600;
  }

  .hero {
    display: grid;
    grid-template-columns: minmax(0, 1.6fr) minmax(15rem, 1fr);
    gap: var(--space-lg);
    align-items: start;
  }
  @media (max-width: 860px) {
    .hero {
      grid-template-columns: 1fr;
    }
  }
  .idw {
    display: flex;
    gap: var(--space-lg);
    min-width: 0;
  }
  .cover {
    width: 132px;
    flex: none;
    border-radius: 10px;
    border: 1px solid var(--border);
    object-fit: contain;
    background: var(--muted);
  }
  .cover.ph {
    width: 108px;
    height: 108px;
    background:
      radial-gradient(circle at 30% 30%, oklch(0.64 0.17 45 / 0.28), transparent 60%),
      repeating-linear-gradient(60deg, var(--muted) 0 14px, transparent 14px 28px), var(--card);
    display: grid;
    place-items: center;
    font-weight: 800;
    font-size: 2rem;
    color: var(--primary);
    letter-spacing: -0.03em;
  }
  .id {
    min-width: 0;
  }
  .title {
    margin: 0;
    font-size: var(--text-heading);
    font-weight: 700;
    letter-spacing: -0.02em;
    text-wrap: balance;
  }
  .title .yr {
    color: var(--muted-foreground);
    font-weight: 500;
  }
  .byline {
    color: var(--muted-foreground);
    font-size: 0.88rem;
    margin: 0.15rem 0 0;
  }
  .pubs {
    color: var(--muted-foreground);
    font-size: 0.78rem;
    margin: 0.1rem 0 0;
  }
  .facts {
    display: flex;
    flex-wrap: wrap;
    gap: 1.1rem;
    margin-top: var(--space-md);
    font-size: 0.85rem;
  }
  .facts div span {
    color: var(--muted-foreground);
    display: block;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .facts div b {
    font-weight: 650;
  }
  .facts .hl {
    color: var(--primary);
  }

  /* Four numbers on one plane, with the rank line that gives them a scale. */
  .stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--space-md) 0.5rem;
    border-left: 1px solid var(--border);
    padding-left: var(--space-lg);
  }
  @media (max-width: 860px) {
    .stats {
      border-left: none;
      padding-left: 0;
      border-top: 1px solid var(--border);
      padding-top: var(--space-md);
    }
  }
  .stat .v {
    font-size: 1.3rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.1;
  }
  .stat .v small {
    font-size: 0.72rem;
    font-weight: 500;
    color: var(--muted-foreground);
  }
  .stat .l {
    font-size: 0.66rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted-foreground);
    margin-top: 0.1rem;
  }
  .rank {
    grid-column: 1 / -1;
    margin: 0;
    font-size: 0.78rem;
    color: var(--muted-foreground);
  }
  .rank b {
    color: var(--foreground);
  }

  .cols {
    display: grid;
    grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
    gap: var(--space-lg);
    margin-top: var(--space-lg);
    align-items: start;
  }
  @media (max-width: 860px) {
    .cols {
      grid-template-columns: 1fr;
    }
  }
  .stack {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    min-width: 0;
  }

  .sub {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted-foreground);
    margin: 0 0 0.6rem;
    font-weight: 600;
  }
  .sub + .chips + .sub {
    margin-top: var(--space-md);
  }
  .sub-note {
    text-transform: none;
    letter-spacing: 0;
    font-weight: 400;
  }

  .pcs {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .pc {
    display: grid;
    grid-template-columns: 2rem 1fr 2.6rem;
    align-items: center;
    gap: 0.6rem;
  }
  .pc .n {
    font-weight: 600;
    font-size: 0.88rem;
    text-align: right;
    color: var(--muted-foreground);
  }
  /* The community's answer is named in prose below and marked here — never colour alone. */
  .pc.top .n {
    color: var(--primary);
    font-weight: 750;
  }
  .pc.top .n::after {
    content: ' ★';
    font-size: 0.6rem;
    vertical-align: 0.15em;
  }
  .pc-bar {
    display: flex;
    height: 1rem;
    border-radius: 5px;
    overflow: hidden;
    background: var(--muted);
  }
  .pc-bar i {
    display: block;
    height: 100%;
  }
  .pc-best {
    background: var(--color-positive);
  }
  .pc-rec {
    background: var(--chart-2);
  }
  .pc-not {
    background: color-mix(in oklch, var(--color-negative) 45%, var(--muted));
  }
  .pc .pct {
    font-size: 0.76rem;
    color: var(--muted-foreground);
    text-align: right;
  }
  .pc .pct small {
    font-size: 0.62rem;
  }
  .pc.top .pct {
    color: var(--foreground);
    font-weight: 600;
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.9rem;
    font-size: 0.72rem;
    color: var(--muted-foreground);
    margin-top: 0.7rem;
  }
  .legend .sw {
    display: inline-block;
    width: 0.7rem;
    height: 0.7rem;
    border-radius: 3px;
    vertical-align: -1px;
    margin-right: 0.3rem;
  }
  .legend .sw.best {
    background: var(--color-positive);
  }
  .legend .sw.rec {
    background: var(--chart-2);
  }
  .legend .sw.not {
    background: color-mix(in oklch, var(--color-negative) 45%, var(--muted));
  }
  .legend .note {
    margin-left: auto;
    opacity: 0.8;
  }
  .verdict {
    font-size: 0.86rem;
    color: var(--muted-foreground);
    margin: 0.7rem 0 0;
  }
  .verdict b {
    color: var(--foreground);
  }

  .desc {
    font-size: 0.88rem;
    line-height: 1.6;
    color: var(--foreground);
    margin: 0;
    white-space: pre-line;
  }
  .desc.clamped {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 7;
    line-clamp: 7;
    overflow: hidden;
  }
  .link {
    margin-top: 0.5rem;
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    font-size: 0.8rem;
    color: var(--primary);
    cursor: pointer;
  }
  .link:hover {
    text-decoration: underline;
  }

  /* Tags are links: one click from "what is this" back to "what else is like this". */
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  .chip {
    font-size: 0.76rem;
    padding: 0.15rem 0.55rem;
    border-radius: 999px;
    border: 1px solid var(--border);
    color: var(--muted-foreground);
    background: var(--background);
    text-decoration: none;
  }
  .chip:hover {
    border-color: var(--primary);
    color: var(--primary);
  }
  .chip.cat {
    border-color: color-mix(in oklch, var(--primary) 35%, var(--border));
    color: var(--primary);
  }

  .sim {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .sim a {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.4rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    text-decoration: none;
    color: inherit;
    background: var(--background);
    min-width: 0;
  }
  .sim a:hover {
    border-color: var(--primary);
  }
  .sim .mono {
    width: 1.8rem;
    height: 1.8rem;
    border-radius: 6px;
    background: var(--muted);
    display: grid;
    place-items: center;
    font-weight: 700;
    font-size: 0.85rem;
    color: var(--muted-foreground);
    flex: none;
  }
  .sim .nmw {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sim .nm {
    font-weight: 600;
    font-size: 0.88rem;
  }
  .sim a:hover .nm {
    color: var(--primary);
  }
  .sim .yr {
    color: var(--muted-foreground);
    font-size: 0.76rem;
  }
  .sim .score {
    margin-left: auto;
    font-size: 0.76rem;
    color: var(--muted-foreground);
    flex: none;
  }

  .empty {
    border: 1px dashed var(--border);
    border-radius: var(--radius);
    padding: var(--space-lg);
    text-align: center;
    color: var(--muted-foreground);
    font-size: 0.84rem;
  }
</style>
