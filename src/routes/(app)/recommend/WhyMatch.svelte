<script lang="ts">
  /**
   * The full "why", side by side: the seed and a candidate in two columns, on the embedding's
   * own inputs, in Phil's order — complexity, players, play time, then mechanics, categories
   * and families. Tags both games have come first in each column, in full colour; a tag only
   * one has is `quiet`. Complexity is one 1–5 scale with both games marked on it, so how close
   * they are reads at a glance. The comparison itself is `$lib/recommend/why.ts`; this only
   * lays it out.
   *
   * Complexity is the model's PREDICTED complexity, which can differ from the BGG weight a
   * reader knows — hence the note under it.
   */
  import { Button } from '$lib/components/ui/button';
  import TagChip, { type TagKind } from '$lib/game/TagChip.svelte';
  import { complexityText, playersText, playtimeText, type Why, type SideTag, type Span } from '$lib/recommend/why';
  import { formatMinutes } from '$lib/catalog/playtime';

  let { why, seed, other }: { why: Why; seed: string; other: string } = $props();

  /** Chips shown per side before "+n". */
  const CAP = 6;
  let open = $state<Record<string, boolean>>({});

  // PLACEHOLDER copy (Phil): row labels and the complexity note.
  const groups = $derived(
    (
      [
        { key: 'mechanics', label: 'Mechanics', kind: 'mech' },
        { key: 'categories', label: 'Categories', kind: 'cat' },
        { key: 'families', label: 'Families', kind: 'fam' }
      ] as const
    )
      .map((g) => ({ ...g, kind: g.kind as TagKind, ...why.sides[g.key], shared: why.shared[g.key].length }))
      .filter((g) => g.a.length || g.b.length)
  );

  const span = ([lo, hi]: Span, f: (n: number) => string = String) => (lo === hi ? f(lo) : `${f(lo)}–${f(hi)}`);
  /** Where a 1–5 complexity sits along the scale, as a percentage. */
  const at = (w: number) => `${((Math.min(5, Math.max(1, w)) - 1) / 4) * 100}%`;
</script>

{#snippet side(tags: SideTag[], kind: TagKind, key: string)}
  <div class="chips">
    {#each open[key] ? tags : tags.slice(0, CAP) as t (t.tag)}<TagChip {kind} tag={t.tag} quiet={!t.shared} />{/each}
    {#if tags.length > CAP}
      <Button variant="ghost" size="xs" onclick={() => (open[key] = !open[key])}>
        {open[key] ? 'Show fewer' : `+${tags.length - CAP}`}
      </Button>
    {/if}
    {#if !tags.length}<span class="none">—</span>{/if}
  </div>
{/snippet}

<div class="cmp">
  <span></span>
  <b class="who">{seed}</b>
  <b class="who">{other}</b>

  {#if why.complexity}
    {@const c = why.complexity}
    <span class="lbl">Complexity</span>
    <div class="scale-cell">
      <div class="scale" role="img" aria-label="Complexity: {seed} {c.a.toFixed(1)}, {other} {c.b.toFixed(1)}, on a 1 to 5 scale">
        <span class="track"></span>
        <span class="mark a" style:left={at(c.a)}></span>
        <span class="mark b" style:left={at(c.b)}></span>
      </div>
      <div class="ends">
        <span>1 Light</span>
        <span class="val">{complexityText(c)}</span>
        <span>5 Heavy</span>
      </div>
      <span class="note">PLACEHOLDER: the model's predicted complexity, not BGG's community weight.</span>
    </div>
  {/if}

  {#if why.players}
    {@const p = why.players}
    <span class="lbl">Players</span>
    <span class:match={!!p.overlap}>{span(p.a)}</span>
    <span class:match={!!p.overlap}>{span(p.b)} <span class="aside">{playersText(p)}</span></span>
  {/if}

  {#if why.playtime}
    {@const t = why.playtime}
    <span class="lbl">Play time</span>
    <span class:match={!!t.overlap}>{span(t.a, formatMinutes)}</span>
    <span class:match={!!t.overlap}>{span(t.b, formatMinutes)} <span class="aside">{playtimeText(t)}</span></span>
  {/if}

  {#each groups as g (g.key)}
    <span class="lbl">{g.label}{#if g.shared}<span class="count">{g.shared} shared</span>{/if}</span>
    {@render side(g.a, g.kind, `${g.key}-a`)}
    {@render side(g.b, g.kind, `${g.key}-b`)}
  {/each}
</div>

<style>
  .cmp {
    display: grid;
    grid-template-columns: 7rem minmax(0, 1fr) minmax(0, 1fr);
    column-gap: var(--space-md);
    row-gap: 0.75rem;
    align-items: baseline;
    font-size: 0.88rem;
  }
  .who {
    font-weight: 650;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .lbl {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    font-size: 0.82rem;
    color: var(--muted-foreground);
  }
  .count { font-size: 0.72rem; }
  .match { color: var(--foreground); font-weight: 600; }
  .aside { margin-left: 0.4rem; font-size: 0.78rem; font-weight: 400; color: var(--muted-foreground); }
  .chips { display: flex; flex-wrap: wrap; gap: 0.35rem; align-items: center; min-width: 0; }
  .none { color: var(--muted-foreground); }

  /* One scale for both games: the seed a filled dot, the match a ring. */
  .scale-cell { grid-column: span 2; display: flex; flex-direction: column; gap: 0.3rem; }
  .scale { position: relative; height: 1.1rem; }
  .track {
    position: absolute; left: 0; right: 0; top: 50%; height: 2px; margin-top: -1px;
    background: var(--border); border-radius: 2px;
  }
  .mark {
    position: absolute; top: 50%; width: 0.85rem; height: 0.85rem; margin: -0.425rem 0 0 -0.425rem;
    border-radius: 50%; box-sizing: border-box;
  }
  .mark.a { background: var(--foreground); }
  .mark.b { border: 2px solid var(--foreground); background: var(--card); }
  .ends { display: flex; justify-content: space-between; gap: var(--space-sm); font-size: 0.72rem; color: var(--muted-foreground); }
  .val { color: var(--foreground); font-weight: 600; }
  .note { font-size: 0.72rem; color: var(--muted-foreground); }

  /* Narrow: each row stacks — label, then the two sides. */
  @container (max-width: 34rem) {
    .cmp { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
    .cmp > span:first-child { display: none; }
    .lbl { grid-column: 1 / -1; flex-direction: row; gap: 0.5rem; }
    .scale-cell { grid-column: 1 / -1; }
  }
</style>
