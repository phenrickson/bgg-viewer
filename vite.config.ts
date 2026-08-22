import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';

// release-please bumps this on every release, so it doubles as the app's displayed version.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));

export default defineConfig({
	define: {
		__APP_VERSION__: JSON.stringify(pkg.version)
	},
	/**
	 * duckdb-wasm ships prebuilt workers whose sourcemaps point into `@duckdb/apache-arrow`,
	 * outside their own package. Pre-bundling them makes esbuild warn once per referenced file
	 * — ~117 lines that bury the dev server's localhost URL. The warnings are harmless, but
	 * they go straight to stderr rather than through Vite's logger, so filtering them is not
	 * possible; excluding the package from dep optimization avoids generating them instead.
	 * duckdb-wasm loads its workers as separate bundles at runtime and doesn't need
	 * pre-bundling to work.
	 */
	optimizeDeps: {
		exclude: ['@duckdb/duckdb-wasm']
	},
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) => filename.split(/[/\\]/).includes('node_modules') ? undefined : true,
				// Allow `await` in components (pairs with remote functions below).
				experimental: { async: true }
			},
			// Enable `.remote.ts` query/form/command functions (server data layer).
			experimental: { remoteFunctions: true },
			adapter: adapter()
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
