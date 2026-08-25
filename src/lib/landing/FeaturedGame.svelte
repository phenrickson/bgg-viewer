<script lang="ts">
  /**
   * One game, as a full-width section down the foot of the landing page.
   *
   * This is the only working door on the page during the warm. Every other link — the query
   * chips, the Explore door — goes to a view that blocks on the catalog, so clicking one
   * mid-load lands you on a spinner. `/games/{id}` is server-rendered by
   * [+page.server.ts](../../routes/(app)/games/[id]/+page.server.ts) and never touches the
   * catalog, so this one actually works.
   *
   * Box art is BGG's CDN, so it costs this app nothing to serve and does not compete with the
   * catalog build for the container's single CPU.
   *
   * `note` and `fact` are both computed at build time (`scripts/build-landing-content.js` /
   * `scripts/featured/`), not hand-written — see `Featured` in `./types.ts`. `fact` reuses the
   * `.callout`/`.mark` visual language `VizOfTheDay.svelte` uses for "the claim, stated," so
   * the two "of the day" sections share one vocabulary for their own takeaway line.
   *
   * The badge row (publisher/designers/categories/mechanics) reuses the game detail page's own
   * `.chip` pattern (`src/routes/(app)/games/[id]/+page.svelte`) — same styling, same idea
   * ("tags are links: one click from 'what is this' back to 'what else is like this'"), pointed
   * at Explore instead of that page's own facet wall. It's what fills the space beside the art
   * and stats: those two are fixed-width, and this is the one thing in the row that wraps to
   * use whatever's left, on-thesis for an app built around querying by exactly these facets.
   */
  import { reveal } from './reveal';
  import type { Featured } from './types';

  let {
    game,
    eyebrow,
    onprev,
    onnext
  }: { game: Featured; eyebrow: string; onprev?: () => void; onnext?: () => void } = $props();

  const fmt = (n: number | null, digits = 1) => (n == null ? '—' : n.toFixed(digits));

  type Badge = { label: string; href: string };
  type BadgeGroup = { label: string; kind: 'pub' | 'des' | 'cat' | 'mech'; items: Badge[] };
  /** One row per facet type, identity first (publisher, designers) then attributes (categories,
   *  mechanics) — matches the per-type caps `build-landing-content.js` already applied. Each
   *  group gets its own `--chart-N` token (`style-rules`: max 5-7 per chart, never color
   *  alone — the label text is the real signal, color is a bonus) so "which kind of tag is
   *  this" reads at a glance without hunting for the group's label above it. */
  const badges = $derived.by((): BadgeGroup[] => {
    const groups: BadgeGroup[] = [
      { label: 'Publisher', kind: 'pub', items: game.publishers.map((v) => ({ label: v, href: `/games?pub=${encodeURIComponent(v)}` })) },
      { label: 'Designers', kind: 'des', items: game.designers.map((v) => ({ label: v, href: `/games?des=${encodeURIComponent(v)}` })) },
      { label: 'Categories', kind: 'cat', items: game.categories.map((v) => ({ label: v, href: `/games?cats=${encodeURIComponent(v)}` })) },
      { label: 'Mechanics', kind: 'mech', items: game.mechanics.map((v) => ({ label: v, href: `/games?mechs=${encodeURIComponent(v)}` })) }
    ];
    return groups.filter((g) => g.items.length > 0);
  });
</script>

<section class="sec" use:reveal>
  <header>
    <div class="titles">
      <p class="eyebrow">{eyebrow}</p>
      <h2><a href="/games/{game.id}">{game.name}</a></h2>
      <p class="note">{game.year ?? '—'} · {game.note}</p>
      {#if game.fact}
        <p class="callout"><span class="mark" aria-hidden="true"></span>{game.fact}</p>
      {/if}
    </div>
    {#if onprev || onnext}
      <div class="nav">
        <button type="button" onclick={onprev} aria-label="Previous game">←</button>
        <button type="button" onclick={onnext} aria-label="Next game">→</button>
      </div>
    {/if}
  </header>

  <div class="body">
    <a class="art" href="/games/{game.id}" aria-label={game.name}>
      {#if game.image}
        <!-- Fixed box so a slow or missing image never reflows the section mid-wait — the one
             moment the page must not jump under the reader. -->
        <img src={game.image} alt="" width="180" height="180" loading="lazy" decoding="async" />
      {/if}
    </a>

    <dl class="stats">
      <div><dt>Geek rating</dt><dd class="tnum">{fmt(game.geek, 2)}</dd></div>
      <div><dt>Complexity</dt><dd class="tnum">{fmt(game.weight)}</dd></div>
      <div><dt>Ratings</dt><dd class="tnum">{game.usersRated.toLocaleString()}</dd></div>
      <div class="go"><a href="/games/{game.id}">Open this game <span class="arw">→</span></a></div>
    </dl>

    {#if badges.length}
      <div class="badges">
        {#each badges as g (g.kind)}
          <div class="bgroup">
            <span class="blabel">{g.label}:</span>
            {#each g.items as b (b.href)}
              <a class="chip {g.kind}" href={b.href}>{b.label}</a>
            {/each}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</section>

<style>
  .sec { border-top: 1px solid var(--border); padding-top: var(--space-lg); }

  header { display: flex; align-items: start; gap: var(--space-lg); margin-bottom: var(--space-lg); }
  .titles { min-width: 0; }

  .eyebrow {
    font-size: 0.72rem; text-transform: uppercase; letter-spacing: .06em;
    color: var(--muted-foreground); font-weight: 600; margin: 0 0 .35rem;
  }
  h2 {
    font-size: var(--text-heading, clamp(1.25rem, 1rem + 1vw, 1.75rem));
    font-weight: 750; letter-spacing: -0.02em; margin: 0; text-wrap: balance;
  }
  h2 a { color: inherit; text-decoration: none; }
  h2 a:hover { color: var(--primary); }
  .note {
    font-size: 0.9rem; color: var(--muted-foreground); margin: .4rem 0 0;
    line-height: 1.45; max-width: 44rem;
  }
  /* The one-line "why this game" fact — same `.callout`/`.mark` visual language
     VizOfTheDay.svelte uses for its own "the claim, stated" line, minus that component's
     left margin (there's no y-axis gutter here to align with). */
  .callout {
    display: flex; align-items: baseline; gap: .5rem; margin: .5rem 0 0;
    font-size: 0.85rem; line-height: 1.45; color: var(--foreground); max-width: 44rem;
  }
  .mark {
    flex: none; width: .7rem; height: .7rem; border-radius: 2px;
    background: var(--primary); transform: translateY(1px);
  }

  .nav { display: flex; gap: .3rem; margin-left: auto; flex: none; }
  .nav button {
    width: 2rem; height: 2rem; line-height: 1; border-radius: var(--radius);
    border: 1px solid var(--border); background: var(--card);
    color: var(--muted-foreground); cursor: pointer;
  }
  .nav button:hover { color: var(--foreground); border-color: var(--primary); }

  .body { display: flex; gap: var(--space-lg); align-items: stretch; flex-wrap: wrap; }

  .art { flex: none; display: block; line-height: 0; }
  img {
    width: 180px; height: 180px; object-fit: cover;
    border-radius: var(--radius); background: var(--muted);
    border: 1px solid var(--border);
  }

  /* A column of labelled numbers beside the art, rather than a cramped row under it — the
     section has the width, and stacked pairs are easier to compare than a wrapping strip.
     Fixed width now (was `flex: 1`, back when it was the only thing beside the art) — `.desc`
     is what grows to fill the row now, so this column stays a stable size instead of stretching
     with it. */
  .stats {
    flex: 0 0 auto; width: 12rem; margin: 0;
    display: flex; flex-direction: column; justify-content: center; gap: var(--space-md);
  }
  .stats div { display: flex; flex-direction: column; gap: .1rem; }
  dt { font-size: 0.7rem; text-transform: uppercase; letter-spacing: .05em; color: var(--muted-foreground); }
  dd { margin: 0; font-size: 1.35rem; font-weight: 700; letter-spacing: -0.02em; }
  .tnum { font-variant-numeric: tabular-nums; }

  .go a { font-size: 0.9rem; font-weight: 650; color: var(--primary); text-decoration: none; }
  .go a:hover { text-decoration: underline; }
  .go .arw { opacity: .7; }

  /* The only flexible element in the row — wraps to use whatever width `.art` + `.stats`
     (both fixed) leave behind, instead of that space sitting empty. `align-self: center`
     matches `.stats`' own vertical centering, so the two read as one row. One row per facet
     type ("Categories: tag tag tag"), label inline with its own badges rather than stacked
     above them — matches how bgg-dash-viewer's game-details renderer lays out the same four
     facet groups. */
  .badges {
    flex: 1 1 16rem; min-width: 16rem; align-self: center;
    display: flex; flex-direction: column; gap: 0.4rem;
  }
  .bgroup { display: flex; flex-wrap: wrap; align-items: center; gap: 0.3rem; }
  .blabel { flex: none; font-size: 0.72rem; color: var(--muted-foreground); margin-right: 0.1rem; }

  /* Same pill shape as the game detail page's own `.chip` (`+page.svelte`), but colored per
     facet type — style-rules: max 5-7 per chart, never color alone, so the label prefix is
     still the real signal and color is a bonus that lets a reader tell "is this a mechanic or
     a category" at a glance without reading every label. */
  .chip {
    font-size: 0.76rem; padding: 0.15rem 0.55rem; border-radius: 999px;
    border: 1px solid var(--border); text-decoration: none; background: var(--background);
  }
  .chip.pub { border-color: color-mix(in oklch, var(--chart-2) 40%, var(--border)); color: var(--chart-2); }
  .chip.des { border-color: color-mix(in oklch, var(--chart-4) 40%, var(--border)); color: var(--chart-4); }
  .chip.cat { border-color: color-mix(in oklch, var(--chart-1) 40%, var(--border)); color: var(--chart-1); }
  .chip.mech { border-color: color-mix(in oklch, var(--chart-3) 40%, var(--border)); color: var(--chart-3); }
  .chip:hover { filter: brightness(1.15); border-color: currentColor; }
</style>
