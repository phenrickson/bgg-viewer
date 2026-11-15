# BGG.CON per-user phone alerts — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Any signed-in user can get phone alerts for their own focus list: the dashboard gives
them an ntfy topic, and the recorder alerts every user who has one.

**Architecture:** The viewer makes each user's topic once and saves it as its own small file,
`bggcon/alerts/{user_id}.json` = `{"topic": "…"}`, beside (not inside) their stars file, so the
stars format the recorder already reads doesn't change. A 🔔 button on `/bggcon` opens a sheet
showing the topic. Each minute, the recorder first checks whether *any* game came back on the
shelf; only then does it list `bggcon/alerts/`, read each user's topic and stars, and push to
each user's own topic. The deploy-time `NTFY_TOPIC` / `BGGCON_ALERT_USER` settings go away.

**Tech stack:** SvelteKit 2 / Svelte 5, vitest, `@google-cloud/storage` (viewer); Python 3,
pytest, `google-cloud-storage`, `requests` (warehouse recorder service).

**Spec:** `docs/superpowers/specs/2026-11-12-bggcon-library-design.md` §8 "Alerts" (and the
access line near the top).

**Delivery:** two branches, two PRs; Phil merges both.
- bgg-viewer: `feat/bggcon-alert-topics` (this plan and the spec ride here) → PR to `main`.
- bgg-data-warehouse: `feat/bggcon-per-user-alerts`, fresh from `origin/main` → PR to `main`.
- Either can merge first. Until the viewer ships, there are no alert files and the recorder
  sends nothing; until the recorder ships, alert files exist and nothing reads them.
- Commit and push each task as it passes. `gh pr view --json state,mergedAt` before every push.

## Global constraints

- Topic: `bggcon-2026-{bgg_username}` when the account has a BGG username linked; otherwise
  `bggcon-2026-{word}-{word}-{NN}`. A BGG username is not required. Never built from an email.
- Made once per user and kept: later visits show the same topic.
- ntfy topic names allow only `A-Za-z0-9_-`, at most 64 characters. Usernames are lowercased,
  any other character becomes `-`, and the whole topic is cut to 64.
- Push content is unchanged: title `BGG.CON: {name} is back`, body `{n}/{m} available`,
  click → `https://boardgame-viz.com/bggcon`, tag `game_die`.
- An alert failure never costs a recorded minute (existing rule), and one user's failure never
  stops another user's alert.
- All panel copy is PLACEHOLDER (Phil); flag it once in the source.
- Viewer writes only under `bggcon/` (existing IAM condition); `bggcon/alerts/` is inside it.
- Reuse UI: `Button`, `$lib/components/ui/sheet`, `@lucide/svelte/icons/bell`. Nothing hand-rolled.

## Review focus

1. **Two tabs open the panel at once** for a user without a BGG username: both would generate
   different words. The write must be create-only, and the loser re-reads → both show one topic.
2. **A BGG username with odd characters** (`Mr. Meeple`, `ÆON`, 70 chars): still a valid topic.
3. **Two users who'd get the same topic** (same BGG username on two accounts): the second gets
   generated words, so nobody receives another person's alerts.
4. **One user's alert file is malformed or their push fails:** the others still get theirs, and
   the minute is still recorded.
5. **A quiet minute must not read every user's files:** no game back on the shelf → no listing,
   no per-user reads (cost: this runs 1,440 times a day).

---

## bgg-viewer

### Task 1: Topics — make, keep, read

**Files:**
- Create: `src/lib/server/bggcon/alerts.ts`
- Modify: `src/lib/server/bggcon/store.ts` (add `create`)
- Test: `src/lib/server/bggcon/alerts.test.ts`

**Interfaces:**
- Produces:
  - `alertsName(userId: string): string` → `bggcon/alerts/{userId}.json`; same id check as `starsName`.
  - `topicFor(bggUsername: string | null, rand?: () => number): string`
  - `getTopic(user: SessionUser, store?: JsonStore, rand?: () => number): Promise<string>`
  - `JsonStore.create(name: string, value: unknown): Promise<boolean>` — writes only if absent
    (GCS `ifGenerationMatch: 0`); `false` when the file already existed (412).

- [ ] **Step 1: Write the failing tests** (`alerts.test.ts`, with an in-memory `JsonStore` fake)
  - `topicFor('phenrickson')` → `'bggcon-2026-phenrickson'`
  - `topicFor('Mr. Meeple')` → `'bggcon-2026-mr--meeple'`; `topicFor('x'.repeat(80)).length` → `64`
  - `topicFor(null, seeded)` matches `/^bggcon-2026-[a-z]+-[a-z]+-[1-9][0-9]$/`; `topicFor('', seeded)` and `topicFor('---', seeded)` likewise (nothing usable left → words)
  - every result matches `/^[A-Za-z0-9_-]{1,64}$/`
  - `getTopic` with no file creates `{topic}` at `alertsName(id)` and returns it; a second call returns the same topic without writing
  - `getTopic` when `create` returns `false` (another tab won) re-reads and returns the stored topic
  - `getTopic` for a user whose username-topic is already another user's (fake store has `bggcon/alerts/other.json` = `{topic:'bggcon-2026-phenrickson'}`, exposed via a `taken(topic)` check — see step 3) → words
  - `alertsName('../x')` throws

- [ ] **Step 2: Run** `npx vitest run src/lib/server/bggcon/alerts.test.ts` → FAIL (module missing)

- [ ] **Step 3: Implement.** Word lists: two `const` arrays of ~50 short lowercase words each
  (adjectives, animals/objects; no names, nothing rude). `NN` is 10–99. Uniqueness check for
  review focus 3: add `JsonStore.list(prefix: string): Promise<string[]>` (names) and treat a
  username-topic as taken when any other `bggcon/alerts/*.json` holds it; the group is small, so
  reading them all on the one-time create is fine. Add `create` and `list` to `gcsStore`.

- [ ] **Step 4: Run** the same command → PASS; then `npx vitest run src/lib/server/bggcon` → PASS

- [ ] **Step 5: Commit** `feat(bggcon): a phone-alert topic per user, made once and kept`

### Task 2: The endpoint

**Files:**
- Create: `src/routes/api/bggcon/alerts/+server.ts`

**Interfaces:**
- Consumes: `getTopic`, `requireUser` (`$lib/server/bggcon/gate`)
- Produces: `GET /api/bggcon/alerts` → `200 {"topic": string}`; `401` signed out.

- [ ] **Step 1: Implement** `GET` in the shape of `api/bggcon/stars/+server.ts`.
- [ ] **Step 2: Verify** `npm run check` → 0 errors.
- [ ] **Step 3: Commit** `feat(bggcon): GET /api/bggcon/alerts returns the user's topic`

### Task 3: 🔔 button and sheet on `/bggcon`

Model: the mockup Phil approved (https://claude.ai/artifact/58BC4cJy2SsWkJXUyqidUQ, v2).

**Files:**
- Create: `src/routes/(app)/bggcon/AlertsButton.svelte`
- Modify: `src/routes/(app)/bggcon/+page.svelte` (two placements)

**Interfaces:**
- Consumes: `GET /api/bggcon/alerts`
- Produces: `<AlertsButton {narrow} />`

- [ ] **Step 1: Build `AlertsButton.svelte`:** `Button variant="outline" size="sm"` with the
  lucide `bell` icon only, `aria-label` and `title` "Phone alerts". Opens a
  `$lib/components/ui/sheet` sheet, `side` `bottom` when `narrow`, else `right`. Fetches the
  topic on first open (not on page load). Sheet body: one line of what alerts do, the topic in
  a monospace box with a Copy button (`navigator.clipboard.writeText`; on rejection select the
  text), the three steps (install ntfy; tap + and paste, server ntfy.sh; star games), and "anyone
  who knows this topic can see its alerts". One `<!-- PLACEHOLDER copy (Phil) -->` note. A
  failed fetch shows an error line in the sheet.
- [ ] **Step 2: Place it.** Desktop: in `.chead`, right after the focus-list count button.
  Phone: in the top row beside Filters; Filters keeps `w-full`, the bell doesn't grow.
- [ ] **Step 3: Verify** `npm run check` → 0 errors; `npx vitest run` → all pass. Then Phil
  reviews on his own dev server (tell him to restart it after the branch switch). No
  browser driving from this session.
- [ ] **Step 4: Commit** `feat(bggcon): a bell on /bggcon that shows your phone-alert topic`
- [ ] **Step 5: Open the PR** `feat(bggcon): per-user phone alerts on /bggcon`.

---

## bgg-data-warehouse

### Task 4: Alert every user who has a topic

**Files:**
- Modify: `src/pipeline/bggcon_recorder.py` (`Deps`, `run_once`/`_record` signature, `_alert`, `real_deps`, docstring)
- Modify: `src/pipeline/bggcon_service.py` (drop `alert_user`)
- Modify: `src/bggcon/recorder.py` — add `came_back(prev_out, now_out) -> bool`
- Test: `tests/test_bggcon_job.py`, `tests/test_bggcon_service.py`, `tests/test_bggcon_recorder.py`

**Interfaces:**
- Produces:
  - `ALERTS_PREFIX = "bggcon/alerts/"`
  - `Deps.list_names: Callable[[str], list[str]]` (object names under a prefix)
  - `Deps.notify: Callable[[str, str, str], None] | None` — `(topic, title, message)`; `None` only in tests that want no pushes
  - `run_once(deps, test_run=False)`; `alert_user` removed everywhere
  - `r.came_back(prev_out, now_out) -> bool`: some game's out-count fell

- [ ] **Step 1: Rewrite the alert tests** (Fakes: `pushes` becomes `(topic, title, message)`; `list_names` filters `files` by prefix)
  - `test_alerts_each_user_on_their_own_topic`: users `u1` (topic `t1`, stars `[822]`) and `u2` (topic `t2`, stars `[13]`); 822 comes back, 13 doesn't → `pushes == [("t1", "BGG.CON: Carcassonne is back", "1/1 available")]`
  - `test_no_alerts_without_any_alert_files` (replaces `..._without_a_user_to_alert`)
  - `test_a_quiet_minute_lists_no_alert_files`: no out-count falls → `list_names` never called
  - `test_one_users_bad_file_or_failing_push_does_not_stop_the_others`: `u1` file `{}` (no topic), `u2`'s push raises, `u3` fine → `u3` pushed, run returns `"recorded 1 events"`
  - keep `test_a_failing_push_does_not_fail_the_run` and the first-run-no-alert check, ported
  - `came_back({822: 1}, {})` → True; `came_back({822: 1}, {822: 1})` → False; `came_back({}, {822: 1})` → False

- [ ] **Step 2: Run** `uv run pytest tests/test_bggcon_job.py tests/test_bggcon_recorder.py -q` → the new tests FAIL

- [ ] **Step 3: Implement.** In `_record`: `if had_state and deps.notify and r.came_back(prev_out, now_out)` → `_alert`. `_alert(deps, prev_out, now_out)` reads the library once, then for each name from `list_names(ALERTS_PREFIX)` (`.json` only; user id = basename) in its own `try`: read alerts → `topic`, read `stars_name(uid)`, `back_on_shelf(...)`, `notify(topic, title, msg)`; log and continue on any exception. `real_deps`: `list_names` = `[b.name for b in bucket.list_blobs(prefix=…)]`; `notify` posts to `https://ntfy.sh/{topic}` (same headers); always set. Remove `NTFY_TOPIC` / `BGGCON_ALERT_USER` from code and docstring.

- [ ] **Step 4: Run** `uv run pytest tests/test_bggcon_job.py tests/test_bggcon_service.py tests/test_bggcon_recorder.py -q` → PASS; `uv run ruff check src tests` → clean

- [ ] **Step 5: Commit** `feat(bggcon): alert every user on their own ntfy topic`

### Task 5: Drop the deploy-time alert settings

**Files:**
- Modify: `config/cloudbuild.yaml` (both `--set-env-vars=NTFY_TOPIC=…,BGGCON_ALERT_USER=…` lines, the comment near line 156)
- Modify: `.github/workflows/deploy.yml:43` (drop `_NTFY_TOPIC` and `_BGGCON_ALERT_USER`; **`_BGG_API_TOKEN` stays last**, its secret ends in a newline — see the comment at line 37)

- [ ] **Step 1: Edit** both files. If no `--set-env-vars` is left on a step, remove the flag; use `--remove-env-vars=NTFY_TOPIC,BGGCON_ALERT_USER` on the service and job deploys so the old empty vars go.
- [ ] **Step 2: Verify** `grep -rnE "NTFY_TOPIC|BGGCON_ALERT_USER|_NTFY|_BGGCON_ALERT" config .github src tests` → no matches; YAML parses (`uv run python -c "import yaml,sys;[yaml.safe_load(open(p)) for p in sys.argv[1:]]" config/cloudbuild.yaml .github/workflows/deploy.yml`).
- [ ] **Step 3: Commit** `chore(bggcon): drop the deploy-time alert topic and user`
- [ ] **Step 4: Open the PR** `feat(bggcon): phone alerts for every user with a topic`. Body notes: needs the viewer PR for anyone to have a topic; deploy runs on merge (Phil).

---

## After both merge (with Phil, each step on his OK)

1. Phil opens the bell on the deployed `/bggcon`, subscribes to his topic in ntfy, stars a game.
2. Confirm the recorder service can list `bggcon/alerts/` (its SA already reads and writes the
   bucket; a listing failure would show in its logs as `BGG.CON alert failed`).
3. An end-to-end push before Tuesday still needs a way to force one: open question from
   2026-11-13 (wait for a real one vs. a small forced test push). Decide with Phil.
