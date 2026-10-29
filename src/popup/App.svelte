<script lang="ts">
	import { onMount } from 'svelte';
	import { defaultSettings, isDefault } from '../shared/settings';
	import BandEditor from './components/BandEditor.svelte';
	import EqGraph from './components/EqGraph.svelte';
	import Presets from './components/Presets.svelte';
	import Switch from './components/Switch.svelte';
	import Volume from './components/Volume.svelte';
	import {
		connect,
		persist,
		refreshStatus,
		send,
		startCapture,
		stopCapture,
		subscribeSpectrum,
		type Connection
	} from './engine';
	import { ui } from './state.svelte';

	let conn = $state<Connection | undefined>();
	let loaded = $state(false);
	let audible = $state(false);
	let bins = $state<number[]>([]);
	let captureConfirm = $state(false);
	let captureBusy = $state(false);
	let captureError = $state('');

	const disabled = $derived(!conn || conn.blocked);
	const capturing = $derived(conn?.engine === 'capture');

	async function init() {
		conn = await connect();
		if (conn) ui.settings = conn.settings;
		loaded = true;
	}

	async function poll() {
		if (!conn || conn.blocked || conn.engine === 'capture') return;
		const r = await refreshStatus(conn.tabId);
		conn.status = r.status;
		conn.spectrumFrameId = r.spectrumFrameId;
		audible = r.audible;
	}

	onMount(() => {
		void init();
		const timer = setInterval(poll, 1000);
		return () => clearInterval(timer);
	});

	// Push every change to the engine and tab memory, at most once per frame.
	let frame = 0;
	$effect(() => {
		const snapshot = $state.snapshot(ui.settings);
		if (!conn || conn.blocked) return;
		const { tabId, engine } = conn;
		cancelAnimationFrame(frame);
		frame = requestAnimationFrame(() => {
			send(tabId, engine, snapshot);
			void persist(tabId, engine, snapshot);
		});
	});

	$effect(() => {
		if (!conn || conn.blocked) return;
		bins = [];
		return subscribeSpectrum(conn.tabId, conn.engine, conn.spectrumFrameId, (b) => (bins = b));
	});

	const status = $derived.by(() => {
		if (!conn) return { text: loaded ? 'No tab' : '', tone: 'quiet' };
		if (conn.blocked) return { text: 'Not available here', tone: 'quiet' };
		if (conn.engine === 'capture') return { text: 'Capture mode', tone: 'warn' };
		const s = conn.status;
		if (s.routed > 0) return { text: 'Full screen safe', tone: 'good' };
		if (s.total > 0 && s.limited === s.total) return { text: 'Volume only', tone: 'quiet' };
		if (s.total > 0)
			return { text: `${s.total === 1 ? 'Media' : `${s.total} players`} found`, tone: 'quiet' };
		return { text: 'No media yet', tone: 'quiet' };
	});

	/** Shown when the in-page engine can't reach (all of) the tab's sound. */
	const reachProblem = $derived.by(() => {
		if (!conn || conn.blocked || conn.engine === 'capture') return '';
		const s = conn.status;
		if (s.limited > 0)
			return 'Some audio here comes from another site in a way that only allows turning it down, not boosting or EQ.';
		if (s.total === 0 && audible)
			return "This tab is playing sound that isn't coming from a video or audio player, so the extension can't reach it directly.";
		return '';
	});

	const focusHint = $derived(
		ui.settings.focus > 0
			? 'Voices forward, music pushed back'
			: ui.settings.focus < 0
				? 'Voices pushed back, like karaoke'
				: 'Untouched'
	);

	async function onStartCapture() {
		if (!conn) return;
		captureBusy = true;
		captureError = '';
		const res = await startCapture(conn.tabId, $state.snapshot(ui.settings)).catch(
			(err: unknown) => ({ ok: false as const, error: String(err) })
		);
		captureBusy = false;
		if (res.ok) {
			conn.engine = 'capture';
			captureConfirm = false;
		} else {
			captureError = /invoked|activeTab/i.test(res.error)
				? 'Chrome needs a fresh click on the extension icon for this tab. Close this popup, click the icon again, then turn on capture mode.'
				: res.error;
		}
	}

	async function onStopCapture() {
		if (!conn) return;
		captureBusy = true;
		await stopCapture(conn.tabId).catch(() => {});
		conn = await connect();
		captureBusy = false;
	}
</script>

<main>
	<header>
		<h1>Tab Audio</h1>
		{#if status.text}
			<span class="status {status.tone}">{status.text}</span>
		{/if}
	</header>

	{#if loaded && (!conn || conn.blocked)}
		<p class="notice">
			Chrome doesn't let extensions change audio on this page. Open a regular website tab and try
			again.
		</p>
	{/if}

	{#if loaded}
		<Volume {disabled} />

		{#if conn?.status.waitingForGesture}
			<p class="notice">
				Click anywhere on the page once. Chrome needs that before the extension can take over the
				page's sound.
			</p>
		{/if}

		{#if capturing}
			<div class="notice warn">
				<p>
					<strong>Capture mode is on.</strong> Full screen stays inside the browser window until you turn
					it off.
				</p>
				<button type="button" class="btn" disabled={captureBusy} onclick={onStopCapture}
					>Turn off capture mode</button
				>
			</div>
		{:else if captureConfirm}
			<div class="notice warn">
				<p>
					Capture mode reaches any sound in this tab. While it's on, Chrome keeps full screen inside
					the browser window instead of filling your monitor.
				</p>
				{#if captureError}<p class="error">{captureError}</p>{/if}
				<div class="buttons">
					<button type="button" class="btn primary" disabled={captureBusy} onclick={onStartCapture}
						>Turn on capture mode</button
					>
					<button type="button" class="btn quiet" onclick={() => (captureConfirm = false)}
						>Cancel</button
					>
				</div>
			</div>
		{:else if reachProblem}
			<div class="notice">
				<p>{reachProblem}</p>
				<button type="button" class="btn" onclick={() => (captureConfirm = true)}
					>Try capture mode</button
				>
			</div>
		{/if}

		<section class="focus">
			<div class="row-head">
				<label for="focus">Focus</label>
				<span class="hint">{focusHint}</span>
			</div>
			<input
				id="focus"
				type="range"
				class="centered"
				min="-100"
				max="100"
				value={Math.round(ui.settings.focus * 100)}
				oninput={(e) => (ui.settings.focus = Number(e.currentTarget.value) / 100)}
				ondblclick={() => (ui.settings.focus = 0)}
				aria-valuetext={focusHint}
				{disabled}
			/>
			<div class="ends" aria-hidden="true"><span>Music</span><span>Voice</span></div>
		</section>

		<section class="eq">
			<div class="row-head">
				<h2>Equalizer</h2>
				<Switch bind:checked={ui.settings.eqEnabled} label="On" {disabled} />
			</div>
			<EqGraph {bins} {disabled} />
			<BandEditor {disabled} />
			<Presets {disabled} />
		</section>

		<section class="toggles">
			<Switch
				bind:checked={ui.settings.nightMode}
				label="Night mode"
				hint="Evens out loud and quiet parts"
				{disabled}
			/>
			<Switch
				bind:checked={ui.settings.mono}
				label="Mono"
				hint="Same sound in both ears"
				{disabled}
			/>
		</section>

		<section class="balance">
			<div class="row-head">
				<label for="balance">Balance</label>
				<span class="hint">
					{ui.settings.balance === 0
						? 'Center'
						: `${Math.round(Math.abs(ui.settings.balance) * 100)}% ${ui.settings.balance < 0 ? 'left' : 'right'}`}
				</span>
			</div>
			<input
				id="balance"
				type="range"
				class="centered"
				min="-100"
				max="100"
				value={Math.round(ui.settings.balance * 100)}
				oninput={(e) => (ui.settings.balance = Number(e.currentTarget.value) / 100)}
				ondblclick={() => (ui.settings.balance = 0)}
				{disabled}
			/>
		</section>

		<footer>
			<button
				type="button"
				class="btn"
				disabled={disabled || isDefault(ui.settings)}
				onclick={() => (ui.settings = defaultSettings())}>Reset everything</button
			>
			{#if !capturing && !captureConfirm && !disabled}
				<button type="button" class="btn quiet" onclick={() => (captureConfirm = true)}
					>Not working? Try capture mode</button
				>
			{/if}
		</footer>
	{/if}
</main>

<style>
	main {
		display: flex;
		flex-direction: column;
		gap: 18px;
		padding: 14px 16px 16px;
	}
	header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
	}
	h1 {
		margin: 0;
		font-family: var(--font-serif);
		font-weight: 600;
		font-size: 18px;
		color: var(--heading);
	}
	h2 {
		margin: 0;
		font-size: 13px;
		font-weight: 600;
	}
	.status {
		font-size: 12px;
		color: var(--text-muted);
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.status::before {
		content: '';
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--text-subtle);
	}
	.status.good::before {
		background: var(--sw-azure);
	}
	.status.warn {
		color: var(--primary);
	}
	.status.warn::before {
		background: var(--primary);
	}
	.notice {
		margin: 0;
		padding: 10px 12px;
		border-radius: 8px;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		color: var(--text-muted);
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 8px;
	}
	.notice p {
		margin: 0;
	}
	.notice.warn {
		background: var(--warning-bg);
		border-color: var(--primary);
		color: var(--text);
	}
	.notice .error {
		color: var(--primary);
	}
	.buttons {
		display: flex;
		gap: 6px;
	}
	.row-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 4px;
	}
	.row-head label {
		font-weight: 600;
	}
	.hint {
		color: var(--text-subtle);
		font-size: 12px;
	}
	.ends {
		display: flex;
		justify-content: space-between;
		font-size: 11px;
		color: var(--text-subtle);
	}
	.eq {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.eq .row-head {
		margin-bottom: 0;
	}
	.toggles {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
	footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding-top: 12px;
		border-top: 1px solid var(--border);
	}
</style>
