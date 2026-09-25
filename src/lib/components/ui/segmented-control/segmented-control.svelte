<script lang="ts" module>
  export type SegmentedOption<V> = {
    value: V;
    label: string;
    /** Tooltip — what choosing this does. */
    title?: string;
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
</script>

<div class="seg {size} {className}" role="group" aria-label={label}>
  {#each options as o (String(o.value))}
    {@const on = o.value === value}
    <button
      type="button"
      class:on
      aria-pressed={on}
      title={o.title}
      disabled={o.disabled}
      onclick={() => onchange(o.value)}>{o.label}</button
    >
  {/each}
</div>

<style>
  .seg {
    display: inline-flex;
    background: var(--muted);
  }
  button {
    border: none;
    background: none;
    color: var(--muted-foreground);
    font: inherit;
    cursor: pointer;
    white-space: nowrap;
  }
  button:hover:not(.on):not(:disabled) {
    color: var(--foreground);
  }
  button.on {
    background: var(--card);
    color: var(--foreground);
    font-weight: 600;
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

  /* Touch sizing: padding AND type together, not min-height alone — a touch control should
     look touch-sized, not be a desktop control in a taller box. The shape strip already did
     this for `sm`; every size gets it now. Desktop density is left alone. */
  @media (max-width: 40rem) {
    .sm button, .md button { padding: 0.6rem 0.8rem; font-size: 0.85rem; }
    .lg button { padding: 0.7rem 1rem; font-size: 1rem; }
  }
</style>
