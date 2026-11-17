<script lang="ts">
  /**
   * The app's loading spinner. It was a local `.spin` style on the Games, BGG.CON library and
   * Home pages (identical but for Home's smaller size); now one component.
   */
  let { size = '0.9rem', label = 'Loading' }: { size?: string; label?: string } = $props();
</script>

<span class="spin" style:width={size} style:height={size} role="status" aria-label={label}></span>

<style>
  .spin {
    display: inline-block;
    flex: none;
    border-radius: 50%;
    border: 2px solid color-mix(in oklch, var(--primary) 35%, var(--border));
    border-top-color: var(--primary);
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .spin {
      animation: none;
    }
  }
</style>
