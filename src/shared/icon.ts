// The toolbar icon, drawn in code so it can react to each tab: the waveform
// grows with volume, runs hotter when boosted, and flatlines when muted.
// scripts/icons.mjs uses this same function to render the static PNGs.

export interface IconState {
	volume: number;
	muted: boolean;
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Sunset ramp from the jesse.id palette: periwinkle → magenta → ember → peach. */
const RAMP: [number, number, number][] = [
	[139, 143, 214],
	[228, 84, 140],
	[255, 106, 61],
	[255, 163, 107]
];
const MUTED: [number, number, number] = [130, 124, 158];

/** Bar heights (0..1); hand-shaped to read as a waveform. */
const ENVELOPES: Record<number, number[]> = {
	5: [0.45, 0.8, 1, 0.65, 0.4],
	9: [0.36, 0.62, 0.86, 0.55, 1, 0.7, 0.9, 0.5, 0.32]
};

function ramp(t: number): string {
	const x = Math.min(1, Math.max(0, t)) * (RAMP.length - 1);
	const i = Math.min(RAMP.length - 2, Math.floor(x));
	const f = x - i;
	const a = RAMP[i]!;
	const b = RAMP[i + 1]!;
	const c = a.map((v, k) => Math.round(v + (b[k]! - v) * f));
	return `rgb(${c.join(',')})`;
}

/** How tall the waveform stands: quiet tabs shrink, muted ones flatline. */
export function iconAmplitude({ volume, muted }: IconState): number {
	return muted ? 0 : 0.3 + 0.7 * Math.min(1, Math.max(0, volume));
}

/** 0 at ≤100%, 1 at 400%: shifts every bar toward the hot end of the ramp. */
export function iconHeat({ volume, muted }: IconState): number {
	return muted ? 0 : Math.min(1, Math.max(0, (volume - 1) / 3));
}

export function drawIcon(ctx: Ctx, size: number, state: IconState): void {
	ctx.clearRect(0, 0, size, size);
	if (size < 48) {
		drawTile(ctx, size, state);
		return;
	}
	// Store/extension-page sizes: Chrome Web Store asks for 96×96 artwork
	// centered in 128×128 with transparent padding (and the same ratio at 48).
	const pad = size / 8;
	ctx.save();
	ctx.translate(pad, pad);
	drawTile(ctx, size - 2 * pad, state);
	ctx.restore();
}

function drawTile(ctx: Ctx, s: number, state: IconState): void {
	// Tile: deep indigo, a touch lighter at the top.
	const tile = ctx.createLinearGradient(0, 0, 0, s);
	tile.addColorStop(0, '#241d45');
	tile.addColorStop(1, '#0c0a1a');
	ctx.fillStyle = tile;
	ctx.beginPath();
	ctx.roundRect(0, 0, s, s, s * 0.22);
	ctx.fill();

	const amp = iconAmplitude(state);
	const heat = iconHeat(state);
	const colorAt = (t: number) =>
		state.muted ? `rgb(${MUTED.join(',')})` : ramp(t * (1 - heat) + heat * 0.85 + heat * 0.15 * t);

	if (s <= 32) drawToolbarWave(ctx, s, amp, colorAt);
	else drawHorizonWave(ctx, s, amp, colorAt, state.muted);
}

/**
 * Toolbar sizes: five thick bars mirrored around the center, snapped to whole
 * pixels so they stay crisp at 16 and 32 px.
 */
function drawToolbarWave(ctx: Ctx, s: number, amp: number, colorAt: (t: number) => string) {
	const env = ENVELOPES[5]!;
	const barW = s <= 16 ? 2 : 4;
	const gap = 1;
	const left = Math.round((s - (5 * barW + 4 * gap)) / 2);
	const mid = s / 2;
	const maxHalf = s * 0.36;
	env.forEach((e, i) => {
		const half = Math.max(barW / 2, Math.round(e * amp * maxHalf));
		ctx.fillStyle = colorAt(i / 4);
		ctx.beginPath();
		ctx.roundRect(left + i * (barW + gap), mid - half, barW, half * 2, barW / 2);
		ctx.fill();
	});
}

/** Large sizes: a glowing horizon with the waveform rising out of it and reflected below. */
function drawHorizonWave(
	ctx: Ctx,
	s: number,
	amp: number,
	colorAt: (t: number) => string,
	muted: boolean
) {
	const count = 9;
	const env = ENVELOPES[count]!;
	const avail = s * 0.7;
	const barW = avail / (count + (count - 1) * 0.6);
	const gap = barW * 0.6;
	const left = (s - (count * barW + (count - 1) * gap)) / 2;
	const mid = Math.round(s * 0.6);
	const maxUp = s * 0.4;
	const maxDown = s * 0.22;

	ctx.save();
	ctx.shadowColor = muted ? 'transparent' : 'rgba(255,106,61,0.9)';
	ctx.shadowBlur = s * 0.08;
	ctx.fillStyle = muted ? 'rgba(130,124,158,0.6)' : 'rgba(255,140,90,0.85)';
	ctx.fillRect(s * 0.1, mid - s * 0.006, s * 0.8, Math.max(1, s * 0.012));
	ctx.restore();

	env.forEach((e, i) => {
		const x = left + i * (barW + gap);
		const color = colorAt(i / (count - 1));
		const up = Math.max(barW, e * amp * maxUp);
		const down = Math.max(barW * 0.6, e * amp * maxDown);
		const r = barW / 2;

		ctx.save();
		ctx.fillStyle = color;
		if (!muted) {
			ctx.shadowColor = color;
			ctx.shadowBlur = s * 0.05;
		}
		ctx.beginPath();
		ctx.roundRect(x, mid - up, barW, up, [r, r, 0, 0]);
		ctx.fill();
		ctx.restore();

		// Reflection below the horizon.
		ctx.save();
		ctx.fillStyle = color;
		ctx.globalAlpha = 0.38;
		ctx.beginPath();
		ctx.roundRect(x, mid + Math.max(1, s * 0.03), barW, down, [0, 0, r, r]);
		ctx.fill();
		ctx.restore();
	});
}

/** ImageData for chrome.action.setIcon, at the sizes the toolbar uses. */
export function iconImageData(state: IconState): Record<string, ImageData> {
	const out: Record<string, ImageData> = {};
	for (const size of [16, 32]) {
		const canvas = new OffscreenCanvas(size, size);
		const ctx = canvas.getContext('2d');
		if (!ctx) continue;
		drawIcon(ctx, size, state);
		out[size] = ctx.getImageData(0, 0, size, size);
	}
	return out;
}
