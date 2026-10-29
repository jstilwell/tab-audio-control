<script lang="ts">
	interface Props {
		checked: boolean;
		label: string;
		hint?: string;
		disabled?: boolean;
	}

	let { checked = $bindable(), label, hint, disabled = false }: Props = $props();
</script>

<button
	type="button"
	role="switch"
	aria-checked={checked}
	class="switch"
	{disabled}
	onclick={() => (checked = !checked)}
>
	<span class="track" aria-hidden="true"><span class="knob"></span></span>
	<span class="text">
		<span class="label">{label}</span>
		{#if hint}<span class="hint">{hint}</span>{/if}
	</span>
</button>

<style>
	.switch {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 0;
		border: 0;
		background: none;
		text-align: left;
		cursor: pointer;
	}
	.switch:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.track {
		flex: none;
		position: relative;
		width: 30px;
		height: 18px;
		margin-top: 1px;
		border-radius: 9px;
		background: var(--border-strong);
		transition: background 150ms ease;
	}
	.knob {
		position: absolute;
		top: 3px;
		left: 3px;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--heading);
		transition: transform 150ms ease;
	}
	[aria-checked='true'] .track {
		background: var(--primary);
	}
	[aria-checked='true'] .knob {
		transform: translateX(12px);
		background: var(--on-primary);
	}
	.text {
		display: flex;
		flex-direction: column;
	}
	.label {
		font-weight: 600;
	}
	.hint {
		color: var(--text-subtle);
		font-size: 12px;
	}
</style>
