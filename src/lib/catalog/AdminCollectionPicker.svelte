<script lang="ts">
	/**
	 * Admin-only (Phase 1): filter the catalog to one BGG username's owned games. Only reads
	 * data already synced into `collections.user_collections` — no on-demand BGG fetch, so a
	 * stale-looking result means the underlying sync is stale, not this control (see
	 * `updated_at` hint below). Rendered only when the caller has already checked `isAdmin`.
	 */
	import { catalog, fetchAndApplyCollection, clearCollectionFilter } from './catalog.svelte';

	let username = $state('');
	let status = $state<'idle' | 'loading' | 'error'>('idle');
	let errorMessage = $state('');
	let updatedAt = $state<string | null>(null);

	async function apply() {
		const name = username.trim();
		if (!name) return;
		status = 'loading';
		errorMessage = '';
		try {
			const result = await fetchAndApplyCollection(name);
			updatedAt = result.updatedAt;
			status = 'idle';
		} catch (e) {
			status = 'error';
			errorMessage = e instanceof Error ? e.message : String(e);
		}
	}

	async function clear() {
		await clearCollectionFilter();
		username = '';
		updatedAt = null;
		status = 'idle';
	}
</script>

<div class="grp">
	<!-- Copy note: placeholder — Phil writes final copy. -->
	<p class="ttl">Collection filter (admin)</p>

	{#if catalog.collectionUsername}
		<div class="active">
			<span>{catalog.collectionUsername}</span>
			{#if updatedAt}<span class="synced">synced {new Date(updatedAt).toLocaleDateString()}</span
				>{/if}
			<button type="button" class="x" onclick={clear} aria-label="Clear collection filter"
				>✕</button
			>
		</div>
	{:else}
		<div class="row">
			<input
				type="text"
				placeholder="BGG username"
				aria-label="BGG username"
				bind:value={username}
				onkeydown={(e) => e.key === 'Enter' && apply()}
			/>
			<button type="button" onclick={apply} disabled={status === 'loading' || !username.trim()}>
				{status === 'loading' ? '…' : 'Apply'}
			</button>
		</div>
		{#if status === 'error'}<p class="note error">{errorMessage}</p>{/if}
	{/if}
</div>

<style>
	.grp {
		border-top: 1px solid var(--border);
		padding: 0.5rem 0;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.ttl {
		margin: 0;
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--muted-foreground);
		font-weight: 600;
	}
	.row {
		display: flex;
		gap: 0.4rem;
	}
	.row input {
		flex: 1;
		min-width: 0;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--background);
		color: var(--foreground);
		padding: 0.28rem 0.4rem;
		font: inherit;
		font-size: 0.8rem;
	}
	.row input:focus-visible {
		outline: 2px solid var(--primary);
		outline-offset: 1px;
	}
	.row button {
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--background);
		color: var(--primary);
		padding: 0.25rem 0.6rem;
		cursor: pointer;
		font: inherit;
		font-size: 0.8rem;
	}
	.row button:hover:not(:disabled) {
		border-color: var(--primary);
	}
	.row button:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.active {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.8rem;
		color: var(--primary);
		font-weight: 600;
	}
	.synced {
		font-size: 0.7rem;
		font-weight: 400;
		color: var(--muted-foreground);
	}
	.x {
		margin-left: auto;
		border: none;
		background: none;
		color: var(--muted-foreground);
		cursor: pointer;
		font-size: 0.7rem;
	}
	.x:hover {
		color: var(--color-negative);
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
