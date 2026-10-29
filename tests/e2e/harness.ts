// Runs the real AudioGraph in an OfflineAudioContext and reports per-channel
// levels, so the specs can check routing math against an actual browser.
import { AudioGraph } from '../../src/audio/graph';
import { defaultSettings, sanitizeSettings, type AudioSettings } from '../../src/shared/settings';

export interface Signal {
	freq: number;
	/** Amplitude in the left / right channel (negative = inverted) */
	left: number;
	right: number;
}

const RATE = 48000;

async function render(partial: Partial<AudioSettings>, signal: Signal) {
	const ctx = new OfflineAudioContext(2, RATE, RATE);
	const graph = new AudioGraph(ctx, ctx.destination);
	graph.apply(sanitizeSettings({ ...defaultSettings(), ...partial }));

	const osc = new OscillatorNode(ctx, { frequency: signal.freq });
	const merger = new ChannelMergerNode(ctx, { numberOfInputs: 2 });
	osc.connect(new GainNode(ctx, { gain: signal.left })).connect(merger, 0, 0);
	osc.connect(new GainNode(ctx, { gain: signal.right })).connect(merger, 0, 1);
	merger.connect(graph.input);
	osc.start();

	const buf = await ctx.startRendering();
	// Measure the second half, after parameter ramps and filters settle.
	const level = (ch: number) => {
		const data = buf.getChannelData(ch).subarray(RATE / 2);
		let sum = 0;
		let peak = 0;
		for (const v of data) {
			sum += v * v;
			peak = Math.max(peak, Math.abs(v));
		}
		return { rms: Math.sqrt(sum / data.length), peak };
	};
	return { left: level(0), right: level(1) };
}

Object.assign(window, { render });
