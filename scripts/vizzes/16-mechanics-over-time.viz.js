import { F, WORKING } from './lib.js';

export default {
	id: 'mechanics-over-time',
	kind: 'line',
	title: 'How mechanics have risen and fallen',
	note: 'PLACEHOLDER — share of that year\'s rated releases, for the 5 mechanics whose share moved the most between 1990-1999 and 2015-2024.',
	xLabel: 'Year',
	yLabel: '% of releases',
	/**
	 * "Top by total volume" would mostly just re-show whichever mechanics have always been
	 * common (Dice Rolling, Hand Management) — not a story about *change*. This ranks by the
	 * size of the swing in share between an early window and a recent one instead, which
	 * surfaces actual risers and fallers.
	 *
	 * `Solo / Solitaire Game` is the single biggest riser but is excluded here — it already
	 * has its own dedicated chart (14-solo-games-over-time.viz.js), so including it here too
	 * would just repeat that chart's story instead of telling a new one.
	 */
	query: `WITH windowed AS (
	     SELECT m, year_published AS yr
	     FROM ${F}, UNNEST(mechanics) AS m
	     WHERE ${WORKING} AND year_published BETWEEN 1990 AND EXTRACT(YEAR FROM CURRENT_DATE()) - 1
	   ),
	   yearly_totals AS (
	     SELECT year_published AS yr, COUNT(*) AS total FROM ${F}
	     WHERE ${WORKING} AND year_published BETWEEN 1990 AND EXTRACT(YEAR FROM CURRENT_DATE()) - 1
	     GROUP BY yr
	   ),
	   early AS (SELECT m, COUNT(*) AS c FROM windowed WHERE yr BETWEEN 1990 AND 1999 GROUP BY m),
	   late AS (SELECT m, COUNT(*) AS c FROM windowed WHERE yr BETWEEN 2015 AND 2024 GROUP BY m),
	   early_total AS (SELECT SUM(total) AS t FROM yearly_totals WHERE yr BETWEEN 1990 AND 1999),
	   late_total AS (SELECT SUM(total) AS t FROM yearly_totals WHERE yr BETWEEN 2015 AND 2024),
	   swing AS (
	     SELECT COALESCE(early.m, late.m) AS m,
	            100*COALESCE(late.c,0)/(SELECT t FROM late_total) AS late_pct,
	            100*COALESCE(early.c,0)/(SELECT t FROM early_total) AS early_pct
	     FROM early FULL OUTER JOIN late USING (m)
	     WHERE COALESCE(early.m, late.m) != 'Solo / Solitaire Game'
	   ),
	   top_mechs AS (
	     -- 5, not 6: VizOfTheDay cycles 5 categorical colors, so a 6th series silently
	     -- collided with the 1st and rendered indistinguishable from it.
	     SELECT m FROM swing ORDER BY ABS(late_pct - early_pct) DESC LIMIT 5
	   )
	   SELECT w.m AS series, w.yr AS x, ROUND(100*COUNT(*)/t.total, 1) AS y
	   FROM windowed w
	   JOIN yearly_totals t USING (yr)
	   WHERE w.m IN (SELECT m FROM top_mechs)
	   GROUP BY series, x, t.total
	   ORDER BY series, x`
};
