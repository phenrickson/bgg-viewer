<script lang="ts">
  /**
   * First / prev / "n of N" / next / last. Lifted out of `GameList` when the BGG.CON dashboard
   * became the next page to page through DuckDB results, rather than copied a fourth time
   * (`GameCards` and What's New still hold their own copies).
   *
   * `touch` is the roomier size for a pager that's alone at the foot of a list on a phone.
   */
  let {
    page = $bindable(),
    pages,
    touch = false
  }: { page: number; pages: number; touch?: boolean } = $props();
</script>

<span class="pager" class:touch>
  <button disabled={page === 0} onclick={() => (page = 0)} title="First page">«</button>
  <button disabled={page === 0} onclick={() => (page = Math.max(0, page - 1))}>‹ Prev</button>
  <span class="pg tnum">{(page + 1).toLocaleString()} / {pages.toLocaleString()}</span>
  <button disabled={page >= pages - 1} onclick={() => (page = Math.min(pages - 1, page + 1))}>Next ›</button>
  <button disabled={page >= pages - 1} onclick={() => (page = pages - 1)} title="Last page">»</button>
</span>

<style>
  .pager {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }
  .pager button {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--foreground);
    cursor: pointer;
    font: inherit;
    font-size: 0.76rem;
    padding: 0.15rem 0.5rem;
  }
  .pager button:hover:not(:disabled) {
    border-color: var(--primary);
    color: var(--primary);
  }
  .pager button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .pg {
    padding: 0 0.35rem;
    color: var(--foreground);
    font-variant-numeric: tabular-nums;
  }
  /* Touch sizing: alone at the foot of a list, there is room for it to be comfortable. */
  .touch button {
    padding: 0.5rem 0.7rem;
    font-size: 0.85rem;
  }
</style>
