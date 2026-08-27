<script lang="ts">
  import { superForm } from 'sveltekit-superforms';
  import { untrack } from 'svelte';
  import { zod4 as zod } from 'sveltekit-superforms/adapters';
  import { settingsSchema } from '$lib/schemas';
  import { Stack } from '$lib/components/ui/layout';

  let { data } = $props();

  const sf = superForm(untrack(() => data.form), { validators: zod(settingsSchema) });
  const { form, errors, enhance, submitting, message } = sf;
</script>

<svelte:head><title>Settings · bgg-viewer</title></svelte:head>

<div class="auth">
  <form method="POST" use:enhance>
    <Stack gap="md">
      <h1>Settings</h1>

      {#if $message}
        <p class="banner" class:ok={!$errors.bgg_username}>{$message}</p>
      {/if}

      <label class="field">
        <!-- Copy note: placeholder — Phil writes final copy. -->
        <span>BGG username <em>(optional)</em></span>
        <input
          type="text"
          name="bgg_username"
          autocomplete="off"
          bind:value={$form.bgg_username}
          aria-invalid={$errors.bgg_username ? 'true' : undefined}
        />
        {#if $errors.bgg_username}<span class="err">{$errors.bgg_username}</span>{/if}
        <span class="hint">Links your account for the "My collection" catalog filter. Leave blank to unlink.</span>
      </label>

      <button class="submit" type="submit" disabled={$submitting}>
        {$submitting ? 'Saving…' : 'Save'}
      </button>
    </Stack>
  </form>
</div>

<style>
  .auth { max-width: 24rem; margin: var(--space-xl) auto; }
  .auth h1 { font-size: var(--text-heading); font-weight: 700; }
  form { margin: 0; }
  .field { display: flex; flex-direction: column; gap: var(--space-sm); }
  .field > span { font-size: 0.875rem; color: var(--muted-foreground); }
  .field > span em { font-style: normal; opacity: 0.7; }
  .field input {
    border: 1px solid var(--border); border-radius: var(--radius);
    background: var(--background); color: var(--foreground);
    padding: var(--space-sm) var(--space-md); font: inherit;
  }
  .field input:focus-visible { outline: 2px solid var(--primary); outline-offset: 1px; }
  .field input[aria-invalid='true'] { border-color: var(--color-negative); }
  .err { font-size: 0.8125rem; color: var(--color-negative); }
  .hint { font-size: 0.8125rem; }
  .banner {
    border: 1px solid var(--border); border-radius: var(--radius);
    background: var(--muted); color: var(--foreground);
    padding: var(--space-sm) var(--space-md); font-size: 0.875rem;
  }
  .banner.ok { border-color: var(--color-positive, var(--border)); }
  .submit {
    border: none; border-radius: var(--radius); cursor: pointer;
    background: var(--primary); color: var(--primary-foreground);
    padding: var(--space-sm) var(--space-md); font: inherit; font-weight: 600;
  }
  .submit:disabled { opacity: 0.6; cursor: default; }
</style>
