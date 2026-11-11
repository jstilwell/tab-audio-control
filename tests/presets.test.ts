import { describe, expect, it } from 'vitest';
import {
	BUILT_IN_PRESETS,
	MAX_USER_PRESETS,
	matchPreset,
	sanitizeUserPresets
} from '../src/shared/presets';
import { BAND_COUNT, defaultSettings, sanitizeBands } from '../src/shared/settings';

describe('built-in presets', () => {
	it('are all valid five-band curves', () => {
		for (const p of BUILT_IN_PRESETS) {
			expect(p.bands).toHaveLength(BAND_COUNT);
			expect(sanitizeBands(p.bands)).toEqual(p.bands);
		}
	});

	it('Flat matches default settings', () => {
		expect(matchPreset(BUILT_IN_PRESETS, defaultSettings().bands)?.id).toBe('flat');
	});
});

describe('sanitizeUserPresets', () => {
	it('drops malformed entries and duplicate ids, trims names', () => {
		const out = sanitizeUserPresets([
			{ id: 'a', name: '  Movie  ', bands: [] },
			{ id: 'a', name: 'dupe', bands: [] },
			{ id: 'b', name: '   ' },
			null,
			{ name: 'no id' }
		]);
		expect(out.map((p) => p.name)).toEqual(['Movie']);
		expect(out[0]!.bands).toHaveLength(BAND_COUNT);
	});

	it('returns [] for non-arrays', () => {
		expect(sanitizeUserPresets({})).toEqual([]);
	});

	it('keeps more than the save cap, so lists stored by older versions survive', () => {
		const stored = Array.from({ length: MAX_USER_PRESETS + 4 }, (_, i) => ({
			id: String(i),
			name: `P${i}`,
			bands: []
		}));
		expect(sanitizeUserPresets(stored)).toHaveLength(MAX_USER_PRESETS + 4);
	});
});

describe('preset storage', () => {
	// chrome.storage.sync QUOTA_BYTES_PER_ITEM: the key plus the JSON of the value.
	it('a full list of long-named presets fits in one sync item', () => {
		const band = { type: 'highshelf', frequency: 19950, gain: -17.5, q: 17.99 };
		const list = Array.from({ length: MAX_USER_PRESETS }, () => ({
			id: '00000000-0000-4000-8000-000000000000',
			name: 'x'.repeat(32),
			bands: Array.from({ length: BAND_COUNT }, () => band)
		}));
		expect('presets'.length + JSON.stringify(list).length).toBeLessThan(8192);
	});
});
