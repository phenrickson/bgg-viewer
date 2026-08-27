<script lang="ts">
	/**
	 * Self-serve counterpart to AdminCollectionPicker: no username to type — the account's own
	 * linked `bgg_username` is implicit. Rendered only when the caller has one (see
	 * docs/superpowers/plans/2026-08-27-collection-filter-phase2.md, Part E).
	 */
	import { catalog, fetchAndApplyCollection, clearCollectionFilter } from './catalog.svelte';

	let { bggUsername }: { bggUsername: string } = $props();

	let status = $state<'idle' | 'loading' | 'error'>('idle');
	let errorMessage = $state('');
	let updatedAt = $state<string | null>(null);

	const active = $derived(catalog.collectionUsername === bggUsername);

	async function toggle() {
		if (active) {
			await clearCollectionFilter();
			return;
		}
		status = 'loading';
		errorMessage = '';
		try {
			const result = await fetchAndApplyCollection(bggUsername);
			updatedAt = result.updatedAt;
			status = 'idle';
		} catch (e) {
			status = 'error';
			errorMessage = e instanceof Error ? e.message : String(e);
		}
	}
</script>

<div class="grp">
	<!-- Copy note: placeholder — Phil writes final copy. -->
	<button type="button" class="toggle" class:on={active} onclick={toggle} disabled={status === 'loading'}>
		{#if status === 'loading'}
			Loading…
		{:else if active}
			✓ My collection
		{:else}
			My collection
		{/if}
	</button>
	{#if active && updatedAt}
		<span class="synced">synced {new Date(updatedAt).toLocaleDateString()}</span>
	{/if}
	{#if status === 'error'}<p class="note error">{errorMessage}</p>{/if}
</div>

<style>
	.grp {
		border-top: 1px solid var(--border);
		padding: 0.5rem 0;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.toggle {
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--background);
		color: var(--foreground);
		padding: 0.3rem 0.6rem;
		cursor: pointer;
		font: inherit;
		font-size: 0.8rem;
		text-align: left;
	}
	.toggle:hover:not(:disabled) {
		border-color: var(--primary);
	}
	.toggle:disabled {
		opacity: 0.6;
		cursor: default;
	}
	.toggle.on {
		border-color: var(--primary);
		color: var(--primary);
		background: color-mix(in oklch, var(--primary) 10%, transparent);
		font-weight: 600;
	}
	.synced {
		font-size: 0.7rem;
		color: var(--muted-foreground);
	}
	.note {
		margin: 0;
		font-size: 0.7rem;
		line-height: 1.35;
	}
	.note.error {
		color: var(--color-negative);
	}
</style>
