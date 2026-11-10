<script lang="ts" module>
  export type SegmentedOption<V> = {
    value: V;
    label: string;
    /** Tooltip — what choosing this does. */
    title?: string;
    /** A line under the label. When any option has one, the group becomes a row of
     *  equal-width cards (label over description) that fills its container. */
    description?: string;
    disabled?: boolean;
  };
</script>

<script lang="ts" generics="T extends string | number | boolean">
  /**
   * A small set of mutually exclusive choices on a muted track, with the chosen one raised
   * onto a card-coloured pill.
   *
   * This look already existed as private page CSS in two places — the Explore shape strip's
   * Count / Share and the game page's similar-games switcher (which said it "mirrors
   * ShapeStrip's `.seg` so the app has one segmented-control look"). One look, written once.
   *
   * Not the Explore rail's control: `SegGroup` (bordered, equal-width, primary-tinted) is the
   * rail's filter language and stays there. This one is for choosing a view or a question —
   * from a compact chart toggle (`sm`, the size those two used) up to a page's main choice
   * (`lg`).
   *
   * With descriptions it's a row of cards rather than a pill track: the same choice, for when
   * the options need a line each to be told apart (Recommend's Recommended / Most Similar /
   * Dark Horses).
   *
   * `aria-pressed` buttons in a labelled group: they apply immediately, which is what a toggle
   * button in a group carries.
   */
  let {
    options,
    value,
    onchange,
    /** Accessible name for the group. */
    label,
    size = 'sm',
    class: className = ''
  }: {
    options: SegmentedOption<T>[];
    value: T;
    onchange: (v: T) => void;
    label: string;
    size?: 'sm' | 'md' | 'lg';
    class?: string;
  } = $props();

  const described = $derived(options.some((o) => o.description));
</script>

<div class="seg {size} {className}" class:cards={described} role="group" aria-label={label}>
  {#each options as o (String(o.value))}
    {@const on = o.value === value}
    <button
      type="button"
      class:on
      aria-pressed={on}
      title={o.title}
      disabled={o.disabled}
      onclick={() => onchange(o.value)}
      >{#if described}<span class="lbl">{o.label}</span>{#if o.description}<span class="desc">{o.description}</span>{/if}{:else}{o.label}{/if}</button
    >
  {/each}
</div>

<style>
  .seg {
    display: inline-flex;
    background: var(--muted);
  }
  /* Unselected options are brighter than muted text, so the whole group reads as choices you
     can press rather than as a label with one bold word in it. */
  button {
    border: none;
    background: none;
    color: color-mix(in oklch, var(--foreground) 70%, var(--muted-foreground));
    font: inherit;
    cursor: pointer;
    white-space: nowrap;
  }
  button:hover:not(.on):not(:disabled) {
    color: var(--foreground);
    background: color-mix(in oklch, var(--card) 55%, transparent);
  }
  /* The chosen option: raised onto the card colour and marked in the primary colour, the same
     accent the app's chips use for "on". Not colour alone — `aria-pressed` carries it too. */
  button.on {
    background: var(--card);
    color: var(--primary);
    font-weight: 600;
    box-shadow: 0 0 0 1px color-mix(in oklch, var(--primary) 45%, transparent);
  }
  button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  button:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 1px;
  }

  /* sm: exactly the shape strip's and game page's control. */
  .sm { gap: 0.15rem; padding: 0.1rem; border-radius: 7px; }
  .sm button { font-size: 0.7rem; padding: 0.08rem 0.4rem; border-radius: 5px; }
  .md { gap: 0.2rem; padding: 0.2rem; border-radius: 10px; }
  .md button { font-size: 0.875rem; padding: 0.35rem 0.8rem; border-radius: 7px; }
  .lg { gap: 0.25rem; padding: 0.25rem; border-radius: 12px; }
  .lg button { font-size: 1rem; padding: 0.6rem 1.25rem; border-radius: 9px; }

  /* Cards: equal-width, label over description, filling the row; they wrap to fewer per row
     when the container is too narrow for all of them. */
  /* With descriptions it's a row of TABS: no track; the chosen tab joins the sheet under it
     (the caller draws the sheet — a bordered panel with no top edge, see Recommend), the
     others sit behind it as plain labels. */
  .seg.cards {
    position: relative;
    display: flex;
    flex-wrap: wrap;
    width: 100%;
    gap: 0.25rem;
    padding: 0;
    border-radius: 0;
    background: none;
    border-bottom: 1px solid var(--border);
  }
  .cards button {
    position: relative;
    flex: 1 1 11rem;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.15rem;
    margin-bottom: -1px;
    border: 1px solid transparent;
    border-bottom: none;
    border-radius: var(--radius) var(--radius) 0 0;
    background: none;
    white-space: normal;
    text-align: left;
  }
  .cards .lbl { font-weight: 650; }
  .cards .desc { font-size: 0.8em; font-weight: 400; line-height: 1.35; color: var(--muted-foreground); }
  .cards button:hover:not(.on):not(:disabled) {
    background: color-mix(in oklch, var(--card) 60%, transparent);
  }
  /* The chosen tab: the sheet's own background and border, with no bottom edge, so it and the
     sheet are one piece. */
  .cards button.on {
    border-color: var(--border);
    background: var(--background);
    box-shadow: none;
  }
  .cards button.on .desc { color: color-mix(in oklch, var(--foreground) 80%, var(--muted-foreground)); }

  /* Touch sizing: padding AND type together, not min-height alone — a touch control should
     look touch-sized, not be a desktop control in a taller box. The shape strip already did
     this for `sm`; every size gets it now. Desktop density is left alone. */
  @media (max-width: 40rem) {
    .sm button, .md button { padding: 0.6rem 0.8rem; font-size: 0.85rem; }
    .lg button { padding: 0.7rem 1rem; font-size: 1rem; }
  }
</style>
