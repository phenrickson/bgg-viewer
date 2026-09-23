# Tools nav and map promotion — design

**Date:** 2026-09-23
**Status:** Design agreed, not yet planned
**Follows:** `docs/superpowers/specs/2026-09-16-embedding-map-explore-design.md`,
`docs/session-handoff-2026-09-21-map-site-integration.md`

## Problem

The embedding map shipped in 0.0.23 at `/dev/map`, unlisted. It works well deployed, but the
only way in is the "Map →" link in Explore's view toggle, which you only find if you are
already filtering. It needs a way in from the nav, at a URL that doesn't say `dev`.

The map is also the first of several tools planned: a streamlined "recommend me a game"
built on the similarity pieces, a "compare these games" view, and a timeline of top games
over time. The nav should have room for them without each one claiming a top-level slot.

## Decision

Top-level nav becomes **Home · Games ▾ · Tools ▾ · About**.

- **Games** is the catalog — ways into the set of games: Discover, Explore, Upcoming,
  What's New. Discover stays here: it is a simplified Explore, a way into the catalog.
- **Tools** is things you do *with* games or a set of games. It launches with one row, Map;
  Recommend, Compare and Timeline are added as each ships. Nothing is listed as coming soon.

A one-row menu is accepted as the starting state. Promoting Map to a top-level link now and
demoting it into Tools later would move navigation people have learned; this doesn't.

Recommend (from games you like) and Discover (from what you want) both end in a shortlist.
Their one-line menu descriptions carry the distinction.

## Changes

### 1. Route: `/dev/map` → `/map`

- Move `src/routes/(app)/dev/map/+page.svelte` and `+page.server.ts` to
  `src/routes/(app)/map/`. The page stays under `(app)`, so it stays sign-in only.
- `MAP_PATH` in `src/lib/map/route.ts` becomes `'/map'`. It is already the single source for
  `mapHref`, so Explore's link follows with no other change.
- `/dev/map` keeps a `+page.server.ts` that redirects (308) to `/map` **with the querystring
  intact**, so shared links keep their scope and encodings.
- Update the header comments on the page and its server load: the "unlisted rather than
  promoted" and "`/dev` is now only a path" notes no longer hold.

`/map`, not `/tools/map`: shorter to share, and the menu grouping can change without
changing URLs.

### 2. Prototypes stay under `/dev`

`/dev/map/network`, `/dev/map/network/sigma` and `/dev/map/story` stay where they are,
still behind their own dev gates. Because the redirect lives in `dev/map/+page.server.ts`,
it applies only to that exact path and the children keep resolving.

### 3. Tools menu, desktop

In `src/routes/+layout.svelte`, add a second dropdown after Games using the same
`.menu` / `.trigger` / `.pop` markup and the same bold-label-plus-description rows:

- `Map` — *PLACEHOLDER: one-line description (Phil)*

Needs its own open state and ref (`toolsOpen`, `toolsMenu`), and the existing
outside-click / Escape handling extended to close it. Opening one menu closes the other.
`inTools` lights the trigger on `/map`.

No shared `NavMenu` component yet. Two copies of the markup are tolerable; extract when a
third dropdown shows up, as its own commit.

### 4. Mobile menu

The narrow-screen menu stays one flat list — the existing comment already rejects submenus
— but gains small non-interactive group labels, **Games** and **Tools**, above their rows.
Map is added under Tools.

### 5. Nav comment

The comment above About says every top-level item is a dataset. Rewrite it for the new
split: Games is the catalog, Tools is instruments that act on it, About explains both and
stays last. *PLACEHOLDER wording (Phil).*

## Not doing

- **A new Explore ↔ Map switch.** It already exists: Explore's List | Visualize | Map →
  control, and the map's "See these as a list →". Map is deliberately a link, not a tab.
- **Map polish** from the 09-21 handoff (`yearActive`, the Colour select, initial framing,
  ring pad, selection panel). Separate work.
- **Recommend, Compare, Timeline.** Each gets its own spec. Worth noting now: they should
  carry their state in the URL the way `route.ts` does, so tools can hand off to each other
  (map lasso → Compare, a game's neighbours → the map).
- **Logged-out access** to the map. It stays under `(app)`.

## Verification

- `pnpm check`, `pnpm test`, `pnpm build` pass.
- `/map` loads; `/dev/map?<scope>` lands on `/map?<scope>` with the same set lit.
- Explore's Map → link goes to `/map` with the scope; the map's list link returns intact.
- Tools menu opens, closes on outside click and Escape, and closes Games when opened.
- Tools trigger is active on `/map`; Games is not.
- Mobile menu shows both groups; Map is reachable in one tap after opening it.
- `/dev/map/story` and `/dev/map/network` still resolve locally.

## Delivery

Branch `feat/tools-nav` from `main`, one PR, conventional-commit title
`feat(nav): a Tools menu, and the map promoted to /map`. Phil merges.
