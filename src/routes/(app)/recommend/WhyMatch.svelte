<script lang="ts" module>
  /** What the panel needs to name and link a game. */
  export type WhyGame = {
    game_id: number;
    name: string;
    year_published: number | null;
    thumbnail: string | null;
  };
</script>

<script lang="ts">
  /**
   * The full "why": the matched game and the game you started from, side by side, on the
   * embedding's own inputs in Phil's order — complexity, players, play time, then mechanics,
   * categories and families.
   *
   * Each game heads its own column: its box art at a readable size and its name and year,
   * together one link to its page — the matched game first, since it's what you clicked. The
   * table is width-capped so the two columns stay close enough to compare across. Complexity
   * uses the app's banded badge, so two games in the same band look the same. Tags both games
   * have are filled, in their usual colours, and come first in each column; the rest are plain.
   * The values speak for themselves: no verdicts (Phil).
   *
   * Complexity is the model's PREDICTED complexity, which can differ from the BGG weight a
   * reader knows — hence the ⓘ on its label. The comparison itself is `$lib/recommend/why.ts`.
   */
  import { Button } from '$lib/components/ui/button';
  import TagChip, { type TagKind } from '$lib/game/TagChip.svelte';
  import ComplexityBadge from '$lib/catalog/encodings/ComplexityBadge.svelte';
  import type { Why, SideTag, Span } from '$lib/recommend/why';
  import { boxPlaytimeLabel } from '$lib/catalog/playtime';

  let {
    why,
    seed,
    other,
    onwalk
  }: {
    /** `explain(seed, other)`: side `a` is the seed, side `b` the matched game. */
    why: Why;
    seed: WhyGame;
    other: WhyGame;
    /** "Find games like …" for the matched game — shown under its name, where it belongs. */
    onwalk?: () => void;
  } = $props();

  // PLACEHOLDER copy (Phil): row labels and the complexity note.
  const groups = $derived(
    (
      [
        { key: 'mechanics', label: 'Mechanics', kind: 'mech' },
        { key: 'categories', label: 'Categories', kind: 'cat' },
        { key: 'families', label: 'Families', kind: 'fam' }
      ] as const
    )
      .map((g) => ({ ...g, kind: g.kind as TagKind, ...why.sides[g.key] }))
      .filter((g) => g.a.length || g.b.length)
  );

  /** Chips shown per side before "+n". */
  const CAP = 6;
  let open = $state<Record<string, boolean>>({});

  const span = ([lo, hi]: Span) => (lo === hi ? String(lo) : `${lo}–${hi}`);
  const gameHref = (g: WhyGame) => `/games/${g.game_id}`;
</script>

{#snippet identity(g: WhyGame, walk?: () => void)}
  <div class="head">
    <a class="art" href={gameHref(g)} tabindex="-1" aria-hidden="true">
      {#if g.thumbnail}<img src={g.thumbnail} alt="" decoding="async" />{/if}
    </a>
    <div class="title">
      <a class="name" href={gameHref(g)}>{g.name}</a>
      {#if g.year_published}<span class="year">{g.year_published}</span>{/if}
      <!-- What you can do with this game, as the app's links, so it reads as clickable.
           PLACEHOLDER copy (Phil) -->
      <div class="links">
        <Button variant="link" size="xs" class="lnk" href={gameHref(g)}>Game page ↗</Button>
        {#if walk}<Button variant="link" size="xs" class="lnk" onclick={walk}>Find games like {g.name}</Button>{/if}
      </div>
    </div>
  </div>
{/snippet}

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

<div class="table">
  <span></span>
  {@render identity(other, onwalk)}
  {@render identity(seed)}

  {#if why.complexity}
    {@const c = why.complexity}
    <span class="lbl">
      Complexity
      <button type="button" class="info" aria-label="About complexity" aria-describedby="why-cx-note">
        i<span class="tip" role="tooltip" id="why-cx-note">PLACEHOLDER: the model's predicted complexity, not BGG's community weight.</span>
      </button>
    </span>
    <span class="val"><span class="num">{c.b.toFixed(1)}</span><ComplexityBadge weight={c.b} /></span>
    <span class="val"><span class="num">{c.a.toFixed(1)}</span><ComplexityBadge weight={c.a} /></span>
  {/if}

  {#if why.players}
    {@const p = why.players}
    <span class="lbl">Players</span>
    <span class="val">{span(p.b)}</span>
    <span class="val">{span(p.a)}</span>
  {/if}

  {#if why.playtime}
    {@const t = why.playtime}
    <span class="lbl">Play time</span>
    <!-- Plain minutes, as the rest of the page writes play time ("40–200 min"). -->
    <span class="val">{boxPlaytimeLabel(t.b[0], t.b[1])}</span>
    <span class="val">{boxPlaytimeLabel(t.a[0], t.a[1])}</span>
  {/if}

  {#each groups as g (g.key)}
    <span class="lbl top">{g.label}</span>
    {@render side(g.b, g.kind, `${g.key}-b`)}
    {@render side(g.a, g.kind, `${g.key}-a`)}
  {/each}
</div>

<style>
  /* One table: a label column and a column per game, width-capped so the two columns stay
     close enough to compare across. */
  .table {
    display: grid;
    grid-template-columns: 6.5rem minmax(0, 1fr) minmax(0, 1fr);
    column-gap: var(--space-lg);
    row-gap: 0.7rem;
    align-items: center;
    max-width: 56rem;
    font-size: 0.88rem;
  }

  /* A game's head: its art at a size you can see, its name (a link) and year, then what you
     can do with it as links underneath. */
  .head {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
    padding-bottom: 0.6rem;
    border-bottom: 1px solid var(--border);
  }
  .art {
    flex: none;
    width: 6rem;
    height: 6rem;
    display: grid;
    place-items: center;
    border-radius: 6px;
    background: var(--muted);
    overflow: hidden;
  }
  .art img {
    max-width: 100%;
    max-height: 100%;
    display: block;
  }
  .title {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    min-width: 0;
  }
  .name {
    font-weight: 650;
    line-height: 1.25;
    color: inherit;
    text-decoration: none;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
  }
  .name:hover {
    color: var(--primary);
  }
  .name:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
    border-radius: 2px;
  }
  .year {
    font-size: 0.78rem;
    color: var(--muted-foreground);
  }
  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 0 0.9rem;
    margin-top: 0.15rem;
  }
  .links :global(.lnk) {
    height: auto;
    padding: 0;
  }

  .lbl {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.82rem;
    color: var(--muted-foreground);
  }
  /* Tag rows: label and both sides hang from the same top line, the label one chip tall, so
     a side that wraps to two lines never pulls the others off level. */
  .lbl.top {
    align-self: start;
    min-height: 1.4rem;
  }
  .val {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    min-width: 0;
    font-variant-numeric: tabular-nums;
  }
  .num {
    min-width: 1.8rem;
  }
  .chips {
    align-self: start;
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    align-items: center;
    min-width: 0;
    min-height: 1.4rem;
  }
  .none {
    color: var(--muted-foreground);
    font-size: 0.8rem;
  }

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
  .info:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 1px;
  }
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
  .info:focus-visible .tip {
    display: block;
  }

  /* Narrow: the two games side by side, each row's label above its values. */
  @container (max-width: 34rem) {
    .table {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }
    .table > span:first-child {
      display: none;
    }
    .lbl {
      grid-column: 1 / -1;
    }
  }
</style>
