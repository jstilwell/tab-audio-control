// Per-tab memory, kept in chrome.storage.session: survives navigation and
// service-worker restarts, cleared when the browser quits. Content scripts
// cannot read it (session storage defaults to trusted contexts only).

import { iconImageData } from './icon';
import { badgeText, sanitizeSettings, type AudioSettings } from './settings';

export type Engine = 'page' | 'capture';

export interface TabState {
	engine: Engine;
	settings: AudioSettings;
}

const key = (tabId: number) => `tab:${tabId}`;

export async function getTabState(tabId: number): Promise<TabState | undefined> {
	const raw = (await chrome.storage.session.get(key(tabId)))[key(tabId)] as
		Record<string, unknown> | undefined;
	if (!raw) return undefined;
	return {
		engine: raw.engine === 'capture' ? 'capture' : 'page',
		settings: sanitizeSettings(raw.settings)
	};
}

export async function setTabState(tabId: number, state: TabState): Promise<void> {
	await chrome.storage.session.set({ [key(tabId)]: state });
}

export async function clearTabState(tabId: number): Promise<void> {
	await chrome.storage.session.remove(key(tabId));
}

const BADGE_COLORS: Record<Engine, string> = {
	page: '#6c4fb0',
	capture: '#e8512a'
};

/**
 * Shows the tab's state on the toolbar: the waveform icon tracks its volume
 * (flatlined when muted), and the badge shows the number (or M / fx).
 */
export async function updateBadge(tabId: number, state: TabState | undefined): Promise<void> {
	const text = state ? badgeText(state.settings) || (state.engine === 'capture' ? 'cap' : '') : '';
	try {
		await chrome.action.setIcon({
			tabId,
			imageData: iconImageData(state?.settings ?? { volume: 1, muted: false })
		});
		await chrome.action.setBadgeText({ tabId, text });
		if (text && state) {
			await chrome.action.setBadgeBackgroundColor({ tabId, color: BADGE_COLORS[state.engine] });
			await chrome.action.setBadgeTextColor({ tabId, color: '#ffffff' });
		}
	} catch {
		// The tab may have closed in the meantime.
	}
}
