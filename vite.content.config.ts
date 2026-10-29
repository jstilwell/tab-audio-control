import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// The in-page engine, injected on demand with scripting.executeScript.
// Must be one classic (IIFE) file with no imports.
export default defineConfig({
	publicDir: false,
	build: {
		outDir: resolve(import.meta.dirname, 'dist'),
		emptyOutDir: false,
		target: 'chrome116',
		sourcemap: true,
		lib: {
			entry: resolve(import.meta.dirname, 'src/content/index.ts'),
			formats: ['iife'],
			name: 'TabAudioContent',
			fileName: () => 'content.js'
		}
	}
});
