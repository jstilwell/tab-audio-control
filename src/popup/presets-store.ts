// User presets live in chrome.storage.sync so they follow the user's Chrome
// profile. Validated on every read.
import { sanitizeUserPresets, type Preset } from '../shared/presets';

const KEY = 'presets';

export async function loadUserPresets(): Promise<Preset[]> {
	const raw = (await chrome.storage.sync.get(KEY))[KEY];
	return sanitizeUserPresets(raw);
}

export async function saveUserPresets(presets: Preset[]): Promise<void> {
	await chrome.storage.sync.set({
		[KEY]: presets.map(({ id, name, bands }) => ({ id, name, bands }))
	});
}
