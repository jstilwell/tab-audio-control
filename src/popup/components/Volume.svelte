<script lang="ts">
	import { sliderToVolume, volumeToSlider } from '../../shared/dsp';
	import { ui } from '../state.svelte';

	let { disabled = false }: { disabled?: boolean } = $props();

	/** Arrow keys move 1% below 100% and 3% above it. */
	const STEPS = 200;

	const percent = $derived(Math.round(ui.settings.volume * 100));
	const position = $derived(Math.round(volumeToSlider(ui.settings.volume) * STEPS));

	function onInput(e: Event & { currentTarget: HTMLInputElement }) {
		const v = sliderToVolume(Number(e.currentTarget.value) / STEPS);
		// Snap to 100% near the middle so it's easy to land on.
		ui.settings.volume = Math.abs(v - 1) < 0.03 ? 1 : Math.round(v * 100) / 100;
	}
</script>

<section class="volume">
	<div class="readout">
		<output class={['number', { off: ui.settings.muted }]} for="volume">
			{percent}<span class="unit">%</span>
		</output>
		<div class="actions">
			{#if percent !== 100}
				<button type="button" class="btn quiet" {disabled} onclick={() => (ui.settings.volume = 1)}
					>Back to 100%</button
				>
			{/if}
			<button
				type="button"
				class="btn mute"
				aria-pressed={ui.settings.muted}
				{disabled}
				onclick={() => (ui.settings.muted = !ui.settings.muted)}
			>
				<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
					<path d="M3 7.5h3l4-3.5v12l-4-3.5H3z" fill="currentColor" />
					{#if ui.settings.muted}
						<path
							d="M13 7.5l5 5m0-5l-5 5"
							stroke="currentColor"
							stroke-width="1.6"
							stroke-linecap="round"
						/>
					{:else}
						<path
							d="M13 7a4 4 0 0 1 0 6m2.2-8.4a7 7 0 0 1 0 10.8"
							fill="none"
							stroke="currentColor"
							stroke-width="1.6"
							stroke-linecap="round"
						/>
					{/if}
				</svg>
				{ui.settings.muted ? 'Unmute' : 'Mute'}
			</button>
		</div>
	</div>
	<!-- svelte-ignore a11y_autofocus -->
	<input
		id="volume"
		type="range"
		min="0"
		max={STEPS}
		value={position}
		oninput={onInput}
		style:--fill="{(position / STEPS) * 100}%"
		aria-label="Volume"
		aria-valuetext="{percent}%"
		autofocus
		{disabled}
	/>
	<div class="scale" aria-hidden="true">
		<span>Quieter</span>
		<span class="mid">100%</span>
		<span>400%</span>
	</div>
</section>

<style>
	.readout {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 8px;
	}
	.number {
		font-family: var(--font-serif);
		font-weight: 600;
		font-size: 44px;
		line-height: 1;
		letter-spacing: -0.02em;
		color: var(--heading);
		font-variant-numeric: tabular-nums;
	}
	.number.off {
		color: var(--text-subtle);
		text-decoration: line-through;
		text-decoration-thickness: 3px;
		text-decoration-color: var(--primary);
	}
	.unit {
		font-size: 22px;
		margin-left: 2px;
		color: var(--text-muted);
	}
	.actions {
		display: flex;
		gap: 4px;
		align-items: center;
		padding-bottom: 4px;
	}
	.mute[aria-pressed='true'] {
		border-color: var(--primary);
		color: var(--primary);
	}
	input {
		margin-top: 10px;
	}
	.scale {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		font-size: 11px;
		color: var(--text-subtle);
	}
	.scale span:last-child {
		text-align: right;
	}
</style>
