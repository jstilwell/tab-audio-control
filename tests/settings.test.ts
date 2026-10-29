import { describe, expect, it } from 'vitest';
import {
	FLAT_BANDS,
	badgeText,
	defaultSettings,
	isDefault,
	sanitizeSettings
} from '../src/shared/settings';

describe('sanitizeSettings', () => {
	it('returns defaults for garbage', () => {
		expect(sanitizeSettings(null)).toEqual(defaultSettings());
		expect(sanitizeSettings('loud')).toEqual(defaultSettings());
	});

	it('clamps out-of-range numbers', () => {
		const s = sanitizeSettings({ volume: 99, focus: -5, balance: 2 });
		expect(s.volume).toBe(4);
		expect(s.focus).toBe(-1);
		expect(s.balance).toBe(1);
	});

	it('rejects NaN and wrong types', () => {
		const s = sanitizeSettings({ volume: Number.NaN, muted: 'yes' });
		expect(s.volume).toBe(1);
		expect(s.muted).toBe(false);
	});

	it('always yields exactly five valid bands', () => {
		const s = sanitizeSettings({
			bands: [{ type: 'notch', frequency: 5, gain: 40, q: 0 }, 'x']
		});
		expect(s.bands).toHaveLength(FLAT_BANDS.length);
		expect(s.bands[0]).toEqual({ type: 'lowshelf', frequency: 20, gain: 18, q: 0.1 });
		expect(s.bands[1]).toEqual(FLAT_BANDS[1]);
	});
});

describe('isDefault', () => {
	it('is true for fresh settings', () => {
		expect(isDefault(defaultSettings())).toBe(true);
	});

	it('detects any change', () => {
		const changes: Partial<ReturnType<typeof defaultSettings>>[] = [
			{ volume: 1.5 },
			{ muted: true },
			{ focus: 0.2 },
			{ mono: true },
			{ balance: -0.1 },
			{ nightMode: true }
		];
		for (const c of changes) expect(isDefault({ ...defaultSettings(), ...c })).toBe(false);
	});

	it('treats a boosted EQ as non-default only while enabled', () => {
		const s = defaultSettings();
		s.bands[2]!.gain = 3;
		expect(isDefault(s)).toBe(false);
		s.eqEnabled = false;
		expect(isDefault(s)).toBe(true);
	});

	it('counts a pass filter as a change even at 0 dB', () => {
		const s = defaultSettings();
		s.bands[0]!.type = 'highpass';
		expect(isDefault(s)).toBe(false);
	});
});

describe('badgeText', () => {
	it('summarizes the tab in at most 4 characters', () => {
		expect(badgeText(defaultSettings())).toBe('');
		expect(badgeText({ ...defaultSettings(), volume: 2.5 })).toBe('250');
		expect(badgeText({ ...defaultSettings(), muted: true, volume: 3 })).toBe('M');
		expect(badgeText({ ...defaultSettings(), nightMode: true })).toBe('fx');
		expect(badgeText({ ...defaultSettings(), volume: 4 }).length).toBeLessThanOrEqual(4);
	});
});
