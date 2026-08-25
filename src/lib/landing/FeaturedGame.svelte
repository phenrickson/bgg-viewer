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
   * The badge block (publisher/designers/categories/mechanics) reuses the game detail page's own
   * `.chip` pattern (`src/routes/(app)/games/[id]/+page.svelte`) — same styling, same idea
   * ("tags are links: one click from 'what is this' back to 'what else is like this'"), pointed
   * at Explore instead of that page's own facet wall. It's what fills the space beside the art
   * and stats: those two are fixed-width, and this is the one thing in the row that wraps to
   * use whatever's left, on-thesis for an app built around querying by exactly these facets.
   * Each group is a label gutter + a wrapping chip column, so a long mechanics list stays in
   * the values column instead of wrapping back under the label.
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
   *  mechanics) — matches the per-type caps `build-landing-content.js` already applied. The
   *  `kind` drives only the identity/attribute weight split in the CSS, not a per-type hue:
   *  the label gutter already carries "which kind of tag is this," so color is spent on
   *  `--primary` alone (the fact mark, the CTA) rather than four competing chart tokens. */
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
      <!-- Always rendered, even with no fact to show: 11 of the 30 featured games have no
           `fact`, so making the row conditional made the header a line shorter for those and
           shunted the art/stats/badges up as you paged between them. Reserving the line keeps
           the body anchored — the same reason the art sits in a fixed 180px box. -->
      <p class="callout" class:empty={!game.fact}>
        {#if game.fact}<span class="mark" aria-hidden="true"></span>{game.fact}{/if}
      </p>
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
            <span class="blabel">{g.label}</span>
            <div class="bchips">
              {#each g.items as b (b.href)}
                <a class="chip {g.kind}" href={b.href}>{b.label}</a>
              {/each}
            </div>
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
    line-height: 1.2;
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
    min-height: 1.45em; /* one line's worth, held whether or not there's a fact */
  }
  .callout.empty { visibility: hidden; }
  .mark {
    flex: none; width: .7rem; height: .7rem; border-radius: 2px;
    background: var(--primary); transform: translateY(1px);
  }

  /* Same top-right placement and styling as VizOfTheDay.svelte's own nav — the two "of the
     day" sections page the same way, so their controls sit in the same spot. */
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
     (both fixed) leave behind, instead of that space sitting empty. `align-self: start` tops
     it out with the art: with only a few short groups it would otherwise float in the middle
     of a 180px-tall row, leaving a gap under the fact line and dead space beneath itself. */
  .badges {
    flex: 1 1 16rem; min-width: 16rem; align-self: start;
    display: flex; flex-direction: column; gap: 0.45rem;
  }
  /* Two columns, not one wrapping line: the label sits in a fixed gutter and every chip —
     including ones that wrap to a second line — stays in the values column, so the
     label → values reading survives a long list of mechanics. */
  .bgroup { display: grid; grid-template-columns: 5.5rem 1fr; gap: 0.3rem 0.5rem; align-items: baseline; }
  .blabel {
    font-size: 0.72rem; color: var(--muted-foreground);
    text-transform: uppercase; letter-spacing: .04em;
  }
  .bchips { display: flex; flex-wrap: wrap; gap: 0.3rem; }

  /* Same pill shape as the game detail page's own `.chip` (`+page.svelte`). Deliberately
     near-neutral rather than one hue per facet type: the label gutter already says which kind
     of tag a row holds, so per-type color was redundant work that put five hues in a section
     whose only real accent should be `--primary` (the fact mark and the "Open this game"
     CTA). Two tiers only — identity (publisher, designer) reads slightly stronger than
     attributes (categories, mechanics), which is the one distinction the gutter can't make. */
  .chip {
    font-size: 0.76rem; padding: 0.15rem 0.6rem; border-radius: 999px;
    border: 1px solid var(--border); text-decoration: none;
    background: var(--background); color: var(--muted-foreground);
    transition: color .12s, border-color .12s, background .12s;
  }
  .chip.pub, .chip.des { color: var(--foreground); background: var(--muted); }
  .chip:hover { color: var(--primary); border-color: var(--primary); background: var(--muted); }
  .chip:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }

  /* Below the two-column split the row is already stacking; drop the label gutter so chips
     get the full width rather than a 5.5rem bite out of a narrow screen. */
  @media (max-width: 40rem) {
    .bgroup { grid-template-columns: 1fr; gap: 0.2rem; }
  }
</style>
