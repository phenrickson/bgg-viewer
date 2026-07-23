<script lang="ts">
  import type { Snippet } from 'svelte';
  import { cn } from '$lib/utils/cn.js';
  import { splitBasis, type SplitRatio, type SplitAt } from './tokens.js';
  let { ratio = 'aside-narrow', side = 'start', at = 'md', aside, main, class: className = '' }:
    { ratio?: SplitRatio; side?: 'start' | 'end'; at?: SplitAt; aside: Snippet; main: Snippet; class?: string } = $props();
</script>

<div class={cn('split', className)} style="--aside-basis: {splitBasis(ratio)}">
  <div class="split-inner at-{at} side-{side}">
    <div class="aside">{@render aside()}</div>
    <div class="main">{@render main()}</div>
  </div>
</div>

<style>
  .split { container-type: inline-size; }
  .split-inner { display: flex; flex-direction: column; gap: var(--space-md); }
  .split-inner > .aside, .split-inner > .main { min-width: 0; }
  @container (min-width: 35rem) {
    .at-md { flex-direction: row; }
    .at-md > .aside { flex: 0 0 var(--aside-basis); }
    .at-md > .main { flex: 1; }
    .at-md.side-end > .aside { order: 2; }
  }
</style>
