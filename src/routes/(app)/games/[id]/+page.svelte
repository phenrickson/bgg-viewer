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
  import { gameFromCatalogRow, type CatalogGameRow } from '$lib/catalog/game-from-catalog';
  import { decodeEntities } from '$lib/utils/html-entities';
  import { Container } from '$lib/components/ui/layout';
  import PredictionPanel from '$lib/game/PredictionPanel.svelte';

  let { data } = $props();

  /**
   * Offline the server has no warehouse to ask, so it hands over the id and this page answers
   * from the catalog already loaded in DuckDB — the same copy Explore just used to get here.
   * Nothing is re-fetched or re-parsed; it's a single-row lookup.
   */
  let fromCatalog = $state<ReturnType<typeof gameFromCatalogRow> | null>(null);

  $effect(() => {
    if (!data.offline || catalog.status !== 'ready' || fromCatalog) return;
    query<CatalogGameRow>(`SELECT * FROM catalog WHERE game_id = ${data.id} LIMIT 1`)
      .then((rows) => {
        if (rows[0]) fromCatalog = gameFromCatalogRow(rows[0]);
      })
      .catch((e) => console.error('offline game lookup failed', e));
  });

  const g = $derived(data.game ?? fromCatalog);

  const num = (n: number | null, digits = 2) =>
    n == null ? '—' : n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const int = (n: number | null) => (n == null ? '—' : Math.round(n).toLocaleString());

  /**
   * Zero is not a measurement here — it's the warehouse's way of saying "no geek rating yet"
   * and "nobody has weighted this". Rendered raw, an unscored game claimed a geek rating of
   * 0.00 and a complexity of 0.0/5 labelled "Light", which is exactly the kind of number the
   * prediction panel below exists to replace.
   */
  const pos = (n: number | null | undefined) => (n != null && n > 0 ? n : null);

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
  const description = $derived(decodeEntities(g?.description ?? null));
  /** Long enough that clamping it actually hides something worth a button. */
  const CLAMP_AT = 620;
  let showAll = $state(false);

  /**
   * Hover breakdown on the player-count bars — built, then switched off: the interaction isn't
   * yet what Phil wants. Flip to `true` to re-enable; the markup and styles are intact, and the
   * reconstructed-counts caveat below is the open question.
   */
  const PC_HOVER = false;

  /** Which player-count row the pointer is on, so its bar can show the vote breakdown. */
  let hover = $state<string | null>(null);

  /**
   * A percentage back to a headcount. BGG publishes the shares, not the tallies, so this is a
   * reconstruction — rounded, and it can be a vote or two off the true split. Worth showing
   * anyway: "83% recommended" off 24 votes and off 2,400 are different claims, and the
   * percentage alone hides which one you are reading.
   */
  const votesOf = (pct: number, total: number) =>
    !total ? '—' : `${Math.round((pct / 100) * total).toLocaleString()}`;

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
  /**
   * Every number on this page is meaningless without a scale: 8.44 is only impressive if you
   * know what 8.44 is *for*. So each stat carries where it stands, and the headline carries
   * two ranks — overall, and against the games it actually launched alongside, which is the
   * fairer comparison for anything recent (a 2023 release competes with 2023, not with 1995).
   *
   * One pass over the in-browser catalog computes all of it, and only if the catalog is
   * already warm — you came via Explore or the nav search. Worth a sentence, not worth
   * pulling a megabyte on a deep link.
   */
  type Standing = {
    geek_pos: number;
    geek_n: number;
    year_pos: number;
    year_n: number;
    geek_pct: number | null;
    avg_pct: number | null;
    rated_pct: number | null;
    weight_pct: number | null;
  };
  let standing = $state<Standing | null>(null);
  /**
   * Whether this game has a geek rating at all. Gates the two figures that are meaningless
   * without one — the "top N%" under Geek rating, and the "#N of M rated games" ranks —
   * while leaving the average, ratings-count and complexity percentiles to render, since
   * those are true for an unrated game.
   */
  let isRanked = $state(false);

  const finite = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  /**
   * Discards a response whose game is no longer the one on screen. Without it a slow lookup
   * for the game you just left can land after the next one's and print its rank here.
   */
  let standingToken = 0;

  $effect(() => {
    /*
     * Clear FIRST, on every run. `standing` is this game's rank and percentiles, so the
     * moment the game changes the old numbers are wrong — and every `return` below is a path
     * that used to leave them on screen. An unrated game (geek_rating = 0) navigated to from
     * a rated one kept the previous game's "top 7%" and "#2,115 of 30,809 rated games" beside
     * its own "—", attributing another game's standing to it.
     */
    standing = null;
    isRanked = false;
    const mine = ++standingToken;

    if (!g || catalog.status !== 'ready') return;
    /*
     * Zero is the warehouse's "not ranked yet", not a rating of zero. This used to return
     * early, but that threw away percentiles the game genuinely has: an unrated game still
     * has an average, a ratings count and a complexity, and "heavier than 60%" was true and
     * useful on exactly the page that was hiding it. So the lookup still runs; `geekPos`
     * below is what gets suppressed, because a rank among *rated* games is the one figure an
     * unrated game cannot have.
     */
    const geek = finite(g.geek);
    const ranked = geek != null && geek > 0;
    isRanked = ranked;
    /* -1 when unranked: the geek columns below still evaluate, but nothing downstream reads
       them, and it keeps the SQL a single shape rather than two. */
    const geekV = ranked ? geek : -1;
    const year = finite(g.year);
    const avg = finite(g.average) ?? -1;
    const rated = finite(g.ratings) ?? -1;
    const weight = finite(g.weight) ?? -1;
    // Percentile = the share this beats, over the games where the measure exists at all;
    // NULLIF keeps a missing measure as null rather than dividing by zero.
    const pct = (col: string, v: number) =>
      `100.0 * COUNT(*) FILTER (WHERE ${col} > 0 AND ${col} < ${v})
         / NULLIF(COUNT(*) FILTER (WHERE ${col} > 0), 0)`;
    query<Standing>(
      `SELECT
         (COUNT(*) FILTER (WHERE geek_rating > ${geekV}) + 1)::INT AS geek_pos,
         COUNT(*) FILTER (WHERE geek_rating > 0)::INT AS geek_n,
         (COUNT(*) FILTER (WHERE year_published = ${year ?? -9999} AND geek_rating > ${geekV}) + 1)::INT AS year_pos,
         COUNT(*) FILTER (WHERE year_published = ${year ?? -9999} AND geek_rating > 0)::INT AS year_n,
         ${pct('geek_rating', geekV)} AS geek_pct,
         ${pct('average_rating', avg)} AS avg_pct,
         ${pct('users_rated', rated)} AS rated_pct,
         ${pct('average_weight', weight)} AS weight_pct
       FROM catalog WHERE users_rated >= 30`
    )
      .then((r) => {
        if (mine !== standingToken) return; // a newer game is on screen
        standing = r[0] ?? null;
      })
      .catch((e) => {
        if (mine !== standingToken) return;
        console.error('standing lookup failed', e);
      });
  });

  /** "top 4%" — and below 1% keep a decimal, or every elite game reads as an identical "top 0%". */
  function topPct(pctBelow: number | null | undefined): string | null {
    if (pctBelow == null) return null;
    const top = Math.max(0, 100 - pctBelow);
    // Decide the branch on the *rounded* value: 0.95 rendered as "top 1.0%" alongside a
    // neighbouring "top 1%" looked like two different measurements of the same thing.
    const tenth = Math.round(top * 10) / 10;
    if (tenth >= 1) return `top ${Math.max(1, Math.round(top))}%`;
    return `top ${tenth < 0.1 ? '0.1' : tenth.toFixed(1)}%`;
  }
  /**
   * Complexity has no better end, so it gets a neutral phrasing rather than a ranking one.
   * Rounded, 99.7 became "heavier than 100%" — a claim the query can't make, since the game
   * sits in the denominator and never in the numerator. Above 99 it truncates to a tenth,
   * which can understate but never overclaim.
   */
  const heavierThan = $derived.by(() => {
    const p = standing?.weight_pct;
    if (p == null) return null;
    const shown = p >= 99 ? Math.min(99.9, Math.floor(p * 10) / 10) : Math.round(p);
    return `heavier than ${shown}%`;
  });

  /** The community's pick, so the chart can mark its own answer. */
  const bestRow = $derived(g?.bestAt ?? null);

  /**
   * "Best at 2" was the whole answer this page gave, and it's the smaller half of the
   * question. A game that is best at 2 but *also works* at 1 and 3 is a different purchase
   * from one that is best at 2 and unplayable otherwise — and the bars said so, faintly,
   * while the top line didn't say it at all.
   *
   * BGG classifies each count by which of its three vote shares wins, so that's the rule
   * here too: plurality, ties resolving toward the more favourable verdict.
   */
  type PC = NonNullable<typeof g>['playerCounts'][number];
  function verdictOf(p: PC): 'best' | 'rec' | 'not' {
    if (!p.votes) return 'not';
    if (p.best >= p.recommended && p.best >= p.notRecommended) return 'best';
    if (p.recommended >= p.notRecommended) return 'rec';
    return 'not';
  }
  /** "1, 3" but "1–4" — a run of three or more reads worse spelled out than bridged. */
  function compact(counts: string[]): string {
    const out: string[] = [];
    for (let i = 0; i < counts.length; ) {
      let j = i;
      const plain = (s: string) => !s.includes('+') && Number.isFinite(Number(s));
      while (j + 1 < counts.length && plain(counts[j]) && plain(counts[j + 1]) &&
             Number(counts[j + 1]) === Number(counts[j]) + 1) j++;
      out.push(j > i + 1 ? `${counts[i]}–${counts[j]}` : counts.slice(i, j + 1).join(', '));
      i = j + 1;
    }
    return out.join(', ');
  }
  const verdicts = $derived(new Map((g?.playerCounts ?? []).map((p) => [p.count, verdictOf(p)])));
  const bestCounts = $derived((g?.playerCounts ?? []).filter((p) => verdicts.get(p.count) === 'best').map((p) => p.count));
  const recCounts = $derived((g?.playerCounts ?? []).filter((p) => verdicts.get(p.count) === 'rec').map((p) => p.count));
  /** The top line leads with the ★ row so the fact and the chart's mark can't disagree. */
  const bestLabel = $derived(bestCounts.length ? compact(bestCounts) : bestRow);
  const recLabel = $derived(recCounts.length ? compact(recCounts) : null);

  const fmtDate = (v: string | null | undefined): string | null => {
    if (!v) return null;
    const t = new Date(v);
    if (Number.isNaN(t.getTime())) return null;
    return t.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };

  /**
   * How stale this is. Ratings and weights move, and a page that shows four decimal-place
   * numbers without saying when it looked is quietly overclaiming.
   */
  const freshness = $derived(fmtDate(g?.lastUpdated ?? null));

  // --- what the model expects -----------------------------------------------------------
  /**
   * The hurdle is the gate, so it leads: BGG holds ~140k games and only ~30k ever gather
   * enough ratings to earn a geek rating. `predicted_hurdle_prob` is the chance this game
   * becomes one of them, and the other four numbers are what to expect *if* it does — stated
   * flat, side by side, they'd read as four equally-confident facts about a game that may
   * never be rated at all.
   *
   * For a game that already has a geek rating the panel inverts into a scorecard: the same
   * estimates against what actually happened. Same data, and the honest use of it once the
   * question it was answering has been settled.
   *
   * All copy here is PLACEHOLDER — Phil writes the final strings.
   */
  const p = $derived(g?.predictions ?? null);
  const isRated = $derived((g?.geek ?? 0) > 0);
  /**
   * Whether this page is about a game whose numbers have settled, or one still arriving.
   *
   * The same test the `upcoming` universe uses — `year_published >= CURRENT_YEAR` — so a game
   * reached from that list leads with the model on its own page too, rather than opening on
   * a hero of actuals that says nothing about why it was in the list.
   *
   * Deliberately NOT `isRated`. A game published this year can hold a geek rating and still
   * be three months into a forecast that hasn't played out: Arkham Horror's 2026 core set has
   * 823 ratings against a modelled 2,866, and treating it as settled put the only panel with
   * anything to say about that at the foot of the page. Year decides where the prediction
   * sits; `isRated` still decides how it is worded, which is the distinction the panel's copy
   * was already making.
   */
  const upcoming = $derived(g?.year != null && g.year >= new Date().getFullYear());
</script>

<svelte:head><title>{g ? `${g.name} · ` : ''}bgg-viewer</title></svelte:head>

{#if !g}
  <!-- Offline, waiting on the catalog to warm (or the game isn't in the working set). The
       online path never lands here: the server load either returns a game or throws 404. -->
  <Container size="content">
    <p class="await">
      {#if catalog.status === 'error'}
        <!-- PLACEHOLDER copy — Phil writes the final strings. -->
        Catalog failed to load, so this game can't be shown offline.
      {:else if catalog.status === 'ready'}
        Game {data.id} isn't in the offline catalog.
      {:else}
        Loading from the offline catalog…
      {/if}
    </p>
  </Container>
{:else}
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
          {#if bestLabel}<div><span>Best at</span><b class="hl">{bestLabel}</b></div>{/if}
          {#if recLabel}<div><span>Recommended at</span><b>{recLabel}</b></div>{/if}
        </div>
      </div>
    </div>

    <!--
      For a game published this year or later, each stat's second line carries the model's
      estimate instead of a percentile. That is the emphasis the page was missing: arriving
      from the upcoming list, the hero used to state four actuals and never mention why the
      game was in that list.

      Estimate REPLACES the percentile rather than joining it, for two reasons. Three lines
      per stat crowds a row that already carries a value, a label and a note; and a
      percentile among rated games is a moving target while the ratings are still arriving,
      so it is the weaker of the two figures here — where "est. 6.93" against a live 6.24 is
      the whole story.
    -->
    <div class="stats">
      <div class="stat">
        <div class="v tnum">{num(pos(g.geek))}</div>
        <div class="l">Geek rating</div>
        {#if upcoming && p?.geek != null}
          <div class="of est">est. <span class="tnum">{num(p.geek)}</span></div>
          <!-- Only when the game HAS a geek rating: a percentile among rated games is exactly
               the figure an unrated game cannot have, and it printed beside its own "—". -->
        {:else if isRanked && topPct(standing?.geek_pct)}
          <div class="of">{topPct(standing?.geek_pct)}</div>
        {/if}
      </div>
      <div class="stat">
        <div class="v tnum">{num(pos(g.average))}</div>
        <div class="l">Average</div>
        {#if upcoming && p?.rating != null}
          <div class="of est">est. <span class="tnum">{num(p.rating)}</span></div>
        {:else if topPct(standing?.avg_pct)}
          <div class="of">{topPct(standing?.avg_pct)}</div>
        {/if}
      </div>
      <div class="stat">
        <div class="v tnum">{int(g.ratings)}</div>
        <div class="l">Ratings</div>
        {#if upcoming && p?.usersRated != null}
          <div class="of est">est. <span class="tnum">{int(p.usersRated)}</span></div>
        {:else if topPct(standing?.rated_pct)}
          <div class="of">{topPct(standing?.rated_pct)}</div>
        {/if}
      </div>
      <div class="stat">
        <div class="v tnum">{num(pos(g.weight), 1)}{#if pos(g.weight)}<small>/5</small>{/if}</div>
        <div class="l">{weightLabel(pos(g.weight)) || 'Complexity'}</div>
        {#if upcoming && p?.complexity != null}
          <div class="of est">est. <span class="tnum">{num(p.complexity, 1)}</span></div>
        {:else}
          <!-- Two lines, not one wrapping phrase: "heavier than 84% · 276 votes" broke after
               the separator and stranded "votes" on its own. -->
          {#if heavierThan}<div class="of">{heavierThan}</div>{/if}
          {#if g.weightVotes}<div class="of">{int(g.weightVotes)} votes</div>{/if}
        {/if}
      </div>
      {#if standing && isRanked}
        <!-- Two ranks, two lines. As one sentence the second half read as a subordinate
             clause of the first, when it's the more useful of the two for anything recent. -->
        <div class="ranks">
          <p>
            <b class="tnum">#{standing.geek_pos.toLocaleString()}</b>
            <span>of <span class="tnum">{standing.geek_n.toLocaleString()}</span> rated games</span>
          </p>
          {#if g.year && standing.year_n > 1}
            <p>
              <b class="tnum">#{standing.year_pos.toLocaleString()}</b>
              <span>of <span class="tnum">{standing.year_n.toLocaleString()}</span> released in {g.year}</span>
            </p>
          {/if}
        </div>
      {/if}
    </div>
  </section>

  <div class="cols">
    <div class="stack">
      <!--
        `order: 2` puts About above this. Player counts are the differentiator and were first
        for that reason, but "what IS this game" has to come before "how does it play at
        three" — you cannot evaluate the second answer without the first. Ordered in CSS
        rather than moved in markup so the two blocks keep their `{#if}` guards intact.

        For a game published this year or later it falls to the FOOT of the stack, below the
        facet wall. These counts are community votes, and nobody has voted: `best_player_counts`
        is populated for 68 of the 4,842 upcoming games. What renders is either nothing or a
        chart built on a handful of ballots, and either way it is the least load-bearing thing
        on the page — where for a settled game it is the most.
      -->
      <section class="card" style:order={upcoming ? 4 : 2}>
        <p class="sub">
          Player counts
          <span class="sub-note"
            >· how the community voted{#if upcoming && g.playerCounts.length}, so far{/if}</span
          >
        </p>
        {#if g.playerCounts.length}
          <div class="pcs tnum">
            {#each g.playerCounts as p (p.count)}
              <!-- `role="group"` is required by Svelte's a11y rule for a div carrying mouse
                   handlers, and is correct here regardless: the row is a labelled set of
                   related values, not decoration. -->
              <div
                class="pc"
                class:top={p.count === bestRow}
                class:hot={PC_HOVER && hover === p.count}
                role="group"
                onmouseenter={() => PC_HOVER && (hover = p.count)}
                onmouseleave={() => PC_HOVER && (hover = null)}
              >
                <div class="n">{p.count}</div>
                <div class="pc-bar">
                  <i class="pc-best" style:width="{p.best}%"></i>
                  <i class="pc-rec" style:width="{p.recommended}%"></i>
                  <i class="pc-not" style:width="{p.notRecommended}%"></i>

                  <!-- The percentages are on screen already; what the bars can't say is how
                       many people each slice represents, which is the difference between a
                       verdict and a rounding artefact. Rendered inline rather than as a `title`
                       so it appears immediately and can carry three labelled rows. -->
                </div>

                <!-- Outside `.pc-bar`, which is `overflow: hidden` to clip its own segments and
                     would clip this too. -->
                {#if PC_HOVER && hover === p.count}
                  <div class="tip" role="tooltip">
                    <b>{p.count} {p.count === '1' ? 'player' : 'players'}</b>
                    <span><i class="sw best"></i>Best <em>{votesOf(p.best, p.votes)}</em></span>
                    <span><i class="sw rec"></i>Recommended <em>{votesOf(p.recommended, p.votes)}</em></span>
                    <span><i class="sw not"></i>Not recommended <em>{votesOf(p.notRecommended, p.votes)}</em></span>
                    <span class="tot">{int(p.votes)} votes cast</span>
                  </div>
                {/if}
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
          {#if bestLabel || recLabel}
            <dl class="verdict">
              {#if bestLabel}
                <div><dt><b class="sw best"></b>Plays best with</dt><dd>{bestLabel}</dd></div>
              {/if}
              {#if recLabel}
                <div><dt><b class="sw rec"></b>Recommended with</dt><dd>{recLabel}</dd></div>
              {/if}
            </dl>
          {/if}
        {:else}
          <div class="empty">No player-count votes for this game.</div>
        {/if}
      </section>

      {#if description}
        <section class="card" style:order="1">
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
        <!-- Last in the stack: the full facet wall is reference, read after you know what the
             game is and how it plays. Explicit, because a card with no `order` defaults to 0
             and would sort above the two that set one. -->
        <section class="card" style:order="3">
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
      <!--
        For a game published this year or later the model takes the wide slot the player-count
        chart holds otherwise, and that chart drops to the foot: its counts are community
        votes, and nobody has voted yet. A settled game gets the reverse and renders its panel
        in the RIGHT column instead — see below.
      -->
      {#if upcoming}
        <PredictionPanel game={g} order={2} />
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
        {:else if data.offline}
          <!-- PLACEHOLDER copy — Phil writes the final strings. "Not computed" is a claim about
               the data; offline the embeddings exist and are simply out of reach, which is a
               different thing and shouldn't read as an empty result. -->
          <div class="empty">Similar games need the warehouse — unavailable offline.</div>
        {:else}
          <div class="empty">No similar games computed.</div>
        {/if}
      </section>


      <!--
        Settled games keep the model HERE, at the foot of the right column: once the actuals
        are in, what the model guessed is a footnote about the model rather than news about the
        game. Similar games sits above it in both cases — useful whatever state a game is in,
        so it is the one card that never moves.
      -->
      {#if !upcoming}
        <PredictionPanel game={g} order={2} />
      {/if}
    </div>
  </div>

  {#if freshness}
    <p class="fresh">Warehouse data for this game last refreshed {freshness}.</p>
  {/if}

  {#if data.offline}
    <!-- PLACEHOLDER copy — Phil writes the final strings. Says which fields are missing and
         why, so a thinner page reads as offline rather than as broken data. -->
    <p class="fresh">
      Offline — built from the cached catalog. Description, box art, play time, similar games,
      and per-count vote totals need the warehouse.
    </p>
  {/if}
</Container>
{/if}

<style>
  .await {
    color: var(--muted-foreground);
    padding: var(--space-lg) 0;
  }

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
     the separator stranded on the label.

     Sized to be *read*, not merely present. These were 0.62rem — small enough that the
     percentile, which is the only thing making the number above it mean anything, arrived as
     visual noise. There is no space pressure in this column; the whole point of the block is
     the comparison, so the comparison gets legible type. */
  .stat .of {
    font-size: 0.78rem;
    color: var(--muted-foreground);
    line-height: 1.3;
    margin-top: 0.15rem;
  }
  /* The estimate sits in the same slot a percentile would, and reads at the same weight —
     it is context for the number above it, not a second headline competing with it. */
  .stat .of.est {
    color: var(--muted-foreground);
  }
  .stat .of.est span {
    color: var(--foreground);
    font-weight: 600;
  }
  .pc .votes {
    display: block;
    font-size: 0.7rem;
    opacity: 0.75;
    line-height: 1.2;
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
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted-foreground);
    margin-top: 0.1rem;
  }
  .ranks {
    grid-column: 1 / -1;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    border-top: 1px solid var(--border);
    padding-top: var(--space-md);
  }
  .ranks p {
    margin: 0;
    font-size: 0.85rem;
    color: var(--muted-foreground);
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
  }
  .ranks b {
    color: var(--foreground);
    font-size: 1rem;
    font-weight: 750;
    letter-spacing: -0.01em;
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

  /* Most games have four or five rows and never scroll. A few support up to "30+", which is
     31 bars — enough to push the description, the tags and the whole right column off the
     screen. Cap it at roughly a dozen rows and let the rest scroll in place. */
  .pcs {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    max-height: 22rem;
    overflow-y: auto;
    /* Room for the scrollbar so it never sits on top of the percentages. */
    padding-right: 0.15rem;
    scrollbar-width: thin;
  }
  .pc {
    display: grid;
    grid-template-columns: 2rem 1fr 2.6rem;
    align-items: center;
    gap: 0.6rem;
    /* Anchors the hover tooltip. */
    position: relative;
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
  /* The hovered row lifts slightly, so the tooltip is clearly attached to a bar rather than
     floating over the card. */
  .pc.hot .pc-bar {
    outline: 1px solid color-mix(in oklch, var(--foreground) 22%, transparent);
  }

  /* Anchored to the bar, not the pointer: the bar is the thing being asked about, and a
     pointer-tracked tooltip on a 5px-tall target chases the cursor more than it informs. */
  .tip {
    position: absolute;
    /* Aligned to where the bar starts, past the 2rem numeral column and its 0.6rem gap —
       `left: 0` would pin it to the row's edge instead, beside the number. */
    left: 2.6rem;
    bottom: calc(100% + 0.2rem);
    z-index: 20;
    display: grid;
    gap: 0.15rem;
    min-width: 13rem;
    padding: 0.5rem 0.6rem;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: 0 8px 24px oklch(0 0 0 / 0.3);
    font-size: 0.76rem;
    color: var(--muted-foreground);
    pointer-events: none;
  }
  .tip b {
    color: var(--foreground);
    font-weight: 650;
    margin-bottom: 0.1rem;
  }
  .tip span {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }
  .tip em {
    margin-left: auto;
    font-style: normal;
    color: var(--foreground);
    font-variant-numeric: tabular-nums;
  }
  .tip .sw {
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 2px;
    flex: none;
  }
  .tip .sw.best { background: var(--vote-best); }
  .tip .sw.rec { background: var(--vote-rec); }
  .tip .sw.not { background: var(--vote-not); }
  .tip .tot {
    margin-top: 0.2rem;
    padding-top: 0.3rem;
    border-top: 1px solid color-mix(in oklch, var(--border) 60%, transparent);
    font-variant-numeric: tabular-nums;
  }

  .pc-best {
    background: var(--vote-best);
  }
  .pc-rec {
    background: var(--vote-rec);
  }
  .pc-not {
    background: var(--vote-not);
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
    background: var(--vote-best);
  }
  .legend .sw.rec {
    background: var(--vote-rec);
  }
  .legend .sw.not {
    background: var(--vote-not);
  }
  .legend .note {
    margin-left: auto;
    opacity: 0.8;
  }
  /* The chart's conclusion, stated. Two rows so "best" and "merely works" stay distinct
     claims, each carrying the same swatch as its bar segment — the colour is a back-
     reference, never the signal on its own. */
  .verdict {
    margin: 0.9rem 0 0;
    padding-top: 0.8rem;
    border-top: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .verdict div {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
  }
  .verdict dt {
    font-size: 0.86rem;
    color: var(--muted-foreground);
  }
  .verdict dd {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--foreground);
    font-variant-numeric: tabular-nums;
  }
  .verdict .sw {
    display: inline-block;
    width: 0.7rem;
    height: 0.7rem;
    border-radius: 3px;
    vertical-align: -1px;
    margin-right: 0.35rem;
  }
  .verdict .sw.best {
    background: var(--vote-best);
  }
  .verdict .sw.rec {
    background: var(--vote-rec);
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
