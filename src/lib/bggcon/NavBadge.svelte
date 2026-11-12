<script lang="ts">
  /**
   * TEMPORARY (BGG.CON 2026). The nav link's badge: "Soon" before the con, "Live" (filled, with a
   * pulsing dot) while it runs, nothing after. Re-checks each minute so an open tab flips over
   * on its own. PLACEHOLDER labels (Phil).
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
{:else if phase === 'soon'}
  <Badge variant="outline" class="nav-badge">Soon</Badge>
{/if}

<style>
  :global(.nav-badge) {
    margin-left: 0.35rem;
    font-size: 0.65rem;
    padding: 0 0.4rem;
    gap: 0.3rem;
    vertical-align: middle;
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
