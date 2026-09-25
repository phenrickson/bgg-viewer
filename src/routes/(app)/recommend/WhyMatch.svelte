<script lang="ts">
  /**
   * The full "why": what a seed and a candidate share on the embedding's inputs, in Phil's
   * order — complexity, players, play time, then shared mechanics, categories and families.
   * The comparison itself is `$lib/recommend/why.ts`; this only lays it out.
   *
   * Complexity is the model's PREDICTED complexity, which can differ from the BGG weight a
   * reader knows — hence the note under it.
   */
  import { Button } from '$lib/components/ui/button';
  import ComplexityMeter from '$lib/catalog/encodings/ComplexityMeter.svelte';
  import TagChip, { type TagKind } from '$lib/game/TagChip.svelte';
  import { complexityText, playersText, playtimeText, type Why } from '$lib/recommend/why';

  let { why, seed, other }: { why: Why; seed: string; other: string } = $props();

  /** Chips shown per group before "+n". */
  const CAP = 6;
  let open = $state<Record<string, boolean>>({});

  // PLACEHOLDER copy (Phil): group labels and the complexity note.
  const groups = $derived(
    (
      [
        { key: 'mechanics', label: 'Shared mechanics', kind: 'mech' },
        { key: 'categories', label: 'Shared categories', kind: 'cat' },
        { key: 'families', label: 'Shared families', kind: 'fam' }
      ] as const
    )
      .map((g) => ({ ...g, kind: g.kind as TagKind, tags: why.shared[g.key] }))
      .filter((g) => g.tags.length)
  );
</script>

<div class="why">
  <dl class="traits">
    {#if why.complexity}
      <div>
        <dt>Complexity</dt>
        <dd>
          <span class="val">{complexityText(why.complexity)}</span>
          <span class="meters">
            <span class="mtr"><ComplexityMeter weight={why.complexity.a} width="4.5rem" /><span class="who">{seed}</span></span>
            <span class="mtr"><ComplexityMeter weight={why.complexity.b} width="4.5rem" /><span class="who">{other}</span></span>
          </span>
          <span class="note">PLACEHOLDER: the model's predicted complexity, not BGG's community weight.</span>
        </dd>
      </div>
    {/if}
    {#if why.players}
      <div><dt>Players</dt><dd><span class="val">{playersText(why.players)}</span></dd></div>
    {/if}
    {#if why.playtime}
      <div><dt>Play time</dt><dd><span class="val">{playtimeText(why.playtime)}</span></dd></div>
    {/if}
  </dl>

  {#each groups as g (g.key)}
    <div class="grp">
      <span class="lbl">{g.label}</span>
      <div class="chips">
        {#each open[g.key] ? g.tags : g.tags.slice(0, CAP) as t (t)}<TagChip kind={g.kind} tag={t} />{/each}
        {#if g.tags.length > CAP}
          <Button variant="ghost" size="xs" onclick={() => (open[g.key] = !open[g.key])}>
            {open[g.key] ? 'Show fewer' : `+${g.tags.length - CAP}`}
          </Button>
        {/if}
      </div>
    </div>
  {:else}
    <p class="none">PLACEHOLDER: no mechanics, categories or families in common.</p>
  {/each}
</div>

<style>
  .why { display: flex; flex-direction: column; gap: var(--space-sm); }
  .traits { display: flex; flex-direction: column; gap: 0.5rem; margin: 0; }
  .traits > div { display: grid; grid-template-columns: 6.5rem minmax(0, 1fr); gap: var(--space-sm); align-items: baseline; }
  dt, .lbl {
    font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em;
    font-weight: 600; color: var(--muted-foreground);
  }
  dd { margin: 0; display: flex; flex-direction: column; gap: 0.3rem; min-width: 0; }
  .val { font-size: 0.9rem; font-weight: 600; color: var(--foreground); }
  .meters { display: flex; flex-wrap: wrap; gap: var(--space-md); }
  .mtr { display: inline-flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
  .who {
    font-size: 0.7rem; color: var(--muted-foreground); max-width: 9rem;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .note { font-size: 0.72rem; color: var(--muted-foreground); }
  .grp { display: grid; grid-template-columns: 6.5rem minmax(0, 1fr); gap: var(--space-sm); align-items: baseline; }
  .chips { display: flex; flex-wrap: wrap; gap: 0.35rem; align-items: center; }
  .none { margin: 0; font-size: 0.8rem; color: var(--muted-foreground); }
  @container (max-width: 30rem) {
    .traits > div, .grp { grid-template-columns: minmax(0, 1fr); gap: 0.2rem; }
  }
</style>
