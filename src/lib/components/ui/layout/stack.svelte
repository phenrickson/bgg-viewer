<script lang="ts">
  import type { Snippet } from 'svelte';
  import { cn } from '$lib/utils/cn.js';
  import { gapVar, type Gap } from './tokens.js';
  let { gap = 'md', children, class: className = '' }:
    { gap?: Gap; children: Snippet; class?: string } = $props();
</script>

<div class={cn('stack', className)} style="--stack-gap: {gapVar(gap)}">{@render children()}</div>

<style>
  .stack { display: flex; flex-direction: column; gap: var(--stack-gap); min-width: 0; }
</style>
