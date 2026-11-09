<script lang="ts">
  /**
   * The full "why", side by side: the matched game and the game you started from, each heading
   * its own column (thumbnail + name), on the embedding's own inputs in Phil's order —
   * complexity, players, play time, then mechanics, categories and families.
   *
   * The matched game comes first, because it's the game the card or tile is about. Each row's
   * label carries the verdict for the pair ("close", "both play 2–4", "1 shared"), so a summary
   * never sits in one game's column. Shared tags are filled and listed first in each column;
   * the rest are plain. The comparison itself is `$lib/recommend/why.ts`; this only lays it out.
   *
   * Complexity is the model's PREDICTED complexity, which can differ from the BGG weight a
   * reader knows — hence the ⓘ on its label.
   */
  import { Button } from '$lib/components/ui/button';
  import TagChip, { type TagKind } from '$lib/game/TagChip.svelte';
  import { playersText, playtimeText, type Why, type SideTag, type Span } from '$lib/recommend/why';
  import { formatMinutes } from '$lib/catalog/playtime';

  let {
    why,
    seed,
    other,
    seedImage = null,
    otherImage = null
  }: {
    /** `explain(seed, other)`: side `a` is the seed, side `b` the matched game. */
    why: Why;
    seed: string;
    other: string;
    seedImage?: string | null;
    otherImage?: string | null;
  } = $props();

  /** Chips shown per side before "+n". */
  const CAP = 6;
  let open = $state<Record<string, boolean>>({});

  // PLACEHOLDER copy (Phil): row labels, verdicts and the complexity note.
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
  const complexityVerdict = (c: NonNullable<Why['complexity']>) =>
    c.close ? 'close' : `${Math.abs(c.a - c.b).toFixed(1)} apart`;
</script>

{#snippet side(tags: SideTag[], kind: TagKind, key: string)}
  <div class="chips">
    {#each open[key] ? tags : tags.slice(0, CAP) as t (t.tag)}<TagChip {kind} tag={t.tag} quiet={!t.shared} filled={t.shared} />{/each}
    {#if tags.length > CAP}
      <Button variant="ghost" size="xs" onclick={() => (open[key] = !open[key])}>
        {open[key] ? 'Show fewer' : `+${tags.length - CAP}`}
      </Button>
    {/if}
    {#if !tags.length}<span class="none">none</span>{/if}
  </div>
{/snippet}

{#snippet head(name: string, image: string | null)}
  <span class="who">
    {#if image}<img src={image} alt="" decoding="async" />{:else}<span class="ph"></span>{/if}
    <b>{name}</b>
  </span>
{/snippet}

<div class="cmp">
  <span></span>
  {@render head(other, otherImage)}
  {@render head(seed, seedImage)}

  {#if why.complexity}
    {@const c = why.complexity}
    <span class="lbl">
      <span class="lbl-row">
        Complexity
        <button type="button" class="info" aria-label="About complexity" aria-describedby="why-cx-note">
          i<span class="tip" role="tooltip" id="why-cx-note">PLACEHOLDER: the model's predicted complexity, not BGG's community weight.</span>
        </button>
      </span>
      <span class="verdict">{complexityVerdict(c)}</span>
    </span>
    <span class="val">{c.b.toFixed(1)}</span>
    <span class="val">{c.a.toFixed(1)}</span>
  {/if}

  {#if why.players}
    {@const p = why.players}
    <span class="lbl">Players<span class="verdict">{p.overlap ? playersText(p) : 'no overlap'}</span></span>
    <span class="val">{span(p.b)}</span>
    <span class="val">{span(p.a)}</span>
  {/if}

  {#if why.playtime}
    {@const t = why.playtime}
    <span class="lbl">Play time<span class="verdict">{t.overlap ? playtimeText(t) : 'no overlap'}</span></span>
    <span class="val">{span(t.b, formatMinutes)}</span>
    <span class="val">{span(t.a, formatMinutes)}</span>
  {/if}

  {#each groups as g (g.key)}
    <span class="lbl">{g.label}{#if g.shared}<span class="verdict">{g.shared} shared</span>{/if}</span>
    {@render side(g.b, g.kind, `${g.key}-b`)}
    {@render side(g.a, g.kind, `${g.key}-a`)}
  {/each}
</div>

<style>
  .cmp {
    display: grid;
    grid-template-columns: 7.5rem minmax(0, 1fr) minmax(0, 1fr);
    column-gap: var(--space-md);
    row-gap: 0.85rem;
    align-items: start;
    font-size: 0.88rem;
  }
  .who {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    padding-bottom: 0.4rem;
    border-bottom: 1px solid var(--border);
  }
  .who img,
  .who .ph {
    flex: none;
    width: 1.6rem;
    height: 1.25rem;
    object-fit: cover;
    border-radius: 3px;
    background: var(--muted);
  }
  .who b {
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
  .lbl-row { display: inline-flex; align-items: center; gap: 0.35rem; }
  .verdict { font-size: 0.75rem; color: var(--foreground); }
  .val { font-variant-numeric: tabular-nums; }
  .chips { display: flex; flex-wrap: wrap; gap: 0.35rem; align-items: center; min-width: 0; }
  .none { color: var(--muted-foreground); font-size: 0.8rem; }

  /* The complexity note: shown on hover or keyboard focus, out of the way otherwise. */
  .info {
    position: relative;
    display: inline-grid;
    place-items: center;
    width: 0.95rem;
    height: 0.95rem;
    padding: 0;
    border: 1px solid var(--muted-foreground);
    border-radius: 50%;
    background: none;
    color: var(--muted-foreground);
    font: inherit;
    font-size: 0.6rem;
    font-style: italic;
    line-height: 1;
    cursor: help;
  }
  .info:focus-visible { outline: 2px solid var(--primary); outline-offset: 1px; }
  .tip {
    display: none;
    position: absolute;
    left: 1.4rem;
    top: -0.4rem;
    z-index: 2;
    width: 15rem;
    padding: 0.45rem 0.6rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--popover, var(--muted));
    color: var(--foreground);
    font-size: 0.78rem;
    font-style: normal;
    line-height: 1.35;
    text-align: left;
  }
  .info:hover .tip,
  .info:focus-visible .tip { display: block; }

  /* Narrow: each row stacks — label, then the two sides. */
  @container (max-width: 34rem) {
    .cmp { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
    .cmp > span:first-child { display: none; }
    .lbl { grid-column: 1 / -1; flex-direction: row; align-items: baseline; gap: 0.5rem; }
  }
</style>
