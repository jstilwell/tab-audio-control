// The packaged extension, loaded into Chromium the way a user would load it.
import { test as base, chromium, expect, type BrowserContext } from '@playwright/test';
import { resolve } from 'node:path';

const DIST = resolve(import.meta.dirname, '../../dist');

const test = base.extend<{ context: BrowserContext; extensionId: string }>({
	// eslint-disable-next-line no-empty-pattern
	context: async ({}, use) => {
		const context = await chromium.launchPersistentContext('', {
			channel: 'chromium',
			args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`]
		});
		await use(context);
		await context.close();
	},
	extensionId: async ({ context }, use) => {
		const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
		await use(new URL(worker.url()).host);
	}
});

test('service worker starts and holds only the declared permissions', async ({
	context,
	extensionId
}) => {
	expect(extensionId).toMatch(/^[a-p]{32}$/);
	const worker = context.serviceWorkers()[0]!;
	const granted = await worker.evaluate(() => chrome.permissions.getAll());
	expect(granted.permissions?.sort()).toEqual(['activeTab', 'scripting', 'storage']);
	expect(granted.origins).toEqual([]);
});

test('popup explains itself on pages Chrome protects', async ({ context, extensionId }) => {
	const page = await context.newPage();
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto(`chrome-extension://${extensionId}/popup/index.html`);
	// Opened as a tab, the "active tab" is the popup itself: an extension page.
	await expect(page.getByText("Chrome doesn't let extensions change audio")).toBeVisible();
	await expect(page.getByRole('slider', { name: 'Volume' })).toBeDisabled();
	expect(errors).toEqual([]);
});

// Visual review: the popup against a pretend media tab, in both themes.
for (const scheme of ['dark', 'light'] as const) {
	test(`popup renders in ${scheme} mode`, async ({ context, extensionId }) => {
		const page = await context.newPage();
		await page.emulateMedia({ colorScheme: scheme });
		await page.addInitScript(() => {
			const status = { total: 1, routed: 1, limited: 0, playing: true, waitingForGesture: false };
			const c = chrome as unknown as Record<string, Record<string, unknown>>;
			c.tabs!.query = async () => [{ id: 4242, active: true }];
			c.tabs!.get = async () => ({ id: 4242, audible: true });
			c.tabs!.sendMessage = async () => undefined;
			c.tabs!.connect = () => {
				const listeners: ((m: unknown) => void)[] = [];
				const timer = setInterval(() => {
					const bins = Array.from({ length: 72 }, (_, i) =>
						Math.max(0, 200 - Math.abs(i - 22) * 5 - (i % 5) * 6 + (i > 45 ? -30 : 0))
					);
					for (const l of listeners) l({ bins });
				}, 50);
				return {
					onMessage: { addListener: (l: (m: unknown) => void) => listeners.push(l) },
					disconnect: () => clearInterval(timer)
				};
			};
			c.scripting!.executeScript = async () => [{ frameId: 0, result: status }];
			c.action!.setBadgeText = async () => {};
			c.action!.setBadgeBackgroundColor = async () => {};
			c.action!.setBadgeTextColor = async () => {};
		});
		await page.setViewportSize({ width: 380, height: 760 });
		await page.goto(`chrome-extension://${extensionId}/popup/index.html`);
		await expect(page.getByText('Full screen safe')).toBeVisible();
		// Shape a curve so the screenshot shows the EQ in use.
		await page
			.getByRole('combobox', { name: 'EQ preset' })
			.selectOption({ label: 'Voice Clarity' });
		await page.getByRole('slider', { name: 'Volume' }).fill('120');
		await page.waitForTimeout(300);
		await page.screenshot({ path: `test-results/popup-${scheme}.png`, fullPage: true });
	});
}
