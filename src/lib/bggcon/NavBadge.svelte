<script lang="ts">
  /**
   * TEMPORARY (BGG.CON 2026). The nav link's badge: "Live" (filled, with a pulsing dot) while
   * the con runs, to draw the eye there; nothing before or after (Phil dropped "Soon"). Re-checks
   * each minute so an open tab flips over on its own. PLACEHOLDER label (Phil).
   */
  import { onMount } from 'svelte';
  import { Badge } from '$lib/components/ui/badge';
  import { conPhase } from './window';

  let phase = $state(conPhase());
  onMount(() => {
    const t = setInterval(() => (phase = conPhase()), 60_000);
    return () => clearInterval(t);
  });
</script>

{#if phase === 'live'}
  <Badge class="nav-badge"><span class="dot" aria-hidden="true"></span>Live</Badge>
{/if}

<style>
  /* Compact: it rides on a nav link and mustn't make that link taller or much wider. */
  :global(.nav-badge) {
    margin-left: 0.3rem;
    height: 1rem;
    font-size: 0.6rem;
    line-height: 1;
    padding: 0 0.35rem;
    gap: 0.25rem;
  }
  .dot {
    width: 0.4rem;
    height: 0.4rem;
    border-radius: 50%;
    background: currentColor;
    animation: pulse 1.6s ease-in-out infinite;
  }
  @keyframes pulse {
    50% { opacity: 0.35; }
  }
  @media (prefers-reduced-motion: reduce) {
    .dot { animation: none; }
  }
</style>
