// Renders the Chrome Web Store listing images into store/ from the real popup:
//   icon-128.png            128×128 store icon (copied from public/icons)
//   screenshot-{1,2,3}.png  1280×800
//   promo-small.png         440×280
// Run after `npm run build`: npm run store-assets
import { chromium } from '@playwright/test';
import { copyFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { stubMediaTab } from './popup-stub.mjs';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
const out = (/** @type {string} */ name) => resolve(root, 'store', name);

const font = async (/** @type {string} */ file) =>
	`data:font/woff2;base64,${(await readFile(resolve(root, 'public/fonts', file))).toString('base64')}`;
const FONTS = `
	@font-face { font-family: Fraunces; font-weight: 600; src: url(${await font('fraunces-600.woff2')}); }
	@font-face { font-family: Inter; font-weight: 400; src: url(${await font('inter-400.woff2')}); }
	@font-face { font-family: Inter; font-weight: 600; src: url(${await font('inter-600.woff2')}); }`;

const context = await chromium.launchPersistentContext('', {
	channel: 'chromium',
	deviceScaleFactor: 2,
	args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`]
});
const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
const extensionId = new URL(worker.url()).host;

/**
 * The popup, as a PNG data URL, after `setup` has put it in the desired state.
 * @param {'dark' | 'light'} scheme
 * @param {(page: import('@playwright/test').Page) => Promise<void>} setup
 */
async function popupShot(scheme, setup) {
	const page = await context.newPage();
	await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
	await page.addInitScript(stubMediaTab);
	await page.setViewportSize({ width: 380, height: 900 });
	await page.goto(`chrome-extension://${extensionId}/popup/index.html`);
	await page.getByText('Full screen safe').waitFor();
	await setup(page);
	await page.evaluate(() => /** @type {HTMLElement | null} */ (document.activeElement)?.blur());
	await page.waitForTimeout(400);
	const png = await page.locator('main').screenshot();
	await page.close();
	return `data:image/png;base64,${png.toString('base64')}`;
}

/** @param {import('@playwright/test').Page} page @param {string} preset @param {string} volume @param {string} focus */
async function shape(page, preset, volume, focus) {
	await page.getByRole('combobox', { name: 'EQ preset' }).selectOption({ label: preset });
	await page.locator('#volume').fill(volume);
	await page.locator('#focus').fill(focus);
}

const darkBoost = await popupShot('dark', (p) => shape(p, 'Loudness', '150', '0'));
const darkVoice = await popupShot('dark', (p) => shape(p, 'Voice Clarity', '120', '65'));
const lightVoice = await popupShot('light', (p) => shape(p, 'Voice Clarity', '120', '65'));

const icon = `data:image/png;base64,${(await readFile(resolve(root, 'public/icons/icon-128.png'))).toString('base64')}`;

const STAGE = `
	${FONTS}
	* { box-sizing: border-box; margin: 0; }
	body {
		width: var(--w); height: var(--h); overflow: hidden; position: relative;
		font-family: Inter, sans-serif; color: #ece9f5;
		background:
			radial-gradient(120% 70% at 50% 108%, rgba(255,106,61,.55), rgba(228,84,140,.28) 38%, transparent 66%),
			linear-gradient(#0c0a1a, #161329 55%, #1d1538);
	}
	/* Synthwave floor: perspective grid fading into the horizon. */
	.floor {
		position: absolute; left: -20%; right: -20%; bottom: 0; height: 44%;
		background:
			repeating-linear-gradient(90deg, rgba(255,106,61,.28) 0 2px, transparent 2px 80px),
			repeating-linear-gradient(0deg, rgba(228,84,140,.25) 0 2px, transparent 2px 42px);
		transform: perspective(420px) rotateX(58deg); transform-origin: bottom;
		mask-image: linear-gradient(to top, #000 10%, transparent 95%);
	}
	h1 { font-family: Fraunces, serif; font-weight: 600; color: #f4f1ff; letter-spacing: -0.015em; }
	.shot { border-radius: 14px; box-shadow: 0 30px 80px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.06); }`;

/** @param {number} w @param {number} h @param {string} body @param {string} file */
async function compose(w, h, body, file) {
	const page = await context.newPage();
	await page.setViewportSize({ width: w, height: h });
	await page.setContent(
		`<!doctype html><html><head><style>:root{--w:${w}px;--h:${h}px}${STAGE}</style></head><body><div class="floor"></div>${body}</body></html>`
	);
	await page.evaluate(() => document.fonts.ready);
	await page.screenshot({ path: out(file), scale: 'css' });
	await page.close();
	console.log(`store/${file}`);
}

const copy = (/** @type {string} */ title, /** @type {string} */ text) => `
	<div style="position:absolute;left:96px;top:0;bottom:0;width:560px;display:flex;flex-direction:column;justify-content:center;gap:22px">
		<h1 style="font-size:58px;line-height:1.08">${title}</h1>
		<p style="font-size:22px;line-height:1.5;color:#a7a0c4;max-width:30ch">${text}</p>
	</div>`;

await compose(
	1280,
	800,
	`${copy('Turn any tab up, down, or off.', 'Boost to 400%, mute, or go quieter, and full screen video still fills your monitor.')}
	 <img class="shot" src="${darkBoost}" style="position:absolute;right:130px;top:50%;width:340px;transform:translateY(-50%)">`,
	'screenshot-1.png'
);
await compose(
	1280,
	800,
	`${copy('Bring voices forward.', 'Focus pushes the music back so dialogue and vocals cut through. Shape the rest with a five-band EQ.')}
	 <img class="shot" src="${darkVoice}" style="position:absolute;right:130px;top:50%;width:340px;transform:translateY(-50%)">`,
	'screenshot-2.png'
);
await compose(
	1280,
	800,
	`<div style="position:absolute;left:0;right:0;top:64px;text-align:center">
		<h1 style="font-size:48px">Light or dark, it follows your system.</h1>
	 </div>
	 <img class="shot" src="${lightVoice}" style="position:absolute;left:236px;top:168px;width:380px">
	 <img class="shot" src="${darkVoice}" style="position:absolute;right:236px;top:168px;width:380px">`,
	'screenshot-3.png'
);
await compose(
	440,
	280,
	`<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:18px">
		<img src="${icon}" style="width:112px;height:112px">
		<h1 style="font-size:34px;line-height:1.05">Tab Audio<br>Control</h1>
	 </div>`,
	'promo-small.png'
);

// The store icon is the manifest's 128px icon: 96×96 artwork, 16px transparent padding.
await copyFile(resolve(root, 'public/icons/icon-128.png'), out('icon-128.png'));
console.log('store/icon-128.png');

await context.close();
