<script lang="ts">
  import type { Snippet } from 'svelte';
  import { cn } from '$lib/utils/cn.js';
  import { colMin, gapVar, type ColMin, type Gap } from './tokens.js';
  let { min = 'md', gap = 'md', children, class: className = '' }:
    { min?: ColMin; gap?: Gap; children: Snippet; class?: string } = $props();
</script>

<div class={cn('autogrid', className)} style="--col-min: {colMin(min)}; --grid-gap: {gapVar(gap)}">
  {@render children()}
</div>

<style>
  .autogrid {
    display: grid; gap: var(--grid-gap); align-items: stretch; min-width: 0;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, var(--col-min)), 1fr));
  }
  .autogrid > :global([data-full]) { grid-column: 1 / -1; } /* the ONLY supported span */
</style>
