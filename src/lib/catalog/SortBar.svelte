<script lang="ts">
  /**
   * The sort control a card list needs because it stopped being a table.
   *
   * `GameCard`'s other half. A table's column headers ARE its sort control — you click "Geek"
   * to sort by it — so every list that switches to cards loses the ability to sort at the same
   * moment it loses its headers, and has to put it back. That is not a coincidence between two
   * pages; it is the same consequence of the same decision, which is why this lives next to the
   * card rather than being copied into each list that uses one.
   *
   * A native `<select>`, not a menu: it is the right size for a thumb and brings the platform's
   * own picker, which on a phone is a better control than anything built here would be.
   */
  let {
    options,
    /** The selected sort key. Bindable — the list owns its sort state. */
    value = $bindable(),
    /** Descending? Bindable for the same reason. */
    desc = $bindable(true),
    /** What "descending" means in words, for the direction button's tooltip. */
    highLow = 'High to low',
    lowHigh = 'Low to high'
  }: {
    options: { value: string; label: string }[];
    value: string;
    desc?: boolean;
    highLow?: string;
    lowHigh?: string;
  } = $props();

  const id = $props.id();
</script>

<span class="sortbar">
  <label class="vh" for={id}>Sort by</label>
  <select {id} bind:value>
    {#each options as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
  </select>
  <button
    type="button"
    class="dir"
    onclick={() => (desc = !desc)}
    aria-label={desc ? 'Sort ascending' : 'Sort descending'}
    title={desc ? highLow : lowHigh}>{desc ? '▼' : '▲'}</button
  >
</span>

<style>
  .sortbar { display: inline-flex; gap: 0.35rem; align-items: center; }

  /* Screen-reader-only. The select's purpose is obvious on screen from what it contains; a
     visible "Sort by" beside it would be a word spent saying what the values already say. */
  .vh {
    position: absolute; width: 1px; height: 1px;
    overflow: hidden; clip-path: inset(50%); white-space: nowrap;
  }

  .sortbar select,
  .sortbar .dir {
    border: 1px solid var(--border); border-radius: 6px;
    background: var(--background); color: var(--foreground);
    font: inherit; cursor: pointer;
  }
  /*
   * Not 0.9rem, which is what both hand-written copies of this control used.
   *
   * iOS Safari zooms the page when a form control smaller than 16px takes focus, and does not
   * zoom back out when it blurs — so tapping "sort by" left you on a magnified page you had to
   * pinch your way out of. The app already fixes this for text inputs in four places via
   * `--input-font-min`; every one of them is an `input`, and nobody thought about `select`.
   * This control only ever renders on a phone, so the floor is unconditional here rather than
   * hidden behind a breakpoint.
   */
  .sortbar select { font-size: var(--input-font-min); padding: 0.45rem 0.5rem; }
  .sortbar .dir {
    color: var(--muted-foreground);
    font-size: 0.8rem; padding: 0.55rem 0.7rem;
  }
  .sortbar .dir:hover { color: var(--primary); border-color: var(--primary); }
  .sortbar select:focus-visible,
  .sortbar .dir:focus-visible { outline: 2px solid var(--primary); outline-offset: 1px; }
</style>
