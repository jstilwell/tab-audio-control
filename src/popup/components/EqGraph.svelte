<script lang="ts">
	import {
		formatFrequency,
		freqToUnit,
		logFrequencies,
		nodeQ,
		roundFrequency,
		unitToFreq,
		usesGain,
		usesQ
	} from '../../shared/dsp';
	import { BAND_COUNT, LIMITS, clamp, type EqBand } from '../../shared/settings';
	import { ui } from '../state.svelte';

	interface Props {
		/** Log-spaced spectrum bars, 0–255 */
		bins: number[];
		disabled?: boolean;
	}

	let { bins, disabled = false }: Props = $props();

	const W = 348;
	const H = 150;
	const TOP = 8;
	const BOTTOM = H - 16;
	const DB_RANGE = LIMITS.gain.max;
	const POINTS = 160;
	const FREQ_TICKS = [50, 100, 200, 500, 1000, 2000, 5000, 10000];
	const FREQ_LABELS = [100, 1000, 10000];
	const DB_TICKS = [12, 6, 0, -6, -12];

	const dbToY = (db: number) => TOP + ((DB_RANGE - db) / (2 * DB_RANGE)) * (BOTTOM - TOP);
	const yToDb = (y: number) => DB_RANGE - ((y - TOP) / (BOTTOM - TOP)) * 2 * DB_RANGE;

	// Real Web Audio filters compute the curve, so the display is exactly what
	// the engine does. An OfflineAudioContext needs no user gesture.
	const offline = new OfflineAudioContext(1, 128, 48000);
	const filters = Array.from({ length: BAND_COUNT }, () => new BiquadFilterNode(offline));
	const freqs = logFrequencies(POINTS);
	const mag = new Float32Array(POINTS);
	const phase = new Float32Array(POINTS);

	function response(band: EqBand, i: number): Float32Array {
		const f = filters[i]!;
		f.type = band.type;
		f.frequency.value = band.frequency;
		f.gain.value = band.gain;
		f.Q.value = nodeQ(band.type, band.q);
		f.getFrequencyResponse(freqs, mag, phase);
		return mag.map((m) => 20 * Math.log10(Math.max(m, 1e-6)));
	}

	function toPath(db: ArrayLike<number>): string {
		let d = '';
		for (let k = 0; k < POINTS; k++) {
			const x = (k / (POINTS - 1)) * W;
			const y = clamp(dbToY(db[k] ?? 0), TOP - 4, BOTTOM + 4);
			d += `${k === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
		}
		return d;
	}

	const curves = $derived.by(() => {
		const total = new Float32Array(POINTS);
		let selected = '';
		if (ui.settings.eqEnabled) {
			ui.settings.bands.forEach((b, i) => {
				const db = response(b, i);
				for (let k = 0; k < POINTS; k++) total[k]! += db[k]!;
				if (i === ui.selectedBand) {
					selected = `${toPath(db)}L${W},${dbToY(0)}L0,${dbToY(0)}Z`;
				}
			});
		}
		return { total: toPath(total), selected };
	});

	// ---------- spectrum ----------
	// Attachment: re-runs whenever `bins` changes.
	function drawSpectrum(canvas: HTMLCanvasElement) {
		const dpr = window.devicePixelRatio || 1;
		canvas.width = W * dpr;
		canvas.height = H * dpr;
		const g = canvas.getContext('2d');
		if (!g) return;
		g.setTransform(dpr, 0, 0, dpr, 0, 0);
		g.clearRect(0, 0, W, H);
		if (bins.length === 0) return;
		const css = getComputedStyle(canvas);
		const grad = g.createLinearGradient(0, TOP, 0, BOTTOM);
		grad.addColorStop(0, css.getPropertyValue('--spectrum-top'));
		grad.addColorStop(0.55, css.getPropertyValue('--spectrum-mid'));
		grad.addColorStop(1, css.getPropertyValue('--spectrum-low'));
		g.fillStyle = grad;
		const barW = W / bins.length;
		bins.forEach((v, i) => {
			const h = (v / 255) * (BOTTOM - TOP);
			g.fillRect(i * barW + 0.5, BOTTOM - h, Math.max(1, barW - 1), h);
		});
	}

	// ---------- handles ----------
	let dragging = $state<number | undefined>();

	function handleY(b: EqBand) {
		return dbToY(usesGain(b.type) ? b.gain : 0);
	}

	function moveTo(svg: SVGSVGElement, i: number, clientX: number, clientY: number) {
		const band = ui.settings.bands[i];
		if (!band) return;
		const rect = svg.getBoundingClientRect();
		const x = ((clientX - rect.left) / rect.width) * W;
		const y = ((clientY - rect.top) / rect.height) * H;
		band.frequency = clamp(
			roundFrequency(unitToFreq(clamp(x / W, 0, 1))),
			LIMITS.frequency.min,
			LIMITS.frequency.max
		);
		if (usesGain(band.type)) {
			band.gain = clamp(Math.round(yToDb(y) * 2) / 2, LIMITS.gain.min, LIMITS.gain.max);
		}
	}

	function onPointerDown(e: PointerEvent, i: number) {
		if (disabled) return;
		ui.selectedBand = i;
		dragging = i;
		(e.currentTarget as Element).setPointerCapture(e.pointerId);
	}

	function onPointerMove(e: PointerEvent & { currentTarget: SVGSVGElement }) {
		if (dragging !== undefined) moveTo(e.currentTarget, dragging, e.clientX, e.clientY);
	}

	function onKeyDown(e: KeyboardEvent, i: number) {
		const band = ui.settings.bands[i];
		if (!band || disabled) return;
		const big = e.shiftKey;
		const ratio = big ? 1.25 : 1.05;
		const dB = big ? 3 : 0.5;
		const keys: Record<string, () => void> = {
			ArrowLeft: () => (band.frequency = Math.round(band.frequency / ratio)),
			ArrowRight: () => (band.frequency = Math.round(band.frequency * ratio)),
			ArrowUp: () => (band.gain += dB),
			ArrowDown: () => (band.gain -= dB),
			Home: () => (band.gain = 0)
		};
		const action = keys[e.key];
		if (!action) return;
		e.preventDefault();
		ui.selectedBand = i;
		action();
		band.frequency = clamp(band.frequency, LIMITS.frequency.min, LIMITS.frequency.max);
		band.gain = clamp(band.gain, LIMITS.gain.min, LIMITS.gain.max);
	}

	// Wheel widens/narrows the selected band. Non-passive so the popup doesn't scroll.
	function wheelQ(el: SVGSVGElement) {
		const onWheel = (e: WheelEvent) => {
			const band = ui.settings.bands[ui.selectedBand];
			if (!band || disabled || !usesQ(band.type)) return;
			e.preventDefault();
			const next = band.q * (e.deltaY < 0 ? 1.1 : 1 / 1.1);
			band.q = Math.round(clamp(next, LIMITS.q.min, LIMITS.q.max) * 100) / 100;
		};
		el.addEventListener('wheel', onWheel, { passive: false });
		return () => el.removeEventListener('wheel', onWheel);
	}

	const TYPE_NAMES: Record<EqBand['type'], string> = {
		peaking: 'peak',
		lowshelf: 'low shelf',
		highshelf: 'high shelf',
		highpass: 'high-pass',
		lowpass: 'low-pass'
	};

	function describe(b: EqBand, i: number) {
		const gain = usesGain(b.type) ? `, ${b.gain > 0 ? '+' : ''}${b.gain} dB` : '';
		return `Band ${i + 1}, ${TYPE_NAMES[b.type]}: ${formatFrequency(b.frequency)}Hz${gain}`;
	}
</script>

<div class={['graph', { off: !ui.settings.eqEnabled || disabled }]}>
	<canvas {@attach drawSpectrum} style:width="{W}px" style:height="{H}px" aria-hidden="true"
	></canvas>
	<svg
		{@attach wheelQ}
		viewBox="0 0 {W} {H}"
		width={W}
		height={H}
		role="group"
		aria-label="Equalizer. Drag a point, or focus it and use arrow keys. Scroll to change its width."
		onpointermove={onPointerMove}
		onpointerup={() => (dragging = undefined)}
		onpointercancel={() => (dragging = undefined)}
	>
		{#each FREQ_TICKS as f (f)}
			<line class="grid" x1={freqToUnit(f) * W} x2={freqToUnit(f) * W} y1={TOP} y2={BOTTOM} />
		{/each}
		{#each DB_TICKS as db (db)}
			<line class={['grid', { zero: db === 0 }]} x1="0" x2={W} y1={dbToY(db)} y2={dbToY(db)} />
			{#if db !== 0}
				<text class="label" x="4" y={dbToY(db) - 3}>{db > 0 ? '+' : ''}{db}</text>
			{/if}
		{/each}
		{#each FREQ_LABELS as f (f)}
			<text class="label" x={freqToUnit(f) * W} y={H - 3} text-anchor="middle"
				>{formatFrequency(f)}Hz</text
			>
		{/each}

		{#if curves.selected}
			<path class="band-fill" d={curves.selected} />
		{/if}
		<path class="curve" d={curves.total} />

		{#each ui.settings.bands as band, i (i)}
			<g
				class={['handle', { selected: i === ui.selectedBand }]}
				transform="translate({freqToUnit(band.frequency) * W} {handleY(band)})"
				role="slider"
				tabindex={disabled ? -1 : 0}
				aria-label={describe(band, i)}
				aria-valuenow={band.gain}
				aria-valuemin={LIMITS.gain.min}
				aria-valuemax={LIMITS.gain.max}
				aria-valuetext={describe(band, i)}
				onpointerdown={(e) => onPointerDown(e, i)}
				onkeydown={(e) => onKeyDown(e, i)}
				onfocus={() => (ui.selectedBand = i)}
				ondblclick={() => (band.gain = 0)}
			>
				<circle class="hit" r="12" />
				<circle class="dot" r="6" />
				<text class="num" y="3.5" text-anchor="middle">{i + 1}</text>
			</g>
		{/each}
	</svg>
</div>

<style>
	.graph {
		position: relative;
		width: 348px;
		height: 150px;
		border-radius: 8px;
		background: var(--bg-sunken);
		border: 1px solid var(--border);
		overflow: hidden;
	}
	canvas,
	svg {
		position: absolute;
		inset: 0;
	}
	svg {
		touch-action: none;
		overflow: visible;
	}
	.grid {
		stroke: var(--grid);
		stroke-width: 1;
	}
	.grid.zero {
		stroke: var(--border-strong);
	}
	.label {
		fill: var(--text-subtle);
		font-size: 9px;
	}
	.curve {
		fill: none;
		stroke: var(--primary);
		stroke-width: 2;
		stroke-linejoin: round;
	}
	.band-fill {
		fill: var(--primary);
		opacity: 0.12;
	}
	.off .curve {
		stroke: var(--text-subtle);
		stroke-dasharray: 4 4;
	}
	.off .handle {
		opacity: 0.45;
	}
	.handle {
		cursor: grab;
		outline: none;
	}
	.handle:active {
		cursor: grabbing;
	}
	.hit {
		fill: transparent;
	}
	.dot {
		fill: var(--bg-elevated);
		stroke: var(--primary);
		stroke-width: 2;
	}
	.num {
		fill: var(--text);
		font-size: 8px;
		font-weight: 600;
		pointer-events: none;
	}
	.handle.selected .dot {
		fill: var(--primary);
	}
	.handle.selected .num {
		fill: var(--on-primary);
	}
	.handle:focus-visible .dot {
		stroke: var(--heading);
		stroke-width: 3;
	}
</style>
