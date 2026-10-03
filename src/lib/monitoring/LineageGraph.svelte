<script lang="ts">
  import type { LineageNode } from '$lib/server/warehouse';
  import { layoutLineage } from './lineage-layout';
  import { nodeStatus, STATUS_GLYPH } from './display';

  let {
    nodes,
    edges,
    selected,
    reference,
    onselect
  }: {
    nodes: LineageNode[];
    edges: [string, string][];
    selected: string | null;
    reference: string;
    onselect: (id: string) => void;
  } = $props();

  const COL_W = 236, ROW_H = 54, BOX_W = 204, BOX_H = 40, PAD = 12;
  const layout = $derived(layoutLineage(nodes, edges));
  const width = $derived(layout.columns * COL_W + PAD);
  const height = $derived(layout.rows * ROW_H + PAD);
  const pos = (id: string) => {
    const p = layout.placements.get(id)!;
    return { x: PAD + p.column * COL_W, y: PAD + p.row * ROW_H };
  };
  const related = $derived(
    selected
      ? new Set([selected, ...(layout.upstream.get(selected) ?? []), ...(layout.downstream.get(selected) ?? [])])
      : null
  );
  const short = (s: string, max = 26) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);
  const tone = (n: LineageNode) => {
    const s = nodeStatus(n, reference);
    return s ? s.tone : 'idle';
  };
  const key = (e: KeyboardEvent, id: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onselect(id);
    }
  };
</script>

<div class="frame">
  <svg {width} {height} role="group" aria-label="Dataform lineage">
    {#each edges as [up, down] (`${up}>${down}`)}
      {#if layout.placements.has(up) && layout.placements.has(down)}
        {@const a = pos(up)}
        {@const b = pos(down)}
        {@const x1 = a.x + BOX_W}
        {@const y1 = a.y + BOX_H / 2}
        {@const x2 = b.x}
        {@const y2 = b.y + BOX_H / 2}
        <path
          d="M{x1} {y1} C{x1 + 40} {y1}, {x2 - 40} {y2}, {x2} {y2}"
          class="edge"
          class:hot={selected !== null && (up === selected || down === selected)}
          class:dim={related !== null && !(up === selected || down === selected)}
        />
      {/if}
    {/each}
    {#each nodes as n (n.id)}
      {@const p = pos(n.id)}
      {@const t = tone(n)}
      <g
        class="node {t}"
        class:selected={n.id === selected}
        class:dim={related !== null && !related.has(n.id)}
        transform="translate({p.x} {p.y})"
        role="button"
        tabindex="0"
        aria-label="{n.dataset}.{n.name}"
        onclick={() => onselect(n.id)}
        onkeydown={(e) => key(e, n.id)}
      >
        <title>{n.id}</title>
        <rect width={BOX_W} height={BOX_H} rx="7" />
        <circle cx="14" cy={BOX_H / 2} r="7" class="dot" />
        <text x="14" y={BOX_H / 2 + 3.5} class="glyph" text-anchor="middle"
          >{t === 'ok' ? STATUS_GLYPH.ok : t === 'warn' ? STATUS_GLYPH.warn : ''}</text
        >
        <text x="28" y="16" class="name">{short(n.name)}</text>
        <text x="28" y="31" class="sub">{n.dataset}{n.project !== 'bgg-data-warehouse' ? ` · ${n.project}` : ''}</text>
      </g>
    {/each}
  </svg>
</div>

<style>
  .frame { overflow: auto; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); max-height: 75vh; }
  svg { display: block; }
  .edge { fill: none; stroke: var(--border); stroke-width: 1.5; }
  .edge.hot { stroke: var(--foreground); stroke-width: 2; }
  .edge.dim, .node.dim { opacity: 0.25; }
  .node { cursor: pointer; }
  .node rect { fill: var(--background); stroke: var(--border); }
  .node.selected rect { stroke: var(--foreground); stroke-width: 2; }
  .node:focus-visible rect { stroke: var(--primary); stroke-width: 2; }
  .node:focus { outline: none; }
  .dot { fill: transparent; stroke: var(--muted-foreground); stroke-width: 1.5; }
  .node.ok .dot { fill: var(--status-ok); stroke: none; }
  .node.warn .dot { fill: var(--status-warn); stroke: none; }
  .glyph { font-size: 9px; font-weight: 700; fill: var(--card); }
  .node.warn .glyph { fill: oklch(0.25 0.02 260); }
  .name { font-size: 12px; font-weight: 600; fill: var(--foreground); }
  .sub { font-size: 10.5px; fill: var(--muted-foreground); }
</style>
