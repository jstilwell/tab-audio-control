// Media-element helpers that don't need a live page, so they can be unit tested.

/**
 * Whether Web Audio would receive silence from this element. Cross-origin
 * media fetched without CORS is "tainted": routing it through
 * createMediaElementSource outputs zeros, which would mute the video.
 * blob:/data:/mediastream sources (YouTube's MSE players, srcObject) are fine.
 */
export function isTainted(
	currentSrc: string,
	crossOrigin: string | null,
	pageOrigin: string
): boolean {
	if (!currentSrc) return false;
	let url: URL;
	try {
		url = new URL(currentSrc);
	} catch {
		return false;
	}
	if (url.protocol === 'blob:' || url.protocol === 'data:' || url.protocol === 'mediastream:') {
		return false;
	}
	if (url.origin === pageOrigin) return false;
	// With a crossorigin attribute the browser makes a CORS request; if the
	// server refuses, the media fails to load rather than playing tainted.
	return crossOrigin === null;
}

/** Every <video>/<audio> under `root`, including inside open shadow roots. */
export function findMedia(root: ParentNode): HTMLMediaElement[] {
	const found: HTMLMediaElement[] = [];
	const visit = (node: ParentNode) => {
		// One walk finds both the players and the shadow roots to look inside.
		for (const el of node.querySelectorAll('*')) {
			if (el instanceof HTMLMediaElement) found.push(el);
			if (el.shadowRoot) visit(el.shadowRoot);
		}
	};
	if (root instanceof HTMLMediaElement) found.push(root);
	visit(root);
	return found;
}
