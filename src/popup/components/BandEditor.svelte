<script lang="ts">
	import { formatFrequency, usesGain, usesQ } from '../../shared/dsp';
	import { FILTER_TYPES, LIMITS, clamp, type FilterType } from '../../shared/settings';
	import { ui } from '../state.svelte';

	let { disabled = false }: { disabled?: boolean } = $props();

	const TYPE_LABELS: Record<FilterType, string> = {
		peaking: 'Peak',
		lowshelf: 'Low shelf',
		highshelf: 'High shelf',
		highpass: 'High-pass',
		lowpass: 'Low-pass'
	};

	const band = $derived(ui.settings.bands[ui.selectedBand]);

	function setNumber(
		key: 'frequency' | 'gain' | 'q',
		e: Event & { currentTarget: HTMLInputElement }
	) {
		const value = e.currentTarget.valueAsNumber;
		if (!band || !Number.isFinite(value)) return;
		band[key] = clamp(value, LIMITS[key].min, LIMITS[key].max);
	}
</script>

<div class="editor">
	<div class="bands" role="group" aria-label="Choose a band to edit">
		{#each ui.settings.bands as b, i (i)}
			<button
				type="button"
				class="chip"
				aria-pressed={i === ui.selectedBand}
				{disabled}
				onclick={() => (ui.selectedBand = i)}
			>
				{formatFrequency(b.frequency)}
			</button>
		{/each}
	</div>

	{#if band}
		<div class="fields">
			<label>
				<span>Shape</span>
				<select bind:value={band.type} {disabled}>
					{#each FILTER_TYPES as t (t)}
						<option value={t}>{TYPE_LABELS[t]}</option>
					{/each}
				</select>
			</label>
			<label>
				<span>Hz</span>
				<input
					type="number"
					min={LIMITS.frequency.min}
					max={LIMITS.frequency.max}
					step="1"
					value={band.frequency}
					onchange={(e) => setNumber('frequency', e)}
					{disabled}
				/>
			</label>
			<label>
				<span>Gain dB</span>
				<input
					type="number"
					min={LIMITS.gain.min}
					max={LIMITS.gain.max}
					step="0.5"
					value={band.gain}
					onchange={(e) => setNumber('gain', e)}
					disabled={disabled || !usesGain(band.type)}
				/>
			</label>
			<label>
				<span>Width Q</span>
				<input
					type="number"
					min={LIMITS.q.min}
					max={LIMITS.q.max}
					step="0.1"
					value={band.q}
					onchange={(e) => setNumber('q', e)}
					disabled={disabled || !usesQ(band.type)}
				/>
			</label>
		</div>
	{/if}
</div>

<style>
	.editor {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.bands {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 4px;
	}
	.chip {
		padding: 3px 0;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: transparent;
		color: var(--text-muted);
		font-size: 12px;
		font-variant-numeric: tabular-nums;
		cursor: pointer;
	}
	.chip[aria-pressed='true'] {
		border-color: var(--primary);
		color: var(--text);
		background: var(--bg-elevated);
	}
	.chip:disabled {
		cursor: default;
		opacity: 0.5;
	}
	.fields {
		display: grid;
		grid-template-columns: 1.4fr 1fr 1fr 1fr;
		gap: 6px;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 2px;
		font-size: 11px;
		color: var(--text-subtle);
	}
	label :global(select),
	label :global(input) {
		width: 100%;
		font-size: 12px;
		color: var(--text);
		font-variant-numeric: tabular-nums;
	}
	label :global(input:disabled) {
		opacity: 0.45;
	}
</style>
