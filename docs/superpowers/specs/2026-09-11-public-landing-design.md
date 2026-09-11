# Public landing page — design

**Date:** 2026-09-11
**Status:** Design agreed, ready to plan

## Problem

A logged-out visitor never sees bgg-viewer. `/` lives inside the `(app)` route group and
`(app)/+layout.server.ts` redirects any request without a session — verified:

```
$ curl -sI https://boardgame-viz.com/
HTTP/1.1 303 See Other
location: /login?next=%2F
```

Someone arriving at the site is asked to sign in without being shown what they would be
signing in for. That is the whole problem.

## What changed underneath

The existing landing page is explicitly "the room where the catalog warms" — its own header
says so. Every design decision follows from a measured 22s cold load: chips are pure links
so they work before the catalog arrives, the warm-gap content exists to fill the wait, and
the pill says how long the wait will be.

The catalog now comes from GCS (`2026-09-10-gcs-catalog-artifact-design.md`). The 14.6s
build is out of the user's path; cold load is roughly 5–8s and repeat visits are browser
cache hits. The 22s constraint that shaped the page no longer exists, so this is a
re-derivation, not a tweak.

## Gates — decided, not revisited here

Two costs scale with visitors and both stay behind login:

- **The catalog.** 5.25 MB of GCS egress per new visitor (~$0.0006 = 0.06¢). Trivial per
  download, but this is a side project with no revenue: at 1,000 new visitors/day that is
  ~$19/month, which is a real and annoying recurring cost for something meant to be shown
  to people for fun. The abuse tail (a looped bearer URL, no rate limiter available on
  `storage.googleapis.com`) is unbounded. And the artifact carries model predictions that
  are deliberately not published.
- **Game detail.** Every click is an uncached request to the warehouse API. Scales with
  engagement, not visitors.

The login gate works *because registration is invite-only* — that is what bounds the pool
who can obtain a bearer URL. If registration is ever opened, revisit (shorter URL expiry,
budget alert, possibly a stripped public artifact).

**Only the page gate moves.** The catalog and game detail gates do not.

## Design: one page, two states

Modelled on fantasycalc.com — a pitch page in front of the app, not a launchpad inside it.
Real data in the hero, a sneak peek of real rows visibly truncated, a short "how it works",
feature screenshots, and the tools one click away.

**One page, not two.** The skeleton is identical for everyone. A logged-in user's real need
is "get me into a room", and the nav plus two hero doors deliver that in one click; a
separate launchpad would buy them nothing and cost two pages that drift apart.

Exactly three things vary with auth state:

| | Logged out | Logged in |
|---|---|---|
| Hero doors | `/login?next=<room url>` | straight into Discover / Explore |
| Sneak-peek footer | "Log in to see all N" | "Open in Explore" |
| Catalog | never touched | `initCatalog()` + warming indicator |

### Sections, top to bottom

1. **Hero.** Headline, one line, a credibility number (the live game count — from the
   pointer's `rows`, not a stale baked figure), one real viz from `content.json`, two doors.
2. **Sneak peek.** Six or seven featured games from `content.json` as a real table — box art,
   rating, weight, rank fact — fading out at the bottom. The single most important element:
   it is what makes "explore games as a set" mean something to someone who has not seen the
   app. Static by necessity for strangers; static by choice for members (below).
3. **How it works.** Two or three sentences on the thesis — querying games as sets, which
   BGG cannot do — and that the data refreshes daily.
4. **Features.** Screenshots of Explore and Discover, a line each. **These do not exist yet
   and must be taken.**
5. **Try a question.** The chips, demoted from hero to a row here. They are entry points for
   people who already understand the app. Logged out they carry `?next=`.

### Static, deliberately

Hero and sneak peek render from `content.json` for everyone, including members. The catalog
is fast now, but cold is still 5–8s, and a hero that shows a spinner for five seconds before
its chart appears is a worse first impression than a chart that is simply there. The landing
page's job is orientation; orientation does not need this morning's data. Live content is
what the rooms are for. If a live element is ever wanted here it is a later enhancement
layered on top, not the foundation.

### Kept

- **The warming indicator.** Phil's call: it shows the catalog is working. Logged-in only,
  since nothing warms for a logged-out visitor.
- **`estimate.ts` sampling** — the before/after measurement for the GCS change lives here.

### Cut or demoted

- The warm-gap rotation (`dayIndex`, `WarmGap.svelte`) as a *gap filler*. There is no
  20-second gap. Its content (featured games, vizzes) is promoted into the hero and sneak
  peek rather than deleted.
- The chips as hero.

## Implementation shape

- Move `/` out of `(app)`. Load `user` from `locals` so the page can branch on it. The
  `(app)` guard itself is untouched — everything else stays gated.
- `initCatalog()` runs only when `user` is present. Logged out it would 401 at
  `/api/catalog` and show "Catalog failed to load" — the one thing that would look broken
  if forgotten.
- `content.json` and the featured/viz components are reused as-is; nothing new is fetched.

## Copy

**All user-facing strings are placeholder and flagged.** Phil writes the copy.

## Not doing

- Opening the catalog or game detail to logged-out visitors (see Gates).
- Opening registration.
- Any public catalog artifact, GCS/CDN work, or cost infrastructure — none needed when
  anonymous visitors download no data.
- Live data on the landing page.
- Anything about `/about`, Discover, Explore, or the login page itself.

## Open

- Whether `/about` should also become public. Static and harmless; a logged-out visitor
  plausibly wants it. Cheap either way — decide during planning.
