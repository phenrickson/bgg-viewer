<script lang="ts">
  /**
   * The map's rail — **how the map is drawn**, and nothing about which games are on it.
   *
   * This used to hold three filters of its own (min ratings, upcoming, categories) beside
   * the encodings, which is how the site ended up with two filter languages for the same
   * 36k games. Those moved to `Scope`, where Explore's rail already expressed every one of
   * them, so a set can now be carried between the two surfaces instead of rebuilt. What is
   * left here is exactly the encodings, and the rail is shorter and more honest for it:
   * every control in this column answers "how should this look", and the chips above the
   * canvas answer "what am I looking at".
   *
   * Chrome comes from `catalog/rail/*` — the same `RailGroup` and `SegGroup` the catalog
   * rail uses, so the two rails are one thing rather than two that resemble each other. An
   * earlier version copied Rail's CSS instead and drifted immediately: native selects where
   * the house uses segmented buttons, no accent on the active state.
   *
   * Order carries the grouping rather than headings: Colour and Size first (what you reach
   * for), then Projection collapsed behind a badge (PC3–PC6 stay one click away without
   * telling a first-time visitor that choosing a principal component is ordinary), then the
   * timeline under a rule.
   */
  import type { Snippet } from 'svelte';
  import RailGroup from '$lib/catalog/rail/RailGroup.svelte';
  import SegGroup from '$lib/catalog/rail/SegGroup.svelte';
  import type { ColourBy, Projection, SizeBy, ViewState } from './view';

  let {
    view = $bindable(),
    /** Components the artifact actually carries — 1..k. */
    components,
    /**
     * The publish-year scrubber. Its state (play/pause loop, `upTo`, tick speed) belongs to
     * the page — the map layer reads `upTo` too — so the rail takes it as a snippet and only
     * decides where it sits. Always open rather than in a `RailGroup`: it is something you
     * scrub and watch, and collapsing it would hide the affordance that makes it
     * discoverable at all.
     */
    timeline,
    /**
     * This rail is following a scope rail rather than starting the column.
     *
     * The map's rail is two runs — which games (`Rail`), then how they're drawn (this) — and
     * the seam between them is the same statement the timeline's rule already makes: more
     * air and a heavier rule, so the two read as separate without either needing a heading.
     * Reusing `.break` rather than letting the page write the rule itself keeps the value in
     * one place; the page asserting its own "matching" CSS is exactly how the first MapRail
     * drifted from `Rail`.
     */
    seam = false
  }: {
    view: ViewState;
    components: number[];
    timeline?: Snippet;
    seam?: boolean;
  } = $props();

  const groupOpen = $state({ projection: false });

  const axisBadge = $derived(
    view.projection === 'pca'
      ? `PC${view.x}×PC${view.y}`
      : view.projection === 'strip'
        ? `PC${view.x}`
        : 'UMAP'
  );

  /**
   * Six colour options, as two rows of three rather than one native `<select>`.
   *
   * A select was the last one in the rail, and it was the tell that this column had been
   * written without looking at the others: it hides the options behind a click and loses the
   * "one of these is on" reading that makes a rail scannable. Six is past what one segmented
   * row holds at 16rem — but it is exactly two rows of three, and two `SegGroup`s sharing
   * one value behave as one control because only the lit button is lit.
   */
  const COLOUR_ROWS: { value: ColourBy; label: string }[][] = [
    [
      { value: 'weight', label: 'Weight' },
      { value: 'rating', label: 'Rating' },
      { value: 'geek', label: 'Geek' }
    ],
    [
      { value: 'category', label: 'Category' },
      { value: 'year', label: 'Year' },
      { value: 'upcoming', label: 'Upcoming' }
    ]
  ];

  const COLOUR_NOTE: Record<ColourBy, string> = {
    weight: 'Pale to dark as a game gets heavier.',
    rating: 'What raters gave it, on average.',
    geek: 'BGG’s shrunk rating — rose below 6, blue above.',
    category: 'The one category a game is shown as. Click a swatch to filter.',
    year: 'When it was published.',
    upcoming: 'Released versus announced.'
  };
</script>

<aside class="rail">
  <div class="grp" class:top={!seam} class:break={seam}>
    <span class="lbl">Colour</span>
    {#each COLOUR_ROWS as row, i (i)}
      <SegGroup
        two
        ariaLabel={i === 0 ? 'Colour by' : 'Colour by, continued'}
        options={row}
        value={view.colour}
        onchange={(v) => (view = { ...view, colour: v })}
      />
    {/each}
    <p class="note">{COLOUR_NOTE[view.colour]}</p>
  </div>

  <div class="grp">
    <SegGroup
      label="Size"
      options={[
        { value: 'popularity' as SizeBy, label: 'Popularity' },
        { value: 'uniform' as SizeBy, label: 'Uniform' }
      ]}
      value={view.size}
      onchange={(v) => (view = { ...view, size: v })}
    />
    <p class="note">
      {view.size === 'popularity'
        ? 'Dot size is how many people have rated it.'
        : 'One size for every game — colour is the only encoding left to read.'}
    </p>
  </div>

  <RailGroup title="Projection" badge={axisBadge} bind:open={groupOpen.projection}>
    <SegGroup
      two
      ariaLabel="Projection"
      options={[
        { value: 'pca' as Projection, label: 'PCA' },
        { value: 'umap' as Projection, label: 'UMAP' },
        { value: 'strip' as Projection, label: 'Strip' }
      ]}
      value={view.projection}
      onchange={(v) => (view = { ...view, projection: v })}
    />
    {#if view.projection === 'pca' || view.projection === 'strip'}
      <label class="field">
        <span class="lbl sm">{view.projection === 'strip' ? 'Component' : 'X axis'}</span>
        <select bind:value={view.x}>
          {#each components as c (c)}
            <option value={c} disabled={view.projection === 'pca' && c === view.y}>PC{c}</option>
          {/each}
        </select>
      </label>
    {/if}
    {#if view.projection === 'pca'}
      <label class="field">
        <span class="lbl sm">Y axis</span>
        <select bind:value={view.y}>
          {#each components as c (c)}
            <option value={c} disabled={c === view.x}>PC{c}</option>
          {/each}
        </select>
      </label>
    {/if}
    <p class="note">
      {view.projection === 'pca'
        ? 'Two components of the embedding, plotted against each other. PC1 tracks complexity.'
        : view.projection === 'umap'
          ? 'A 2-D layout of the full 64-d space — neighbourhoods, not axes.'
          : 'One component on x, games jittered on y — a dimension read on its own.'}
    </p>
  </RailGroup>

  {#if timeline}
    <div class="grp break">
      <span class="lbl">Published up to</span>
      {@render timeline()}
    </div>
  {/if}
</aside>

<style>
  /* No card chrome: the rail is a column of controls, not content — the section rules carry
     the structure. Matches catalog/Rail.svelte, whose comment explains the reasoning. */
  .rail {
    padding-right: var(--space-sm);
    font-size: 0.85rem;
    overflow-y: auto;
    min-height: 0;
  }

  .grp {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.6rem 0;
    border-top: 1px solid var(--border);
  }
  .grp.top {
    border-top: none;
  }

  /* The seam between how-it-is-drawn and when-it-was-published: more air than the rules
     between groups, so the rail reads as two runs without either one needing a name. */
  .grp.break {
    margin-top: var(--space-md);
    border-top-width: 2px;
  }

  .lbl {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted-foreground);
    font-weight: 600;
  }
  .lbl.sm {
    font-size: 0.68rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .field select {
    width: 100%;
    min-width: 0;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: var(--background);
    color: var(--foreground);
    padding: 0.35rem 0.5rem;
    font: inherit;
    font-size: 0.85rem;
  }
  /* iOS Safari zooms the page when a focused input computes under 16px and does not zoom back
     out on blur. The rail's density is a desktop affordance, so the floor only applies where
     the problem exists. */
  @media (max-width: 40rem) {
    .field select {
      font-size: var(--input-font-min);
    }
  }

  .note {
    margin: 0;
    font-size: 0.7rem;
    color: var(--muted-foreground);
    line-height: 1.35;
  }
</style>
