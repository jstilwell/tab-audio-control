// The popup's link to whichever engine is running the current tab.

import { injectAndApply, queryStatus, spectrumFrame, summarize } from '../shared/inject';
import {
	CAPTURE_PERMISSIONS,
	PORT_SPECTRUM,
	spectrumPortName,
	type ApplyMessage,
	type FrameStatus,
	type OffscreenRequest,
	type Result,
	type SpectrumFrame,
	type WorkerRequest
} from '../shared/messages';
import { defaultSettings, isDefault, type AudioSettings } from '../shared/settings';
import {
	clearTabState,
	getTabState,
	setTabState,
	updateBadge,
	type Engine
} from '../shared/tab-state';

export interface Connection {
	tabId: number;
	engine: Engine;
	settings: AudioSettings;
	status: FrameStatus;
	spectrumFrameId: number | undefined;
	/** Set when Chrome won't let extensions touch this page at all */
	blocked: boolean;
}

const EMPTY_STATUS: FrameStatus = {
	total: 0,
	routed: 0,
	limited: 0,
	playing: false,
	waitingForGesture: false
};

async function captureActive(tabId: number): Promise<boolean> {
	try {
		const msg: OffscreenRequest = { target: 'offscreen', type: 'tac:capture-status' };
		const res = (await chrome.runtime.sendMessage(msg)) as { tabIds?: number[] } | undefined;
		return res?.tabIds?.includes(tabId) ?? false;
	} catch {
		return false;
	}
}

export async function connect(): Promise<Connection | undefined> {
	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
	if (tab?.id === undefined) return undefined;
	const tabId = tab.id;
	const stored = await getTabState(tabId);
	const settings = stored?.settings ?? defaultSettings();

	if (stored?.engine === 'capture' && (await captureActive(tabId))) {
		return {
			tabId,
			engine: 'capture',
			settings,
			status: EMPTY_STATUS,
			spectrumFrameId: undefined,
			blocked: false
		};
	}

	try {
		const frames = await injectAndApply(tabId, settings);
		return {
			tabId,
			engine: 'page',
			settings,
			status: summarize(frames),
			spectrumFrameId: spectrumFrame(frames),
			blocked: false
		};
	} catch {
		return {
			tabId,
			engine: 'page',
			settings,
			status: EMPTY_STATUS,
			spectrumFrameId: undefined,
			blocked: true
		};
	}
}

export async function refreshStatus(
	tabId: number
): Promise<{ status: FrameStatus; spectrumFrameId: number | undefined; audible: boolean }> {
	const [frames, tab] = await Promise.all([
		queryStatus(tabId).catch(() => []),
		chrome.tabs.get(tabId).catch(() => undefined)
	]);
	return {
		status: summarize(frames),
		spectrumFrameId: spectrumFrame(frames),
		audible: tab?.audible ?? false
	};
}

/** Sends settings to the running engine. Cheap enough to call per animation frame. */
export function send(tabId: number, engine: Engine, settings: AudioSettings): void {
	if (engine === 'capture') {
		const msg: OffscreenRequest = {
			target: 'offscreen',
			type: 'tac:capture-apply',
			tabId,
			settings
		};
		void chrome.runtime.sendMessage(msg).catch(() => {});
	} else {
		const msg: ApplyMessage = { type: 'tac:apply', settings };
		void chrome.tabs.sendMessage(tabId, msg).catch(() => {});
	}
}

/** Remembers the tab's settings (so reloads keep them) and updates the badge. */
export async function persist(tabId: number, engine: Engine, settings: AudioSettings) {
	if (engine === 'page' && isDefault(settings)) {
		await clearTabState(tabId);
		await updateBadge(tabId, undefined);
		return;
	}
	const state = { engine, settings };
	await setTabState(tabId, state);
	await updateBadge(tabId, state);
}

/**
 * Must be called straight from a click handler: the permission prompt needs
 * the user gesture.
 */
export async function startCapture(tabId: number, settings: AudioSettings): Promise<Result> {
	const granted = await chrome.permissions.request(CAPTURE_PERMISSIONS);
	if (!granted) return { ok: false, error: 'Capture mode needs permission to capture this tab.' };
	await setTabState(tabId, { engine: 'page', settings });
	const msg: WorkerRequest = { type: 'tac:capture-start', tabId };
	return chrome.runtime.sendMessage(msg);
}

export async function stopCapture(tabId: number): Promise<Result> {
	const msg: WorkerRequest = { type: 'tac:capture-stop', tabId };
	return chrome.runtime.sendMessage(msg);
}

/** Streams spectrum bars from the engine; returns an unsubscribe function. */
export function subscribeSpectrum(
	tabId: number,
	engine: Engine,
	frameId: number | undefined,
	onFrame: (bins: number[]) => void
): () => void {
	let port: chrome.runtime.Port;
	try {
		port =
			engine === 'capture'
				? chrome.runtime.connect({ name: spectrumPortName(tabId) })
				: chrome.tabs.connect(tabId, { name: PORT_SPECTRUM, frameId: frameId ?? 0 });
	} catch {
		return () => {};
	}
	port.onMessage.addListener((msg: SpectrumFrame) => {
		if (Array.isArray(msg?.bins)) onFrame(msg.bins);
	});
	return () => port.disconnect();
}
