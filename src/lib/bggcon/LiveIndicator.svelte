<script lang="ts">
  /**
   * TEMPORARY (BGG.CON 2026). A pulsing dot before the nav's BGG.CON while the con runs, to draw
   * the eye there; nothing before or after. No pill and no text, and in front of the label so it
   * reads as a status light rather than part of the menu's caret (Phil). Re-checks each minute so
   * an open tab picks it up on its own.
   */
  import { onMount } from 'svelte';
  import { conPhase } from './window';

  let phase = $state(conPhase());
  onMount(() => {
    const t = setInterval(() => (phase = conPhase()), 60_000);
    return () => clearInterval(t);
  });
</script>

{#if phase === 'live'}
  <span class="dot"><span class="sr-only">(happening now)</span></span>
{/if}

<style>
  .dot {
    display: inline-block;
    width: 0.4rem;
    height: 0.4rem;
    margin-right: 0.35rem;
    vertical-align: middle;
    border-radius: 50%;
    background: var(--primary);
    animation: pulse 1.6s ease-in-out infinite;
  }
  @keyframes pulse {
    50% { opacity: 0.35; }
  }
  @media (prefers-reduced-motion: reduce) {
    .dot { animation: none; }
  }
</style>
