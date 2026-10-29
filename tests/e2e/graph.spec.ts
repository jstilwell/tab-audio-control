// The audio graph, rendered by a real browser's Web Audio engine.
import { expect, test, type Page } from '@playwright/test';
import type { Server } from 'node:http';
import type { AudioSettings } from '../../src/shared/settings';
import type { Signal } from './harness';
import { startServer } from './server';

type Level = { rms: number; peak: number };
type Result = { left: Level; right: Level };

let server: Server;
let origin: string;

test.beforeAll(async () => {
	const s = await startServer();
	server = s.server;
	origin = `http://127.0.0.1:${s.port}`;
});
test.afterAll(() => server.close());

async function setup(page: Page) {
	await page.goto(`${origin}/index.html`);
	await page.addScriptTag({ url: '/harness.js' });
}

function render(page: Page, settings: Partial<AudioSettings>, signal: Signal): Promise<Result> {
	return page.evaluate(
		([s, sig]) =>
			(window as unknown as { render: (s: unknown, sig: Signal) => Result }).render(s, sig),
		[settings, signal] as const
	);
}

const CENTER: Signal = { freq: 1000, left: 0.25, right: 0.25 };
const SIDE: Signal = { freq: 1000, left: 0.25, right: -0.25 };
const LEFT: Signal = { freq: 1000, left: 0.25, right: 0 };
const SINE_RMS = 0.25 / Math.SQRT2;
const dB = (ratio: number) => 20 * Math.log10(ratio);

test.beforeEach(async ({ page }) => setup(page));

test('default settings pass audio through at unity gain', async ({ page }) => {
	const r = await render(page, {}, CENTER);
	expect(Math.abs(dB(r.left.rms / SINE_RMS))).toBeLessThan(0.1);
	expect(Math.abs(dB(r.right.rms / SINE_RMS))).toBeLessThan(0.1);
});

test('volume scales and mute silences', async ({ page }) => {
	const half = await render(page, { volume: 0.5 }, CENTER);
	expect(dB(half.left.rms / SINE_RMS)).toBeCloseTo(-6.02, 0);
	const boosted = await render(page, { volume: 2 }, CENTER);
	expect(dB(boosted.left.rms / SINE_RMS)).toBeCloseTo(6.02, 0);
	const muted = await render(page, { muted: true, volume: 3 }, CENTER);
	expect(muted.left.peak).toBeLessThan(1e-3);
});

test('the limiter keeps a 400% boost from clipping', async ({ page }) => {
	const r = await render(page, { volume: 4 }, { freq: 1000, left: 0.8, right: 0.8 });
	expect(r.left.peak).toBeLessThanOrEqual(1);
	expect(r.right.peak).toBeLessThanOrEqual(1);
});

test('voice focus pushes the sides (music) back', async ({ page }) => {
	const side = await render(page, { focus: 1 }, SIDE);
	expect(side.left.rms).toBeLessThan(SINE_RMS * 0.01);
	const center = await render(page, { focus: 1 }, CENTER);
	expect(center.left.rms).toBeGreaterThan(SINE_RMS);
});

test('karaoke focus removes the center (voice)', async ({ page }) => {
	const center = await render(page, { focus: -1 }, CENTER);
	expect(center.left.rms).toBeLessThan(SINE_RMS * 0.01);
	const side = await render(page, { focus: -1 }, SIDE);
	expect(Math.abs(dB(side.left.rms / SINE_RMS))).toBeLessThan(0.1);
});

test('mono and balance', async ({ page }) => {
	const mono = await render(page, { mono: true }, LEFT);
	expect(mono.left.rms).toBeCloseTo(mono.right.rms, 4);
	expect(mono.right.rms).toBeGreaterThan(0.01);
	const hardLeft = await render(page, { balance: -1 }, CENTER);
	expect(hardLeft.right.rms).toBeLessThan(1e-3);
});

test('EQ bands shape the sound and the switch bypasses them', async ({ page }) => {
	const bands = [
		{ type: 'highpass', frequency: 1000, gain: 0, q: 0.7 },
		{ type: 'peaking', frequency: 4000, gain: 12, q: 1 },
		{ type: 'peaking', frequency: 1000, gain: 0, q: 1 },
		{ type: 'peaking', frequency: 3500, gain: 0, q: 1 },
		{ type: 'highshelf', frequency: 10000, gain: 0, q: 0.7 }
	] as AudioSettings['bands'];
	const low = await render(page, { bands }, { freq: 100, left: 0.25, right: 0.25 });
	expect(dB(low.left.rms / SINE_RMS)).toBeLessThan(-24);
	const peak = await render(page, { bands }, { freq: 4000, left: 0.05, right: 0.05 });
	expect(dB(peak.left.rms / (0.05 / Math.SQRT2))).toBeCloseTo(12, 0);
	const bypassed = await render(
		page,
		{ bands, eqEnabled: false },
		{ freq: 100, left: 0.25, right: 0.25 }
	);
	expect(Math.abs(dB(bypassed.left.rms / SINE_RMS))).toBeLessThan(0.1);
});

test('night mode lifts quiet passages', async ({ page }) => {
	const quiet: Signal = { freq: 1000, left: 0.02, right: 0.02 };
	const off = await render(page, {}, quiet);
	const on = await render(page, { nightMode: true }, quiet);
	expect(dB(on.left.rms / off.left.rms)).toBeGreaterThan(3);
});
