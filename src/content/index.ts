// The in-page engine. Injected on demand (activeTab + scripting) into the
// isolated world of each frame. It routes the page's own <video>/<audio>
// elements through Web Audio instead of capturing the tab, which is what
// keeps real (monitor-filling) full screen working.

import { AudioGraph } from '../audio/graph';
import { PORT_SPECTRUM, isObject, type FrameStatus, type SpectrumFrame } from '../shared/messages';
import {
	defaultSettings,
	isDefault,
	sanitizeSettings,
	type AudioSettings
} from '../shared/settings';
import { findMedia, isTainted } from './media';

const SPECTRUM_INTERVAL_MS = 50;

function createEngine(): ContentApi {
	let settings = defaultSettings();
	let ctx: AudioContext | undefined;
	let graph: AudioGraph | undefined;
	let watching = false;

	const known = new Set<HTMLMediaElement>();
	// Weak: Chrome itself keeps a routed element alive as long as the AudioContext
	// lives (even with its source disconnected), but we shouldn't add to that.
	const routed = new WeakSet<HTMLMediaElement>();
	/** Tainted or already claimed by the page's own AudioContext: volume-only. */
	const limited = new Map<HTMLMediaElement, number>();

	/** Forgets players the page removed, so feeds that keep making new ones don't pile up. */
	function prune() {
		for (const el of known) {
			if (!el.isConnected && el.paused) {
				known.delete(el);
				limited.delete(el);
			}
		}
	}

	function ensureGraph(): AudioContext {
		if (ctx) return ctx;
		ctx = new AudioContext();
		graph = new AudioGraph(ctx, ctx.destination);
		graph.apply(settings);
		ctx.addEventListener('statechange', () => {
			if (ctx?.state === 'running') for (const el of known) adopt(el);
		});
		if (ctx.state !== 'running') {
			// Autoplay policy: the popup click doesn't count as a gesture on the
			// page. Until the page has one, the context stays suspended — and
			// routing media into it would silence the video, so we wait.
			const resume = () => void ctx?.resume();
			for (const type of ['pointerdown', 'keydown']) {
				window.addEventListener(type, resume, { capture: true, once: true });
			}
			void ctx.resume();
		}
		return ctx;
	}

	/** Takes an element over, once the graph can actually play. */
	function adopt(el: HTMLMediaElement) {
		if (routed.has(el) || limited.has(el)) return;
		// No source yet: we can't tell if it will be tainted. 'loadedmetadata' retries.
		if (!el.currentSrc && !el.srcObject) return;
		if (isTainted(el.currentSrc, el.crossOrigin, location.origin)) {
			limit(el);
			return;
		}
		const context = ensureGraph();
		if (context.state !== 'running' || !graph) return;
		try {
			context.createMediaElementSource(el).connect(graph.input);
			routed.add(el);
		} catch {
			// The page already connected this element to its own AudioContext.
			limit(el);
		}
	}

	function limit(el: HTMLMediaElement) {
		limited.set(el, el.volume);
		el.addEventListener('volumechange', onPageVolume);
		applyLimited(el);
	}

	/** What the volume-only fallback multiplies the page's own volume by. */
	function limitedFactor(): number {
		return settings.muted ? 0 : Math.min(1, settings.volume);
	}

	/** Volume-only fallback: can turn down and mute, never boost. */
	function applyLimited(el: HTMLMediaElement) {
		const original = limited.get(el);
		if (original === undefined) return;
		el.volume = Math.min(1, original * limitedFactor());
	}

	/**
	 * The site's own volume control moved a volume-only player. Keep the level
	 * the user just chose there and work back to what it means at 100%, so the
	 * two sliders don't fight and the next change here starts from that level.
	 */
	function onPageVolume(e: Event) {
		const el = e.currentTarget as HTMLMediaElement;
		const original = limited.get(el);
		const factor = limitedFactor();
		// Our own writes also land here; they already match.
		if (original === undefined || el.volume === Math.min(1, original * factor)) return;
		limited.set(el, factor > 0 ? el.volume / factor : el.volume);
		applyLimited(el);
	}

	function track(el: HTMLMediaElement) {
		if (known.has(el)) return;
		known.add(el);
		// Here, not just in status(): nothing polls status while the popup is closed.
		prune();
		// Leave the page untouched until the user actually changes something.
		if (!isDefault(settings) || ctx) adopt(el);
		// A src swap can turn a routable element into a tainted one.
		el.addEventListener('loadedmetadata', () => {
			if (!routed.has(el) && !limited.has(el) && (!isDefault(settings) || ctx)) adopt(el);
		});
	}

	function watch() {
		if (watching) return;
		watching = true;
		for (const el of findMedia(document)) track(el);
		new MutationObserver((records) => {
			for (const r of records) {
				for (const node of r.addedNodes) {
					if (node instanceof Element) for (const el of findMedia(node)) track(el);
				}
			}
		}).observe(document, { childList: true, subtree: true });
		// 'play' doesn't bubble, but capture sees it — catches elements we missed.
		document.addEventListener(
			'play',
			(e) => {
				if (e.target instanceof HTMLMediaElement) track(e.target);
			},
			true
		);
	}

	function status(): FrameStatus {
		prune();
		return {
			total: known.size,
			routed: [...known].filter((el) => routed.has(el)).length,
			limited: limited.size,
			playing: [...known].some((el) => !el.paused && !el.muted),
			waitingForGesture: ctx !== undefined && ctx.state !== 'running' && known.size > 0
		};
	}

	function apply(input: unknown): FrameStatus {
		settings = sanitizeSettings(input);
		watch();
		if (!isDefault(settings)) for (const el of known) adopt(el);
		graph?.apply(settings);
		for (const el of limited.keys()) applyLimited(el);
		return status();
	}

	chrome.runtime.onMessage.addListener((msg: unknown, sender) => {
		if (sender.id !== chrome.runtime.id || !isObject(msg)) return;
		if (msg.type === 'tac:apply') apply(msg.settings);
	});

	chrome.runtime.onConnect.addListener((port) => {
		if (port.name !== PORT_SPECTRUM || port.sender?.id !== chrome.runtime.id) return;
		const timer = setInterval(() => {
			if (!graph || ctx?.state !== 'running') return;
			const frame: SpectrumFrame = { bins: graph.spectrum() };
			port.postMessage(frame);
		}, SPECTRUM_INTERVAL_MS);
		port.onDisconnect.addListener(() => clearInterval(timer));
	});

	return { apply: (s: AudioSettings) => apply(s), status };
}

// The isolated world persists across injections, so re-injecting is a no-op.
window.__tabAudio ??= createEngine();
