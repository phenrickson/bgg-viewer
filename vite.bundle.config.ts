/**
 * `pnpm bundle:mm`: builds `src/lib/recommend/bundle/index.ts` into `dist-bundle/bgg-rank.js`,
 * one minified classic script that sets `window.BggRank` (apache-arrow included). For sites
 * with no build step; first consumer is The Merry Meeple's games page, which commits the
 * built file. Separate from `vite.config.ts` so the SvelteKit plugin stays out of it.
 */
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));

export default defineConfig({
	define: { __APP_VERSION__: JSON.stringify(pkg.version) },
	build: {
		outDir: 'dist-bundle',
		emptyOutDir: true,
		minify: true,
		lib: {
			entry: 'src/lib/recommend/bundle/index.ts',
			name: 'BggRank',
			formats: ['iife'],
			fileName: () => 'bgg-rank.js'
		}
	}
});
