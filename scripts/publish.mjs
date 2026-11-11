// Uploads the signed .crx to the Chrome Web Store and submits it for review,
// through the Chrome Web Store API v2 as a service account:
// https://developer.chrome.com/docs/webstore/using-api
//
//   node scripts/publish.mjs --check   prove the credentials work; changes nothing
//   node scripts/publish.mjs           upload release/tab-audio-control-<version>.crx, then submit
//
// Needs CWS_PUBLISHER_ID, CWS_ITEM_ID and CWS_SERVICE_ACCOUNT_KEY (a path to the
// service account's JSON key, which must never be in the repo). bin/build.sh
// --publish sets these up, fetching the key from 1Password if configured.
//
// The API only replaces the package. Listing text and screenshots are still
// edited in the dashboard.
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const { CWS_PUBLISHER_ID, CWS_ITEM_ID, CWS_SERVICE_ACCOUNT_KEY } = process.env;
if (!CWS_PUBLISHER_ID || !CWS_ITEM_ID || !CWS_SERVICE_ACCOUNT_KEY) {
	console.error('Set CWS_PUBLISHER_ID, CWS_ITEM_ID and CWS_SERVICE_ACCOUNT_KEY.');
	process.exit(2);
}
if (resolve(CWS_SERVICE_ACCOUNT_KEY).startsWith(root)) {
	console.error('Refusing to use a service account key stored inside the repository.');
	process.exit(1);
}

const API = 'https://chromewebstore.googleapis.com';
const ITEM = `publishers/${CWS_PUBLISHER_ID}/items/${CWS_ITEM_ID}`;

const key = JSON.parse(readFileSync(CWS_SERVICE_ACCOUNT_KEY, 'utf8'));

/** Trades a self-signed JWT for a short-lived access token (no SDK needed). */
async function accessToken() {
	const now = Math.floor(Date.now() / 1000);
	const part = (/** @type {object} */ o) => Buffer.from(JSON.stringify(o)).toString('base64url');
	const unsigned = `${part({ alg: 'RS256', typ: 'JWT' })}.${part({
		iss: key.client_email,
		scope: 'https://www.googleapis.com/auth/chromewebstore',
		aud: key.token_uri,
		iat: now,
		exp: now + 600
	})}`;
	const signature = createSign('RSA-SHA256').update(unsigned).sign(key.private_key, 'base64url');
	const res = await fetch(key.token_uri, {
		method: 'POST',
		body: new URLSearchParams({
			grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
			assertion: `${unsigned}.${signature}`
		})
	});
	const body = await res.json();
	if (!res.ok) throw new Error(`Google refused the service account: ${JSON.stringify(body)}`);
	return body.access_token;
}

const token = await accessToken();

/** @param {string} method @param {string} path @param {RequestInit} [init] */
async function call(method, path, init = {}) {
	const res = await fetch(`${API}${path}`, {
		...init,
		method,
		headers: { ...init.headers, Authorization: `Bearer ${token}` }
	});
	const text = await res.text();
	if (!res.ok) throw new Error(`${method} ${path} failed (${res.status}): ${text}`);
	return text ? JSON.parse(text) : {};
}

const fetchStatus = () => call('GET', `/v2/${ITEM}:fetchStatus`);
const describe = (/** @type {any} */ rev) =>
	rev ? `${rev.distributionChannels?.[0]?.crxVersion ?? '?'} (${rev.state})` : 'none';

const status = await fetchStatus();
console.log(`Published: ${describe(status.publishedItemRevisionStatus)}`);
console.log(`In review: ${describe(status.submittedItemRevisionStatus)}`);
if (process.argv.includes('--check')) process.exit(0);

const { version } = JSON.parse(readFileSync(resolve(root, 'public/manifest.json'), 'utf8'));
const crx = resolve(root, 'release', `tab-audio-control-${version}.crx`);

console.log(`Uploading ${basename(crx)}…`);
let { uploadState } = await call('POST', `/upload/v2/${ITEM}:upload`, {
	body: readFileSync(crx),
	// These two headers are what make the store treat the body as a CRX, not a zip.
	headers: { 'X-Goog-Upload-Protocol': 'raw', 'X-Goog-Upload-File-Name': basename(crx) }
});
// shortcut: gives up after 3 minutes of polling; rerun if the store is ever slower.
for (let i = 0; i < 60 && /IN_PROGRESS/.test(uploadState); i++) {
	await new Promise((r) => setTimeout(r, 3000));
	uploadState = (await fetchStatus()).lastAsyncUploadState;
}
if (uploadState !== 'SUCCEEDED') throw new Error(`Upload did not succeed: ${uploadState}`);

const submitted = await call('POST', `/v2/${ITEM}:publish`);
for (const w of submitted.warningInfo?.warnings ?? []) {
	console.warn(`Warning: ${w.reason}: ${w.description}`);
}
console.log(`Submitted v${version} for review (${submitted.state}).`);
