<script lang="ts" module>
  export type DialChip = { label: string; on: boolean; onclick: () => void; ariaLabel?: string };
</script>

<script lang="ts">
  /**
   * One of Discover's questions: the question as content, in the landing page's voice, with
   * its answers as chips beneath it. A question, not a field label — these were once
   * `.try`-style uppercase eyebrows ("CATEGORIES", "PLAYERS"), which read as a filing system
   * and turned the page into a filter toolbar.
   *
   * Stateless: each chip says whether it's on and what clicking it does. `DialStrip` builds its
   * four questions from this; Recommend's "Where from?" is one more.
   */
  let { id, question, chips }: { id: string; question: string; chips: DialChip[] } = $props();
</script>

<div class="row">
  <p class="q" {id}>{question}</p>
  <div class="chips" role="group" aria-labelledby={id}>
    {#each chips as c (c.label)}
      <button
        type="button"
        class="chip"
        class:on={c.on}
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

  /* Touch sizing: padding AND type together, not `min-height` alone — a touch control
     rather than a desktop control in a bigger box. Desktop density is left alone. */
  @media (max-width: 40rem) {
    .chip { padding: 0.6rem 0.9rem; font-size: 0.95rem; }
    .chips { gap: 0.6rem; }
  }
</style>
