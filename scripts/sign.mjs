// Signs dist/ into release/tab-audio-control-<version>.crx for the Chrome Web
// Store's "Verified CRX uploads": every update must be signed with our key.
//
// The private key never lives in the repo. It's read from $CRX_SIGNING_KEY,
// defaulting to ~/.config/tab-audio-control/crx-signing-key.pem (bin/build.sh
// can fetch it from 1Password into a temp file instead). Its public half must
// match store/crx-public-key.pem, the key registered with the Web Store, so a
// wrong key fails here instead of at upload.
//
// Packing uses Playwright's Chromium (same CRX3 format as Chrome) with a
// throwaway profile, so it can't collide with a running Chrome. Source maps
// are left out, as in the zip.
//
// Exit codes: 0 signed, 2 no key found (so callers can decide if that's fatal).
import { execFileSync } from 'node:child_process';
import { createPrivateKey, createPublicKey } from 'node:crypto';
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	renameSync,
	rmSync
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const root = resolve(import.meta.dirname, '..');
const keyPath =
	process.env.CRX_SIGNING_KEY ?? join(homedir(), '.config/tab-audio-control/crx-signing-key.pem');

if (!existsSync(keyPath)) {
	console.error(`No CRX signing key at ${keyPath} (set CRX_SIGNING_KEY to use another path).`);
	process.exit(2);
}
if (keyPath.startsWith(root)) {
	console.error('Refusing to use a signing key stored inside the repository.');
	process.exit(1);
}

const publicDer = createPublicKey(createPrivateKey(readFileSync(keyPath))).export({
	type: 'spki',
	format: 'der'
});
const registered = createPublicKey(readFileSync(resolve(root, 'store/crx-public-key.pem'))).export({
	type: 'spki',
	format: 'der'
});
if (!publicDer.equals(registered)) {
	console.error(
		`The key at ${keyPath} isn't the one registered with the Web Store (store/crx-public-key.pem).`
	);
	process.exit(1);
}

const { version } = JSON.parse(readFileSync(resolve(root, 'dist/manifest.json'), 'utf8'));
const work = mkdtempSync(join(tmpdir(), 'tac-sign-'));
try {
	// Stage dist/ without source maps; Chromium writes <dir>.crx beside it.
	const stage = join(work, 'extension');
	cpSync(resolve(root, 'dist'), stage, {
		recursive: true,
		filter: (src) => !src.endsWith('.map')
	});
	execFileSync(
		chromium.executablePath(),
		[
			`--pack-extension=${stage}`,
			`--pack-extension-key=${keyPath}`,
			`--user-data-dir=${join(work, 'profile')}`,
			'--no-first-run',
			'--no-default-browser-check'
		],
		{ stdio: 'ignore', timeout: 60_000 }
	);
	const packed = `${stage}.crx`;
	if (!existsSync(packed)) throw new Error('Chromium did not produce a .crx');

	// Sanity check: CRX3 magic, and signed with *our* key (its public key is
	// embedded in the header).
	const crx = readFileSync(packed);
	if (crx.toString('latin1', 0, 4) !== 'Cr24' || crx.readUInt32LE(4) !== 3) {
		throw new Error('Output is not a CRX3 file');
	}
	if (crx.indexOf(publicDer) === -1) throw new Error('CRX is not signed with the expected key');

	mkdirSync(resolve(root, 'release'), { recursive: true });
	const out = resolve(root, 'release', `tab-audio-control-${version}.crx`);
	rmSync(out, { force: true });
	renameSync(packed, out);
	console.log(`release/tab-audio-control-${version}.crx (signed)`);
} finally {
	rmSync(work, { recursive: true, force: true });
}
