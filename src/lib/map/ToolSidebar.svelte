<script lang="ts" generics="Id extends string">
  /**
   * A canvas tool's sidebar, in `/map`'s pattern: ONE sidebar whose tabs are its collapsed
   * state. Shut, it is just the tabs, stacked — a few rem wide. Open, the tabs become a row
   * along the top of a card and the lit tab titles the panel, so nothing repeats itself.
   *
   * Not animated: a width transition resizes the canvas on every frame it runs, and each
   * resize repaints every point.
   *
   * Extracted from `/map`'s sidebar markup and CSS for `/dev/genealogy`; the map still carries
   * its own copy (moving it onto this is a mechanical follow-up — see the 2026-11-11
   * genealogy presentation spec).
   */
  import type { Snippet } from 'svelte';

  let {
    tabs,
    panel = $bindable(null),
    children
  }: {
    tabs: { id: Id; label: string; badge?: number }[];
    /** The open tab; null = shut. */
    panel?: Id | null;
    children: Snippet<[Id]>;
  } = $props();

  const toggle = (id: Id) => (panel = panel === id ? null : id);
</script>

<aside class="side" class:open={panel !== null}>
  <div class="tabs">
    {#each tabs as t (t.id)}
      <button type="button" class="tab" class:on={panel === t.id} aria-expanded={panel === t.id} onclick={() => toggle(t.id)}>
        <span>{t.label}</span>
        {#if t.badge}<span class="badge">{t.badge}</span>{/if}
      </button>
    {/each}
    {#if panel !== null}
      <button type="button" class="close" onclick={() => (panel = null)} aria-label="Close">×</button>
    {/if}
  </div>
  {#if panel !== null}
    <div class="panel-body">{@render children(panel)}</div>
  {/if}
</aside>

<style>
  .side {
    display: flex; flex-direction: column; gap: var(--space-sm);
    min-height: 0; width: max-content;
  }
  .side.open {
    width: 17rem;
    border: 1px solid var(--border); border-radius: var(--radius);
    background: var(--card);
    gap: 0;
  }

  .tabs { display: flex; flex-direction: column; gap: 0.4rem; }
  .side.open .tabs {
    flex-direction: row; align-items: center; gap: 0.35rem;
    padding: 0.4rem; border-bottom: 1px solid var(--border);
  }
  .side.open .tab { flex: 1 1 auto; justify-content: center; }

  .tab {
    display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;
    padding: 0.45rem 0.7rem;
    border: 1px solid var(--border); border-radius: var(--radius);
    background: var(--card); color: var(--muted-foreground);
    font: inherit; font-size: 0.8rem; text-align: left; cursor: pointer;
  }
  .tab:hover { color: var(--foreground); }
  .tab.on { color: var(--foreground); border-color: var(--primary); background: var(--muted); }
  .tab:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }

  .badge {
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 1rem; height: 1rem; padding: 0 0.25rem; border-radius: 999px;
    background: var(--primary); color: var(--primary-foreground);
    font-size: 0.65rem; font-weight: 700;
  }

  .close {
    border: 0; background: none; padding: 0 0.3rem; cursor: pointer;
    color: var(--muted-foreground); font-size: 1rem; line-height: 1;
  }
  .close:hover { color: var(--foreground); }

  .panel-body { overflow-y: auto; min-height: 0; padding: 0 var(--space-md) var(--space-md); }
</style>
