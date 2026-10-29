// Every message that crosses an extension context boundary. Listeners must
// check `sender.id === chrome.runtime.id` and validate shape before acting.

import type { AudioSettings } from './settings';

/** What the in-page engine reports about one frame. */
export interface FrameStatus {
	/** Media elements found in the frame */
	total: number;
	/** Elements routed through our audio graph (full control) */
	routed: number;
	/** Elements we can only turn down, not boost or EQ */
	limited: number;
	/** Any element currently playing */
	playing: boolean;
	/** The audio graph is waiting for a click on the page before it may start */
	waitingForGesture: boolean;
}

/** Requested at runtime, only when the user opts into capture mode. */
export const CAPTURE_PERMISSIONS: chrome.permissions.Permissions = {
	permissions: ['tabCapture', 'offscreen']
};

export const PORT_SPECTRUM = 'tac:spectrum';

export interface SpectrumFrame {
	bins: number[];
}

/** Popup → content scripts (all frames) */
export interface ApplyMessage {
	type: 'tac:apply';
	settings: AudioSettings;
}

/** Popup → service worker */
export type WorkerRequest =
	{ type: 'tac:capture-start'; tabId: number } | { type: 'tac:capture-stop'; tabId: number };

/** Offscreen document → service worker */
export interface CaptureEndedMessage {
	type: 'tac:capture-ended';
	tabId: number;
}

/** Service worker / popup → offscreen document */
export type OffscreenRequest =
	| {
			target: 'offscreen';
			type: 'tac:capture-start';
			tabId: number;
			streamId: string;
			settings: AudioSettings;
	  }
	| { target: 'offscreen'; type: 'tac:capture-apply'; tabId: number; settings: AudioSettings }
	| { target: 'offscreen'; type: 'tac:capture-stop'; tabId: number }
	| { target: 'offscreen'; type: 'tac:capture-status' };

export type Result = { ok: true } | { ok: false; error: string };

export function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

export function isTabId(value: unknown): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export function spectrumPortName(tabId: number): string {
	return `${PORT_SPECTRUM}:${tabId}`;
}
