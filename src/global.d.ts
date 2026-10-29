import type { FrameStatus } from './shared/messages';
import type { AudioSettings } from './shared/settings';

declare global {
	/** The in-page engine's surface, reachable from scripting.executeScript funcs. */
	interface ContentApi {
		apply(settings: AudioSettings): FrameStatus;
		status(): FrameStatus;
	}

	interface Window {
		__tabAudio?: ContentApi;
	}
}

export {};
