<script lang="ts">
  /**
   * The warm gap: what runs down the foot of the landing page while the catalog loads.
   *
   * Sections alternate chart → game → chart, so scrolling gives you something different each
   * time rather than a wall of one kind. They are stacked at a wider measure than the hero
   * copy, because a 52rem reading column is the wrong width for a plot.
   *
   * Not hidden once the catalog is ready. These are decent landing content either way, and
   * pulling them out on load would collapse the page under whoever is reading it — at exactly
   * the moment they were told everything is now ready.
   *
   * Copy is PLACEHOLDER — Phil writes the final strings.
   */
  import VizOfTheDay from './VizOfTheDay.svelte';
  import FeaturedGame from './FeaturedGame.svelte';
  import { pick } from './rotation';
  import type { LandingContent } from './types';

  /**
   * `slots`: how many sections to show, in the fixed order chart → game → chart → game.
   * Four filled a twenty-second wait. Now that the catalog arrives in a few seconds and the
   * landing page leads with screenshots of the app, two is enough — one chart, one game —
   * and four made the foot of the page longer than the page.
   */
  let { content, day, slots = 4 }: { content: LandingContent; day: number; slots?: number } = $props();

  // One offset per slot, so strolling one section never shuffles the others under the reader.
  let steps = $state([0, 0, 0, 0]);

  /**
   * Four slots, alternating chart and game. The `+n` seeds mean the two chart slots never
   * open on the same viz and the two game slots never on the same game — the rotation is a
   * single day index, so without an offset every slot of a kind would show the identical
   * thing.
   */
  const viz1 = $derived(pick(content.vizzes, day, steps[0]));
  const game1 = $derived(pick(content.featured, day, steps[1]));
  const viz2 = $derived(pick(content.vizzes, day, steps[2] + 1));
  const game2 = $derived(pick(content.featured, day, steps[3] + 1));

  const step = (i: number, by: number) => (steps[i] += by);
</script>

<div class="gap">
  {#if viz1}
    <VizOfTheDay viz={viz1} eyebrow="Chart of the day"
      onprev={() => step(0, -1)} onnext={() => step(0, 1)} />
  {/if}

  {#if slots > 1 && game1}
    <FeaturedGame game={game1} eyebrow="Featured game"
      onprev={() => step(1, -1)} onnext={() => step(1, 1)} />
  {/if}

  {#if slots > 2 && viz2 && content.vizzes.length > 1}
    <VizOfTheDay viz={viz2} eyebrow="Also worth a look"
      onprev={() => step(2, -1)} onnext={() => step(2, 1)} />
  {/if}

  {#if slots > 3 && game2 && content.featured.length > 1}
    <FeaturedGame game={game2} eyebrow="And one more"
      onprev={() => step(3, -1)} onnext={() => step(3, 1)} />
  {/if}
</div>

<style>
  /* Generous rhythm — these are destinations you scroll to, not rows in a list. */
  .gap { display: flex; flex-direction: column; gap: clamp(2.5rem, 5vw, 4.5rem); }

  /* The reveal is defined here rather than in each section so the two share one motion.
     `reveal.ts` never adds `reveal-pending` when the user asked for reduced motion, so those
     elements start visible and no transition ever runs. */
  .gap :global(.reveal-pending) { opacity: 0; transform: translateY(14px); }
  .gap :global(.revealed) {
    opacity: 1; transform: none;
    transition: opacity .5s ease, transform .5s cubic-bezier(0.22, 1, 0.36, 1);
  }
</style>
