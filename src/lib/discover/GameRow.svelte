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
  import { navigating } from '$app/stores';
  import { complexityLabel, complexityBandIndex } from './dials';
  import type { DiscoverGame } from './types';

  let { game, rank }: { game: DiscoverGame; rank: number } = $props();

  /**
   * Is THIS row the one being navigated to? The shell shows a global progress bar, but that
   * says "something is loading" — it doesn't confirm which game was clicked. Marking the
   * specific row keeps the answer where the user's eye already is.
   */
  const href = $derived(`/games/${game.game_id}`);
  const opening = $derived($navigating?.to?.url.pathname === href);

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

  /**
   * The rating meter's domain. Geek rating is Bayesian and squeezed into roughly 5.5–8.8, so
   * a 0–10 scale would leave every game's meter sitting in the same narrow band and comparing
   * nothing. Fixed, not scaled to the current page: a meter that re-scales per result set
   * makes every page look identical and destroys comparison between them.
   */
  const GEEK_LO = 5.5;
  const GEEK_HI = 8.8;
  const SEGMENTS = 5;

  /** Fill of the i-th (0-based) segment, 0–100. */
  function ratingSeg(i: number): number {
    const v = game.geek_rating;
    if (v == null) return 0;
    const filled = ((v - GEEK_LO) / (GEEK_HI - GEEK_LO)) * SEGMENTS;
    return Math.max(0, Math.min(1, filled - i)) * 100;
  }

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

<a class="row" class:opening {href} aria-busy={opening}>
  <!-- Position in the returned set. In a panel that scrolls through thousands, this is the
       only thing telling you whether you are at the top of the list or deep inside it. -->
  <span class="rk tnum">{rank.toLocaleString()}</span>
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

  <!-- Two columns, not one cluster: each label owns a fixed slot, so "BEST" sits at the same
       x on every row whether or not the game has a "RECOMMENDED" beside it. -->
  <span class="fact">
    {#if bestAt}
      <span class="lbl">Best</span>
      <b class="hl">{bestAt}</b>
    {/if}
  </span>
  <span class="fact">
    {#if recAt}
      <span class="lbl">Also good</span>
      <b>{recAt}</b>
    {/if}
  </span>

  <span class="rate">
    <span class="lbl">Rating</span>
    {#if game.geek_rating != null}
      <span class="rv">{game.geek_rating.toFixed(1)}</span>
      <span class="meter" aria-hidden="true">
        {#each [0, 1, 2, 3, 4] as i (i)}
          <i><b style:width="{ratingSeg(i)}%"></b></i>
        {/each}
      </span>
    {:else}
      <span class="rv none">—</span>
    {/if}
  </span>
</a>

<style>
  /* Fixed art, flexible title, then three fixed columns. Everything except the title is a
     fixed width so the labels, numbers and meters form columns you can read down; only the
     title absorbs slack.
     A lone `1fr` in the middle is only dangerous when the page is unbounded — on a full-bleed
     window it pooled ~900px into one gap (the failure `GameList.svelte` documents). The list
     is capped at the `list` measure, so the surplus it can absorb is small and bounded. */
  .row {
    display: grid;
    /* "Recommended" was 7.5rem wide because of the LABEL, not the data — the numbers under it
       are usually four characters. Shortening it to "Also good" lets the column give 2rem back
       to the game's title. */
    grid-template-columns: 2rem 3.5rem minmax(0, 1fr) 4.5rem 5.5rem 4.5rem;
    align-items: center;
    gap: 0 var(--space-md);
    padding: 0.5rem var(--space-md);
    text-decoration: none;
    color: inherit;
    border-bottom: 1px solid color-mix(in oklch, var(--border) 55%, transparent);
    /* Skip layout and paint for rows scrolled out of the panel. `contain-intrinsic-size`
       supplies a placeholder height so the scrollbar stays stable as rows enter and leave —
       without it the thumb jitters, because the container keeps re-measuring. Cheap, and it
       keeps a few thousand rows responsive; it does not reduce the DOM node count, which is
       why the list still pages in rather than rendering everything at once. */
    content-visibility: auto;
    contain-intrinsic-size: auto 3.75rem;
  }
  .row:last-child { border-bottom: none; }
  .row:hover { background: color-mix(in oklch, var(--primary) 7%, transparent); }

  /* The clicked row holds the hover tint and gains a left edge, so the click is acknowledged
     on the thing that was clicked — the global bar says "loading", this says "loading THIS".
     Pointer-events off stops a second click re-firing a navigation already in flight. */
  .row.opening {
    background: color-mix(in oklch, var(--primary) 10%, transparent);
    box-shadow: inset 2px 0 0 var(--primary);
    pointer-events: none;
  }
  .row.opening .nm { color: var(--primary); }
  .row:focus-visible { outline: 2px solid var(--primary); outline-offset: -2px; }
  .row > span { min-width: 0; }

  /* Quiet — it is a position marker, not a score. Tabular so the digits stay in column as
     the numbers grow through the hundreds and thousands. */
  /* Left-aligned and dimmer, not right-aligned tight against the artwork — pushed up to the
     thumbnail it read as a caption on the image rather than a position in the list. */
  .rk {
    text-align: left; font-size: 0.75rem;
    color: color-mix(in oklch, var(--muted-foreground) 75%, transparent);
    font-variant-numeric: tabular-nums;
  }

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
     labels to different offsets and a game with no RECOMMENDED shifted BEST rightward —
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

  /* The number leads; the meter gives it a scale to sit on.
     Five segments rather than one continuous bar, because segments are countable — a bar
     half-filled on an invisible 5.5–8.8 domain told a reader nothing, whereas "three of five
     lit" is a quantity even without knowing the endpoints.
     Labelled like the two columns beside it — it was the only unlabelled number on the row,
     so nothing said what "8.4" measured. Centred, because the label is wider than the number
     it heads: right-aligning left "7.7" hanging off the end of "RATING" instead of under it. */
  .rate { justify-self: stretch; text-align: center; }
  .rv {
    display: block;
    font-size: 0.95rem; font-weight: 650; color: var(--foreground);
    font-variant-numeric: tabular-nums; line-height: 1.15;
  }
  .rv.none { color: var(--muted-foreground); font-weight: 500; }
  .meter { display: flex; gap: 1.5px; margin-top: 0.25rem; }
  .meter i {
    flex: 1; height: 0.3rem; border-radius: 1.5px; overflow: hidden;
    background: color-mix(in oklch, var(--border) 80%, transparent);
  }
  .meter b { display: block; height: 100%; background: var(--chart-1); }

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
    .row { grid-template-columns: 2rem 3.5rem minmax(0, 1fr) 4.5rem 4.5rem; }
    .fact:nth-of-type(2) { display: none; }
  }
</style>
