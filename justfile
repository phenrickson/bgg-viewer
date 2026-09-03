# bgg-viewer — local dev tasks
#
# Short verbs over hand-typed pnpm. Recipes are single commands (identical in
# bash / PowerShell); `verify` chains via just's recipe dependencies so it needs
# no shell-specific `&&`.
#
#   just            # list recipes
#   just setup      # install dependencies
#   just dev        # dev server (foreground, Ctrl-C to stop)
#   just dev-bg     # dev server (background)
#   just stop       # stop it, however it was started
#   just status     # is it up?
#   just vizzes     # regenerate landing content, print the /dev/vizzes review URL
#   just dev-vizzes # regenerate + start the dev server, one command/one terminal
#   just dev-similar # start the dev server, print the /dev/similar bench URL
#   just verify     # types + tests + build (run before every PR)

set windows-shell := ["powershell.exe", "-NoLogo", "-NoProfile", "-Command"]

# Show the recipe list.
default:
    @just --list

# --- Setup / doctor --------------------------------------------------------

# Install dependencies and scaffold .env (safe to re-run).
setup: && env
    pnpm install

# Create .env from .env.example, generating SESSION_SECRET. Never clobbers an existing .env.
env:
    node scripts/setup-env.js

# Print toolchain versions and check local config (env vars, GCP credentials).
doctor:
    node -v
    pnpm -v
    just --version
    node scripts/doctor.js

# --- Operate ---------------------------------------------------------------

# No --open: it resolves the browser through $BROWSER rather than the macOS default handler, so
# it opened the wrong one. Vite prints the URL — click that.
#
# Leading `-` ignores the exit code — Ctrl-C stopping the server is not a failure.
# Run the dev server (http://localhost:5173).
dev:
    -pnpm exec vite dev --port 5173

# Offline: serves the catalog from .cache/catalog.arrow.gz and renders game pages from it, so
# no request reaches BigQuery or the warehouse. Run `just dev` once with network access first
# to populate the cache. Inline `VAR=x cmd` is bash-only, hence the per-platform variants.
# Run the dev server with no network, off the cached catalog.
[unix]
dev-offline:
    -OFFLINE=1 pnpm exec vite dev --port 5173

# Run the dev server with no network, off the cached catalog.
[windows]
dev-offline:
    -$env:OFFLINE = '1'; pnpm exec vite dev --port 5173

# Ctrl-C only works from the terminal that owns the server; killing whatever holds the port
# also reaches one orphaned from its terminal.
#
# try/catch, not -ErrorAction SilentlyContinue: that suppresses the message but still exits
# non-zero, so `just stop` with nothing running reported a failed recipe.
#
# just describes a recipe with the LAST comment line above it, so the description goes last
# and each platform variant repeats it — the listing shows one `stop`, not the rationale.
# Stop the dev server (kills whatever is listening on 5173).
[windows]
stop:
    @try { Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction Stop | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force; "stopped pid $($_.OwningProcess)" } } catch { "nothing listening on 5173" }

# Leading `-`: lsof exits non-zero when it finds nothing, which is not a failure here.
# Stop the dev server (kills whatever is listening on 5173).
[unix]
stop:
    -@lsof -ti tcp:5173 -sTCP:LISTEN | xargs -r kill

# --- Landing content ---------------------------------------------------------

# Doesn't start or restart the dev server — run `just dev` separately, and reload that tab
# after this finishes; /dev/vizzes reads the file fresh on every request, no rebuild needed.
# Regenerate landing content from BigQuery, then print the /dev/vizzes review URL.
vizzes:
    pnpm landing:content
    @echo "→ http://localhost:5173/dev/vizzes"

# `vizzes` runs first (just's recipe-dependency order), then this starts the server in the same
# terminal — one command instead of juggling two. Foreground, same as `dev`: Ctrl-C to stop.
# Regenerate landing content, then start the dev server.
dev-vizzes: vizzes
    -pnpm exec vite dev --port 5173

# --- Similarity tuning bench (dev only) -------------------------------------

# The /dev/similar bench is dev-gated and computes neighbour lists in the browser. It loads
# a dataset from BigQuery on first request (cached 24h in .cache/similar-explorer.arrow.gz);
# nothing to regenerate up front, so this just points you at it.
# Print the /dev/similar tuning-bench URL.
similar:
    @echo "-> http://localhost:5173/dev/similar"

# The 24h cache is keyed on time, not content, so a change to the dataset query
# (src/lib/server/similar-explorer/) isn't picked up until the file is gone. Portable via node.
# Drop the cached similarity dataset so the next /dev/similar load rebuilds it (~40s).
similar-rebuild:
    node -e "require('fs').rmSync('.cache/similar-explorer.arrow.gz',{force:true})"
    @echo "cleared - next /dev/similar load rebuilds the dataset from BigQuery"

# `similar` runs first (prints the URL), then the server starts in the same terminal.
# Foreground, same as `dev`: Ctrl-C to stop.
# Start the dev server, pointed at the /dev/similar bench.
dev-similar: similar
    -pnpm exec vite dev --port 5173

# Type-check (svelte-check).
check:
    pnpm run check

# Unit tests (vitest, single run).
test:
    pnpm test

# Watch tests.
test-watch:
    pnpm run test:unit

# Production build (adapter-node).
build:
    pnpm build

# Serve the built adapter-node server (PORT env overrides; default 3000).
start:
    node build/index.js

# --- Gates -----------------------------------------------------------------

# Full pre-PR gate: types, then tests, then build. Run this before opening a PR.
verify: check test build

# --- Cleanup ---------------------------------------------------------------

# Remove generated artifacts (keeps source + node_modules). Portable via node.
clean:
    node -e "for (const d of ['.svelte-kit','build']) require('fs').rmSync(d,{recursive:true,force:true})"
