// Makes the popup believe it's attached to a tab with a playing, routed video,
// with a lively fake spectrum. Shared by the e2e popup test and the store
// screenshots. Passed to page.addInitScript, so it must be self-contained.
export function stubMediaTab() {
	const status = { total: 1, routed: 1, limited: 0, playing: true, waitingForGesture: false };
	const c = /** @type {Record<string, Record<string, unknown>>} */ (
		/** @type {unknown} */ (chrome)
	);
	const tabs = /** @type {Record<string, unknown>} */ (c.tabs);
	const scripting = /** @type {Record<string, unknown>} */ (c.scripting);
	const action = /** @type {Record<string, unknown>} */ (c.action);
	tabs.query = async () => [{ id: 4242, active: true }];
	tabs.get = async () => ({ id: 4242, audible: true });
	tabs.sendMessage = async () => undefined;
	tabs.connect = () => {
		/** @type {((m: unknown) => void)[]} */
		const listeners = [];
		let t = 0;
		const timer = setInterval(() => {
			t += 1;
			const bins = Array.from({ length: 72 }, (_, i) => {
				const body = 205 - Math.abs(i - 20) * 4.2;
				const air = i > 44 ? -(i - 44) * 3 : 0;
				const wobble = Math.sin(i * 1.7 + t * 0.4) * 14;
				return Math.max(0, Math.min(255, body + air + wobble));
			});
			for (const l of listeners) l({ bins });
		}, 50);
		return {
			onMessage: { addListener: (/** @type {(m: unknown) => void} */ l) => listeners.push(l) },
			disconnect: () => clearInterval(timer)
		};
	};
	scripting.executeScript = async () => [{ frameId: 0, result: status }];
	for (const fn of ['setBadgeText', 'setBadgeBackgroundColor', 'setBadgeTextColor', 'setIcon']) {
		action[fn] = async () => {};
	}
}
