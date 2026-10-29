// The capture engine (opt-in fallback). Lives in an offscreen document because
// service workers can't run Web Audio. While a tab is captured Chrome keeps its
// full screen inside the browser window — the popup warns before starting.
// Offscreen documents only get chrome.runtime, so all state lives with the
// service worker.

import { AudioGraph } from '../audio/graph';
import {
	PORT_SPECTRUM,
	isObject,
	isTabId,
	type CaptureEndedMessage,
	type Result,
	type SpectrumFrame
} from '../shared/messages';
import { sanitizeSettings } from '../shared/settings';

interface Session {
	ctx: AudioContext;
	graph: AudioGraph;
	stream: MediaStream;
}

const sessions = new Map<number, Session>();

async function start(tabId: number, streamId: string, settings: unknown): Promise<Result> {
	stop(tabId);
	try {
		const stream = await navigator.mediaDevices.getUserMedia({
			audio: {
				mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId }
			} as MediaTrackConstraints,
			video: false
		});
		// Capturing silences the tab's own output, so we must play it back.
		const ctx = new AudioContext();
		const graph = new AudioGraph(ctx, ctx.destination);
		graph.apply(sanitizeSettings(settings));
		ctx.createMediaStreamSource(stream).connect(graph.input);
		for (const track of stream.getAudioTracks()) {
			track.addEventListener('ended', () => {
				stop(tabId);
				const msg: CaptureEndedMessage = { type: 'tac:capture-ended', tabId };
				void chrome.runtime.sendMessage(msg).catch(() => {});
			});
		}
		sessions.set(tabId, { ctx, graph, stream });
		return { ok: true };
	} catch (err) {
		return { ok: false, error: err instanceof Error ? err.message : String(err) };
	}
}

function stop(tabId: number) {
	const session = sessions.get(tabId);
	if (!session) return;
	sessions.delete(tabId);
	for (const track of session.stream.getTracks()) track.stop();
	void session.ctx.close();
}

chrome.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
	if (sender.id !== chrome.runtime.id || !isObject(msg) || msg.target !== 'offscreen') return;
	switch (msg.type) {
		case 'tac:capture-start':
			if (!isTabId(msg.tabId) || typeof msg.streamId !== 'string') return;
			void start(msg.tabId, msg.streamId, msg.settings).then(sendResponse);
			return true;
		case 'tac:capture-apply':
			if (isTabId(msg.tabId)) sessions.get(msg.tabId)?.graph.apply(sanitizeSettings(msg.settings));
			return;
		case 'tac:capture-stop':
			if (isTabId(msg.tabId)) stop(msg.tabId);
			sendResponse({ remaining: sessions.size });
			return;
		case 'tac:capture-status':
			sendResponse({ tabIds: [...sessions.keys()] });
			return;
	}
});

chrome.runtime.onConnect.addListener((port) => {
	if (port.sender?.id !== chrome.runtime.id || !port.name.startsWith(`${PORT_SPECTRUM}:`)) return;
	const tabId = Number(port.name.slice(PORT_SPECTRUM.length + 1));
	const timer = setInterval(() => {
		const session = sessions.get(tabId);
		if (!session) return;
		const frame: SpectrumFrame = { bins: session.graph.spectrum() };
		port.postMessage(frame);
	}, 50);
	port.onDisconnect.addListener(() => clearInterval(timer));
});
