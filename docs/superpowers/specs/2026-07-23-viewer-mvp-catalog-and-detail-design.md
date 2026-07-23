# BGG Viewer — MVP: Catalog Browse/Search + Game Detail — Design

**Date:** 2026-07-23
**Status:** Draft for review

## Goal

Stand up `bgg-viewer` — a new SvelteKit front-end that consumes the decoupled
warehouse read API — and ship the first end-to-end slice: **browse/search the
game catalog** with facets BGG's own site won't give you, and **drill into a
game's detail** (features + predictions + similarity + embedding). This is the
foundation that eventually replaces `bgg-dash-viewer`.

### Success criteria

- A logged-in user can open the app, filter/sort/paginate the catalog
  ("games published in 2025", "best at 5 players with complexity > 3"), and
  click through to a game detail page.
- The browser never talks to the warehouse API directly — all warehouse calls
  go through the SvelteKit server, which authenticates to the gated Cloud Run
  service with an ID token.
- Auth is "simple like dash-viewer": email/password against the existing
  `core.users` table, session cookie, registration gated by an invite code.
- The build follows the front-end kit's conventions (Stack/AutoGrid/Split,
  tokens, TanStack, Svelte 5 runes) via the three skills copied into
  `.claude/skills/`.

## Background & motivating problem

`bgg-dash-viewer` is a Flask + Dash app that queries BigQuery **directly** from
the front-end process. We are decoupling: the warehouse now exposes a read API
(`services/warehouse_api/` in `bgg-data-warehouse`) with per-game point lookups
already built (`GET /games/{id}` and sub-resources). This project is the *new
front-end* that consumes that API — designed so the API and UI are independent,
and so we can query the warehouse in ways BGG's data model doesn't allow.

Two jobs motivate the whole front-end (this spec covers the first end-to-end
slice of Job 1):

1. **Flexible querying** — faceted catalog search.
2. **Enrichments** — predictions, similarity, embeddings (later slices).

## Architecture (inherited from the kit, decided here)

- **Stack:** SvelteKit 2, SSR + `adapter-node` (a long-running Node server),
  Tailwind v4 + OKLCH tokens, shadcn-svelte on bits-ui, Svelte 5 runes,
  intrinsic layout primitives. Per the copied `frontend-patterns` skill.
- **Data boundary (the load-bearing decision):**
  `browser → SvelteKit Node server → warehouse API`.
  - The browser calls **SvelteKit remote functions** (`$app/server`) / server
    `load`, never the warehouse.
  - The SvelteKit server holds the service identity and mints a Google **ID
    token** for the warehouse API's audience on each call. This extends the
    existing IAM gating: add the viewer's service account to
    `warehouse_api_invoker_members`.
- **Per-view client vs. server (not a global stance):** each view fetches the
  result set it shows and decides locally.
  - **Game detail** — point lookup, tiny → server `load` of `GET /games/{id}`.
  - **Catalog** — potentially the whole ~140k-row catalog → filter/sort/
    paginate **server-side in the warehouse API** (see dependency below);
    the client holds only the current page.

## MVP views

### 1. Catalog browse/search (`/games`)

The faceted directory. Toolbar of facets + a results table + pagination.

- **Facets / params** (mirroring `bgg-dash-viewer`'s `get_games`): year range,
  rating range, geek-rating range, complexity range, player-count (+ "best at"),
  publishers[], designers[], categories[], mechanics[]; `sort_by` / `sort_order`;
  `limit` / `offset`.
- **Data flow:** filter state lives in the **URL** (shareable, reload-safe). A
  remote function calls the warehouse list endpoint with that state; TanStack
  Query keys on it (stale-while-revalidate). The table renders the returned
  page only — **no client-side faceted model** at this scale.
- **UI:** kit's table Pattern A toolbar (search + faceted filters) but driven by
  server round-trips; a `Pagination` control since results are paged.
- **Facet options** (the values to populate publisher/designer/category/
  mechanic pickers) come from a warehouse facet-options endpoint
  (dash-viewer's `get_all_filter_options`).

### 2. Game detail (`/games/{id}`)

The full document we already serve. **Unblocked — uses the existing API.**

- Server `load` → `GET /games/{id}` → features, player counts, predictions,
  embedding coords, similar (precomputed default), provenance.
- Layout: `Split` (info card + KPI stack) + sections for predictions, similar
  games, player-count recommendations. Charts via LayerChart where useful.

## Cross-repo dependency: the warehouse list/search endpoint

The catalog view is **blocked** on a warehouse API endpoint that does not exist
yet. Today the API does per-game point lookups only. We need:

- `GET /games` — server-side filter + sort + paginate, returning a page of game
  rows + a total count. Params as in the Catalog facets above.
- `GET /games/facets` (or `/filters`) — distinct publishers/designers/
  categories/mechanics for the pickers.

**This is warehouse-side work** and belongs in `bgg-data-warehouse` (its
services layer, its Dataform/serving tables, its Actions-only deploy). It gets
its **own spec + plan there**; this spec only pins the *interface* the viewer
consumes. Sequencing: the list endpoint is the critical path for the catalog;
the detail page can proceed in parallel against the existing API.

Open cost/perf question for that companion work: whether `GET /games` reads
`games_features` directly (unclustered, ~200 MB/scan) or a purpose-built
catalog serving table (narrow columns, clustered/partitioned for filter
pruning). Decide there, measured — same discipline as the profile/neighbors work.

## Auth (simple, like dash-viewer)

Replicate dash-viewer's model in SvelteKit; **reuse the same `core.users`
table** so existing accounts carry over.

- **Session:** signed session cookie that **carries the user identity**
  (user_id + email + display_name), HMAC-signed by a server secret.
  `hooks.server.ts` verifies the signature and exposes `event.locals.user` with
  **no per-request BigQuery read**. Unauthed requests to app routes redirect to
  `/login`. Modest TTL (e.g. 7 days), re-issued on activity.
- **Login:** form action verifies email + bcrypt password against `core.users`.
- **Register:** form action gated by a shared invite code (`REGISTRATION_CODE`);
  bcrypt-hash; insert into `core.users`. (This is how access is granted to
  others — share the code.)
- **Logout:** clear the cookie.
- bcrypt in Node (e.g. `bcryptjs` / `@node-rs/bcrypt`); the hash format is
  compatible with the existing bcrypt hashes in the table.

## Delivery

- **New repo `bgg-viewer`** (this folder). Branch off `main`; PR to `main`;
  never develop on `main`. Follow the copied superpowers spec→plan→TDD flow.
- **Deploy is out of scope for this spec** but will be Actions-only (Cloud Build
  workflow + Terraform for the Cloud Run service and the invoker-members grant),
  consistent with the warehouse. A later infra slice.

## Resolved decisions

1. **Landing page:** we *do* want a landing page and it must be **extremely
   performant** — but its content/design is deferred to its own discussion. For
   this MVP, `/games` (catalog) and `/games/{id}` (detail) are directly
   reachable; the landing page is a near-term follow-up, not part of this slice.
2. **Warehouse list endpoint:** confirmed — `GET /games` + facets is built in
   `bgg-data-warehouse` under its own spec + plan. This spec only pins the
   interface the viewer consumes.
3. **Scaffold method:** install `just` and use the kit's recipes. Environment
   checked: Node v22.17.1 ✓, pnpm via `corepack enable`, `just` to be installed.
4. **Session:** **stateless signed cookie carrying minimal identity** (user_id +
   email + display_name, HMAC-signed). Validating a request is pure crypto — zero
   per-request BigQuery, unlike dash-viewer's Flask-Login `user_loader` which
   reads the users table every request. Revocation is traded for a modest cookie
   TTL; acceptable at personal scale.

## Out of scope (later slices)

- Enrichment views: upcoming/new predictions, similarity explorer, embedding map,
  user-collection predictions.
- Entity pages (publisher/designer/artist/family/category/mechanic directories).
- Deploy/infra (Cloud Run, Terraform, CI) — its own slice.
- Gating the predictive-models services (tracked separately).
