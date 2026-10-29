import { describe, expect, it } from 'vitest';
import {
	focusGains,
	formatFrequency,
	freqToUnit,
	logBins,
	nodeQ,
	roundFrequency,
	sliderToVolume,
	stereoMatrix,
	unitToFreq,
	volumeToSlider
} from '../src/shared/dsp';

/** Runs one stereo sample through focus → matrix, like the audio graph does. */
function process(l: number, r: number, focus: number, mono = false) {
	const { mid, side } = focusGains(focus, mono);
	const { direct, cross } = stereoMatrix(mid, side);
	return [direct * l + cross * r, cross * l + direct * r];
}

describe('voice focus matrix', () => {
	it('passes audio through untouched at 0', () => {
		expect(process(0.3, -0.7, 0)).toEqual([0.3, -0.7]);
	});

	it('removes side content (music) at +1, keeping and lifting the center', () => {
		const [l, r] = process(0.5, 0.5, 1); // pure center
		expect(l).toBeCloseTo(0.75);
		expect(r).toBeCloseTo(0.75);
		const [sl, sr] = process(0.5, -0.5, 1); // pure side
		expect(sl).toBeCloseTo(0);
		expect(sr).toBeCloseTo(0);
	});

	it('removes center content (voice) at -1, keeping the sides', () => {
		const [l, r] = process(0.5, 0.5, -1);
		expect(l).toBeCloseTo(0);
		expect(r).toBeCloseTo(0);
		expect(process(0.5, -0.5, -1)).toEqual([0.5, -0.5]);
	});

	it('mono sums both channels', () => {
		const [l, r] = process(1, 0, 0, true);
		expect(l).toBeCloseTo(0.5);
		expect(r).toBeCloseTo(0.5);
	});
});

describe('nodeQ', () => {
	it('converts linear Q to dB for pass filters only', () => {
		expect(nodeQ('highpass', 1)).toBeCloseTo(0);
		expect(nodeQ('lowpass', 10)).toBeCloseTo(20);
		expect(nodeQ('peaking', 2)).toBe(2);
	});
});

describe('frequency axis', () => {
	it('round-trips through the unit scale', () => {
		for (const f of [20, 100, 1000, 12345, 20000]) expect(unitToFreq(freqToUnit(f))).toBeCloseTo(f);
		expect(freqToUnit(20)).toBe(0);
		expect(freqToUnit(20000)).toBeCloseTo(1);
	});

	it('formats and rounds frequencies for display', () => {
		expect(formatFrequency(80)).toBe('80');
		expect(formatFrequency(3500)).toBe('3.5k');
		expect(formatFrequency(12000)).toBe('12k');
		expect(roundFrequency(1234)).toBe(1250);
		expect(roundFrequency(87.4)).toBe(87);
	});
});

describe('volume slider curve', () => {
	it('puts 100% in the middle and spans 0–400%', () => {
		expect(sliderToVolume(0)).toBe(0);
		expect(sliderToVolume(0.5)).toBe(1);
		expect(sliderToVolume(1)).toBe(4);
		expect(sliderToVolume(0.25)).toBe(0.5);
	});

	it('round-trips', () => {
		for (const v of [0, 0.3, 1, 1.75, 4]) expect(sliderToVolume(volumeToSlider(v))).toBeCloseTo(v);
	});
});

describe('logBins', () => {
	it('produces the requested number of bars and finds peaks', () => {
		const data = new Uint8Array(2048);
		// 1 kHz at 48 kHz sample rate, 2048 bins → bin width ≈ 11.7 Hz
		data[Math.round(1000 / (24000 / 2048))] = 200;
		const bars = logBins(data, 48000, 64);
		expect(bars).toHaveLength(64);
		expect(Math.max(...bars)).toBe(200);
		const peakBar = bars.indexOf(200);
		expect(unitToFreq(peakBar / 64)).toBeLessThanOrEqual(1000);
		expect(unitToFreq((peakBar + 1) / 64)).toBeGreaterThanOrEqual(990);
	});
});
