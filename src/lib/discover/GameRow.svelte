<script lang="ts">
  /**
   * One game, as Discover shows it: a picture, a name, and three signals — who it plays
   * well with, how heavy it is, and how well it is rated.
   *
   * Differences from Explore's row are deliberate, not decorative. Complexity is a WORD
   * ("Medium-Heavy") rather than the number 3.4, because a reader who has not asked to think
   * in a 1–5 weight scale should not have to. Mechanics are omitted and categories capped at
   * three, because the full facet wall is exactly what makes a dense card unscannable.
   *
   * The thumbnail is a STUB. `thumbnail` is not in the catalog artifact, and whether to add
   * it is a measured decision deferred until this layout has earned it.
   */
  import { complexityLabel, complexityBandIndex } from './dials';
  import type { DiscoverGame } from './types';

  let { game }: { game: DiscoverGame } = $props();

  const sorted = (a: number[] | null): number[] =>
    a ? Array.from(a).sort((x, y) => x - y) : [];

  /**
   * The community's player-count vote, stated in the same words the game detail page's hero
   * uses. Encoding it as pips or filled cells was tried twice and failed the same test both
   * times: nothing on the page said which mark meant "best", so it needed a key nobody had.
   *
   * `recAt` excludes anything already in `bestAt` — BGG marks some counts both, and listing a
   * number under both labels reads as a contradiction.
   */
  const bestAt = $derived(sorted(game.best_player_counts).join(', '));
  const recAt = $derived(
    sorted(game.recommended_player_counts)
      .filter((n) => !sorted(game.best_player_counts).includes(n))
      .join(', ')
  );

  const weight = $derived(complexityLabel(game.average_weight));
  /** Band index 1–5, driving the badge's tint step. Derived from the same source as weight. */
  const weightStep = $derived(complexityBandIndex(game.average_weight));
  const cats = $derived((game.categories ? Array.from(game.categories) : []).slice(0, 3));
  /** Initials stand in for box art until the artifact question is settled. */
  const initials = $derived(
    game.name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('')
  );
</script>

<a class="row" href="/games/{game.game_id}">
  <span class="thumb" aria-hidden="true">{initials}</span>

  <span class="main">
    <span class="l1">
      <span class="nm">{game.name}</span>
      {#if game.year_published != null}<span class="yr">{game.year_published}</span>{/if}
    </span>
    <span class="l2">
      {#if weight}
        <span class="cx" data-step={weightStep}>{weight}</span>
      {/if}
      {#if cats.length}<span class="cats">{cats.join(' · ')}</span>{/if}
    </span>
  </span>

  <!-- Two columns, not one cluster: each label owns a fixed slot, so "BEST AT" sits at the
       same x on every row whether or not the game has a RECOMMENDED AT beside it. -->
  <span class="fact">
    {#if bestAt}
      <span class="lbl">Best at</span>
      <b class="hl">{bestAt}</b>
    {/if}
  </span>
  <span class="fact">
    {#if recAt}
      <span class="lbl">Recommended at</span>
      <b>{recAt}</b>
    {/if}
  </span>

  <span class="rate">
    {#if game.geek_rating != null}
      <span class="rv">{game.geek_rating.toFixed(1)}<span class="of">/10</span></span>
    {:else}
      <span class="rv none">—</span>
    {/if}
  </span>
</a>

<style>
  /* Fixed art, flexible middle, fixed rating. The rating column was `minmax(4.5rem, 1fr)`,
     i.e. stretching, which left the number and its bar drifting in the middle of a column
     wider than they are and unaligned with anything. It is a fixed 4.5rem now so it hugs the
     right edge and the bars line up down the list.
     A lone `1fr` in the middle is only dangerous when the page is unbounded — on a full-bleed
     window it pooled ~900px into one gap (the failure `GameList.svelte` documents). The list
     is capped at the `content` measure, so the surplus it can absorb is small and bounded. */
  .row {
    display: grid;
    grid-template-columns: 3.5rem minmax(0, 1fr) 5.5rem 8.5rem 4.25rem;
    align-items: center;
    gap: 0 var(--space-md);
    padding: 0.5rem var(--space-md);
    text-decoration: none;
    color: inherit;
    border-bottom: 1px solid color-mix(in oklch, var(--border) 55%, transparent);
  }
  .row:last-child { border-bottom: none; }
  .row:hover { background: color-mix(in oklch, var(--primary) 7%, transparent); }
  .row:focus-visible { outline: 2px solid var(--primary); outline-offset: -2px; }
  .row > span { min-width: 0; }

  .thumb {
    width: 3.5rem; height: 3.5rem; border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
    background: color-mix(in oklch, var(--muted) 70%, var(--card));
    color: var(--muted-foreground);
    font-size: 0.8rem; font-weight: 650; letter-spacing: -0.02em;
  }

  .main { display: flex; flex-direction: column; gap: 0.28rem; }
  .l1 { display: flex; align-items: baseline; gap: 0.35rem; min-width: 0; }
  .nm {
    font-size: 0.95rem; font-weight: 650; letter-spacing: -0.01em; color: var(--foreground);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .row:hover .nm { color: var(--primary); }
  .yr { font-size: 0.85rem; color: var(--muted-foreground); flex: none; }

  .l2 { display: flex; align-items: center; gap: 0.75rem; min-width: 0; }

  /* Fixed columns, in the space the layout was wasting between the categories and the
     rating. `auto` widths let each row size to its own numbers, so "2, 3" and "2" pushed the
     labels to different offsets and a game with no RECOMMENDED AT shifted BEST AT rightward —
     nothing lined up down the list. Fixed slots make the labels a column you can read
     vertically. Matches `.facts` on the game detail page. */
  .fact { align-self: center; font-size: 0.85rem; font-variant-numeric: tabular-nums; }
  .lbl {
    display: block; color: var(--muted-foreground);
    font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em;
    white-space: nowrap;
  }
  .fact b { font-weight: 650; }
  .hl { color: var(--primary); }

  /* "7.9/10", not "7.95" over a bar.
     The bar ran on a fixed 5.5–8.8 domain — chosen because geek rating is Bayesian and
     squeezed into that range — but the domain was invisible, so a half-full bar meant nothing
     to a reader who does not already know BGG's scale. A number against its maximum needs no
     legend, and two significant digits are all a rating supports anyway. */
  .rate { justify-self: end; text-align: right; }
  .rv {
    font-size: 0.95rem; font-weight: 650; color: var(--foreground);
    font-variant-numeric: tabular-nums; white-space: nowrap;
  }
  .rv .of { font-size: 0.72rem; font-weight: 500; color: var(--muted-foreground); }
  .rv.none { color: var(--muted-foreground); font-weight: 500; }

  /* Complexity as an ordered ramp in ONE hue.
     The first attempt stepped through `--chart-2..--chart-1`, which put purple at Medium,
     orange at Medium-Heavy and blue at Heavy: that palette is *categorical*, so it read as
     three unrelated kinds rather than as a scale that climbs. An ordered quantity needs an
     ordered encoding, so the ramp now holds the primary hue fixed and varies only
     intensity — Light barely tinted, Heavy fully saturated. The WORD still carries the
     meaning; the tint only reinforces it, which keeps the scale legible in greyscale and to
     a colourblind reader. Outline rather than solid fill so it never outshouts the title. */
  .cx {
    flex: none; font-size: 0.7rem; font-weight: 550; white-space: nowrap;
    padding: 0.1rem 0.45rem; border-radius: 999px; border: 1px solid;
    color: color-mix(in oklch, var(--primary) calc(45% + var(--step) * 11%), var(--muted-foreground));
    border-color: color-mix(in oklch, var(--primary) calc(18% + var(--step) * 9%), transparent);
    background: color-mix(in oklch, var(--primary) calc(4% + var(--step) * 3%), transparent);
  }
  .cx[data-step='1'] { --step: 1; }
  .cx[data-step='2'] { --step: 2; }
  .cx[data-step='3'] { --step: 3; }
  .cx[data-step='4'] { --step: 4; }
  .cx[data-step='5'] { --step: 5; }

  .cats {
    font-size: 0.73rem; color: var(--muted-foreground);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;
  }

  /* Narrow canvases drop the categories rather than squeezing the pips. */
  /* Shed in order of least value: the categories first, then the recommended-at column, so
     the game's name and its best-at count — the two things Discover exists to surface —
     survive the narrowest layout. */
  @container (max-width: 46rem) {
    .cats { display: none; }
  }
  @container (max-width: 34rem) {
    .row { grid-template-columns: 3.5rem minmax(0, 1fr) 5.5rem 4.25rem; }
    .fact:nth-of-type(2) { display: none; }
  }
</style>
