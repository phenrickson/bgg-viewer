# Pipeline Monitor (`/admin/pipeline`)

The design lives in bgg-data-warehouse, which owns the data and the API:
`bgg-data-warehouse/docs/superpowers/specs/2026-10-02-pipeline-monitor-design.md`.

Mockup: [`docs/design/pipeline-monitor-mockup.html`](../../design/pipeline-monitor-mockup.html).

The viewer's part (see "Components — bgg-viewer" in that spec): an admin-only route at
`src/routes/(app)/admin/pipeline/`, `getPipelineStatus()` on the warehouse client,
components in `src/lib/monitoring/`, `--status-ok/warn/fail` tokens in `app.css`, and an
admin-only nav link. The catalog artifact's freshness comes from the viewer's own pointer.
