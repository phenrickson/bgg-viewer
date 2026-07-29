<script lang="ts">
  import type { Scope } from './scope';
  import EntityFilter from './EntityFilter.svelte';

  type Facet = { c: string; n: number };
  let {
    scope = $bindable(),
    categories = [],
    mechanics = [],
    onreset
  }: {
    scope: Scope;
    categories: Facet[];
    mechanics: Facet[];
    onreset: () => void;
  } = $props();

  function toggle(list: 'categories' | 'mechanics', value: string) {
    scope[list] = scope[list].includes(value)
      ? scope[list].filter((v) => v !== value)
      : [...scope[list], value];
  }
  const setPlayers = (n: number) => (scope.players = scope.players === n ? null : n);
  const setBestAt = (n: number) => (scope.bestAt = scope.bestAt === n ? null : n);
</script>

<aside class="rail">
  <div class="rail-h"><h3>Scope</h3><button class="reset" onclick={onreset}>Reset</button></div>

  <div class="grp uni">
    <span class="lbl">Universe</span>
    <div class="seg">
      <button class:on={scope.universe === 'top10k'} onclick={() => (scope.universe = 'top10k')}>Top 10,000</button>
      <button class:on={scope.universe === 'rated'} onclick={() => (scope.universe = 'rated')}>All rated</button>
    </div>
  </div>

  <div class="grp">
    <span class="lbl">Year</span>
    <div class="pair">
      <input type="number" placeholder="from" bind:value={scope.yearMin} />
      <input type="number" placeholder="to" bind:value={scope.yearMax} />
    </div>
  </div>

  <div class="grp">
    <span class="lbl">Complexity</span>
    <div class="pair">
      <input type="number" step="0.1" min="1" max="5" placeholder="min" bind:value={scope.weightMin} />
      <input type="number" step="0.1" min="1" max="5" placeholder="max" bind:value={scope.weightMax} />
    </div>
  </div>

  <div class="grp">
    <span class="lbl">Geek rating ≥</span>
    <input type="number" step="0.1" min="1" max="10" placeholder="any" bind:value={scope.geekMin} />
  </div>

  <div class="grp">
    <span class="lbl">Plays with</span>
    <div class="seg">
      {#each [1, 2, 3, 4, 5, 6] as n}
        <button class:on={scope.players === n} onclick={() => setPlayers(n)}>{n === 6 ? '6+' : n}</button>
      {/each}
    </div>
  </div>

  <div class="grp">
    <span class="lbl">Best at <span class="hint">community-voted</span></span>
    <div class="seg">
      {#each [1, 2, 3, 4, 5, 6] as n}
        <button class:on={scope.bestAt === n} onclick={() => setBestAt(n)}>{n}</button>
      {/each}
    </div>
  </div>

  {#if categories.length}
    <div class="grp">
      <span class="lbl">Categories</span>
      {#each categories as f}
        <label class="fac">
          <input type="checkbox" checked={scope.categories.includes(f.c)} onchange={() => toggle('categories', f.c)} />
          <span class="nm">{f.c}</span><span class="ct tnum">{f.n.toLocaleString()}</span>
        </label>
      {/each}
    </div>
  {/if}

  {#if mechanics.length}
    <div class="grp">
      <span class="lbl">Mechanics</span>
      {#each mechanics as f}
        <label class="fac">
          <input type="checkbox" checked={scope.mechanics.includes(f.c)} onchange={() => toggle('mechanics', f.c)} />
          <span class="nm">{f.c}</span><span class="ct tnum">{f.n.toLocaleString()}</span>
        </label>
      {/each}
    </div>
  {/if}

  <div class="grp find">
    <span class="lbl">Find <span class="hint">designer · artist · publisher</span></span>
    <EntityFilter label="Designer" column="designers" bind:selected={scope.designers} />
    <EntityFilter label="Artist" column="artists" bind:selected={scope.artists} />
    <EntityFilter label="Publisher" column="publishers" bind:selected={scope.publishers} />
  </div>
</aside>

<style>
  .rail { border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); padding: var(--space-md); font-size: 0.85rem; }
  .rail-h { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: .6rem; }
  .rail-h h3 { margin: 0; font-size: 0.75rem; text-transform: uppercase; letter-spacing: .07em; color: var(--muted-foreground); }
  .reset { background: none; border: none; color: var(--primary); cursor: pointer; font: inherit; font-size: 0.78rem; padding: 0; }
  .tnum { font-variant-numeric: tabular-nums; }
  .grp { border-top: 1px solid var(--border); padding: .6rem 0; display: flex; flex-direction: column; gap: .4rem; }
  .find { gap: .7rem; }
  .lbl { font-size: 0.72rem; text-transform: uppercase; letter-spacing: .05em; color: var(--muted-foreground); font-weight: 600; }
  .lbl .hint { text-transform: none; letter-spacing: 0; font-weight: 400; opacity: .8; }
  .pair { display: flex; gap: .4rem; }
  input[type='number'] { width: 100%; min-width: 0; border: 1px solid var(--border); border-radius: 6px; background: var(--background); color: var(--foreground); padding: .3rem .45rem; font: inherit; }
  input[type='number']:focus-visible { outline: 2px solid var(--primary); outline-offset: 1px; }
  .seg { display: flex; gap: .25rem; }
  .seg button { flex: 1; border: 1px solid var(--border); border-radius: 6px; background: var(--background); color: var(--muted-foreground); padding: .25rem 0; cursor: pointer; font: inherit; font-size: 0.8rem; }
  .seg button.on { border-color: var(--primary); color: var(--primary); background: color-mix(in oklch, var(--primary) 10%, transparent); }
  .fac { display: flex; align-items: center; gap: .45rem; padding: .12rem 0; }
  .fac .nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fac .ct { color: var(--muted-foreground); font-size: 0.72rem; }
</style>
