// Renders the static PNG icons from src/shared/icon.ts — the same drawing code
// the service worker uses for live per-tab icons — in Playwright's Chromium.
//
//   node scripts/icons.mjs                      write public/icons/icon-{16,32,48,128}.png
//   node scripts/icons.mjs --preview out.png    also render a review sheet
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'vite';

/**
 * @typedef {{ volume: number, muted: boolean }} IconState
 * @typedef {{ drawIcon(ctx: CanvasRenderingContext2D, size: number, state: IconState): void }} IconModule
 */

const root = resolve(import.meta.dirname, '..');
const outDir = resolve(root, 'scripts/.build');
const previewIndex = process.argv.indexOf('--preview');
const previewPath = previewIndex > -1 ? process.argv[previewIndex + 1] : undefined;

await build({
	configFile: false,
	logLevel: 'warn',
	build: {
		outDir,
		emptyOutDir: true,
		lib: {
			entry: resolve(root, 'src/shared/icon.ts'),
			formats: ['iife'],
			name: 'Icon',
			fileName: () => 'icon.js'
		}
	}
});

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
await page.setContent('<!doctype html><body style="margin:0"></body>');
await page.addScriptTag({ path: resolve(outDir, 'icon.js') });

for (const size of [16, 32, 48, 128]) {
	// Runs in the page, where the bundled module is the global `Icon`.
	const dataUrl = await page.evaluate((s) => {
		/** @type {IconModule} */
		const Icon = /** @type {any} */ (window).Icon;
		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = s;
		const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
		Icon.drawIcon(ctx, s, { volume: 1, muted: false });
		return canvas.toDataURL('image/png');
	}, size);
	await writeFile(
		resolve(root, `public/icons/icon-${size}.png`),
		Buffer.from(dataUrl.split(',')[1] ?? '', 'base64')
	);
	console.log(`icon-${size}.png`);
}

if (previewPath) {
	await page.evaluate(() => {
		/** @type {IconModule} */
		const Icon = /** @type {any} */ (window).Icon;
		/** @type {[string, IconState][]} */
		const states = [
			['Muted', { volume: 1, muted: true }],
			['30%', { volume: 0.3, muted: false }],
			['100%', { volume: 1, muted: false }],
			['250%', { volume: 2.5, muted: false }],
			['400%', { volume: 4, muted: false }]
		];
		const normal = { volume: 1, muted: false };

		/** A `size` bitmap shown at `display` CSS px. */
		const icon = (/** @type {number} */ size, /** @type {IconState} */ state, display = size) => {
			const c = document.createElement('canvas');
			c.width = c.height = size;
			c.style.width = c.style.height = `${display}px`;
			Icon.drawIcon(/** @type {CanvasRenderingContext2D} */ (c.getContext('2d')), size, state);
			return c;
		};

		/** @param {string} bg @param {string} fg @param {string} label @param {number} size @param {number} display */
		const row = (bg, fg, label, size, display) => {
			const r = document.createElement('div');
			r.style.cssText = `display:flex;gap:28px;align-items:center;padding:14px 18px;background:${bg};color:${fg};font:12px system-ui`;
			const l = document.createElement('div');
			l.textContent = label;
			l.style.width = '110px';
			r.append(l);
			for (const [name, st] of states) {
				const cell = document.createElement('div');
				cell.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:6px';
				cell.append(icon(size, st, display), name);
				r.append(cell);
			}
			return r;
		};

		const sizes = document.createElement('div');
		sizes.style.cssText =
			'display:flex;gap:24px;align-items:flex-end;padding:18px;background:#2b2b2b;color:#ddd;font:12px system-ui';
		const zoom = icon(16, normal, 64);
		zoom.style.imageRendering = 'pixelated';
		sizes.append(
			icon(128, normal),
			icon(48, normal),
			icon(32, normal),
			icon(16, normal),
			zoom,
			'16px ×4'
		);
		document.body.style.cssText = 'margin:0;width:620px';
		document.body.append(
			sizes,
			// Toolbar: the 32px bitmap at 16 CSS px, as on a 2x display.
			row('#f1f3f4', '#333', 'Light toolbar', 32, 16),
			row('#35363a', '#ddd', 'Dark toolbar', 32, 16),
			row('#0c0a1a', '#ddd', 'States, large', 128, 64)
		);
	});
	await page.screenshot({ path: previewPath, fullPage: true });
	console.log(`preview: ${previewPath}`);
}

await browser.close();
