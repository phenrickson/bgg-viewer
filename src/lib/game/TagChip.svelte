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
   * `quiet` steps a chip back (Recommend's "why": a tag only one of the two games has).
   */
  let { kind, tag, quiet = false }: { kind: TagKind; tag: string; quiet?: boolean } = $props();
</script>

<a class="chip {kind}" class:quiet href="/games?{PARAM[kind]}={encodeURIComponent(tag)}">{tag}</a>

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
  .chip:hover {
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
  .chip.quiet {
    border-color: var(--border);
    border-style: dashed;
    color: var(--muted-foreground);
  }
  .chip.quiet:hover {
    border-color: var(--primary);
    color: var(--primary);
  }
</style>
