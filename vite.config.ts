import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'node:path';

// Extension pages (popup, offscreen) and the background service worker.
// The content script is built separately (vite.content.config.ts) because
// scripting.executeScript needs a single self-contained classic script.
export default defineConfig({
	root: resolve(import.meta.dirname, 'src'),
	publicDir: resolve(import.meta.dirname, 'public'),
	plugins: [svelte({ configFile: resolve(import.meta.dirname, 'svelte.config.js') })],
	build: {
		outDir: resolve(import.meta.dirname, 'dist'),
		emptyOutDir: true,
		target: 'chrome116',
		modulePreload: false,
		sourcemap: true,
		rollupOptions: {
			input: {
				popup: resolve(import.meta.dirname, 'src/popup/index.html'),
				offscreen: resolve(import.meta.dirname, 'src/offscreen/index.html'),
				background: resolve(import.meta.dirname, 'src/background/index.ts')
			},
			output: {
				entryFileNames: (chunk) =>
					chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'
			}
		}
	}
});
