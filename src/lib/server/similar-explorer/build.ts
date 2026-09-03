/**
 * Materialize the similarity-explorer dataset from BigQuery — a DEV-ONLY artifact for
 * tuning what the game page's "Similar games" list should show.
 *
 * This carries ONLY what the catalog artifact (`/api/catalog`) lacks or can't give reliably:
 * the 64-d embedding, predicted `complexity` (the catalog's `predicted_complexity` is
 * year-scoped and NULL for most older games), playtime (warehouse-only), the `Game:` /
 * `Series:` family ids, and the reimplementation/expansion links. The bench page loads the
 * catalog alongside this and reads every other game fact — name, mechanics, categories,
 * ratings, weight, players — from there, so there's one source of truth for game metadata.
 *
 * Row set matches the catalog's working set (`users_rated >= 30 OR upcoming`) so every game
 * here also exists in the catalog. The embedding column dominates the size (~8.5 MB raw);
 * never built in production — `/dev/similar/dataset` is gated on `dev`.
 *
 * When the tuning settles, the winning rules become a new `game_neighbors` profile in
 * bgg-data-warehouse; nothing here ships.
 */
import { BigQuery } from '@google-cloud/bigquery';
import { env } from '$env/dynamic/private';
import { rowsToArrowIPC } from './serialize';

const PROJECT = env.GCP_PROJECT_ID || 'bgg-data-warehouse';

/**
 * `related_ids` is symmetric: a game is "related" to what it reimplements/expands AND to
 * what reimplements/expands it, since either direction means "another version of the same
 * thing" for the purpose of keeping it out of a similar-games list.
 *
 * `family_ids` is restricted to `Game: …` and `Series: …` families — BGG's "this is a
 * version / edition / entry of that line" groupings (`Game: Risk (Official)`,
 * `Series: Unlock!`). The other prefixes (`Components:`, `Theme:`, `Misc:`, `Digital
 * Implementations:` …) are cross-cutting tags that would over-exclude wildly. `family_labels`
 * rides along so the bench can show what a source game's families actually are.
 *
 * `product_line_id` collapses those to ONE id per game for the neighbour cap, choosing
 * among a game's `Game:`/`Series:` families in this order:
 *   1. the family whose name appears in the game's own title — `Unlock!: Escape Adventures
 *      – Fifth Avenue` picks `Series: Unlock!` over the smaller `Series: Free PnP … COVID`
 *      promo it also sits in;
 *   2. a `Game:` family over a `Series:` one;
 *   3. the smallest family — Irish Gauge (no name match anywhere) takes `Series: Iron Rail`
 *      (4) over `Series: Cube Rails` (59).
 *
 * A game with NO such family inherits the line of a game it reimplements / expands (one
 * hop). BGG's family lists are patchy — `Summoner Wars (Second Edition)` sits in no family
 * at all — but the reimplementation edge to `Summoner Wars` is there, so it lands in the
 * same line and the cap sees all the Summoner Wars games as one budget. Still null when
 * neither a family nor a lined neighbour exists.
 */
function querySql(): string {
	return `
    WITH edges AS (
      SELECT game_id, implementation_id AS other FROM \`${PROJECT}.core.game_implementations\`
      UNION ALL SELECT implementation_id AS game_id, game_id AS other FROM \`${PROJECT}.core.game_implementations\`
      UNION ALL SELECT game_id, expansion_id AS other FROM \`${PROJECT}.core.game_expansions\`
      UNION ALL SELECT expansion_id AS game_id, game_id AS other FROM \`${PROJECT}.core.game_expansions\`
    ),
    rel AS (
      SELECT game_id, ARRAY_AGG(DISTINCT other) AS related_ids
      FROM edges GROUP BY game_id
    ),
    fam_size AS (
      SELECT family_id, COUNT(*) AS n FROM \`${PROJECT}.core.game_families\` GROUP BY family_id
    ),
    gs_families AS (
      SELECT
        gf.game_id,
        gf.family_id,
        f.name AS family_name,
        fs.n AS family_size,
        STARTS_WITH(f.name, 'Game: ') AS is_game_family,
        -- the family's "core" name (drop the 'Game: '/'Series: ' prefix and a trailing
        -- ' (Publisher)') found inside the game's own title
        (
          LENGTH(REGEXP_REPLACE(REGEXP_REPLACE(f.name, r'^(Game|Series): ', ''), r' \\([^)]*\\)$', '')) >= 3
          AND STRPOS(
            LOWER(gfeat.name),
            LOWER(REGEXP_REPLACE(REGEXP_REPLACE(f.name, r'^(Game|Series): ', ''), r' \\([^)]*\\)$', ''))
          ) > 0
        ) AS name_match
      FROM \`${PROJECT}.core.game_families\` gf
      JOIN \`${PROJECT}.core.families\` f ON f.family_id = gf.family_id
      JOIN fam_size fs ON fs.family_id = gf.family_id
      JOIN \`${PROJECT}.analytics.games_features\` gfeat ON gfeat.game_id = gf.game_id
      WHERE STARTS_WITH(f.name, 'Game: ') OR STARTS_WITH(f.name, 'Series: ')
    ),
    fam AS (
      SELECT
        game_id,
        ARRAY_AGG(family_id ORDER BY family_id) AS family_ids,
        ARRAY_AGG(family_name ORDER BY family_id) AS family_labels
      FROM gs_families
      GROUP BY game_id
    ),
    product_line_base AS (
      SELECT
        game_id,
        ARRAY_AGG(
          family_id
          ORDER BY name_match DESC, is_game_family DESC, family_size ASC, family_id ASC
          LIMIT 1
        )[OFFSET(0)] AS product_line_id
      FROM gs_families
      GROUP BY game_id
    ),
    product_line_inherited AS (
      SELECT
        e.game_id,
        ARRAY_AGG(plb.product_line_id ORDER BY fs.n ASC, plb.product_line_id ASC LIMIT 1)[OFFSET(0)]
          AS product_line_id
      FROM edges e
      JOIN product_line_base plb ON plb.game_id = e.other
      JOIN fam_size fs ON fs.family_id = plb.product_line_id
      WHERE e.game_id NOT IN (SELECT game_id FROM product_line_base)
      GROUP BY e.game_id
    ),
    product_line AS (
      SELECT game_id, product_line_id FROM product_line_base
      UNION ALL
      SELECT game_id, product_line_id FROM product_line_inherited
    )
    SELECT
      s.game_id,
      s.embedding,
      s.complexity,
      s.min_playtime,
      s.max_playtime,
      IFNULL(f.family_ids, []) AS family_ids,
      IFNULL(f.family_labels, []) AS family_labels,
      IFNULL(r.related_ids, []) AS related_ids,
      pl.product_line_id
    FROM \`${PROJECT}.analytics.game_similarity_search\` s
    LEFT JOIN fam f ON f.game_id = s.game_id
    LEFT JOIN rel r ON r.game_id = s.game_id
    LEFT JOIN product_line pl ON pl.game_id = s.game_id
    WHERE s.complexity IS NOT NULL
      AND (s.users_rated >= 30 OR s.year_published >= EXTRACT(YEAR FROM CURRENT_DATE()))
    ORDER BY s.game_id
  `;
}

let _bq: BigQuery | null = null;
function bq(): BigQuery {
	return (_bq ??= new BigQuery({ projectId: PROJECT }));
}

export async function buildSimilarExplorerArtifact(client: BigQuery = bq()): Promise<Uint8Array> {
	const [rows] = await client.query({ query: querySql() });
	return rowsToArrowIPC(rows as Record<string, unknown>[]);
}
