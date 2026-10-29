// Service worker: per-tab memory and the capture-mode lifecycle.
//
// - Re-applies a tab's settings after a same-site reload (the activeTab grant
//   survives same-origin navigation; cross-site needs another click).
// - Owns the offscreen document used by opt-in capture mode.
// - Forgets a tab when it closes.

import { injectAndApply } from '../shared/inject';
import {
	CAPTURE_PERMISSIONS,
	isObject,
	isTabId,
	type OffscreenRequest,
	type Result
} from '../shared/messages';
import { defaultSettings, isDefault } from '../shared/settings';
import { clearTabState, getTabState, setTabState, updateBadge } from '../shared/tab-state';

const OFFSCREEN_URL = 'offscreen/index.html';

let creatingOffscreen: Promise<void> | undefined;

async function ensureOffscreen(): Promise<void> {
	const existing = await chrome.runtime.getContexts({
		contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT]
	});
	if (existing.length > 0) return;
	creatingOffscreen ??= chrome.offscreen
		.createDocument({
			url: OFFSCREEN_URL,
			reasons: [chrome.offscreen.Reason.USER_MEDIA],
			justification: 'Process captured tab audio when the in-page engine cannot reach it.'
		})
		.finally(() => (creatingOffscreen = undefined));
	await creatingOffscreen;
}

function toOffscreen<T>(msg: OffscreenRequest): Promise<T> {
	return chrome.runtime.sendMessage(msg);
}

async function startCapture(tabId: number): Promise<Result> {
	if (!(await chrome.permissions.contains(CAPTURE_PERMISSIONS))) {
		return { ok: false, error: 'Capture permission not granted.' };
	}
	const state = (await getTabState(tabId)) ?? { engine: 'page', settings: defaultSettings() };

	// Flatten the in-page engine so the audio isn't processed twice.
	await chrome.scripting
		.executeScript({
			target: { tabId, allFrames: true },
			func: (s) => window.__tabAudio?.apply(s) ?? null,
			args: [defaultSettings()]
		})
		.catch(() => {});

	try {
		await ensureOffscreen();
		const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
		const result = await toOffscreen<Result>({
			target: 'offscreen',
			type: 'tac:capture-start',
			tabId,
			streamId,
			settings: state.settings
		});
		if (result.ok) {
			const next = { engine: 'capture' as const, settings: state.settings };
			await setTabState(tabId, next);
			await updateBadge(tabId, next);
		}
		return result;
	} catch (err) {
		return { ok: false, error: err instanceof Error ? err.message : String(err) };
	}
}

async function closeOffscreenIfIdle(remaining: number) {
	if (remaining === 0) await chrome.offscreen?.closeDocument().catch(() => {});
}

async function stopCapture(tabId: number): Promise<Result> {
	const state = await getTabState(tabId);
	try {
		const { remaining } = await toOffscreen<{ remaining: number }>({
			target: 'offscreen',
			type: 'tac:capture-stop',
			tabId
		});
		await closeOffscreenIfIdle(remaining);
	} catch {
		// No offscreen document: nothing was capturing.
	}
	if (!state) return { ok: true };
	const next = { engine: 'page' as const, settings: state.settings };
	await setTabState(tabId, next);
	await reapply(tabId, next.settings);
	return { ok: true };
}

/** Puts the in-page engine back on a tab; clears the badge if we've lost access. */
async function reapply(tabId: number, settings: ReturnType<typeof defaultSettings>) {
	try {
		if (!isDefault(settings)) await injectAndApply(tabId, settings);
		await updateBadge(tabId, { engine: 'page', settings });
	} catch {
		await updateBadge(tabId, undefined);
	}
}

chrome.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
	if (sender.id !== chrome.runtime.id || !isObject(msg) || 'target' in msg) return;
	const req = msg as { type?: unknown; tabId?: unknown };
	if (!isTabId(req.tabId)) return;

	// Only extension pages (the popup) may drive capture; never content scripts.
	if (req.type === 'tac:capture-start' && !sender.tab) {
		void startCapture(req.tabId).then(sendResponse);
		return true;
	}
	if (req.type === 'tac:capture-stop' && !sender.tab) {
		void stopCapture(req.tabId).then(sendResponse);
		return true;
	}
	if (req.type === 'tac:capture-ended' && sender.url?.includes(OFFSCREEN_URL)) {
		const tabId = req.tabId;
		void (async () => {
			const state = await getTabState(tabId);
			if (state) {
				await setTabState(tabId, { engine: 'page', settings: state.settings });
				await updateBadge(tabId, undefined);
			}
			const { tabIds } = await toOffscreen<{ tabIds: number[] }>({
				target: 'offscreen',
				type: 'tac:capture-status'
			}).catch(() => ({ tabIds: [] }));
			await closeOffscreenIfIdle(tabIds.length);
		})();
	}
});

chrome.tabs.onUpdated.addListener((tabId, info) => {
	// 'loading' gets audio under control early; 'complete' catches the new
	// document if 'loading' raced the old one. The engine ignores repeats.
	if (info.status !== 'loading' && info.status !== 'complete') return;
	void (async () => {
		const state = await getTabState(tabId);
		if (!state) return;
		if (state.engine === 'capture') {
			await updateBadge(tabId, state);
			return;
		}
		await reapply(tabId, state.settings);
	})();
});

chrome.tabs.onRemoved.addListener((tabId) => {
	void (async () => {
		const state = await getTabState(tabId);
		await clearTabState(tabId);
		if (state?.engine === 'capture') await stopCapture(tabId);
	})();
});
