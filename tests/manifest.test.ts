// Guardrail for the least-privilege mandate (see CLAUDE.md). Changing any of
// these lists is a deliberate act: update the test *and* the justification
// table in CLAUDE.md in the same commit.
import { describe, expect, it } from 'vitest';
import manifest from '../public/manifest.json';
import pkg from '../package.json';

describe('manifest', () => {
	it('uses Manifest V3', () => {
		expect(manifest.manifest_version).toBe(3);
	});

	it('requests only the install-time permissions we justify', () => {
		expect([...manifest.permissions].sort()).toEqual(['activeTab', 'scripting', 'storage']);
	});

	it('keeps capture mode behind runtime-requested permissions', () => {
		expect([...manifest.optional_permissions].sort()).toEqual(['offscreen', 'tabCapture']);
	});

	it('asks for no host access, ever', () => {
		const m = manifest as Record<string, unknown>;
		expect(m.host_permissions).toBeUndefined();
		expect(m.optional_host_permissions).toBeUndefined();
		expect(m.content_scripts).toBeUndefined();
	});

	it('exposes nothing to web pages and keeps the default CSP', () => {
		const m = manifest as Record<string, unknown>;
		expect(m.web_accessible_resources).toBeUndefined();
		expect(m.externally_connectable).toBeUndefined();
		expect(m.content_security_policy).toBeUndefined();
	});

	it('matches the package version', () => {
		expect(manifest.version).toBe(pkg.version);
	});
});
