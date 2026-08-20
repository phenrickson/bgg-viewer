# Landing viz modules — design

## Goal

Right now, adding a "chart of the day" or writing its caption means editing
`scripts/build-landing-content.js` — one file that interleaves 11 BigQuery
queries, three shared builder functions (`scatter`/`columns`/`bars`), and all
copy in a single `vizzes` array. Phil wants to add new vizzes and write their
copy himself, which means the file needs to stop being one growing array and
become something you can extend by adding a file.

## Decision

One file per viz, in a new `scripts/vizzes/` folder. The build script
discovers them, runs their queries in parallel, and assembles `content.json`
exactly as it does today — the output shape (`types.ts`, `content.test.ts`)
doesn't change.

Copy stays colocated with its query rather than moving to a shared strings
file. `callout` text is a function of query results (e.g. "$YEAR was the
biggest year on record, with $N releases") — splitting copy out from the
query that produces those numbers would break that pattern.

## Module interface

```ts
// scripts/vizzes/types.ts
interface VizModule {
	id: string; // slug, also the object key BQ helpers can log against
	kind: 'scatter' | 'columns' | 'bars';
	title: string;
	// Runs against the shared bq helpers (q, pair, topOf...) exported from
	// scripts/vizzes/lib.js. Returns whatever scatter()/columns()/bars() need.
	build: (helpers: BqHelpers) => Promise<Viz>;
}
```

Each file default-exports one `VizModule`, calling the existing
`scatter()`/`columns()`/`bars()` builders (moved from the script into
`scripts/vizzes/lib.js` alongside `q`, `pair`, `topOf`, `sample`, `notable`,
`label`) to produce its `Viz`. Example shape (not final code):

```js
// scripts/vizzes/complexity-vs-rating.js
import { pair, scatter } from './lib.js';

export default {
	id: 'complexity-vs-rating',
	kind: 'scatter',
	title: 'Complexity against rating',
	async build() {
		const rows = await pair(
			'ROUND(average_weight,2) AS x, ROUND(average_rating,2) AS y',
			'average_weight > 0 AND average_rating > 0'
		);
		return scatter(
			'Complexity against rating',
			'PLACEHOLDER — ...',
			'Complexity',
			'Average rating',
			rows
		);
	}
};
```

## Discovery & ordering

- `fs.readdirSync('scripts/vizzes').filter(f => f.endsWith('.js'))`, sorted
  alphabetically. Filenames carry an explicit two-digit prefix (`01-`, `02-`,
  …) so array order — which decides which two vizzes land in the same
  `WarmGap` slot pairing (`day` vs `day+1`) — stays visible and diffable
  instead of depending on filesystem order.
- A malformed module (missing `kind`/`build`, wrong shape returned) fails the
  build loudly, the same way a bad row shape does today — no silent
  omissions.
- `lib.js` is not itself a viz and is excluded by the `.js` glob plus a
  filename check, or lives one level up to avoid ambiguity. (Settle in
  planning.)

## Adding a new viz (the actual ask)

1. Copy an existing file in `scripts/vizzes/` as a template.
2. Write the query, pick `scatter`/`columns`/`bars`, write the `note` (and
   `callout` template, if `columns`).
3. Run `node scripts/build-landing-content.js` locally to regenerate
   `content.json` and eyeball the shape/size budget.
4. Commit both the new module and the regenerated `content.json` snapshot.

No change to `WarmGap.svelte`, `VizOfTheDay.svelte`, `rotation.ts`, or
`types.ts` — this only touches how `content.json` gets generated.

## Open questions carried over (from the original warm-gap spec), now answerable per-file

- Which of the 11 current vizzes are worth keeping — decided per-file now,
  by deleting the file rather than editing an array entry.
- Featured-game selection (top 24 by geek rating, ≥8,000 ratings) is
  out of scope here — it's a single query, not a per-item viz, and doesn't
  benefit from the folder pattern. Left as-is.

## Out of scope

- The "stroll" UX (arrows vs. gallery) — unrelated to authoring, not touched.
- Writing the actual copy for the 11 existing vizzes — separate follow-up
  once the mechanism exists.
