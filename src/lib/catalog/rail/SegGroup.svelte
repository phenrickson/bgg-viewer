<script lang="ts" generics="T extends string | number | boolean">
  /**
   * The rail's segmented control — a small set of mutually-exclusive choices, all visible at
   * once with one lit.
   *
   * The house uses this wherever a choice has few enough options to show them: Universe
   * (Top 10,000 / All rated / Upcoming), the player-count mode (Plays with / Best at), the
   * counts themselves (1–6+). A native `<select>` in the same place is the tell that a rail
   * was written without looking at the others — it hides the options behind a click and
   * loses the "one of these is on" reading that makes the rail scannable.
   *
   * Values are compared with `===`, so anything comparable works: a string union, a number,
   * a boolean.
   *
   * `aria-pressed` rather than a radiogroup: these are buttons that apply immediately, and
   * `aria-pressed` is what a toggle button in a group should carry.
   */

  let {
    /** The section heading above the buttons. Omit when the group is already inside one. */
    label = null,
    options,
    value,
    onchange,
    /** Two lines' worth of label text — slightly smaller type, as Universe uses. */
    two = false,
    /** Accessible name for the group when there is no visible `label`. */
    ariaLabel = null
  }: {
    label?: string | null;
    options: { value: T; label: string }[];
    value: T;
    onchange: (v: T) => void;
    two?: boolean;
    ariaLabel?: string | null;
  } = $props();
</script>

{#if label}<span class="lbl">{label}</span>{/if}
<div class="seg" class:two role="group" aria-label={ariaLabel ?? label ?? undefined}>
  {#each options as o (String(o.value))}
    {@const on = o.value === value}
    <button type="button" class:on aria-pressed={on} onclick={() => onchange(o.value)}>
      {o.label}
    </button>
  {/each}
</div>

<style>
  .lbl {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted-foreground);
    font-weight: 600;
  }
  .seg {
    display: flex;
    gap: 0.25rem;
  }
  .seg button {
    flex: 1;
    min-width: 0;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--background);
    color: var(--muted-foreground);
    padding: 0.25rem 0;
    cursor: pointer;
    font: inherit;
    font-size: 0.8rem;
  }
  .seg.two button {
    font-size: 0.78rem;
  }
  .seg button:hover {
    color: var(--foreground);
  }
  .seg button.on {
    border-color: var(--primary);
    color: var(--primary);
    background: color-mix(in oklch, var(--primary) 10%, transparent);
    font-weight: 600;
  }
  .seg button:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 1px;
  }
  /* Touch sizing: padding AND type together, not min-height alone. Raising only the height
     gives tall boxes with tiny text floating in them — a desktop control in a bigger box.
     A touch control should look touch-sized. Desktop density is left alone. */
  @media (max-width: 40rem) {
    .seg button {
      padding: 0.7rem 0.5rem;
      font-size: 0.95rem;
    }
  }
</style>
