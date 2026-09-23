# Tools nav and map promotion — plan

**Spec:** `docs/superpowers/specs/2026-09-23-tools-nav-map-promotion-design.md`
**Branch:** `feat/tools-nav` from `main` (worktree `../bgg-viewer-tools-nav`)
**Delivery:** one PR, `feat(nav): a Tools menu, and the map promoted to /map`. Phil merges.

## Goal

The map lives at `/map`, is reachable from a Tools menu in the nav (desktop and mobile), and
every old `/dev/map?…` link lands on the same view.

## What the code already gives us

- `MAP_PATH` in `src/lib/map/route.ts` is the only producer of map links (`mapHref`, used
  once, by Explore's view toggle).
- The map page is path-agnostic: it reads `location.search` and writes back with
  `history.replaceState(…, '?qs' | location.pathname)`. Moving the file needs no edits inside.
- `+layout.svelte` has one dropdown (`gamesOpen`/`gamesMenu`), a shared click-away/Escape
  effect, and a close-on-navigate effect. `onHome` is the fallback, so any new destination
  must be named or it lights Home.
- The story and network prototypes carry their own `if (!dev) error(404)` gates.

## Steps (one commit each)

### 1. Move the route — `refactor(map): serve the map at /map`

- `git mv src/routes/(app)/dev/map/+page.svelte` and `+page.server.ts` →
  `src/routes/(app)/map/`.
- `MAP_PATH = '/map'`.
- New `src/routes/(app)/dev/map/+page.server.ts`: `redirect(308, '/map' + url.search)`.
  Under `(app)`, so a signed-out visitor goes to login with `next=/dev/map?…` first, then
  gets redirected here — both hops keep the query.
- Rewrite the stale header comments (page: `/dev/map` → `/map`; server load: drop the
  "unlisted" and "`/dev` is only a path" notes, say it is linked from Tools). The
  `/dev/map/network` pointer in `EmbeddingMap.svelte` stays — that prototype doesn't move.

**Verify:** new `src/lib/map/route.test.ts` — `mapHref` with and without scope/view yields
`/map…`; `exploreHref` unchanged. `just check`, `just test`.

### 2. Tools menu, desktop — `feat(nav): a Tools menu, holding the map`

- In `+layout.svelte`: `onMap = path === '/map' || path.startsWith('/map/')`;
  `inTools = onMap`; `onHome = !inGames && !inTools && !onAbout`.
- `toolsOpen`, `toolsMenu` state. Toggling one menu closes the other.
- Extend the navigate effect and the click-away/Escape effect to cover `toolsOpen`.
- Markup: second `.menu` after Games, same `.trigger` / `.pop` rows:
  `Map` — `PLACEHOLDER(Phil): one-line description`.
- Update the "A menu, not a row of tabs" comment and the About comment to the
  Games-is-catalog / Tools-acts-on-it split — `PLACEHOLDER(Phil)` wording flagged once.
- No new CSS expected; reuse `.menu`/`.pop`.

**Verify:** `just check`; `just dev` (Phil's server) in light and dark — Tools opens and
closes on outside click, Escape and navigation; opening Tools closes Games and vice versa;
trigger active on `/map`, Home not.

### 3. Mobile menu — `feat(nav): group the narrow menu into Games and Tools`

- In the `.navmenu` list: a non-interactive label (`<span class="grp" aria-hidden>` or a
  `role="presentation"` heading) above Discover…What's New ("Games") and above Map
  ("Tools"). Home and About stay ungrouped.
- `.pop .grp` style from tokens (`--muted-foreground`, small caps-ish size), no hard-coded
  colours.

**Verify:** `just check`; narrow viewport in both themes — groups read, Map is one tap.

### 4. Final checks

`just check`, `just test`, `just build`. Manually: Explore's Map → lands on `/map?scope`;
"See these as a list →" returns intact; `/dev/map?<scope>` → `/map?<scope>`.

## Risks / rollback

- **Redirect loop / query loss:** covered by the 308 carrying `url.search`; checked by hand.
- **Menus fighting over the click-away handler:** both checked in one handler, as today.
- **Rollback:** revert the PR. `/dev/map` comes back as the page; nothing persistent changes.
- No artifact, catalog, warehouse or IAM changes.

## Out of scope

Map polish (09-21 handoff list), a shared `NavMenu` component, Recommend/Compare/Timeline,
logged-out map access.
