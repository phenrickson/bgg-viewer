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
   * The full "why": how a matched game compares with the game you started from, on the
   * embedding's own inputs, in Phil's order — complexity, players, play time, then tags.
   *
   * Built to make likeness easy to SEE, not just to read:
   *
   * - each game heads its own column — its box art at a readable size and its name and year,
   *   together one link to its page — the matched game first, since it's what you clicked;
   * - complexity, players and play time are a compact table, so each pair of values sits side
   *   by side rather than a panel's width apart; complexity uses the app's banded badge, so two
   *   games in the same band look the same; a verdict column says whether they agree, with a
   *   dot in the positive colour when they do (never colour alone — the words say it too);
   * - tags both games have are shown ONCE, under "In common", in their usual colours; each
   *   game's own tags follow, plain and muted, collapsed after a few.
   *
   * Complexity is the model's PREDICTED complexity, which can differ from the BGG weight a
   * reader knows — hence the ⓘ on its label. The comparison itself is `$lib/recommend/why.ts`.
   */
  import { Button } from '$lib/components/ui/button';
  import TagChip, { type TagKind } from '$lib/game/TagChip.svelte';
  import ComplexityBadge from '$lib/catalog/encodings/ComplexityBadge.svelte';
  import { playersText, playtimeText, type Why, type Span } from '$lib/recommend/why';
  import { formatMinutes } from '$lib/catalog/playtime';

  let {
    why,
    seed,
    other
  }: {
    /** `explain(seed, other)`: side `a` is the seed, side `b` the matched game. */
    why: Why;
    seed: WhyGame;
    other: WhyGame;
  } = $props();

  // PLACEHOLDER copy (Phil): labels, verdicts, section headings and the complexity note.
  const KINDS = [
    { key: 'mechanics', label: 'Mechanics', kind: 'mech' },
    { key: 'categories', label: 'Categories', kind: 'cat' },
    { key: 'families', label: 'Families', kind: 'fam' }
  ] as const;

  /** Tags in common, per kind, rarest first. */
  const common = $derived(
    KINDS.map((k) => ({ ...k, kind: k.kind as TagKind, tags: why.shared[k.key] })).filter((k) => k.tags.length)
  );

  /** A game's own tags (the ones the other lacks), every kind in order. */
  const own = (side: 'a' | 'b') =>
    KINDS.flatMap((k) =>
      why.sides[k.key][side].filter((t) => !t.shared).map((t) => ({ tag: t.tag, kind: k.kind as TagKind }))
    );
  const ownOther = $derived(own('b'));
  const ownSeed = $derived(own('a'));

  /** Own tags shown before "+n". */
  const CAP = 8;
  let open = $state<Record<string, boolean>>({});

  const span = ([lo, hi]: Span, f: (n: number) => string = String) => (lo === hi ? f(lo) : `${f(lo)}–${f(hi)}`);
  const gameHref = (g: WhyGame) => `/games/${g.game_id}`;
</script>

{#snippet identity(g: WhyGame)}
  <a class="game" href={gameHref(g)}>
    <span class="art">
      {#if g.thumbnail}<img src={g.thumbnail} alt="" decoding="async" />{/if}
    </span>
    <span class="title">
      <span class="name">{g.name}</span>
      {#if g.year_published}<span class="year">{g.year_published}</span>{/if}
    </span>
  </a>
{/snippet}

{#snippet verdict(same: boolean, text: string)}
  <span class="verdict" class:same>{text}</span>
{/snippet}

{#snippet ownTags(g: WhyGame, tags: { tag: string; kind: TagKind }[], key: string)}
  {#if tags.length}
    <div class="own">
      <span class="own-label" title="Only in {g.name}">Only in {g.name}</span>
      <div class="chips">
        {#each open[key] ? tags : tags.slice(0, CAP) as t (t.kind + t.tag)}<TagChip kind={t.kind} tag={t.tag} quiet />{/each}
        {#if tags.length > CAP}
          <Button variant="ghost" size="xs" onclick={() => (open[key] = !open[key])}>
            {open[key] ? 'Show fewer' : `+${tags.length - CAP}`}
          </Button>
        {/if}
      </div>
    </div>
  {/if}
{/snippet}

<div class="why">
  <div class="table">
    <span></span>
    {@render identity(other)}
    {@render identity(seed)}
    <span></span>

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
      {@render verdict(c.close, c.close ? 'Close' : `${Math.abs(c.a - c.b).toFixed(1)} apart`)}
    {/if}

    {#if why.players}
      {@const p = why.players}
      <span class="lbl">Players</span>
      <span class="val">{span(p.b)}</span>
      <span class="val">{span(p.a)}</span>
      {@render verdict(!!p.overlap, p.overlap ? playersText(p) : 'No overlap')}
    {/if}

    {#if why.playtime}
      {@const t = why.playtime}
      <span class="lbl">Play time</span>
      <span class="val">{span(t.b, formatMinutes)}</span>
      <span class="val">{span(t.a, formatMinutes)}</span>
      {@render verdict(!!t.overlap, t.overlap ? playtimeText(t) : 'No overlap')}
    {/if}
  </div>

  {#if common.length}
    <div class="common">
      <h4>In common</h4>
      {#each common as k (k.key)}
        <span class="lbl">{k.label}</span>
        <div class="chips">
          {#each k.tags as tag (tag)}<TagChip kind={k.kind} {tag} filled />{/each}
        </div>
      {/each}
    </div>
  {/if}

  {@render ownTags(other, ownOther, 'b')}
  {@render ownTags(seed, ownSeed, 'a')}
</div>

<style>
  .why {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    font-size: 0.88rem;
  }

  /* The comparison table. Value columns are capped, so a pair of values sits side by side
     instead of a panel's width apart; the verdict column takes the rest. */
  .table {
    display: grid;
    grid-template-columns: 6.5rem minmax(0, 13rem) minmax(0, 13rem) minmax(0, 1fr);
    column-gap: var(--space-md);
    row-gap: 0.7rem;
    align-items: center;
  }

  /* A game: its art at a size you can see, then name and year — one link to its page. */
  .game {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    min-width: 0;
    padding-bottom: 0.6rem;
    color: inherit;
    text-decoration: none;
  }
  .art {
    flex: none;
    width: 4rem;
    height: 4rem;
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
    min-width: 0;
  }
  .name {
    font-weight: 650;
    line-height: 1.25;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
  }
  .year {
    font-size: 0.78rem;
    color: var(--muted-foreground);
  }
  .game:hover .name {
    color: var(--primary);
  }
  .game:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
    border-radius: 6px;
  }

  .lbl {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.82rem;
    color: var(--muted-foreground);
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

  /* Does this row agree? Words always; the positive colour and dot only when it does. */
  .verdict {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.8rem;
    color: var(--muted-foreground);
  }
  .verdict::before {
    content: '';
    width: 0.45rem;
    height: 0.45rem;
    border-radius: 50%;
    border: 1.5px solid currentColor;
    flex: none;
  }
  .verdict.same {
    color: var(--color-positive);
    font-weight: 600;
  }
  .verdict.same::before {
    background: currentColor;
  }

  /* In common: each kind's shared tags, once, in their usual colours. */
  .common {
    display: grid;
    grid-template-columns: 6.5rem minmax(0, 1fr);
    column-gap: var(--space-md);
    row-gap: 0.5rem;
    align-items: baseline;
    padding-top: var(--space-md);
    border-top: 1px solid var(--border);
  }
  .common h4 {
    grid-column: 1 / -1;
    margin: 0 0 0.15rem;
    font-size: 0.85rem;
    font-weight: 650;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    align-items: center;
    min-width: 0;
  }

  /* Each game's own tags: quiet, after what they share. */
  .own {
    display: grid;
    grid-template-columns: 6.5rem minmax(0, 1fr);
    column-gap: var(--space-md);
    align-items: baseline;
  }
  .own-label {
    font-size: 0.8rem;
    color: var(--muted-foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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

  /* Narrow: the two games side by side; each row's label above its values, verdict below. */
  @container (max-width: 34rem) {
    .table {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }
    .table > span:empty {
      display: none;
    }
    .table .lbl,
    .table .verdict {
      grid-column: 1 / -1;
    }
    .common,
    .own {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
