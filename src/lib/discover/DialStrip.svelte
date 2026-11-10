<script lang="ts">
  /**
   * Discover's four questions. Deliberately chips, not a rail: the point of this page is
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
    bandPatch,
    PLAYTIME_CHIPS,
    isPlaytimeOn,
    playtimePatch
  } from './dials';
  import DialRow from './DialRow.svelte';
  import { AutoGrid } from '$lib/components/ui/layout';

  let { scope, onpatch }: { scope: Scope; onpatch: (patch: Partial<Scope>) => void } = $props();
</script>

<!-- Two questions to a row where there's room, so they fill the page's width (the page read
     as hugging the left with four short chip rows stacked down it); one to a row on a phone.
     Each rises in a beat after the one before, after the page's heading. -->
<AutoGrid min="xl" gap="lg">
  <div class="rise-in" style="--rise-i: 1">
    <DialRow
      id="dial-cat"
      question="What kind of game?"
      chips={CATEGORY_CHIPS.map((c) => ({
        label: c.label,
        on: isCategoryOn(scope, c),
        onclick: () => onpatch(toggleCategory(scope, c))
      }))}
    />
  </div>
  <div class="rise-in" style="--rise-i: 2">
    <DialRow
      id="dial-players"
      question="How many players?"
      chips={PLAYER_CHIPS.map((p) => ({
        label: p.label,
        on: scope.bestAt === p.bestAt,
        ariaLabel: `Best at ${p.bestAt} players`,
        onclick: () => onpatch({ bestAt: scope.bestAt === p.bestAt ? null : p.bestAt })
      }))}
    />
  </div>
  <div class="rise-in" style="--rise-i: 3">
    <DialRow
      id="dial-weight"
      question="How complex?"
      chips={COMPLEXITY_BANDS.map((b) => ({
        label: b.label,
        on: isBandOn(scope, b),
        onclick: () => onpatch(bandPatch(scope, b))
      }))}
    />
  </div>
  <div class="rise-in" style="--rise-i: 4">
    <DialRow
      id="dial-time"
      question="How long do you have?"
      chips={PLAYTIME_CHIPS.map((t) => ({
        label: t.label,
        on: isPlaytimeOn(scope, t),
        onclick: () => onpatch(playtimePatch(scope, t))
      }))}
    />
  </div>
</AutoGrid>

