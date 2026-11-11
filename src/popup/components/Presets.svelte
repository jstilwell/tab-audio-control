<script lang="ts">
	import { onMount } from 'svelte';
	import {
		BUILT_IN_PRESETS,
		MAX_USER_PRESETS,
		matchPreset,
		type Preset
	} from '../../shared/presets';
	import { loadUserPresets, saveUserPresets } from '../presets-store';
	import { ui } from '../state.svelte';

	let { disabled = false }: { disabled?: boolean } = $props();

	let userPresets = $state<Preset[]>([]);
	let naming = $state(false);
	let name = $state('');
	let error = $state('');

	onMount(() => {
		void loadUserPresets().then((list) => (userPresets = list));
	});

	const all = $derived([...BUILT_IN_PRESETS, ...userPresets]);
	const current = $derived(matchPreset(all, ui.settings.bands));
	const full = $derived(userPresets.length >= MAX_USER_PRESETS);

	/** Shows the new list only once Chrome has really stored it. */
	async function store(next: Preset[]): Promise<boolean> {
		try {
			await saveUserPresets(next);
			userPresets = next;
			error = '';
			return true;
		} catch {
			error = "Chrome couldn't save your presets. Delete one you don't need, then try again.";
			return false;
		}
	}

	function choose(e: Event & { currentTarget: HTMLSelectElement }) {
		const preset = all.find((p) => p.id === e.currentTarget.value);
		if (!preset) return;
		ui.settings.bands = preset.bands.map((b) => ({ ...b }));
		ui.settings.eqEnabled = true;
	}

	async function save(e: SubmitEvent) {
		e.preventDefault();
		const trimmed = name.trim();
		if (!trimmed) return;
		const preset: Preset = {
			id: crypto.randomUUID(),
			name: trimmed,
			bands: $state.snapshot(ui.settings.bands)
		};
		if (await store([...$state.snapshot(userPresets), preset])) {
			naming = false;
			name = '';
		}
	}

	async function remove() {
		if (!current || current.builtIn) return;
		const id = current.id;
		await store($state.snapshot(userPresets).filter((p) => p.id !== id));
	}
</script>

{#if naming}
	<form class="row" onsubmit={save}>
		<!-- svelte-ignore a11y_autofocus -->
		<input
			type="text"
			bind:value={name}
			maxlength="32"
			placeholder="Preset name"
			aria-label="Preset name"
			autofocus
		/>
		<button type="submit" class="btn primary" disabled={!name.trim()}>Save</button>
		<button type="button" class="btn quiet" onclick={() => (naming = false)}>Cancel</button>
	</form>
{:else}
	<div class="row">
		<select aria-label="EQ preset" value={current?.id ?? ''} onchange={choose} {disabled}>
			{#if !current}<option value="" disabled>Custom</option>{/if}
			<optgroup label="Built in">
				{#each BUILT_IN_PRESETS as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
			</optgroup>
			{#if userPresets.length}
				<optgroup label="Yours">
					{#each userPresets as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
				</optgroup>
			{/if}
		</select>
		{#if current && !current.builtIn}
			<button type="button" class="btn quiet" {disabled} onclick={remove}>Delete</button>
		{:else if !current}
			<button type="button" class="btn" disabled={disabled || full} onclick={() => (naming = true)}
				>Save preset</button
			>
		{/if}
	</div>
{/if}
{#if error}
	<p class="note" role="alert">{error}</p>
{:else if full && !current}
	<p class="note">
		You have {MAX_USER_PRESETS} presets, the most that fit. Pick one and delete it to save another.
	</p>
{/if}

<style>
	.row {
		display: flex;
		gap: 6px;
		align-items: center;
	}
	select,
	input {
		flex: 1;
	}
	.note {
		margin: 0;
		font-size: 12px;
		color: var(--text-muted);
	}
	.note[role='alert'] {
		color: var(--primary);
	}
</style>
