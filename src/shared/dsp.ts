// Pure math behind the audio graph and the EQ display.

import { LIMITS, type FilterType } from './settings';

/**
 * Mid/side gains for the voice-focus control. Voices are usually mixed to the
 * center (mid), backing music spreads to the sides, so trading one against the
 * other pushes music back (focus > 0) or the voice back (focus < 0).
 */
export function focusGains(focus: number, mono: boolean): { mid: number; side: number } {
	let mid = 1;
	let side = 1;
	if (focus > 0) {
		mid = 1 + 0.5 * focus;
		side = 1 - focus;
	} else if (focus < 0) {
		mid = 1 + focus;
	}
	if (mono) side = 0;
	return { mid, side };
}

/**
 * Coefficients for the 2x2 matrix that applies mid/side gains straight to
 * left/right: outL = direct·L + cross·R, outR = cross·L + direct·R.
 */
export function stereoMatrix(mid: number, side: number): { direct: number; cross: number } {
	return { direct: (mid + side) / 2, cross: (mid - side) / 2 };
}

/**
 * The value to put on BiquadFilterNode.Q. Web Audio interprets Q in dB for
 * lowpass/highpass and as linear bandwidth for peaking; shelves ignore it.
 */
export function nodeQ(type: FilterType, q: number): number {
	return type === 'highpass' || type === 'lowpass' ? 20 * Math.log10(q) : q;
}

export function usesGain(type: FilterType): boolean {
	return type !== 'highpass' && type !== 'lowpass';
}

export function usesQ(type: FilterType): boolean {
	return type !== 'lowshelf' && type !== 'highshelf';
}

const LOG_MIN = Math.log10(LIMITS.frequency.min);
const LOG_MAX = Math.log10(LIMITS.frequency.max);

/** Frequency → 0..1 position on a log axis spanning the audible range. */
export function freqToUnit(freq: number): number {
	return (Math.log10(freq) - LOG_MIN) / (LOG_MAX - LOG_MIN);
}

export function unitToFreq(unit: number): number {
	return 10 ** (LOG_MIN + unit * (LOG_MAX - LOG_MIN));
}

/** `count` frequencies spread evenly on the log axis. */
export function logFrequencies(count: number): Float32Array<ArrayBuffer> {
	const out = new Float32Array(count);
	for (let i = 0; i < count; i++) out[i] = unitToFreq(count === 1 ? 0 : i / (count - 1));
	return out;
}

/**
 * Collapses linear FFT magnitude bins (AnalyserNode.getByteFrequencyData) into
 * `count` log-spaced bars, taking the peak in each bar's range.
 */
export function logBins(data: ArrayLike<number>, sampleRate: number, count: number): number[] {
	const nyquist = sampleRate / 2;
	const binHz = nyquist / data.length;
	const out: number[] = [];
	for (let i = 0; i < count; i++) {
		const lo = unitToFreq(i / count);
		const hi = unitToFreq((i + 1) / count);
		const start = Math.max(0, Math.floor(lo / binHz));
		const end = Math.min(data.length - 1, Math.max(start, Math.ceil(hi / binHz) - 1));
		let peak = 0;
		for (let b = start; b <= end; b++) peak = Math.max(peak, data[b] ?? 0);
		out.push(peak);
	}
	return out;
}

/**
 * Volume slider position (0..1) ↔ gain. The left half covers 0–100% and the
 * right half 100–400%, so turning things down gets as much room as boosting.
 */
export function sliderToVolume(position: number): number {
	const p = Math.min(1, Math.max(0, position));
	return p <= 0.5 ? p * 2 : 1 + (p - 0.5) * 2 * (LIMITS.volume.max - 1);
}

export function volumeToSlider(volume: number): number {
	const v = Math.min(LIMITS.volume.max, Math.max(0, volume));
	return v <= 1 ? v / 2 : 0.5 + (v - 1) / (2 * (LIMITS.volume.max - 1));
}

export function formatFrequency(hz: number): string {
	if (hz >= 1000) {
		const k = hz / 1000;
		return `${k >= 10 ? Math.round(k) : Number(k.toFixed(1))}k`;
	}
	return String(Math.round(hz));
}

/** Rounds to a resolution that feels natural for a log-scaled frequency. */
export function roundFrequency(hz: number): number {
	const step = hz < 100 ? 1 : hz < 1000 ? 5 : hz < 10000 ? 50 : 100;
	return Math.round(hz / step) * step;
}
