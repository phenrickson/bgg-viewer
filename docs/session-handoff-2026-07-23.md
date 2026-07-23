# BGG Viewer — Session Handoff (2026-07-23)

Read this first to navigate the next session. It captures state, environment
gotchas, decisions already made (don't relitigate), and exactly what's left.

## TL;DR

- New repo `bgg-viewer` (SvelteKit front-end) is scaffolded and running. **PR 1
  (scaffold) + local-dev ergonomics are done and merged to `main`.**
- **PR 2 (auth) is IN FLIGHT on branch `feat/auth` — incomplete and NOT yet
  type-checked/built.** Session + password modules are done and unit-tested
  (10 tests green); the BigQuery user repo, hooks, schemas, types, and shell are
  written but the **login/register/logout routes are not yet created** and the
  landing page has **not** been moved under the guarded `(app)` group.
- Git is **local-only** (no GitHub remote, by choice). Branch-per-PR, merge to
  `main` locally.

## How to work in this repo (ENVIRONMENT — read before running anything)

Environment setup cost real time this session. Don't repeat it:

- **pnpm** is installed via **scoop**: `C:\Users\philh\scoop\shims\pnpm.exe`
  (v11.16.0). **Do NOT** reinstall it via winget/npm/corepack — that caused a
  pnpm store-location conflict. If you ever see
  `ERR_PNPM_UNEXPECTED_STORE`, the fix is: `rm -rf node_modules && pnpm install`.
- In the **Bash tool**, pnpm is not on PATH — prepend
  `export PATH="/c/Users/philh/scoop/shims:$PATH"`. In the user's own terminal
  and the PowerShell tool (fresh shell), pnpm is on PATH.
- **just** is installed (1.57.0). The `justfile` uses PowerShell as its shell.
- Recipes: `just dev` (= `pnpm exec vite dev --open --port 5173`), `just check`,
  `just test`, `just build`, and **`just verify`** (check + test + build — the
  pre-PR gate). Note `just dev` calls vite **directly**; do NOT switch it back to
  `pnpm dev -- --flags` (PowerShell/pnpm drops the `--`, so flags are ignored).
- Node v22.17.1. Never develop on `main`.

## What's done (on `main`)

- SvelteKit 2 + `adapter-node`, Svelte 5 runes, Tailwind v4, vitest — scaffolded
  via `sv create` + `sv add`. **Config lives in `vite.config.ts`** (this
  SvelteKit version has no `svelte.config.js`).
- `src/app.css`: design tokens (first-pass BGG orange palette, full light/dark) +
  `.chart-area`. Light/dark reviewed and approved.
- Layout primitives `Stack`/`AutoGrid`/`Split` + `cn`, copied from the kit.
- Tokenized shell (`src/routes/+layout.svelte`) with dark-mode toggle.
- `justfile`, `.env.example`, README with the `just` workflow.
- **The `experimental` add-on (remoteFunctions + async) was DEFERRED to PR 3** —
  enable with `sv add experimental` when the data layer needs it.

## IN FLIGHT: PR 2 (auth) on `feat/auth` — INCOMPLETE, UNVERIFIED

### Written (uncommitted on `feat/auth`)

Deps added: `bcryptjs` `@types/bcryptjs` `sveltekit-superforms` `formsnap`
`zod` (4.4.3) `@google-cloud/bigquery`.

- `src/lib/server/auth/session.ts` (+ `.test.ts`) — stateless HMAC session token
  carrying identity; `signSession`/`readSession(token, secret)`. **7 tests green.**
- `src/lib/server/auth/password.ts` (+ `.test.ts`) — bcryptjs; verifies the
  Python-`$2b$` hashes in `core.users` (interop proven; regression test embeds a
  real Python hash). **3 tests green.**
- `src/lib/server/auth/cookie.ts` — `SESSION_COOKIE` name + cookie options.
- `src/lib/server/auth/users.ts` — BigQuery repo over `core.users`
  (`getUserByEmail`, `createUser`, `updateLastLogin`), project `bgg-data-warehouse`,
  dataset `core`.
- `src/hooks.server.ts` — resolves cookie → `locals.user` (no per-request BQ).
- `src/lib/schemas.ts` — `loginSchema` / `registerSchema` (Zod v4).
- `src/routes/+layout.server.ts` — exposes `user` to all pages.
- `src/routes/(app)/+layout.server.ts` — the **guard** (unauthed → `/login?next=`).
- `src/app.d.ts` — `App.Locals.user`, `App.PageData`.
- `src/routes/+layout.svelte` — auth-aware header (Log in / Log out).

### Remaining to finish PR 2 (do these next)

1. **First, run `just check`** — the auth infra above has NOT been type-checked.
   Expect and fix type errors (superforms/zod v4 API, `$env/dynamic/private`,
   `$types` for the new routes). Use the superforms **`zod4` / `zod4Client`**
   adapters (confirmed exported).
2. **Create the routes** (not yet written):
   - `src/routes/login/+page.server.ts` (load: redirect if `locals.user`; action:
     `superValidate` → `getUserByEmail` → `verifyPassword` → `cookies.set(signSession(...))`
     → redirect to `?next`) + `+page.svelte` (superForm; plain inputs are fine —
     Formsnap can come later).
   - `src/routes/register/+page.server.ts` (same + invite-code check against
     `env.REGISTRATION_CODE`; `getUserByEmail` dup check; `hashPassword`;
     `createUser`) + `+page.svelte`.
   - `src/routes/logout/+server.ts` — `POST` clears cookie, redirects to `/login`.
3. **Move the landing page under the guard**: `src/routes/+page.svelte` →
   `src/routes/(app)/+page.svelte` (delete the old one) so `/` requires auth.
   Currently `/` is still served unguarded.
4. **`just verify`** — check + test + build all green.
5. **Manual smoke** (needs env + gcloud ADC — see below): register with the code,
   log in, hit `/`, log out; bad password / bad code rejected.
6. **Commit** `feat/auth`, then merge to `main` locally.

### Local env needed to actually run auth

Create `bgg-viewer/.env` (gitignored; see `.env.example`):
- `SESSION_SECRET=` any long random string.
- `REGISTRATION_CODE=` reuse dash-viewer's value (so the same code works). It's a
  GitHub secret on `bgg-dash-viewer`; ask the user for the value.
- `GCP_PROJECT_ID=bgg-data-warehouse`.
- BigQuery access uses **ADC** — the user's `gcloud auth application-default login`
  identity must read/write `bgg-data-warehouse.core.users` (it does; dash-viewer
  uses the same table).

## Key decisions (settled — don't relitigate)

- **Data boundary:** `browser → SvelteKit server → warehouse API`. Browser never
  hits the warehouse; the SK server mints an ID token (PR 3). Extends the
  existing IAM gating (add viewer's SA to `warehouse_api_invoker_members`).
- **Per-view client vs. server:** decided per view by result-set size, not
  globally. Only "browse the whole catalog" is server-side; scoped views are
  client-side.
- **Session:** stateless signed cookie carrying identity — zero per-request BQ
  (fixes dash-viewer's Flask-Login per-request user read). 7-day TTL; revocation
  traded away.
- **Auth reuses `core.users`** (same table as dash-viewer); bcrypt interop proven.
- **Local-only git**, branch-per-PR.
- **front-end-design stays pristine** — it's the reusable kit; its skills were
  copied into `bgg-viewer/.claude/skills/` and are owned here now.

## The plan beyond PR 2

Full plan: `docs/superpowers/plans/2026-07-23-viewer-mvp-catalog-and-detail.md`.
Spec: `docs/superpowers/specs/2026-07-23-viewer-mvp-catalog-and-detail-design.md`.

- **PR 3 — Warehouse API client:** enable `experimental` (remoteFunctions/async);
  server-side typed client + **ID-token minting** (`google-auth-library`) for the
  gated Cloud Run service; `getGame(id)` via `GET /games/{id}` (already exists in
  the warehouse API). Verify against the deployed gated service.
- **PR 4 — Game detail page** `/games/[id]`: server `load` → client; `Split` +
  KPIs + sections (predictions, similar, player counts). Unblocked.
- **PR 5 — Catalog browse/search** `/games`: **BLOCKED** on a warehouse
  `GET /games` list + facets endpoint that does not exist yet. That endpoint is
  **warehouse-side work** (its own spec/plan in `bgg-data-warehouse`). PR 5 is
  contract-first: define the request/response TS types, build the UI against a
  mock, wire when the endpoint lands. URL-driven filter state, server pagination,
  **no client-side faceted model** at ~140k rows.

### Companion warehouse work (separate, not started)

`GET /games` (server-side filter/sort/paginate + total) and `GET /games/facets`
in `bgg-data-warehouse`, mirroring dash-viewer's `get_games` /
`get_all_filter_options`. Deploy Actions-only. Open perf question: read
`games_features` directly vs. a purpose-built catalog serving table (decide
measured, same discipline as the profile/neighbors cost work).

## Git state

- Branch `main`: skeleton + scaffold + DX (merged).
- Branch `feat/auth`: checked out, **many uncommitted files** (the auth infra
  above). `git -C bgg-viewer status` to see them.
- No remote.

## Pointers

- Spec: `docs/superpowers/specs/2026-07-23-viewer-mvp-catalog-and-detail-design.md`
- Plan: `docs/superpowers/plans/2026-07-23-viewer-mvp-catalog-and-detail.md`
- House skills: `.claude/skills/{frontend-patterns,forms,style-rules}/`
- Warehouse API being consumed: `bgg-data-warehouse/services/warehouse_api/`
- dash-viewer auth being replicated: `bgg-dash-viewer/src/auth/`
