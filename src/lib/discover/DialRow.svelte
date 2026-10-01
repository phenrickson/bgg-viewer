<script lang="ts" module>
  export type DialChip = {
    label: string;
    on: boolean;
    onclick: () => void;
    ariaLabel?: string;
    /** A pre-selected answer ("Anywhere") — on, but not a choice the reader made. */
    isDefault?: boolean;
    /** "Doesn't matter": when on, outlined and neutral rather than filled — not an answer. */
    quiet?: boolean;
  };
</script>

<script lang="ts">
  /**
   * One of Discover's questions: the question as content, in the landing page's voice, with
   * its answers as chips beneath it. A question, not a field label — these were once
   * `.try`-style uppercase eyebrows ("CATEGORIES", "PLAYERS"), which read as a filing system
   * and turned the page into a filter toolbar.
   *
   * Stateless: each chip says whether it's on and what clicking it does. `DialStrip` builds its
   * four questions from this; Recommend's "Where from?" is one more. `centered` centres the
   * question and its chips (Recommend, under its centred headline).
   */
  let {
    id,
    question,
    chips,
    centered = false
  }: { id: string; question: string; chips: DialChip[]; centered?: boolean } = $props();
</script>

<div class="row" class:centered>
  <p class="q" {id}>{question}</p>
  <div class="chips" role="group" aria-labelledby={id}>
    {#each chips as c (c.label)}
      <button
        type="button"
        class="chip"
        class:on={c.on}
        class:quiet={c.quiet}
        aria-pressed={c.on}
        aria-label={c.ariaLabel}
        onclick={c.onclick}>{c.label}</button
      >
    {/each}
  </div>
</div>

<style>
  /* Proximity does the grouping: a question sits tight to the chips that answer it (0.55rem)
     and far from the next question (the strip's --space-lg). */
  .row { display: flex; flex-direction: column; gap: 0.55rem; }

  .q {
    font-size: 1.05rem; font-weight: 600; letter-spacing: -0.01em;
    color: var(--foreground); margin: 0;
  }

  .chips { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  .centered { align-items: center; text-align: center; }
  .centered .chips { justify-content: center; }

  /* Matches the landing page's `.chip`, as a button rather than a link. */
  .chip {
    font: inherit; font-size: 0.85rem; padding: 0.4rem 0.75rem; border-radius: 999px;
    border: 1px solid color-mix(in oklch, var(--primary) 35%, var(--border));
    color: var(--primary);
    background: color-mix(in oklch, var(--primary) 8%, var(--card));
    cursor: pointer;
  }
  .chip:hover { background: color-mix(in oklch, var(--primary) 15%, var(--card)); }
  .chip:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }

  /* Selected. The fill carries it at a glance; `aria-pressed` carries it for anyone the
     fill doesn't reach, so selection is never encoded by colour alone. */
  .chip.on {
    background: color-mix(in oklch, var(--primary) 88%, var(--card));
    border-color: var(--primary);
    color: var(--primary-foreground, var(--card));
    font-weight: 600;
  }

  /* A chosen "Doesn't matter" is a non-answer: neutral, outlined, not filled. */
  .chip.on.quiet {
    background: transparent;
    border-color: color-mix(in oklch, var(--foreground) 45%, var(--border));
    color: var(--foreground);
    font-weight: 500;
  }

  /* Touch sizing: padding AND type together, not `min-height` alone — a touch control
     rather than a desktop control in a bigger box. Desktop density is left alone. */
  @media (max-width: 40rem) {
    .chip { padding: 0.6rem 0.9rem; font-size: 0.95rem; }
    .chips { gap: 0.6rem; }
  }
</style>
