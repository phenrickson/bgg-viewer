<script lang="ts">
  import { superForm } from 'sveltekit-superforms';
  import { untrack } from 'svelte';
  import { zod4 as zod } from 'sveltekit-superforms/adapters';
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { settingsSchema } from '$lib/schemas';

  let { data } = $props();

  const sf = superForm(untrack(() => data.form), { validators: zod(settingsSchema) });
  const { form, errors, enhance: superEnhance, submitting, message } = sf;

  // Kept out of superForm's own `form`/message state — mixing this action's result into that
  // would hand superForm a response shaped nothing like a SuperValidated form.
  let refreshing = $state(false);
  let refreshMessage = $state<string | null>(null);
</script>

<svelte:head><title>Settings · bgg-viewer</title></svelte:head>

<div class="settings">
  <h1>Settings</h1>

  <div class="panel">
    <section class="row">
      <span class="lbl">Email</span>
      <p class="val">{data.email ?? '—'}</p>
    </section>

    <section class="row">
      <span class="lbl">BGG account</span>
      <form method="POST" use:superEnhance>
        <div class="inline">
          <input
            type="text"
            name="bgg_username"
            placeholder="BGG username"
            autocomplete="off"
            aria-label="BGG username"
            bind:value={$form.bgg_username}
            aria-invalid={$errors.bgg_username ? 'true' : undefined}
          />
          <button class="btn" type="submit" disabled={$submitting}>
            {$submitting ? 'Saving…' : 'Save'}
          </button>
        </div>
        {#if $errors.bgg_username}<p class="note err">{$errors.bgg_username}</p>{/if}
        <!-- Copy note: placeholder — Phil writes final copy. -->
        <p class="note">Links your account for the "My Collection" catalog filter. Leave blank to unlink.</p>
        {#if $message}<p class="note ok">{$message}</p>{/if}
      </form>
    </section>

    {#if data.collection}
      <section class="row">
        <span class="lbl">Collection sync</span>
        <p class="val">
          {data.collection.gameCount.toLocaleString()} games{#if data.collection.updatedAt}
            &nbsp;· last synced {new Date(data.collection.updatedAt).toLocaleString()}{/if}
        </p>
        <!-- Copy note: placeholder — Phil writes final copy. -->
        <p class="note">
          Pulls your collection fresh from BGG — not a cached read — which can take up to a
          minute since BGG queues the export on its end.
        </p>
        <form
          method="POST"
          action="?/refresh"
          use:enhance={() => {
            refreshing = true;
            refreshMessage = null;
            return async ({ result }) => {
              refreshing = false;
              if (result.type === 'success') {
                refreshMessage = 'Refreshed.';
                await invalidateAll();
              } else {
                refreshMessage =
                  (result.type === 'failure' && (result.data?.message as string)) ||
                  'Refresh failed — try again in a moment.';
              }
            };
          }}
        >
          <button class="btn" type="submit" disabled={refreshing}>
            {refreshing ? 'Refreshing… (up to a minute)' : 'Refresh from BGG'}
          </button>
        </form>
        {#if refreshMessage}<p class="note">{refreshMessage}</p>{/if}
      </section>
    {/if}
  </div>
</div>

<style>
  .settings { max-width: 28rem; margin: var(--space-xl) auto; }
  .settings h1 { font-size: var(--text-heading); font-weight: 700; margin-bottom: var(--space-lg); }

  /* One surface, hairline-divided rows — matches Rail's `.grp` group convention rather than
     introducing a new "card" motif the rest of the app doesn't otherwise use. */
  .panel { border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
  .row { padding: var(--space-lg); display: flex; flex-direction: column; gap: var(--space-sm); }
  .row + .row { border-top: 1px solid var(--border); }
  .lbl {
    font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em;
    color: var(--muted-foreground); font-weight: 600;
  }
  .val { margin: 0; font-size: 0.95rem; }
  form { margin: 0; display: flex; flex-direction: column; gap: var(--space-sm); }

  .inline { display: flex; gap: var(--space-sm); }
  .inline input {
    flex: 1; min-width: 0;
    border: 1px solid var(--border); border-radius: var(--radius);
    background: var(--background); color: var(--foreground);
    padding: var(--space-sm) var(--space-md); font: inherit; font-size: 0.9rem;
  }
  .inline input:focus-visible { outline: 2px solid var(--primary); outline-offset: 1px; }
  .inline input[aria-invalid='true'] { border-color: var(--color-negative); }

  /* Same bordered-button language as the admin collection picker's "Apply" — this page
     shouldn't invent its own heavier button style just because it lives on its own route. */
  .btn {
    flex: none;
    border: 1px solid var(--border); border-radius: var(--radius);
    background: var(--background); color: var(--primary);
    padding: var(--space-sm) var(--space-md); cursor: pointer;
    font: inherit; font-size: 0.85rem; font-weight: 600;
    white-space: nowrap;
  }
  .btn:hover:not(:disabled) { border-color: var(--primary); }
  .btn:disabled { opacity: 0.5; cursor: default; }

  .note { margin: 0; font-size: 0.8125rem; color: var(--muted-foreground); line-height: 1.4; }
  .note.err { color: var(--color-negative); }
  .note.ok { color: var(--color-positive, var(--primary)); }
</style>
