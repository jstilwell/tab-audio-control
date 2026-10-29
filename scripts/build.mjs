// Builds the extension into dist/: pages + service worker first (which empties
// dist/), then the content script on top.
import { build } from 'vite';

const watch = process.argv.includes('--watch') ? {} : null;

await build({ configFile: 'vite.config.ts', build: { watch } });
await build({ configFile: 'vite.content.config.ts', build: { watch } });
