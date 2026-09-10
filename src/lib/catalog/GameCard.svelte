<script lang="ts">
  /**
   * One game as a CARD — the shape a list of games takes when it is too narrow to be a list.
   *
   * The shell only. Art on the left, identity on top, a row of labelled stats underneath; the
   * caller supplies what goes in each. Explore fills the stats with gauges on fixed domains,
   * Discover with a complexity word and a best-at count, and neither had to agree with the
   * other for this to be worth sharing — what they agree on is the *shape*, and that is what
   * kept getting written twice.
   *
   * It was written twice, in fact, and both of the bugs that came out of that pass were in the
   * seam: a container query in one file silently overriding another's grid because both matched
   * on a phone, and a column that never dropped because the selector counted element types.
   * Neither is expressible here — there is one grid, stated once, and the caller renders the
   * cells it wants rather than rendering all of them and hiding the surplus in CSS.
   *
   * A separate component rather than a breakpoint on the row, deliberately. The row-that-is-
   * also-a-card had to carry both sets of markup at all times, with CSS deciding which half was
   * real; every rule in the narrow block existed to undo something the wide layout had done.
   * Two components mean each one renders only what it shows.
   */
  import type { Snippet } from 'svelte';

  let {
    href,
    /** The game's art, or a placeholder standing in for it — the caller owns which. */
    art,
    /** Title line and whatever sits under it: year, players, designer, a complexity word. */
    identity,
    /**
     * The labelled numbers. Emit one `<span class="stat">` per measure, each leading with a
     * `<span class="stat-lbl">`; they are laid out as equal columns however many there are.
     * The label is not optional decoration — a table teaches its encodings once in a column
     * header, and a card has no header to lean on, so an unlabelled bar here says nothing.
     */
    stats,
    /** Marks the card being navigated to, so a tap is acknowledged on the thing tapped. */
    opening = false
  }: {
    href: string;
    art: Snippet;
    identity: Snippet;
    stats: Snippet;
    opening?: boolean;
  } = $props();
</script>

<a class="card" class:opening {href} aria-busy={opening || undefined}>
  <span class="art">{@render art()}</span>
  <span class="body">{@render identity()}</span>
  <span class="stats">{@render stats()}</span>
</a>

<style>
  /*
   * Art spans both rows; identity and stats stack beside it. `minmax(0, 1fr)` on the second
   * track, not `auto`, so a long title wraps instead of widening the grid past the screen.
   */
  .card {
    display: grid;
    grid-template-columns: 3.2rem minmax(0, 1fr);
    grid-template-areas:
      'art body'
      'art stats';
    row-gap: 0.4rem;
    column-gap: var(--space-sm);
    padding: 0.6rem var(--space-md);
    text-decoration: none;
    color: inherit;
    border-bottom: 1px solid color-mix(in oklch, var(--border) 55%, transparent);
    /* Skip layout and paint for cards scrolled out of view; the intrinsic size keeps the
       scrollbar from jumping as they enter and leave. */
    content-visibility: auto;
    contain-intrinsic-size: auto 5.5rem;
  }
  .card:last-child { border-bottom: none; }
  .card:hover { background: color-mix(in oklch, var(--primary) 7%, transparent); }
  .card:focus-visible { outline: 2px solid var(--primary); outline-offset: -2px; }
  .card.opening {
    background: color-mix(in oklch, var(--primary) 10%, transparent);
    box-shadow: inset 2px 0 0 var(--primary);
    pointer-events: none;
  }
  .card > span { min-width: 0; }

  /* Top-aligned, not centred: the title beside it may be one line or three, and a centred
     thumbnail drifts down the card as the title grows. */
  .art { grid-area: art; align-self: start; }
  /* Both the real image and any placeholder, so a background thumbnails load never reflows
     the card it fills in. */
  .art :global(img),
  .art :global(.ph) {
    width: 3.2rem; height: 3.2rem; border-radius: 6px;
    object-fit: cover;
    background: color-mix(in oklch, var(--muted) 70%, var(--card));
  }
  .art :global(.ph) {
    display: flex; align-items: center; justify-content: center;
    color: var(--muted-foreground); font-size: 0.78rem; font-weight: 650;
    letter-spacing: -0.02em;
  }

  .body { grid-area: body; display: flex; flex-direction: column; gap: 0.2rem; line-height: 1.25; }
  /* The name gets the card's full width, so it wraps rather than ellipsising at word two —
     which is what a fixed-width column forced it to do. */
  .body :global(.nm) {
    font-size: 0.95rem; font-weight: 650; letter-spacing: -0.01em; color: var(--foreground);
    /* Stated, not assumed: both callers' table rows set `nowrap` on this class for their own
       layout, and a card exists precisely because the title has stopped fitting on one line. */
    white-space: normal;
  }
  .card:hover .body :global(.nm) { color: var(--primary); }
  .body :global(.mt) {
    font-size: 0.78rem; color: var(--muted-foreground);
    overflow: hidden; text-overflow: ellipsis;
  }

  /*
   * Equal columns for however many stats the caller emits — two on Discover, three on Explore.
   * `grid-auto-flow: column` with a `1fr` auto-track means the count is the caller's business
   * and not a number this file has to know.
   */
  .stats {
    grid-area: stats;
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(0, 1fr);
    column-gap: var(--space-sm);
    align-items: start;
  }
  .stats :global(.stat) { display: block; min-width: 0; }
  .stats :global(.stat-lbl) {
    display: block;
    font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.04em;
    font-weight: 600; color: var(--muted-foreground); margin-bottom: 0.1rem;
  }
  /*
   * Gauges size themselves intrinsically (3.5rem) so a wide table column doesn't stretch a bar
   * out of proportion to the two-digit number above it. A card is the opposite case: the column
   * IS the measure's own slot, and a bar that fills it is the point.
   */
  .stats :global(.gauge) { width: 100%; align-items: flex-start; }
</style>
