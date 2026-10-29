import { FLAT_BANDS, sanitizeBands, type EqBand } from './settings';

export interface Preset {
	id: string;
	name: string;
	bands: EqBand[];
	builtIn?: boolean;
}

function bands(...list: EqBand[]): EqBand[] {
	return list;
}

export const BUILT_IN_PRESETS: readonly Preset[] = Object.freeze([
	{ id: 'flat', name: 'Flat', builtIn: true, bands: FLAT_BANDS.map((b) => ({ ...b })) },
	{
		id: 'voice-clarity',
		name: 'Voice Clarity',
		builtIn: true,
		// Cut rumble and low-mid mud, lift the 2–4 kHz intelligibility range.
		bands: bands(
			{ type: 'highpass', frequency: 90, gain: 0, q: 0.7 },
			{ type: 'peaking', frequency: 300, gain: -3, q: 1 },
			{ type: 'peaking', frequency: 1000, gain: 0, q: 1 },
			{ type: 'peaking', frequency: 3000, gain: 5, q: 0.9 },
			{ type: 'highshelf', frequency: 9000, gain: 1, q: 0.7 }
		)
	},
	{
		id: 'podcast',
		name: 'Podcast',
		builtIn: true,
		// Like Voice Clarity, plus a narrow dip to soften sibilance.
		bands: bands(
			{ type: 'highpass', frequency: 80, gain: 0, q: 0.7 },
			{ type: 'peaking', frequency: 200, gain: -2, q: 1 },
			{ type: 'peaking', frequency: 2500, gain: 3, q: 1.2 },
			{ type: 'peaking', frequency: 6000, gain: -2, q: 3 },
			{ type: 'highshelf', frequency: 10000, gain: 1, q: 0.7 }
		)
	},
	{
		id: 'bass-boost',
		name: 'Bass Boost',
		builtIn: true,
		bands: bands(
			{ type: 'lowshelf', frequency: 110, gain: 6, q: 0.7 },
			{ type: 'peaking', frequency: 300, gain: -1, q: 1 },
			{ type: 'peaking', frequency: 1000, gain: 0, q: 1 },
			{ type: 'peaking', frequency: 3500, gain: 0, q: 1 },
			{ type: 'highshelf', frequency: 10000, gain: 0, q: 0.7 }
		)
	},
	{
		id: 'treble',
		name: 'Treble Boost',
		builtIn: true,
		bands: bands(
			{ type: 'lowshelf', frequency: 80, gain: 0, q: 0.7 },
			{ type: 'peaking', frequency: 250, gain: 0, q: 1 },
			{ type: 'peaking', frequency: 1000, gain: 0, q: 1 },
			{ type: 'peaking', frequency: 3500, gain: 1.5, q: 1 },
			{ type: 'highshelf', frequency: 6000, gain: 5, q: 0.7 }
		)
	},
	{
		id: 'loudness',
		name: 'Loudness',
		builtIn: true,
		// The classic "smile" curve for quiet listening.
		bands: bands(
			{ type: 'lowshelf', frequency: 90, gain: 5, q: 0.7 },
			{ type: 'peaking', frequency: 250, gain: 0, q: 1 },
			{ type: 'peaking', frequency: 1000, gain: -1.5, q: 0.8 },
			{ type: 'peaking', frequency: 3500, gain: 0, q: 1 },
			{ type: 'highshelf', frequency: 9000, gain: 4, q: 0.7 }
		)
	}
]);

export const MAX_USER_PRESETS = 24;
const MAX_NAME_LENGTH = 32;

/** Validates presets read back from chrome.storage.sync. */
export function sanitizeUserPresets(input: unknown): Preset[] {
	if (!Array.isArray(input)) return [];
	const seen = new Set<string>();
	const out: Preset[] = [];
	for (const raw of input) {
		if (typeof raw !== 'object' || raw === null) continue;
		const p = raw as Record<string, unknown>;
		if (typeof p.id !== 'string' || typeof p.name !== 'string') continue;
		const name = p.name.trim().slice(0, MAX_NAME_LENGTH);
		if (!name || seen.has(p.id)) continue;
		seen.add(p.id);
		out.push({ id: p.id, name, bands: sanitizeBands(p.bands) });
		if (out.length >= MAX_USER_PRESETS) break;
	}
	return out;
}

/** The preset whose bands match exactly, if any — used to label the picker. */
export function matchPreset(
	list: readonly Preset[],
	current: readonly EqBand[]
): Preset | undefined {
	return list.find((p) =>
		p.bands.every((b, i) => {
			const c = current[i];
			return (
				c !== undefined &&
				c.type === b.type &&
				c.frequency === b.frequency &&
				c.gain === b.gain &&
				c.q === b.q
			);
		})
	);
}
