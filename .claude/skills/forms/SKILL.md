---
name: forms
description: Use when creating or editing forms — Zod v4 schema validation, Superforms setup, server actions, Formsnap field components, and shadcn-svelte patterns.
---

# Superforms + Formsnap + Zod

Forms use **Superforms** with **Formsnap** and **Zod v4** schemas. Single source of truth — the schema defines validation, TypeScript types, and drives Formsnap's accessible field markup.

## Critical: Use the `zod4` adapter

The project uses Zod v4. Always import `zod4`, not `zod`:

```typescript
import { zod4 as zod } from 'sveltekit-superforms/adapters';
```

## Core Workflow

### 1. Define the Schema

Add to a single schemas module (e.g. `src/lib/schemas.ts`) at module top level (not inside functions):

```typescript
import { z } from 'zod';

export const createThingSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  slug: z.string().min(1, 'Slug is required').regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers, hyphens only'),
  description: z.string().optional(),
});
```

### 2. Server-Side Setup (`+page.server.ts`)

Return the form from `load`, validate in the action:

```typescript
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 as zod } from 'sveltekit-superforms/adapters';
import { createThingSchema } from '$lib/schemas';
import { fail } from '@sveltejs/kit';

export const load = async () => {
  const form = await superValidate(zod(createThingSchema));
  return { form };
};

export const actions = {
  create: async ({ request }) => {
    const form = await superValidate(request, zod(createThingSchema));
    if (!form.valid) return fail(400, { form });

    const res = await someApiCall(form.data);
    if (!res.ok) {
      // Use message() for API-level errors (not field errors)
      return message(form, 'Failed to create thing', { status: 400 });
    }

    return { form };
  }
};
```

**On redirect after success:** just call `redirect(303, ...)` — Superforms handles it transparently.

### 3. Client-Side (`+page.svelte`)

Pass the full `superForm` return object to Formsnap as `form={sf}`, destructure stores separately:

```svelte
<script lang="ts">
  import { superForm } from 'sveltekit-superforms';
  import { untrack } from 'svelte';
  import * as Form from 'formsnap';
  import { Input } from '$lib/components/ui/input';
  import { Button } from '$lib/components/ui/button';
  import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';

  let { data } = $props();

  // untrack: superForm reads data.form once at init — intentionally non-reactive
  const sf = superForm(untrack(() => data.form), { resetForm: true });
  const { form, enhance, submitting, message } = sf;
</script>

<form method="POST" action="?/create" use:enhance>
  {#if $message}
    <div class="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {$message}
    </div>
  {/if}

  <Form.Field form={sf} name="name">
    <Form.Control>
      {#snippet children({ props })}
        <Form.Label>Name *</Form.Label>
        <Input {...props} bind:value={$form.name} placeholder="My Thing" />
      {/snippet}
    </Form.Control>
    <Form.FieldErrors />
  </Form.Field>

  <Form.Field form={sf} name="description">
    <Form.Control>
      {#snippet children({ props })}
        <Form.Label>Description</Form.Label>
        <Input {...props} bind:value={$form.description} placeholder="Optional description" />
      {/snippet}
    </Form.Control>
    <Form.Description>A brief description of this thing.</Form.Description>
    <Form.FieldErrors />
  </Form.Field>

  <Button type="submit" disabled={$submitting}>
    {#if $submitting}
      <LoaderCircleIcon class="size-4 animate-spin" />
      Creating...
    {:else}
      Create
    {/if}
  </Button>
</form>
```

**Key Formsnap rules:**
- `<Form.Field>` takes the full `sf` object (not the `$form` store): `form={sf}`
- `<Form.Control>` exposes `{ props }` in its snippet (not `{ attrs }`)
- Spread `{...props}` onto the input — it provides `id`, `name`, `aria-*` attributes

## Composite Field Components

For standard fields, use the composite components instead of raw `Form.Field` + `Form.Control`:

```svelte
<!-- Text input -->
<Form.TextField form={sf} name="name" label="Name *" placeholder="..." bind:value={$form.name} />

<!-- Textarea -->
<Form.TextareaField form={sf} name="bio" label="Bio" rows={4} bind:value={$form.bio} />

<!-- Select -->
<Form.SelectField
  form={sf}
  name="status"
  label="Status"
  placeholder="Select a status"
  bind:value={$form.status}
  options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]}
/>

<!-- API error banner (above fields, pass $message directly) -->
<Form.FormError message={$message} />

<!-- Footer buttons — place inside Dialog.Footer or Sheet.Footer for layout -->
<Dialog.Footer>
  <Form.FormFooter submitting={$submitting} submitLabel="Create Thing" oncancel={() => (open = false)} />
</Dialog.Footer>
```

Extra HTML attributes (`oninput`, `class`, `maxlength`, etc.) forward through `...rest` on `TextField` and `TextareaField`. Use raw `Form.Field` + `Form.Control` only for unusual inputs (date pickers, file uploads, checkboxes).

Import: `import * as Form from "$lib/components/ui/form"` — all composite components are in the same namespace as the existing primitives.

Note: pass `submitting={$submitting}` (resolved boolean value), not `{submitting}` (the store). Passing the store always evaluates truthy and permanently disables the submit button.

For inter-field dependencies (e.g., auto-generating a slug from a name field), use `oninput` on the source field — never `$effect`. Superforms uses a single store for all field values; writing to one field in an effect that reads another causes infinite loops.

## Inter-Field Dependencies (e.g. auto-slug from name)

**Do NOT use `$effect`** to sync form fields — `$form` is a Svelte store and reading one property while writing another causes infinite loops even with `untrack`.

Use `oninput` handlers instead:

```svelte
<script lang="ts">
  let slugManuallyEdited = $state(false);

  function generateSlug(name: string) {
    return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
  }
</script>

<Form.Field form={sf} name="name">
  <Form.Control>
    {#snippet children({ props })}
      <Form.Label>Name *</Form.Label>
      <Input
        {...props}
        bind:value={$form.name}
        oninput={() => { if (!slugManuallyEdited) $form.slug = generateSlug($form.name); }}
      />
    {/snippet}
  </Form.Control>
  <Form.FieldErrors />
</Form.Field>

<Form.Field form={sf} name="slug">
  <Form.Control>
    {#snippet children({ props })}
      <Form.Label>Slug *</Form.Label>
      <Input
        {...props}
        bind:value={$form.slug}
        oninput={() => { slugManuallyEdited = $form.slug.length > 0; }}
      />
    {/snippet}
  </Form.Control>
  <Form.FieldErrors />
</Form.Field>
```

## Pre-Populating with Existing Data

Pass the existing record as the first argument to `superValidate`:

```typescript
export const load = async ({ params }) => {
  const thing = await getThing(params.id);
  const form = await superValidate(thing, zod(updateThingSchema));
  return { form };
};
```

## Multiple Forms on One Page

Each call to `superForm` returns its own `sf` object. Use distinct load keys and pass the correct `sf` to each `<Form.Field>`:

```typescript
// +page.server.ts
const createForm = await superValidate(zod(createSchema));
const settingsForm = await superValidate(settings, zod(settingsSchema));
return { createForm, settingsForm };
```

```svelte
<script lang="ts">
  const createSf = superForm(untrack(() => data.createForm), { resetForm: true });
  const settingsSf = superForm(untrack(() => data.settingsForm));
  const { form: createForm, enhance: createEnhance, submitting: createSubmitting } = createSf;
  const { form: settingsForm, enhance: settingsEnhance, submitting: settingsSubmitting } = settingsSf;
</script>

<form action="?/create" use:createEnhance>
  <Form.Field form={createSf} name="name">...</Form.Field>
</form>

<form action="?/updateSettings" use:settingsEnhance>
  <Form.Field form={settingsSf} name="theme">...</Form.Field>
</form>
```

## Setting Field-Level Errors from the Server

```typescript
import { setError } from 'sveltekit-superforms';

if (slugTaken) {
  return setError(form, 'slug', 'This slug is already in use');
}
```

## Client-Side Validation

Add `validators` to get immediate per-field feedback without a round-trip:

```typescript
import { zod4 as zod } from 'sveltekit-superforms/adapters';

const sf = superForm(untrack(() => data.form), {
  resetForm: true,
  validators: zod(createThingSchema),
});
```

## Dependent Field Validation (cross-field)

Use Zod `.refine()` on the schema:

```typescript
const schema = z.object({
  password: z.string().min(8),
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});
```

## Schema Location

Keep all form schemas in one module (e.g. `src/lib/schemas.ts`). Export both the schema and its inferred type:

```typescript
export const createThingSchema = z.object({ ... });
export type CreateThing = z.infer<typeof createThingSchema>;
```

## Additional Resources

- [Superforms docs](https://superforms.rocks/)
- [Formsnap docs](https://formsnap.dev/)
