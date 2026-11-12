<script lang="ts">
  /**
   * One neighbour in a "similar games" list: art, name and year, then two badges — how
   * *alike* it is, and how *well-rated* it is.
   *
   * Lifted out of the game-detail page's "Similar games" card when the Recommend tool became
   * the second page to list neighbours, so a match reads the same on both. The badges are
   * `SimBadges`, shared with `GameTile`.
   *
   * `children`, when given, is a second line under the name — Recommend's one-line "why".
   * `action`, when given, sits after the badges, outside the link, so it can be a control of
   * its own (Recommend's "Why?") without nesting interactive elements.
   * `middle`, when given, fills the space between the name and the badges, also outside the
   * link (Recommend's shared tags, which are links of their own).
   */
  import type { Snippet } from 'svelte';
  import SimBadges from './SimBadges.svelte';

  let {
    href,
    name,
    year = null,
    thumbnail = null,
    similarity = null,
    rating = null,
    children,
    action,
    middle,
    onopen,
    expanded
  }: {
    href: string;
    name: string;
    year?: number | null;
    thumbnail?: string | null;
    /** Left out where there's no seed to be similar to (the BGG.CON library list). */
    similarity?: number | null;
    rating?: number | null;
    children?: Snippet;
    action?: Snippet;
    middle?: Snippet;
    /** Makes the art and name a button that calls this, instead of a link to `href`. */
    onopen?: () => void;
    /** With `onopen`: whether what it opens is open. */
    expanded?: boolean;
  } = $props();
</script>

<!-- With `onopen`, the whole row opens (not just the art and name): a click anywhere outside
     its own links and buttons calls it. Keyboard users reach the same thing through the
     art-and-name button, so the row itself needs no key handling. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
  class="row"
  class:whole={!!onopen}
  onclick={onopen ? (e) => !(e.target as Element).closest('a, button') && onopen() : undefined}
>
  <svelte:element
    this={onopen ? 'button' : 'a'}
    class="main"
    href={onopen ? undefined : href}
    type={onopen ? 'button' : undefined}
    role={onopen ? 'button' : undefined}
    onclick={onopen}
    aria-expanded={onopen ? !!expanded : undefined}
  >
    {#if thumbnail}
      <img class="mono" src={thumbnail} alt="" loading="lazy" />
    {:else}
      <span class="mono ph">{name?.[0] ?? '?'}</span>
    {/if}
    <span class="txt">
      <span class="nmw"><span class="nm">{name}</span> {#if year}<span class="yr">{year}</span>{/if}</span>
      {#if children}<span class="sub">{@render children()}</span>{/if}
    </span>
  </svelte:element>
  {#if middle}<span class="mid">{@render middle()}</span>{/if}
  <span class="end"><SimBadges {similarity} {rating} />{#if action}{@render action()}{/if}</span>
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    padding: 0.45rem 0.6rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--background);
    min-width: 0;
  }
  .row.whole { cursor: pointer; }
  .row.whole:hover,
  .row:has(.main:hover) {
    border-color: var(--primary);
  }
  /* The link covers the art and the name; the badges and any action sit beside it. */
  .main {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.65rem;
    text-decoration: none;
    color: inherit;
  }
  button.main {
    border: none;
    background: none;
    padding: 0;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .main:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 3px;
    border-radius: 4px;
  }
  /* Shared footprint for the real thumbnail and the initials placeholder, so a row never
     shifts size once a (fire-and-forget, non-blocking) thumbnail lookup resolves. */
  .mono {
    width: 2rem;
    height: 2rem;
    border-radius: 6px;
    background: var(--muted);
    flex: none;
    object-fit: cover;
  }
  .mono.ph {
    display: grid;
    place-items: center;
    font-weight: 700;
    font-size: 0.9rem;
    color: var(--muted-foreground);
  }
  .txt {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }
  .nmw,
  .sub {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .nm {
    font-weight: 600;
    font-size: 0.9rem;
  }
  .main:hover .nm {
    color: var(--primary);
  }
  .yr {
    color: var(--muted-foreground);
    font-size: 0.78rem;
  }
  .sub {
    color: var(--muted-foreground);
    font-size: 0.74rem;
  }
  /* With a middle, the name takes a fixed slot, so every row's middle starts at the same place
     and reads as a column down the list (a long name ends in "…", as it does anyway). */
  .row:has(> .mid) .main {
    flex: 0 0 min(18rem, 45%);
  }
  .mid {
    flex: 1 1 0;
    min-width: 0;
  }
  .end {
    margin-left: auto;
    flex: none;
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
</style>
