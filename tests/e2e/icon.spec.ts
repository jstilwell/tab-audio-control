// The live toolbar icon, drawn by a real browser canvas.
import { expect, test, type Page } from '@playwright/test';
import type { Server } from 'node:http';
import type { IconState } from '../../src/shared/icon';
import { startServer } from './server';

let server: Server;
let origin: string;

test.beforeAll(async () => {
	const s = await startServer();
	server = s.server;
	origin = `http://127.0.0.1:${s.port}`;
});
test.afterAll(() => server.close());

test.beforeEach(async ({ page }) => {
	await page.goto(`${origin}/index.html`);
	await page.addScriptTag({ url: '/harness.js' });
});

/** Height in px of the bright (waveform) pixels and the hottest red channel. */
function measure(page: Page, size: number, state: IconState) {
	return page.evaluate(
		([s, st]) => {
			const data = (
				window as unknown as { iconImageData: (st: unknown) => Record<string, ImageData> }
			).iconImageData(st)[s]!;
			let top = s;
			let bottom = -1;
			let reddest = 0;
			for (let y = 0; y < s; y++) {
				for (let x = 0; x < s; x++) {
					const i = (y * s + x) * 4;
					const [r, g, b] = [data.data[i]!, data.data[i + 1]!, data.data[i + 2]!];
					if (r + g + b > 250) {
						top = Math.min(top, y);
						bottom = Math.max(bottom, y);
						reddest = Math.max(reddest, r - b);
					}
				}
			}
			return { height: bottom - top + 1, reddest };
		},
		[size, state] as const
	);
}

for (const size of [16, 32]) {
	test(`${size}px waveform tracks volume and flatlines when muted`, async ({ page }) => {
		const muted = await measure(page, size, { volume: 1, muted: true });
		const quiet = await measure(page, size, { volume: 0.3, muted: false });
		const full = await measure(page, size, { volume: 1, muted: false });
		const boosted = await measure(page, size, { volume: 4, muted: false });
		expect(muted.height).toBeLessThanOrEqual(size <= 16 ? 2 : 4);
		expect(quiet.height).toBeGreaterThan(muted.height);
		expect(full.height).toBeGreaterThan(quiet.height);
		expect(full.height).toBeGreaterThanOrEqual(size * 0.6);
		expect(boosted.height).toBe(full.height);
		expect(boosted.reddest).toBeGreaterThan(full.reddest * 0.9);
	});
}
