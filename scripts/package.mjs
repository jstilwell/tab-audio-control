// Zips dist/ for upload to the Chrome Web Store: release/tab-audio-control-<version>.zip.
// Source maps are left out to keep the upload small (the source is public anyway).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const { version } = JSON.parse(readFileSync(resolve(root, 'dist/manifest.json'), 'utf8'));
const zip = resolve(root, 'release', `tab-audio-control-${version}.zip`);

mkdirSync(resolve(root, 'release'), { recursive: true });
rmSync(zip, { force: true });
execFileSync('zip', ['-r', '-X', '-q', zip, '.', '-x', '*.map', '-x', '.*'], {
	cwd: resolve(root, 'dist'),
	stdio: 'inherit'
});
console.log(`release/tab-audio-control-${version}.zip`);
