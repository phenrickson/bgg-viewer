<script lang="ts">
  /**
   * Type-ahead filter for a high-cardinality list column (designers/artists/publishers).
   * Queries DISTINCT values from the in-browser catalog as you type — so every value is
   * reachable (no server, no top-N cap) and the noisy long tail never renders as a list.
   * `column` is a fixed literal from our own code (never user input), so it's SQL-safe.
   */
  import { query } from '$lib/catalog/catalog.svelte';

  let {
    label,
    column,
    selected = $bindable()
  }: { label: string; column: string; selected: string[] } = $props();

  let q = $state('');
  let results = $state<{ v: string; n: number }[]>([]);
  let active = $state(false);

  let token = 0;
  async function search(term: string) {
    const mine = ++token;
    const esc = term.replace(/'/g, "''");
    // UNNEST must be produced in a subquery before the WHERE/GROUP BY in DuckDB.
    const sql = `SELECT v, COUNT(*)::INT n
      FROM (SELECT UNNEST(${column}) AS v FROM catalog)
      WHERE v ILIKE '%${esc}%'
      GROUP BY v ORDER BY n DESC, v LIMIT 12`;
    try {
      const rows = await query<{ v: string; n: number }>(sql);
      if (mine === token) results = rows.filter((r) => !selected.includes(r.v));
    } catch (e) {
      console.error('entity search failed', e);
    }
  }

  $effect(() => {
    const term = q.trim();
    if (term.length < 2) {
      results = [];
      return;
    }
    search(term);
  });

  function add(v: string) {
    if (!selected.includes(v)) selected = [...selected, v];
    q = '';
    results = [];
    active = false;
  }
  const remove = (v: string) => (selected = selected.filter((x) => x !== v));
</script>

<div class="ef">
  <span class="lbl">{label}</span>

  {#if selected.length}
    <div class="chips">
      {#each selected as v}
        <button class="chip" onclick={() => remove(v)} title="Remove">{v} <span class="x">×</span></button>
      {/each}
    </div>
  {/if}

  <div class="box">
    <input
      type="text"
      placeholder="Search {label.toLowerCase()}…"
      bind:value={q}
      onfocus={() => (active = true)}
      onblur={() => setTimeout(() => (active = false), 120)}
    />
    {#if active && results.length}
      <ul class="menu">
        {#each results as r}
          <li>
            <button onmousedown={() => add(r.v)}>
              <span class="nm">{r.v}</span><span class="ct tnum">{r.n.toLocaleString()}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>

<style>
  .ef { display: flex; flex-direction: column; gap: 0.4rem; }
  .lbl { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted-foreground); font-weight: 600; }
  .chips { display: flex; flex-wrap: wrap; gap: 0.25rem; }
  .chip { display: inline-flex; align-items: center; gap: 0.25rem; border: 1px solid color-mix(in oklch, var(--primary) 40%, var(--border)); color: var(--primary); background: color-mix(in oklch, var(--primary) 8%, transparent); border-radius: 999px; padding: 0.1rem 0.45rem; font: inherit; font-size: 0.74rem; cursor: pointer; }
  .chip .x { opacity: 0.7; }
  .box { position: relative; }
  input { width: 100%; min-width: 0; border: 1px solid var(--border); border-radius: 6px; background: var(--background); color: var(--foreground); padding: 0.3rem 0.45rem; font: inherit; font-size: 0.82rem; }
  input:focus-visible { outline: 2px solid var(--primary); outline-offset: 1px; }
  .menu { position: absolute; z-index: 10; top: calc(100% + 2px); left: 0; right: 0; margin: 0; padding: 0.2rem; list-style: none; background: var(--card); border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 8px 20px oklch(0 0 0 / 0.12); max-height: 15rem; overflow: auto; }
  .menu button { display: flex; align-items: center; gap: 0.5rem; width: 100%; text-align: left; background: none; border: none; border-radius: 5px; padding: 0.3rem 0.4rem; font: inherit; font-size: 0.82rem; color: var(--foreground); cursor: pointer; }
  .menu button:hover { background: var(--muted); }
  .menu .nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .menu .ct { color: var(--muted-foreground); font-size: 0.72rem; }
  .tnum { font-variant-numeric: tabular-nums; }
</style>
