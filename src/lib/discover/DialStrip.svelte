<script lang="ts">
  /**
   * Discover's three questions. Deliberately chips, not a rail: the point of this page is
   * that every option is visible at once and none of them is a text field, a slider, or a
   * combo box. The visual language is lifted from the landing page's "Try a query" chips so
   * arriving here from the front door feels like the same room.
   *
   * Stateless — it renders the scope it is given and reports the patch for what was clicked.
   */
  import type { Scope } from '$lib/catalog/scope';
  import {
    CATEGORY_CHIPS,
    PLAYER_CHIPS,
    COMPLEXITY_BANDS,
    toggleCategory,
    isCategoryOn,
    isBandOn,
    bandPatch
  } from './dials';

  let { scope, onpatch }: { scope: Scope; onpatch: (patch: Partial<Scope>) => void } = $props();
</script>

<div class="strip">
  <div class="row">
    <p class="label" id="dial-cat">Categories</p>
    <div class="chips" role="group" aria-labelledby="dial-cat">
      {#each CATEGORY_CHIPS as c (c.label)}
        {@const on = isCategoryOn(scope, c)}
        <button
          type="button"
          class="chip"
          class:on
          aria-pressed={on}
          onclick={() => onpatch(toggleCategory(scope, c))}
        >{c.label}</button>
      {/each}
    </div>
  </div>

  <div class="row">
    <p class="label" id="dial-players">Players</p>
    <div class="chips" role="group" aria-labelledby="dial-players">
      {#each PLAYER_CHIPS as p (p.bestAt)}
        {@const on = scope.bestAt === p.bestAt}
        <button
          type="button"
          class="chip num"
          class:on
          aria-pressed={on}
          aria-label="Best at {p.label} players"
          onclick={() => onpatch({ bestAt: on ? null : p.bestAt })}
        >{p.label}</button>
      {/each}
    </div>
  </div>

  <div class="row">
    <p class="label" id="dial-weight">Complexity</p>
    <div class="chips" role="group" aria-labelledby="dial-weight">
      {#each COMPLEXITY_BANDS as b (b.label)}
        {@const on = isBandOn(scope, b)}
        <button
          type="button"
          class="chip"
          class:on
          aria-pressed={on}
          onclick={() => onpatch(bandPatch(scope, b))}
        >{b.label}</button>
      {/each}
    </div>
  </div>
</div>

<style>
  .strip { display: flex; flex-direction: column; gap: var(--space-md); }
  .row { display: flex; flex-direction: column; gap: 0.45rem; }

  /* Matches the landing page's `.try` eyebrow exactly. */
  .label {
    font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--muted-foreground); font-weight: 600; margin: 0;
  }

  .chips { display: flex; flex-wrap: wrap; gap: 0.5rem; }

  /* Matches the landing page's `.chip`, as a button rather than a link. */
  .chip {
    font: inherit; font-size: 0.85rem; padding: 0.4rem 0.75rem; border-radius: 999px;
    border: 1px solid color-mix(in oklch, var(--primary) 35%, var(--border));
    color: var(--primary);
    background: color-mix(in oklch, var(--primary) 8%, var(--card));
    cursor: pointer;
  }
  .chip:hover { background: color-mix(in oklch, var(--primary) 15%, var(--card)); }
  .chip:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }

  /* Selected. The fill carries it at a glance; `aria-pressed` carries it for anyone the
     fill doesn't reach, so selection is never encoded by colour alone. */
  .chip.on {
    background: color-mix(in oklch, var(--primary) 88%, var(--card));
    border-color: var(--primary);
    color: var(--primary-foreground, var(--card));
    font-weight: 600;
  }

  /* Single digits look accidental at chip width unless given a floor. */
  .num { min-width: 2.75rem; text-align: center; }
</style>
