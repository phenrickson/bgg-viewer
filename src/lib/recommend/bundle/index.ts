/**
 * `BggRank`: Recommend's ranking for sites that aren't this app (first: The Merry Meeple's
 * games page). Built by `pnpm bundle:mm` (`vite.bundle.config.ts`) into one classic script
 * that sets `globalThis.BggRank`, `apache-arrow` included, so a site with no build step can
 * load it with a `<script>` tag. The ranking is this app's own `rank.ts`, unchanged.
 */
import { parseVectors } from '../vectors';
import { rankShelf, rankCatalog } from '../rank';
import { readCatalog, checkVectors } from './catalog-basics';

declare const __APP_VERSION__: string;

export const BUNDLE_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

export { parseVectors, rankShelf, rankCatalog, readCatalog, checkVectors };
