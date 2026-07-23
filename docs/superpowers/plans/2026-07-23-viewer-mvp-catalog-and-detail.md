# BGG Viewer MVP — Catalog Browse/Search + Game Detail — Plan

> **Flow:** implement task-by-task; stop after each PR for review. TDD where
> logic is unit-testable (auth utils, API client); front-end verify
> (`svelte-check` + dev server + light/dark) for pages. Follows the copied
> `frontend-patterns` / `forms` / `style-rules` skills.

**Spec:** [specs/2026-07-23-viewer-mvp-catalog-and-detail-design.md](../specs/2026-07-23-viewer-mvp-catalog-and-detail-design.md)

**Goal:** A logged-in user can browse/search the catalog and open a game's
detail page, with all warehouse calls proxied through the SvelteKit server
using an ID token.

## Delivery

- New repo `bgg-viewer`. **Never develop on `main`.** Each phase below is one
  branch → PR → `main`, reviewed before the next starts.
- `git init` the repo as the first action of PR 1.
- Deploy (Cloud Run + Terraform invoker grant + CI) is a **later slice**, out of
  scope here.

## Dependency note

The **Catalog page (PR 5)** consumes a warehouse `GET /games` list + facets
endpoint that **does not exist yet** — it is built in `bgg-data-warehouse` under
its own spec/plan. PR 5 defines the TypeScript contract and builds the UI
against it; final wiring waits on that companion work. **PRs 1–4 have no such
dependency** (scaffold, auth, and detail all work against the existing API).

---

## PR 1 — Scaffold the SvelteKit app

**Branch:** `feat/scaffold`

**Affected:** new app tree (`package.json`, `svelte.config.js`, `vite.config.ts`,
`src/app.css`, `src/lib/components/ui/layout/*`, `src/lib/utils/cn.ts`,
`src/routes/(app)/+layout.svelte`), `.gitignore`, `README.md`.

- [ ] **Step 1:** `git init`; add a Node `.gitignore` (`node_modules`,
  `.svelte-kit`, `build`, `.env*`).
- [ ] **Step 2:** Install prerequisites: `corepack enable` (pnpm), install `just`.
  Verify `node -v` ≥ 20, `pnpm -v` ≥ 9.
- [ ] **Step 3:** Scaffold via the kit's recipe / documented commands:
  `sv create` (minimal, ts), then the `pnpm add` blocks from
  `basecamp-rebuild-kit.md` (framework, Tailwind v4, bits-ui, TanStack, forms,
  vitest). Adapter = `adapter-node`.
- [ ] **Step 4:** Enable the two load-bearing features in `svelte.config.js`:
  `experimental.remoteFunctions: true` and compiler `experimental.async: true`.
  `vite.config.ts` = tailwind + sveltekit plugins.
- [ ] **Step 5:** Copy in `app.css` tokens (define a first-pass BGG brand palette
  as OKLCH; keep the chart-1..5 + spacing + `--chart-h` tokens) and the layout
  primitives (`Stack`/`AutoGrid`/`Split`/`tokens.ts`) + `cn.ts` verbatim from the
  kit's `kit/` dir.
- [ ] **Step 6:** Minimal `(app)/+layout.svelte` shell: header from
  `breadcrumbs`+`subtitle`, `QueryClientProvider` + `header_actions` context,
  `mode-watcher` for dark mode. A placeholder `(app)/+page.svelte`.
- [ ] **Verify:** `pnpm exec svelte-check` clean; `pnpm dev` serves the
  placeholder page; toggle light/dark works.

---

## PR 2 — Auth (session + login/register/logout)

**Branch:** `feat/auth`

**Affected:** `src/lib/server/auth/` (session sign/verify, bcrypt, user repo),
`src/lib/schemas.ts` (Zod login/register), `hooks.server.ts`,
`src/routes/login/`, `src/routes/register/`, `src/routes/logout/`,
`(app)/+layout.server.ts` (guard). Reuses BigQuery `core.users`.

- [ ] **Step 1 (TDD):** Session cookie sign/verify util — HMAC over
  `{user_id,email,display_name,iat}`. Tests: round-trips; rejects tampered
  payload; rejects expired (TTL). Then implement.
- [ ] **Step 2 (TDD):** bcrypt `verifyPassword` / `hashPassword` (Node bcrypt).
  Test: a known dash-viewer-format hash verifies against its password. Then
  implement.
- [ ] **Step 3:** User repo (server-only): `getByEmail`, `create`,
  `updateLastLogin` against `core.users` via `@google-cloud/bigquery`,
  parameterized. (Read path used only at login — not per request.)
- [ ] **Step 4:** `hooks.server.ts` — verify the cookie, set
  `event.locals.user` (or null). **No BigQuery read here.**
- [ ] **Step 5:** Zod schemas + Superforms form actions (per `forms` skill):
  `login` (verify → set cookie → redirect `next`), `register` (invite-code gate
  via `REGISTRATION_CODE` → bcrypt → insert → cookie), `logout` (clear cookie).
- [ ] **Step 6:** `(app)/+layout.server.ts` guard: redirect to
  `/login?next=…` when `locals.user` is null.
- [ ] **Verify:** unit tests green; manual — register with code, log in, hit a
  protected route, log out; bad password / bad code rejected; `svelte-check`
  clean.

---

## PR 3 — Warehouse API client (server-side, ID-token auth)

**Branch:** `feat/warehouse-client`

**Affected:** `src/lib/server/warehouse/client.ts`, `src/lib/data/remote.remote.ts`
(first remote function), env config (`WAREHOUSE_API_URL`).

- [ ] **Step 1 (TDD):** Typed client `getGame(id)` → `GET /games/{id}`. Test with
  a mocked fetch: correct URL, `Authorization: Bearer <id-token>` header,
  parses JSON, maps non-200 to a typed error. Then implement.
- [ ] **Step 2:** ID-token minting for the warehouse audience via
  `google-auth-library` (`getIdTokenClient(audience)`); cache the client. Falls
  back to `gcloud`/ADC locally for dev against the deployed gated service.
- [ ] **Step 3:** Expose `getGame` as a remote `query()` in `remote.remote.ts`;
  centralize keys in `src/lib/query/keys.ts`.
- [ ] **Verify:** unit tests green; a scripted/dev call to the **deployed gated**
  `GET /games/{id}` returns 200 with a real payload (server-side token works);
  an unauthenticated direct call still 403s (gating intact).

---

## PR 4 — Game detail page

**Branch:** `feat/game-detail`

**Affected:** `src/routes/(app)/games/[id]/+page.server.ts` + `+page.svelte`,
colocated section components.

- [ ] **Step 1:** `+page.server.ts` `load` → `getGame(id)`; return the document
  + `breadcrumbs`/`subtitle`; 404 when the API returns none.
- [ ] **Step 2:** Page layout per `frontend-patterns`: `Split` (info card +
  KPI stack), then sections — predictions, similar games (precomputed default),
  player-count recommendations. `AutoGrid` of `Card.Kpi` for headline numbers.
- [ ] **Step 3:** Any chart (e.g. player-count recommendation bars) via
  LayerChart in `.chart-area`, colors from `var(--chart-N)` per `style-rules`.
  Wrap fallible sections in `<svelte:boundary>`.
- [ ] **Verify:** renders a real game (e.g. Catan) end-to-end through the
  server→warehouse path; `svelte-check` clean; light + dark both checked;
  unknown id → 404.

---

## PR 5 — Catalog browse/search  *(depends on warehouse `GET /games`)*

**Branch:** `feat/catalog`

**Affected:** `src/routes/(app)/games/+page.svelte` (+ colocated toolbar/table),
`src/lib/data/remote.remote.ts` (list + facets), `src/lib/query/keys.ts`,
a shared request/response type module (the contract).

- [ ] **Step 1:** Define the **contract** — TS types for the list request
  (year/rating/geek/complexity ranges, player-count + best-at, publishers[]/
  designers[]/categories[]/mechanics[], sort_by/sort_order, limit/offset) and
  the response (`{ rows, total }`) + facet-options shape. This is the interface
  the companion warehouse endpoint implements.
- [ ] **Step 2:** URL as the source of truth for filter state (shareable,
  reload-safe): read/write params via SvelteKit `page`/`goto`.
- [ ] **Step 3:** Remote functions `getGames(params)` + `getFacetOptions()`;
  TanStack Query keyed on the params (stale-while-revalidate). **No client-side
  faceted model** — the table renders the returned page only.
- [ ] **Step 4:** UI — Pattern A toolbar (search + faceted filter pickers
  populated from facet options) + results table + a `Pagination` control (server
  paging). Row click → `/games/{id}`.
- [ ] **Verify (once endpoint lands):** "published in 2025" and "best at 5,
  complexity > 3" return correct pages; sort + pagination work; `svelte-check`
  clean; light + dark checked. Until then: build/verify against a mock
  implementing the contract.

---

## Risks / rollback

- **Cross-repo blocker:** PR 5 is gated on the warehouse endpoint. Mitigation:
  the contract-first split lets PR 5's UI be built and reviewed against a mock;
  only final verification waits.
- **bcrypt interop:** Node bcrypt must verify dash-viewer's existing hashes —
  covered by the Step-2 test in PR 2 before anything depends on it.
- **ID-token / IAM:** the viewer's runtime identity must be in
  `warehouse_api_invoker_members`. Local dev uses ADC against the gated service;
  the members grant is part of the (later) deploy slice.
- Each PR is independently revertable; nothing here is a one-way migration.

## Out of scope

Enrichment views, entity pages, the landing page's content/design, deploy/infra,
and the warehouse `GET /games` implementation (companion plan in
`bgg-data-warehouse`).
