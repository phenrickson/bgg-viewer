<script lang="ts">
  /**
   * What the model expected of one game.
   *
   * Lifted out of the detail page so it can render in EITHER column. For a game published
   * this year or later it takes the wide left slot the player-count chart holds otherwise;
   * for a settled game it sits at the foot of the right column, where the model is a footnote
   * about itself rather than the story. A component rather than two copies of the markup
   * behind an `{#if}`, because a card cannot move between two grid parents any other way and
   * duplicating ninety lines to place it is how the two drift.
   *
   * All copy here is PLACEHOLDER — Phil writes the final strings.
   */
  let {
    game,
    /** CSS `order` within whichever stack renders it. */
    order = 2
  }: { game: NonNullable<unknown> & Record<string, any>; order?: number } = $props();

  const g = $derived(game);
  const p = $derived(g?.predictions ?? null);

  /**
   * Whether the question the model was answering has been settled.
   *
   * NOT the same test as the page's `upcoming`, which decides *where* this card sits. A game
   * published this year can already hold a geek rating, and then it belongs in the wide slot
   * AND reads as a scorecard. Placement is about recency; wording is about whether there is
   * an actual to compare against yet.
   */
  const isRated = $derived((g?.geek ?? 0) > 0);

  const num = (n: number | null, digits = 2) =>
    n == null
      ? '—'
      : n.toLocaleString(undefined, {
          minimumFractionDigits: digits,
          maximumFractionDigits: digits
        });
  const int = (n: number | null) => (n == null ? '—' : Math.round(n).toLocaleString());
  /** Zero is the warehouse's "no rating yet", not a measurement of zero. */
  const pos = (n: number | null | undefined) => (n != null && n > 0 ? n : null);

  const fmtDate = (v: string | null | undefined): string | null => {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime())
      ? null
      : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };

  /**
   * Whether the model was fitted on this game. Three states, not two — NULL means the row
   * predates the flag and hasn't been rescored, so the card says nothing rather than implying
   * a forecast. The cutoff year rides along so the claim is checkable.
   */
  const inSample = $derived(p?.sampleStatus === 'in_sample');
  const sampleNote = $derived(
    p?.sampleStatus == null
      ? null
      : inSample
        ? `Fitted — this game was in the model’s training data${p.trainingCutoff ? ` (through ${p.trainingCutoff})` : ''}.`
        : `Forecast — published after the model’s training cutoff${p.trainingCutoff ? ` of ${p.trainingCutoff}` : ''}.`
  );

  /** "38%", "5.3%", "<1%" — a rounded "0%" and a rounded "5%" hide the range that matters. */
  function probText(v: number | null): string {
    if (v == null) return '—';
    const pc = v * 100;
    if (pc < 1) return '<1%';
    if (pc < 10) return `${pc.toFixed(1)}%`;
    return `${Math.round(pc)}%`;
  }

  /**
   * The four estimates, each with the scale it is drawn on.
   *
   * `lo`/`hi` is what makes a position mean anything, and it is stated on the row rather than
   * assumed. Geek runs 5.0–8.8 rather than `RatingBar`'s 5.5–8.8: that domain was set against
   * the rated catalog, and this card also serves games nobody has played, whose predicted
   * geek rating bottoms out near 5.0 and would sit off the left end of a 5.5 floor.
   *
   * Ratings is the one LOG row. Counts run from a handful to ~130,000, so on a linear axis
   * every game short of a blockbuster sits on the left edge and a 103-against-1,262 miss — an
   * order of magnitude — renders as no gap at all. `aggregates.ts` bins `users_rated` on log10
   * for the same reason, so this agrees with the histograms rather than inventing a scale.
   */
  const predRows = $derived(
    p == null || g == null
      ? []
      : (
          [
            { k: 'Geek rating', v: p.geek, actual: g.geek, digits: 2, lo: 5.0, hi: 8.8, dom: '5–8.8', log: false },
            { k: 'Average', v: p.rating, actual: g.average, digits: 2, lo: 5.0, hi: 10, dom: '5–10', log: false },
            { k: 'Ratings', v: p.usersRated, actual: g.ratings, digits: 0, lo: 10, hi: 100_000, dom: '10–100k', log: true },
            { k: 'Complexity', v: p.complexity, actual: g.weight, digits: 1, lo: 1, hi: 5, dom: '1–5', log: false }
          ] as const
        ).filter((r) => r.v != null)
  );

  /**
   * Position of a value on its row's scale, 0–100. On a log row the position is taken on
   * log10, so equal *ratios* are equal distances — which is what makes 103 against 1,262 read
   * as the order-of-magnitude miss it is.
   */
  const at = (v: number | null, lo: number, hi: number, log = false) => {
    if (v == null) return 0;
    if (!log) return Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));
    // Clamp before the log: a predicted count below the floor (or a literal 0 on an unrated
    // game) would otherwise be -Infinity and place the dot nowhere.
    const l = Math.log10(Math.max(lo, v));
    return Math.max(
      0,
      Math.min(100, ((l - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo))) * 100)
    );
  };
  const fmtPred = (v: number | null, digits: number) => (digits === 0 ? int(v) : num(v, digits));

  /** `users_rated` → `Ratings`, so the disclosure names targets the way the rows above do. */
  const TARGET_LABEL: Record<string, string> = {
    hurdle: 'Rated at all',
    geek_rating: 'Geek rating',
    rating: 'Average',
    users_rated: 'Ratings',
    complexity: 'Complexity'
  };
</script>

<section class="card" style:order={order}>
  <p class="sub">
    {isRated ? 'What the model expected' : 'Model prediction'}
    {#if fmtDate(p?.scoredAt)}<span class="sub-note">· scored {fmtDate(p?.scoredAt)}</span>{/if}
  </p>

  {#if !p}
    <div class="empty">No prediction — {g.name} falls outside the model’s scoring window.</div>
  {:else}
    {#if predRows.length}
      <!-- PLACEHOLDER copy -->
      <p class="pk">
        {isRated ? 'Estimate vs. actual' : 'If it is rated, expect'}
        {#if isRated}
          <span class="key">
            <i class="k-est"></i> estimate
            <i class="k-act"></i> actual
          </span>
        {/if}
      </p>
      <!--
        A dumbbell: two dots on a shared scale, with the segment between them as the error.
        It replaces a fill-plus-tick, where the two marks fought — with the estimate drawn as
        a bar from the scale's start, an actual close to it landed on the bar's end and read
        as a cap, and an actual below it sat INSIDE the bar and read as a defect. Neither
        said "two values".

        A fill was wrong for a second reason: none of these scales start at zero, so a bar
        growing from the left edge asserts a baseline that isn't there. Two points on a line
        have no baseline to falsify, and the thing you actually want — how far off was it —
        becomes the one distance on the row.
      -->
      <div class="preds tnum">
        {#each predRows as r (r.k)}
          <div class="prow">
            <span class="pl">{r.k}</span>
            <span class="ptrack">
              {#if isRated && pos(r.actual) != null}
                <i
                  class="pgap"
                  style:left="{Math.min(at(r.v, r.lo, r.hi, r.log), at(r.actual, r.lo, r.hi, r.log))}%"
                  style:width="{Math.abs(at(r.v, r.lo, r.hi, r.log) - at(r.actual, r.lo, r.hi, r.log))}%"
                ></i>
              {/if}
              <i class="pdot est" style:left="{at(r.v, r.lo, r.hi, r.log)}%"></i>
              {#if isRated && pos(r.actual) != null}
                <i class="pdot act" style:left="{at(r.actual, r.lo, r.hi, r.log)}%"></i>
              {/if}
            </span>
            <span class="pdom">{r.dom}{#if r.log}<span class="lg">log</span>{/if}</span>
            <span class="pv">{fmtPred(r.v, r.digits)}</span>
            {#if isRated}<span class="pa">{fmtPred(pos(r.actual), r.digits)}</span>{/if}
          </div>
        {/each}
      </div>
    {/if}

    <!--
      The hurdle, as one line rather than the panel's headline.

      It led here — a 1.7rem figure in a tinted box with its own bar — on the reasoning that
      everything below it is conditional on it. True, and still the wrong weight for a page
      about ONE game: by the time you are reading a game's page the question is settled or
      nearly so (this reads 100% far more often than not), and a figure that is the same on
      most pages cannot be the thing that leads them. Where it earns its keep is as a first
      cut across a LIST — separating real releases from records that exist and little else —
      which is why it is a filter in the rail and a column in the table, and a footnote here.
    -->
    {#if p.hurdle != null}
      <!-- PLACEHOLDER copy. The number is meaningless without the second clause: most games
           never clear the bar, so a small percentage is ordinary, not damning. -->
      <p class="hnote">
        <b class="tnum">{probText(p.hurdle)}</b>
        {isRated ? 'was its modelled chance of being rated' : 'chance of being rated'} — most
        BGG games never gather enough ratings to earn a geek rating.{#if isRated}
          {' '}This one did.{/if}
      </p>
    {/if}

    <!-- Phil wants in-sample predictions visible precisely because they show model
         behaviour — so this labels, it doesn't hide or hedge. -->
    {#if sampleNote}
      <p class="sample" class:fitted={inSample}>
        <b class="tag">{inSample ? 'In sample' : 'Out of sample'}</b>
        <span>{sampleNote}</span>
      </p>
    {/if}

    <!-- A prediction nobody can attribute is a rumour — but each target has its own model,
         and five near-identical name+version strings crowded out the numbers they belonged
         to. Collapsed by default, complete when opened. -->
    {#if p.models.length}
      <details class="attrib">
        <summary>{p.models.length} models</summary>
        <dl>
          {#each p.models as m (m.target)}
            <div>
              <dt>{TARGET_LABEL[m.target] ?? m.target}</dt>
              <dd>{m.name}{m.version ? ` v${m.version}` : ''}</dd>
            </div>
          {/each}
        </dl>
      </details>
    {/if}
  {/if}
</section>

<style>
  /* Card chrome, copied rather than shared: these dress every card on the detail page, and
     Svelte scopes styles per component, so a card that moved out of that file brings them. */
  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space-lg);
  }
  .sub {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted-foreground);
    margin: 0 0 0.6rem;
    font-weight: 600;
  }
  .sub-note {
    text-transform: none;
    letter-spacing: 0;
    font-weight: 400;
  }
  .empty {
    border: 1px dashed var(--border);
    border-radius: var(--radius);
    padding: var(--space-lg);
    text-align: center;
    color: var(--muted-foreground);
    font-size: 0.84rem;
  }
  .tnum {
    font-variant-numeric: tabular-nums;
  }

  .pk {
    font-size: 0.76rem;
    color: var(--muted-foreground);
    margin: var(--space-md) 0 0.4rem;
  }
  .preds {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  /* label · track · scale · estimate · actual — the actual column only exists when there is
     one, so an unrated game's rows end at the estimate instead of trailing an empty slot. */
  .prow {
    display: grid;
    grid-template-columns: 6.2rem minmax(3rem, 1fr) auto 3.6rem;
    gap: 0.55rem;
    align-items: center;
  }
  .prow:has(.pa) {
    grid-template-columns: 6.2rem minmax(3rem, 1fr) auto 3.4rem 3.4rem;
  }
  .pl {
    font-size: 0.82rem;
    color: var(--muted-foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* The scale itself is a hairline — recessive, because the data is the two dots on it. */
  .ptrack {
    position: relative;
    height: 0.85rem;
  }
  .ptrack::before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    height: 2px;
    margin-top: -1px;
    border-radius: 1px;
    background: color-mix(in oklch, var(--border) 70%, transparent);
  }
  /* The error, as the one emphasised span on the row. */
  .pgap {
    position: absolute;
    top: 50%;
    height: 2px;
    margin-top: -1px;
    border-radius: 1px;
    background: color-mix(in oklch, var(--chart-1) 45%, var(--muted-foreground));
  }
  .pdot {
    position: absolute;
    top: 50%;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    /* A surface ring, so the two stay legible where they overlap — which is exactly what a
       good forecast looks like, and the case a bare pair of dots renders as one blob. */
    box-shadow: 0 0 0 2px var(--card);
  }
  /* The estimate is hollow and the fact is solid: a guess should not carry the same weight as
     the measurement beside it. */
  .pdot.est {
    background: var(--card);
    border: 2px solid color-mix(in oklch, var(--chart-1) 60%, var(--muted-foreground));
  }
  .pdot.act {
    background: var(--foreground);
  }
  .pdom {
    font-size: 0.62rem;
    color: var(--muted-foreground);
    opacity: 0.7;
    white-space: nowrap;
  }
  /* Says the row is log without spelling it out — a reader comparing gaps ACROSS rows has to
     know this one measures ratios, or a short segment here looks like a small miss. */
  .pdom .lg {
    margin-left: 0.25rem;
    font-size: 0.9em;
    letter-spacing: 0.03em;
    opacity: 0.8;
  }
  .pv {
    font-size: 0.9rem;
    font-weight: 650;
    text-align: right;
  }
  /* The estimate is the muted one and the fact is the solid one — a page should not present a
     guess with the same confidence as the measurement beside it. */
  .prow:has(.pa) .pv {
    font-weight: 550;
    color: var(--muted-foreground);
  }
  .pa {
    font-size: 0.9rem;
    font-weight: 700;
    text-align: right;
  }
  /* Two series on one scale need a key; it rides the section label rather than taking a row. */
  .key {
    float: right;
    font-size: 0.66rem;
    color: var(--muted-foreground);
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }
  .key i {
    display: inline-block;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
  }
  .key .k-est {
    background: var(--card);
    border: 2px solid color-mix(in oklch, var(--chart-1) 60%, var(--muted-foreground));
  }
  .key .k-act {
    background: var(--foreground);
    margin-left: 0.35rem;
  }

  .hnote {
    margin: var(--space-md) 0 0;
    font-size: 0.76rem;
    line-height: 1.45;
    color: var(--muted-foreground);
  }
  .hnote b {
    color: var(--foreground);
    font-weight: 650;
  }

  /* A label, not a warning: neutral by default, and the fitted case reads as a fact about the
     model rather than a caveat about the number. */
  .sample {
    margin: var(--space-md) 0 0;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.4rem;
    font-size: 0.76rem;
    line-height: 1.4;
    color: var(--muted-foreground);
  }
  .sample .tag {
    flex: none;
    font-size: 0.62rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 700;
    padding: 0.1rem 0.4rem;
    border-radius: 999px;
    border: 1px solid var(--border);
    color: var(--foreground);
  }
  .sample.fitted .tag {
    border-color: color-mix(in oklch, var(--chart-2) 45%, var(--border));
    background: color-mix(in oklch, var(--chart-2) 12%, transparent);
  }

  .attrib {
    margin-top: var(--space-md);
    padding-top: 0.5rem;
    border-top: 1px solid var(--border);
    font-size: 0.72rem;
    color: var(--muted-foreground);
  }
  .attrib summary {
    cursor: pointer;
    opacity: 0.8;
  }
  .attrib summary:hover {
    color: var(--primary);
  }
  .attrib dl {
    margin: 0.5rem 0 0;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .attrib dl div {
    display: flex;
    gap: 0.6rem;
    justify-content: space-between;
  }
  .attrib dt {
    opacity: 0.8;
    flex: none;
  }
  .attrib dd {
    margin: 0;
    text-align: right;
    word-break: break-word;
    font-variant-numeric: tabular-nums;
  }
</style>
