// Injecting and driving the in-page engine. Both the popup and the service
// worker use this; it relies only on activeTab + scripting.

import type { FrameStatus } from './messages';
import type { AudioSettings } from './settings';

export interface FrameResult {
	frameId: number;
	status: FrameStatus;
}

function collect(results: chrome.scripting.InjectionResult<unknown>[]): FrameResult[] {
	return results.flatMap((r) =>
		r.result ? [{ frameId: r.frameId, status: r.result as FrameStatus }] : []
	);
}

/**
 * Loads the engine into every frame we may access (idempotent: the script
 * guards against double-loading) and applies the settings. Throws when Chrome
 * won't let extensions run on the page (chrome://, the Web Store, …) or when
 * the activeTab grant has lapsed.
 */
export async function injectAndApply(
	tabId: number,
	settings: AudioSettings
): Promise<FrameResult[]> {
	await chrome.scripting.executeScript({
		target: { tabId, allFrames: true },
		files: ['content.js']
	});
	const results = await chrome.scripting.executeScript({
		target: { tabId, allFrames: true },
		func: (s: AudioSettings) => window.__tabAudio?.apply(s) ?? null,
		args: [settings]
	});
	return collect(results);
}

export async function queryStatus(tabId: number): Promise<FrameResult[]> {
	const results = await chrome.scripting.executeScript({
		target: { tabId, allFrames: true },
		func: () => window.__tabAudio?.status() ?? null
	});
	return collect(results);
}

/** Sums per-frame status into one picture of the tab. */
export function summarize(frames: FrameResult[]): FrameStatus {
	return frames.reduce<FrameStatus>(
		(acc, { status }) => ({
			total: acc.total + status.total,
			routed: acc.routed + status.routed,
			limited: acc.limited + status.limited,
			playing: acc.playing || status.playing,
			waitingForGesture: acc.waitingForGesture || status.waitingForGesture
		}),
		{ total: 0, routed: 0, limited: 0, playing: false, waitingForGesture: false }
	);
}

/** The frame whose audio the spectrum should show: playing + routed, top frame first. */
export function spectrumFrame(frames: FrameResult[]): number | undefined {
	const ranked = [...frames]
		.filter((f) => f.status.routed > 0)
		.sort(
			(a, b) =>
				Number(b.status.playing) - Number(a.status.playing) ||
				(a.frameId === 0 ? -1 : b.frameId === 0 ? 1 : 0)
		);
	return ranked[0]?.frameId;
}
