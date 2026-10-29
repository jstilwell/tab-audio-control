// Bundles the audio-graph harness so specs can load the real AudioGraph into a
// plain page. The extension itself must already be built (`npm run build`).
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'vite';

export const HARNESS_DIR = resolve(import.meta.dirname, '.build');

export default async function globalSetup() {
	if (!existsSync(resolve(import.meta.dirname, '../../dist/manifest.json'))) {
		throw new Error('dist/ is missing: run `npm run build` first (npm run test:e2e does).');
	}
	await build({
		configFile: false,
		logLevel: 'warn',
		build: {
			outDir: HARNESS_DIR,
			emptyOutDir: true,
			lib: {
				entry: resolve(import.meta.dirname, 'harness.ts'),
				formats: ['iife'],
				name: 'Harness',
				fileName: () => 'harness.js'
			}
		}
	});
}
