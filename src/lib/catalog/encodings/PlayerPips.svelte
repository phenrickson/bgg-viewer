<script lang="ts">
  /**
   * Best/recommended-at player counts, encoded as the numerals themselves: the community's
   * vote is carried by weight and tint, so the control is self-labelling and needs no legend.
   */
  let { best, recommended }: { best: number[] | null; recommended: number[] | null } = $props();

  /** How many player counts the strip shows before collapsing to "+". */
  const PIP_MAX = 6;

  const list = <T,>(a: T[] | null): T[] => (a ? Array.from(a) : []);
  const b = $derived(list(best));
  const rec = $derived(list(recommended));
  const overflow = $derived(b.concat(rec).some((n) => n > PIP_MAX));

  const title = $derived.by(() => {
    const others = rec.filter((n) => !b.includes(n));
    if (!b.length && !others.length) return 'no player-count votes';
    const parts: string[] = [];
    if (b.length) parts.push(`best at ${b.join(', ')}`);
    if (others.length) parts.push(`also recommended at ${others.join(', ')}`);
    return parts.join('; ');
  });

  /**
   * The pip grid's alternate form — the same best/recommended numbers, as the two or three
   * numerals they actually are rather than seven cells (six numbers plus "+") most of which
   * are muted filler. The grid earns its keep scanned down a table column; alone on a card
   * it was reading as noise, not signal. `.compact`/`.pips` are siblings so a container
   * query at the call site can pick one — see `GameList.svelte`'s narrow-card block.
   */
  const compactText = $derived.by(() => {
    if (b.length) return b.join(', ');
    if (rec.length) return rec.join(', ');
    return '—';
  });
</script>

<span class="c-best" {title}>
  <!-- Numerals styled by vote are a visual encoding; screen readers get the prose. -->
  <span class="vh">{title}</span>
  <span class="pips" aria-hidden="true">
    {#each Array.from({ length: PIP_MAX }, (_, k) => k + 1) as n (n)}
      <span class="pip" class:best={b.includes(n)} class:rec={!b.includes(n) && rec.includes(n)}>{n}</span>
    {/each}
    <span class="pip more" class:vis={overflow}>+</span>
  </span>
  <!-- Hidden by default (`display: none` below) — a plain sibling GameList's narrow rule can
       reveal instead of the grid, not a second interactive control. -->
  <span class="compact" aria-hidden="true">{compactText}</span>
</span>

<style>
  /* `position: relative` is load-bearing, not decoration: without a positioned ancestor the
     absolutely-positioned `.vh` below is laid out against the initial containing block, at
     its *static* position — so the hidden text in row 100 sits ~4,400px down the document and
     is not clipped by the list's own scroll container. A hundred invisible 1px spans then
     stretch `documentElement.scrollHeight` to ~4,700px against a 1,000px viewport, and the
     page gains thousands of pixels of empty scroll below the app. */
  .c-best { position: relative; }
  .vh {
    position: absolute; width: 1px; height: 1px;
    overflow: hidden; clip-path: inset(50%); white-space: nowrap;
  }
  .pips {
    display: flex; gap: 0.1rem; max-width: 7rem; font-variant-numeric: tabular-nums;
  }
  .pip {
    flex: 1; text-align: center; font-size: 0.72rem; line-height: 1.3; border-radius: 3px;
    /* "Not recommended" still has to be *perceivable*, not just dimmer than the rest —
       especially on a light background, where 45% all but disappeared. */
    color: color-mix(in oklch, var(--muted-foreground) 60%, transparent);
  }
  .pip.rec { color: var(--foreground); }
  .pip.best {
    color: var(--primary); font-weight: 750;
    background: color-mix(in oklch, var(--primary) 13%, transparent);
  }
  .pip.more { visibility: hidden; flex: 0 0 0.6rem; }
  .pip.more.vis { visibility: visible; }

  .compact {
    display: none;
    font-size: 0.82rem;
    font-weight: 650;
    color: var(--primary);
    font-variant-numeric: tabular-nums;
  }
</style>
