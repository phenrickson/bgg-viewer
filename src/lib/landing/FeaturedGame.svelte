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
     section has the width, and stacked pairs are easier to compare than a wrapping strip. */
  .stats {
    flex: 1; min-width: 12rem; margin: 0;
    display: flex; flex-direction: column; justify-content: center; gap: var(--space-md);
  }
  .stats div { display: flex; flex-direction: column; gap: .1rem; }
  dt { font-size: 0.7rem; text-transform: uppercase; letter-spacing: .05em; color: var(--muted-foreground); }
  dd { margin: 0; font-size: 1.35rem; font-weight: 700; letter-spacing: -0.02em; }
  .tnum { font-variant-numeric: tabular-nums; }

  .go a { font-size: 0.9rem; font-weight: 650; color: var(--primary); text-decoration: none; }
  .go a:hover { text-decoration: underline; }
  .go .arw { opacity: .7; }
</style>
