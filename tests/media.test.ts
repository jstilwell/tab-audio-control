import { describe, expect, it } from 'vitest';
import { isTainted } from '../src/content/media';

const PAGE = 'https://www.youtube.com';

describe('isTainted', () => {
	it('allows same-origin, blob, data and empty sources', () => {
		expect(isTainted('https://www.youtube.com/a.mp4', null, PAGE)).toBe(false);
		expect(isTainted('blob:https://www.youtube.com/123', null, PAGE)).toBe(false);
		expect(isTainted('data:audio/wav;base64,AAAA', null, PAGE)).toBe(false);
		expect(isTainted('', null, PAGE)).toBe(false);
	});

	it('flags cross-origin media loaded without CORS', () => {
		expect(isTainted('https://cdn.example.com/a.mp3', null, PAGE)).toBe(true);
	});

	it('trusts cross-origin media loaded with a crossorigin attribute', () => {
		expect(isTainted('https://cdn.example.com/a.mp3', 'anonymous', PAGE)).toBe(false);
	});
});
