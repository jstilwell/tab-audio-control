import { describe, expect, it } from 'vitest';
import { spectrumFrame, summarize, type FrameResult } from '../src/shared/inject';

const frame = (frameId: number, status: Partial<FrameResult['status']>): FrameResult => ({
	frameId,
	status: { total: 1, routed: 0, limited: 0, playing: false, waitingForGesture: false, ...status }
});

describe('summarize', () => {
	it('adds counts and ORs flags across frames', () => {
		expect(summarize([frame(0, { routed: 1 }), frame(3, { limited: 1, playing: true })])).toEqual({
			total: 2,
			routed: 1,
			limited: 1,
			playing: true,
			waitingForGesture: false
		});
	});
});

describe('spectrumFrame', () => {
	it('prefers a playing, routed frame', () => {
		expect(spectrumFrame([frame(0, { routed: 1 }), frame(5, { routed: 1, playing: true })])).toBe(
			5
		);
	});

	it('falls back to the top frame among equals and ignores unrouted frames', () => {
		expect(spectrumFrame([frame(4, { routed: 1 }), frame(0, { routed: 1 })])).toBe(0);
		expect(spectrumFrame([frame(0, { playing: true })])).toBeUndefined();
	});
});
