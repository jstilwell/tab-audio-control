// Renders public/icons/icon.svg to the PNG sizes the manifest uses
// (Chrome doesn't accept SVG icons). Requires ImageMagick (`magick`).
import { execFileSync } from 'node:child_process';

for (const size of [16, 32, 48, 128]) {
	execFileSync('magick', [
		'-background',
		'none',
		'-density',
		'384',
		'public/icons/icon.svg',
		'-resize',
		`${size}x${size}`,
		`public/icons/icon-${size}.png`
	]);
	console.log(`icon-${size}.png`);
}
