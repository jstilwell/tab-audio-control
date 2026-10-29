import { describe, expect, it } from 'vitest';
import { BUILT_IN_PRESETS, matchPreset, sanitizeUserPresets } from '../src/shared/presets';
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
});
