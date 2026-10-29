import { describe, expect, it } from 'vitest';
import { iconAmplitude, iconHeat } from '../src/shared/icon';

describe('icon state mapping', () => {
	it('flatlines when muted', () => {
		expect(iconAmplitude({ volume: 3, muted: true })).toBe(0);
		expect(iconHeat({ volume: 3, muted: true })).toBe(0);
	});

	it('grows with volume up to 100%, then runs hotter instead of taller', () => {
		const amp = (volume: number) => iconAmplitude({ volume, muted: false });
		expect(amp(0)).toBeGreaterThan(0);
		expect(amp(0.3)).toBeLessThan(amp(1));
		expect(amp(1)).toBe(1);
		expect(amp(4)).toBe(1);
		const heat = (volume: number) => iconHeat({ volume, muted: false });
		expect(heat(1)).toBe(0);
		expect(heat(2.5)).toBeCloseTo(0.5);
		expect(heat(4)).toBe(1);
	});
});
