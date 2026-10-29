import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: 'tests/e2e',
	globalSetup: './tests/e2e/global-setup.ts',
	fullyParallel: true,
	reporter: [['list']],
	use: {
		launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] }
	}
});
