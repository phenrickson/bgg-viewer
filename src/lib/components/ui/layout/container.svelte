<script lang="ts">
  /**
   * Bounds a region to a readable measure and centres it. The fourth layout primitive,
   * alongside `Stack` / `AutoGrid` / `Split`.
   *
   * Every page was answering "how wide should this get?" privately, in its own scoped styles —
   * the landing capped itself at 52rem, the detail page not at all, Explore not at all until a
   * 2,500px window made a row unreadable. Three different answers to one question, none of
   * them findable from the others. The widths are now named in `tokens.ts` and chosen here.
   *
   * (Avoid writing a literal style/script tag in this comment — Svelte's parser reads one as
   * the start of that block and reports the script as never closed.)
   *
   * `fill` switches to the fill-height archetype: the region takes the definite height the app
   * shell gives it and becomes a flex column, so a child can own its own scrolling (Explore's
   * rail and list) instead of the page growing to fit its tallest panel.
   *
   * NB the class is `.measured`, not `.container` — Tailwind ships a global `.container`
   * utility that would silently win over a scoped rule of the same name.
   */
  import type { Snippet } from 'svelte';
  import { cn } from '$lib/utils/cn.js';
  import { measure, type Measure } from './tokens.js';

  let {
    size = 'content',
    fill = false,
    children,
    class: className = ''
  }: { size?: Measure; fill?: boolean; children: Snippet; class?: string } = $props();
</script>

<div class={cn('measured', fill && 'fill', className)} style="--measure: {measure(size)}">
  {@render children()}
</div>

<style>
  .measured {
    width: 100%;
    min-width: 0;
    max-width: var(--measure);
    margin-inline: auto;
  }
  .fill {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
</style>
