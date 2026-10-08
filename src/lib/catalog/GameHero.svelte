<script lang="ts">
  /**
   * One game shown large: its art beside its name, a meta line, the actions you can take on
   * it, then whatever the caller wants to say about it. For the moments a page puts a single
   * game forward — Recommend's Surprise pick and "Pick one for me".
   *
   * The shell only. What goes in `meta` (year, badges, shelf status), `actions` (buttons) and
   * `children` (a "why", a description) is the caller's.
   *
   * `onclose` adds a × in the corner, for a hero that sits over other content and can be
   * dismissed.
   *
   * The art is usually BGG's thumbnail (~200px on its long side), so it sits on the left at
   * its own size and the space goes to the text beside it. Stacks only when the hero itself
   * is too narrow for both (a container query, not the viewport).
   */
  import type { Snippet } from 'svelte';

  let {
    href,
    name,
    image = null,
    meta,
    actions,
    children,
    onclose
  }: {
    href: string;
    name: string;
    /** The largest art the caller has — the catalog's thumbnail, or a game document's image. */
    image?: string | null;
    meta?: Snippet;
    actions?: Snippet;
    children?: Snippet;
    onclose?: () => void;
  } = $props();
</script>

<section class="hero" aria-label={name}>
  {#if onclose}
    <button type="button" class="close" aria-label="Close" onclick={onclose}>×</button>
  {/if}
  <div class="row">
    <a class="art" {href} tabindex="-1" aria-hidden="true">
      {#if image}<img src={image} alt="" decoding="async" />{/if}
    </a>
    <div class="body">
      <h2><a {href}>{name}</a></h2>
      {#if meta}<div class="meta">{@render meta()}</div>{/if}
      {#if actions}<div class="actions">{@render actions()}</div>{/if}
      {#if children}<div class="more">{@render children()}</div>{/if}
    </div>
  </div>
</section>

<style>
  .hero {
    position: relative;
    padding: var(--space-lg);
    border: 1px solid var(--border);
    border-radius: calc(var(--radius) + 2px);
    background: var(--card);
    container-type: inline-size;
  }
  .close {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    width: 2rem;
    height: 2rem;
    border: none;
    border-radius: 8px;
    background: none;
    color: var(--muted-foreground);
    font: inherit;
    font-size: 1.2rem;
    line-height: 1;
    cursor: pointer;
  }
  .close:hover {
    background: var(--muted);
    color: var(--foreground);
  }
  .close:focus-visible {
    outline: 2px solid var(--primary);
  }
  .row {
    display: flex;
    align-items: flex-start;
    gap: var(--space-lg);
  }
  /* Left, at its own shape, never scaled past the thumbnail's size. */
  .art {
    flex: none;
    width: 12.5rem;
    display: flex;
    justify-content: center;
  }
  .art img {
    max-width: 100%;
    max-height: 12.5rem;
    width: auto;
    height: auto;
    border-radius: 6px;
    display: block;
  }
  @container (max-width: 32rem) {
    .row { flex-direction: column; gap: var(--space-md); }
    .art { width: auto; justify-content: flex-start; }
    .art img { max-height: 9rem; }
  }
  .body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    min-width: 0;
  }
  h2 {
    font-size: clamp(1.5rem, 1rem + 2.5cqi, 2.4rem);
    font-weight: 750;
    letter-spacing: -0.03em;
    line-height: 1.05;
    margin: 0;
    padding-right: 2rem;
    text-wrap: balance;
  }
  h2 a {
    color: inherit;
    text-decoration: none;
  }
  h2 a:hover {
    color: var(--primary);
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem 0.8rem;
    color: var(--muted-foreground);
    font-size: 0.95rem;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-sm);
  }
  .more {
    margin-top: var(--space-sm);
  }
</style>
