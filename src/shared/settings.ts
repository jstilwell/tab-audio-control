// The complete description of what we do to a tab's audio. Every engine
// (in-page or capture) receives one of these and nothing else, so anything
// that crosses a context boundary goes through sanitizeSettings first.

export const FILTER_TYPES = ['peaking', 'lowshelf', 'highshelf', 'highpass', 'lowpass'] as const;
export type FilterType = (typeof FILTER_TYPES)[number];

export interface EqBand {
	type: FilterType;
	/** Hz */
	frequency: number;
	/** dB; ignored by highpass/lowpass */
	gain: number;
	/** Linear Q (bandwidth); ignored by shelves */
	q: number;
}

export interface AudioSettings {
	/** Linear gain, 1 = 100% */
	volume: number;
	muted: boolean;
	eqEnabled: boolean;
	bands: EqBand[];
	/** -1 = push voice back (karaoke), 0 = untouched, 1 = push music back */
	focus: number;
	mono: boolean;
	/** -1 = left, 1 = right */
	balance: number;
	/** Compressor that evens out loud and quiet passages */
	nightMode: boolean;
}

export const LIMITS = {
	volume: { min: 0, max: 4 },
	frequency: { min: 20, max: 20000 },
	gain: { min: -18, max: 18 },
	q: { min: 0.1, max: 18 },
	focus: { min: -1, max: 1 },
	balance: { min: -1, max: 1 }
} as const;

export const BAND_COUNT = 5;

export const FLAT_BANDS: readonly EqBand[] = Object.freeze([
	{ type: 'lowshelf', frequency: 80, gain: 0, q: 0.7 },
	{ type: 'peaking', frequency: 250, gain: 0, q: 1 },
	{ type: 'peaking', frequency: 1000, gain: 0, q: 1 },
	{ type: 'peaking', frequency: 3500, gain: 0, q: 1 },
	{ type: 'highshelf', frequency: 10000, gain: 0, q: 0.7 }
]);

export function defaultSettings(): AudioSettings {
	return {
		volume: 1,
		muted: false,
		eqEnabled: true,
		bands: FLAT_BANDS.map((b) => ({ ...b })),
		focus: 0,
		mono: false,
		balance: 0,
		nightMode: false
	};
}

export function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function num(value: unknown, fallback: number, limits: { min: number; max: number }): number {
	return typeof value === 'number' && Number.isFinite(value)
		? clamp(value, limits.min, limits.max)
		: fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
	return typeof value === 'boolean' ? value : fallback;
}

export function sanitizeBand(input: unknown, fallback: EqBand): EqBand {
	const b = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
	return {
		type: FILTER_TYPES.includes(b.type as FilterType) ? (b.type as FilterType) : fallback.type,
		frequency: num(b.frequency, fallback.frequency, LIMITS.frequency),
		gain: num(b.gain, fallback.gain, LIMITS.gain),
		q: num(b.q, fallback.q, LIMITS.q)
	};
}

export function sanitizeBands(input: unknown): EqBand[] {
	const list = Array.isArray(input) ? input : [];
	return FLAT_BANDS.map((fallback, i) => sanitizeBand(list[i], fallback));
}

/** Coerces anything (storage, messages) into valid settings, falling back to defaults. */
export function sanitizeSettings(input: unknown): AudioSettings {
	const d = defaultSettings();
	if (typeof input !== 'object' || input === null) return d;
	const s = input as Record<string, unknown>;
	return {
		volume: num(s.volume, d.volume, LIMITS.volume),
		muted: bool(s.muted, d.muted),
		eqEnabled: bool(s.eqEnabled, d.eqEnabled),
		bands: sanitizeBands(s.bands),
		focus: num(s.focus, d.focus, LIMITS.focus),
		mono: bool(s.mono, d.mono),
		balance: num(s.balance, d.balance, LIMITS.balance),
		nightMode: bool(s.nightMode, d.nightMode)
	};
}

export function isFlatEq(bands: readonly EqBand[]): boolean {
	return bands.every((b) => {
		if (b.type === 'highpass' || b.type === 'lowpass') return false;
		return b.gain === 0;
	});
}

/** True when the settings would leave the audio exactly as the page made it. */
export function isDefault(s: AudioSettings): boolean {
	return (
		s.volume === 1 &&
		!s.muted &&
		(!s.eqEnabled || isFlatEq(s.bands)) &&
		s.focus === 0 &&
		!s.mono &&
		s.balance === 0 &&
		!s.nightMode
	);
}

/** Text for the toolbar badge: at most 4 characters. */
export function badgeText(s: AudioSettings): string {
	if (s.muted) return 'M';
	if (s.volume !== 1) return String(Math.round(s.volume * 100));
	return isDefault(s) ? '' : 'fx';
}
