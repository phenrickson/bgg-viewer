<script lang="ts">
  /**
   * Jump-to-a-game search — a name type-ahead over the in-browser catalog that navigates
   * to the game's detail page. Used big on the landing and compact in the app header, so
   * you can reach any game's page from anywhere. Warms the catalog on first focus.
   */
  import { goto } from '$app/navigation';
  import { initCatalog, query, catalog } from '$lib/catalog/catalog.svelte';

  let { compact = false }: { compact?: boolean } = $props();

  type Hit = { game_id: number; name: string; year_published: number | null };
  let q = $state('');
  let hits = $state<Hit[]>([]);
  let active = $state(false);
  let token = 0;

  const warm = () => {
    active = true;
    if (catalog.status === 'idle') initCatalog();
  };

  $effect(() => {
    const term = q.trim();
    if (term.length < 2 || catalog.status !== 'ready') {
      hits = [];
      return;
    }
    const mine = ++token;
    const esc = term.replace(/'/g, "''");
    query<Hit>(
      `SELECT game_id, name, year_published FROM catalog
       WHERE name ILIKE '%${esc}%' ORDER BY geek_rating DESC NULLS LAST LIMIT 8`
    )
      .then((rows) => mine === token && (hits = rows))
      .catch((e) => console.error('search failed', e));
  });

  function open(id: number) {
    q = '';
    hits = [];
    active = false;
    goto(`/games/${id}`);
  }

  const placeholder = $derived(
    catalog.status === 'ready' || catalog.status === 'idle' ? 'Jump to a game…' : 'Warming the catalog…'
  );
</script>

<div class="gs" class:compact>
  <div class="box">
    <svg width={compact ? 15 : 18} height={compact ? 15 : 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m21 21-4.3-4.3"></path></svg>
    <input
      type="text"
      {placeholder}
      bind:value={q}
      onfocus={warm}
      onblur={() => setTimeout(() => (active = false), 120)}
    />
  </div>
  {#if active && hits.length}
    <ul class="menu">
      {#each hits as h}
        <li>
          <button onmousedown={() => open(h.game_id)}>
            <span class="nm">{h.name}</span>
            {#if h.year_published}<span class="yr tnum">{h.year_published}</span>{/if}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .gs { position: relative; }
  .box { display: flex; align-items: center; gap: 0.6rem; background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 0.7rem 0.9rem; color: var(--muted-foreground); }
  .box input { flex: 1; min-width: 0; border: none; background: none; color: var(--foreground); font: inherit; font-size: 1rem; }
  .box input:focus { outline: none; }

  .compact .box { border-radius: 8px; padding: 0.32rem 0.6rem; }
  .compact .box input { font-size: 0.85rem; }

  .menu { position: absolute; z-index: 30; top: calc(100% + 4px); left: 0; right: 0; margin: 0; padding: 0.25rem; list-style: none; background: var(--card); border: 1px solid var(--border); border-radius: 10px; box-shadow: 0 10px 24px oklch(0 0 0 / 0.14); max-height: 20rem; overflow: auto; }
  .menu button { display: flex; align-items: center; gap: 0.5rem; width: 100%; text-align: left; background: none; border: none; border-radius: 6px; padding: 0.45rem 0.5rem; font: inherit; color: var(--foreground); cursor: pointer; }
  .menu button:hover { background: var(--muted); }
  .menu .nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 550; }
  .menu .yr { color: var(--muted-foreground); font-size: 0.82rem; }
  .tnum { font-variant-numeric: tabular-nums; }
</style>
