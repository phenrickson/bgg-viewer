<script lang="ts" module>
  export type TagKind = 'cat' | 'mech' | 'fam';

  /** The Explore filter each tag kind opens — the same params the game page's chips use. */
  const PARAM: Record<TagKind, string> = { cat: 'cats', mech: 'mechs', fam: 'fam' };
</script>

<script lang="ts">
  /**
   * A category, mechanic or family as a chip. Tags are links: one click from "what is this"
   * back to "what else is like this", opening Explore filtered to that tag.
   *
   * The game-detail page's `.chip` look, lifted out for the Recommend tool's "why" panel.
   * That page (and `FeaturedGame`) still carry their own copies of these rules; moving them
   * onto this component is a follow-up.
   *
   * Categories take `--primary`, mechanics `--chart-1`: two kinds of tag, not one grey wall.
   * Families stay neutral.
   *
   * `link={false}` makes it a plain label (Recommend's list rows, where the whole row opens the
   * "why" and a tag leaving for Explore would be a surprise).
   *
   * Recommend's "why" uses two emphases: `filled` brings a chip forward (a tag both games
   * have), `quiet` steps it back to plain muted text (a tag only one has).
   */
  let {
    kind,
    tag,
    quiet = false,
    filled = false,
    link = true
  }: { kind: TagKind; tag: string; quiet?: boolean; filled?: boolean; link?: boolean } = $props();
</script>

<svelte:element
  this={link ? 'a' : 'span'}
  class="chip {kind}"
  class:quiet
  class:filled
  title={tag}
  href={link ? `/games?${PARAM[kind]}=${encodeURIComponent(tag)}` : undefined}>{tag}</svelte:element
>

<style>
  .chip {
    font-size: 0.76rem;
    padding: 0.15rem 0.55rem;
    border-radius: 999px;
    border: 1px solid var(--border);
    color: var(--muted-foreground);
    background: var(--background);
    text-decoration: none;
  }
  /* Only a link lights up: a plain label has nothing to press. */
  a.chip:hover {
    border-color: var(--primary);
    color: var(--primary);
  }
  .chip.cat {
    border-color: color-mix(in oklch, var(--primary) 35%, var(--border));
    color: var(--primary);
  }
  .chip.mech {
    border-color: color-mix(in oklch, var(--chart-1) 40%, var(--border));
    color: var(--chart-1);
  }
  /* Brought forward by a fill only: a filled tag keeps its kind's colour (blue mechanics,
     orange categories), so a row of shared tags reads like tags everywhere else in the app. */
  .chip.filled {
    background: var(--muted);
  }
  .chip.fam.filled {
    color: var(--foreground);
  }
  .chip.quiet {
    border-color: transparent;
    background: none;
    color: var(--muted-foreground);
  }
  a.chip.quiet:hover {
    border-color: var(--primary);
    color: var(--primary);
  }
</style>
