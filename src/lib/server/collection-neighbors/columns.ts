/**
 * SQL for the collection-neighbours artifact — one file per BGG username, holding every
 * neighbour list the Recommend tool walks for that collection:
 *
 *   A  owned → owned              "what else on my shelf is like this game I own"
 *   C  owned → not owned          "what's out there like it that I don't have"
 *   D  C's not-owned games → owned "the closest thing I don't own — what on my shelf is like THAT"
 *
 * PROTOTYPE. A and D use a placeholder "collection mode": plain embedding similarity within
 * the shelf, top `TOP_N_SHELF`, product-line cap 1 — no rating floors, no complexity band, no
 * ratings minimum. The catalog profiles collapse on a shelf (measured 2026-09-24: Dark Horses
 * empty, Recommended == Most Similar), and the real collection-mode profiles are to be tuned
 * against this output. C uses the catalog profiles unchanged, read from
 * `analytics.similarity_profiles` so it matches `game_neighbors`.
 *
 * Each part is its own query: BigQuery's on-demand CPU ceiling is per job, and D's seeds are
 * C's output. Production moves this into a Dataform model (see bgg-data-warehouse
 * docs/superpowers/specs/2026-09-24-pool-similarity-and-collection-neighbors-design.md).
 */

/** How many shelf neighbours A and D keep per seed. Recommend shows 10; Surprise me draws
 *  from the rest. D keeps one extra so dropping the seed you arrived from still leaves 20. */
export const TOP_N_SHELF = 20;

export interface Tables {
	gss: string; // analytics.game_similarity_search
	profiles: string; // analytics.similarity_profiles
	lines: string; // analytics.game_product_line
	collections: string; // collections.user_collections
}

const owned = (t: Tables) => `
owned AS (
  SELECT DISTINCT game_id FROM \`${t.collections}\`
  WHERE username = @username AND owned = TRUE
)`;

/**
 * Plain-similarity neighbours of `seeds` within the shelf — A and D. `seeds` is a CTE body
 * yielding `game_id`. Product-line cap 1 so three editions of one game don't fill a list.
 */
function shelfQuery(t: Tables, part: 'A' | 'D', seedsCte: string, topN: number): string {
	return `
WITH ${owned(t)},
seeds AS (${seedsCte}),
emb AS (SELECT game_id, embedding FROM \`${t.gss}\`),
pairs AS (
  SELECT s.game_id AS seed_id, o.game_id AS neighbor_id,
         1 - ML.DISTANCE(se.embedding, oe.embedding, 'COSINE') AS similarity
  FROM seeds s
  JOIN emb se ON se.game_id = s.game_id
  CROSS JOIN owned o
  JOIN emb oe ON oe.game_id = o.game_id
  WHERE o.game_id != s.game_id
),
lined AS (
  SELECT p.*, pl.product_line_id AS line,
         ROW_NUMBER() OVER (PARTITION BY p.seed_id, pl.product_line_id ORDER BY p.similarity DESC) AS line_rn
  FROM pairs p
  LEFT JOIN \`${t.lines}\` pl ON pl.game_id = p.neighbor_id
),
ranked AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY seed_id ORDER BY similarity DESC) AS rank
  FROM lined WHERE line IS NULL OR line_rn <= 1
)
SELECT '${part}' AS part, 'shelf' AS style, seed_id, rank, neighbor_id, similarity, similarity AS score
FROM ranked WHERE rank <= ${topN}`;
}

/** A — every owned game against the rest of the shelf. */
export function partASql(t: Tables): string {
	return shelfQuery(t, 'A', 'SELECT game_id FROM owned', TOP_N_SHELF);
}

/** D — each not-owned game from C (passed as `@seeds`) against the whole shelf. */
export function partDSql(t: Tables): string {
	return shelfQuery(t, 'D', 'SELECT game_id FROM UNNEST(@seeds) AS game_id', TOP_N_SHELF + 1);
}

/**
 * C — every owned game against the catalog minus the shelf, with the catalog profiles.
 * The game_neighbors logic (rating blend, band, floors, ceiling, source floor, product-line
 * cap, top_k), many sources at once, candidates excluding owned games.
 */
export function partCSql(t: Tables): string {
	return `
WITH ${owned(t)},
profiles AS (SELECT * FROM \`${t.profiles}\`),
rating_pct AS (
  SELECT game_id, PERCENT_RANK() OVER (ORDER BY geek_rating) AS geek_pct
  FROM \`${t.gss}\` WHERE geek_rating > 0
),
src AS (
  SELECT g.game_id, g.complexity, g.users_rated, g.embedding
  FROM \`${t.gss}\` g JOIN owned o USING (game_id)
  WHERE g.complexity IS NOT NULL
),
cand AS (
  SELECT g.game_id, g.complexity, g.users_rated, g.embedding
  FROM \`${t.gss}\` g
  WHERE g.complexity IS NOT NULL AND g.game_id NOT IN (SELECT game_id FROM owned)
),
pairs AS (
  SELECT s.game_id AS seed_id, c.game_id AS neighbor_id, c.complexity, c.users_rated,
         s.complexity AS src_complexity, s.users_rated AS src_users,
         ML.DISTANCE(c.embedding, s.embedding, 'COSINE') AS distance
  FROM src s CROSS JOIN cand c
),
scored AS (
  SELECT
    p.name AS style, p.max_per_family AS cap, p.top_k,
    pr.seed_id, pr.neighbor_id, 1 - pr.distance AS similarity,
    pl.product_line_id AS line,
    p.weight * (1 - pr.distance) + (1 - p.weight) * COALESCE(rp.geek_pct, 0) AS score
  FROM pairs pr
  CROSS JOIN profiles p
  LEFT JOIN rating_pct rp ON rp.game_id = pr.neighbor_id
  LEFT JOIN \`${t.lines}\` pl ON pl.game_id = pr.neighbor_id
  WHERE pr.src_users >= p.source_min_users_rated
    AND pr.users_rated >= p.min_users_rated
    AND (p.complexity_band IS NULL
         OR pr.complexity BETWEEN pr.src_complexity - p.complexity_band
                              AND pr.src_complexity + p.complexity_band)
    AND (1 - pr.distance) >= p.min_similarity
    AND (p.min_rating_pct = 0 OR COALESCE(rp.geek_pct, 0) >= p.min_rating_pct)
    AND (p.max_rating_pct = 1 OR COALESCE(rp.geek_pct, 0) < p.max_rating_pct)
),
kept AS (
  SELECT * FROM (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY style, seed_id, line ORDER BY score DESC) AS line_rn
    FROM scored
  )
  WHERE cap IS NULL OR line IS NULL OR line_rn <= cap
),
ranked AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY style, seed_id ORDER BY score DESC) AS rank FROM kept
)
SELECT 'C' AS part, style, seed_id, rank, neighbor_id, similarity, score
FROM ranked WHERE rank <= top_k`;
}
