// The built in-page engine (dist/content.js) on a real page with real media.
// chrome.runtime is stubbed: here we test the engine, not the messaging.
import { expect, test, type Page } from '@playwright/test';
import type { Server } from 'node:http';
import type { FrameStatus } from '../../src/shared/messages';
import type { AudioSettings } from '../../src/shared/settings';
import { startServer } from './server';

let server: Server;
let port: number;

test.beforeAll(async () => {
	({ server, port } = await startServer());
});
test.afterAll(() => server.close());

const STUB = () => {
	const listeners = { addListener() {} };
	Object.assign(window, {
		chrome: { runtime: { id: 'test', onMessage: listeners, onConnect: listeners } }
	});
};

async function load(page: Page) {
	await page.addInitScript(STUB);
	await page.goto(`http://127.0.0.1:${port}/index.html`);
	await page.evaluate(() => (document.getElementById('local') as HTMLAudioElement).play());
	await page.addScriptTag({ url: '/content.js' });
}

function apply(page: Page, settings: Partial<AudioSettings>): Promise<FrameStatus> {
	return page.evaluate(
		(s) =>
			window.__tabAudio!.apply({
				volume: 1,
				muted: false,
				eqEnabled: true,
				bands: [],
				focus: 0,
				mono: false,
				balance: 0,
				nightMode: false,
				...s
			} as AudioSettings),
		settings
	);
}

test('leaves the page alone until something changes', async ({ page }) => {
	await load(page);
	const status = await apply(page, {});
	expect(status).toMatchObject({ total: 1, routed: 0, limited: 0, playing: true });
});

test('routes same-origin media once a setting changes', async ({ page }) => {
	await load(page);
	const status = await apply(page, { volume: 1.5 });
	expect(status).toMatchObject({ total: 1, routed: 1, limited: 0, waitingForGesture: false });
});

test('re-injecting keeps the same engine', async ({ page }) => {
	await load(page);
	await apply(page, { volume: 2 });
	await page.addScriptTag({ url: '/content.js' });
	expect(await page.evaluate(() => window.__tabAudio!.status().routed)).toBe(1);
});

test('picks up players added later', async ({ page }) => {
	await load(page);
	await apply(page, { volume: 2 });
	await page.evaluate(async () => {
		const host = document.createElement('div');
		const el = document.createElement('audio');
		el.src = '/tone.wav';
		el.loop = true;
		host.append(el);
		document.body.append(host);
		await el.play();
	});
	await expect.poll(() => page.evaluate(() => window.__tabAudio!.status().routed)).toBe(2);
});

test('cross-origin media without CORS is volume-only, never silenced', async ({ page }) => {
	await load(page);
	await page.evaluate(async (p) => {
		const el = document.createElement('audio');
		el.id = 'remote';
		el.src = `http://localhost:${p}/tone.wav`;
		el.loop = true;
		document.body.append(el);
		await el.play();
	}, port);
	await expect.poll(() => apply(page, { volume: 0.5 }).then((s) => s.limited)).toBe(1);
	const volume = () =>
		page.evaluate(() => (document.getElementById('remote') as HTMLAudioElement).volume);
	expect(await volume()).toBeCloseTo(0.5);
	await apply(page, { volume: 3 });
	expect(await volume()).toBe(1);
	await apply(page, { muted: true });
	expect(await volume()).toBe(0);
});

test('full screen still works while the engine is processing', async ({ page }) => {
	await load(page);
	expect((await apply(page, { volume: 2, focus: 0.5 })).routed).toBe(1);
	await page.click('#fs');
	await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
});
