// The processing chain shared by both engines:
//
//   input (forced stereo) → EQ (5 biquads, bypassable) → mid/side matrix
//   → balance → night-mode compressor → [analyser tap]
//   → volume → limiter → trim → destination
//
// Works on any AudioContext; the in-page engine feeds it media elements, the
// capture engine feeds it a tab MediaStream.

import { focusGains, nodeQ, stereoMatrix, logBins } from '../shared/dsp';
import { BAND_COUNT, type AudioSettings } from '../shared/settings';

/** Short ramp so slider moves never click. */
const SMOOTHING = 0.015;

// Chrome's DynamicsCompressorNode adds its own makeup gain, (1/g)^0.6 where g
// is the curve's gain at 0 dBFS, so night mode needs none of ours: with these
// numbers dialogue comes up ~9 dB and peaks drop ~6 dB.
const NIGHT_ON = { threshold: -24, knee: 12, ratio: 3, attack: 0.005, release: 0.25 };
const NIGHT_OFF = { threshold: 0, knee: 0, ratio: 1, attack: 0.005, release: 0.25 };

const LIMITER = { threshold: -1.5, knee: 0, ratio: 20, attack: 0.001, release: 0.08 };
/** Cancels the limiter's automatic makeup gain so 100% really is 100%. */
const LIMITER_TRIM = 10 ** ((LIMITER.threshold * (1 - 1 / LIMITER.ratio) * 0.6) / 20);

export const SPECTRUM_BARS = 72;

export class AudioGraph {
	readonly input: GainNode;
	private readonly ctx: BaseAudioContext;
	private readonly eqIn: GainNode;
	private readonly eqOut: GainNode;
	private readonly bands: BiquadFilterNode[];
	private readonly direct: [GainNode, GainNode];
	private readonly cross: [GainNode, GainNode];
	private readonly panner: StereoPannerNode;
	private readonly night: DynamicsCompressorNode;
	private readonly analyser: AnalyserNode;
	private readonly volume: GainNode;
	private readonly limiter: DynamicsCompressorNode;
	private readonly fft: Uint8Array<ArrayBuffer>;
	private eqActive: boolean | undefined;

	constructor(ctx: BaseAudioContext, destination: AudioNode) {
		this.ctx = ctx;

		// Upmix mono sources so the mid/side matrix always sees two channels.
		this.input = new GainNode(ctx, {
			channelCount: 2,
			channelCountMode: 'explicit',
			channelInterpretation: 'speakers'
		});
		this.eqIn = new GainNode(ctx);
		this.eqOut = new GainNode(ctx);
		this.bands = Array.from({ length: BAND_COUNT }, () => new BiquadFilterNode(ctx));
		this.bands.reduce<AudioNode>((prev, band) => prev.connect(band), this.eqIn);
		this.bands[BAND_COUNT - 1]!.connect(this.eqOut);
		this.input.connect(this.eqIn);

		// outL = direct·L + cross·R ; outR = cross·L + direct·R
		const splitter = new ChannelSplitterNode(ctx, { numberOfOutputs: 2 });
		const merger = new ChannelMergerNode(ctx, { numberOfInputs: 2 });
		this.direct = [new GainNode(ctx), new GainNode(ctx)];
		this.cross = [new GainNode(ctx), new GainNode(ctx)];
		this.eqOut.connect(splitter);
		splitter.connect(this.direct[0], 0).connect(merger, 0, 0);
		splitter.connect(this.cross[0], 1).connect(merger, 0, 0);
		splitter.connect(this.cross[1], 0).connect(merger, 0, 1);
		splitter.connect(this.direct[1], 1).connect(merger, 0, 1);

		this.panner = new StereoPannerNode(ctx);
		this.night = new DynamicsCompressorNode(ctx);
		this.analyser = new AnalyserNode(ctx, { fftSize: 4096, smoothingTimeConstant: 0.75 });
		this.volume = new GainNode(ctx);
		// Brick-wall-ish limiter so boosts above 100% don't crackle.
		this.limiter = new DynamicsCompressorNode(ctx, LIMITER);
		const trim = new GainNode(ctx, { gain: LIMITER_TRIM });

		merger.connect(this.panner).connect(this.night);
		this.night.connect(this.analyser);
		this.night.connect(this.volume).connect(this.limiter).connect(trim).connect(destination);

		this.fft = new Uint8Array(this.analyser.frequencyBinCount);
	}

	private ramp(param: AudioParam, value: number): void {
		param.setTargetAtTime(value, this.ctx.currentTime, SMOOTHING);
	}

	apply(s: AudioSettings): void {
		this.setEqActive(s.eqEnabled);
		s.bands.forEach((b, i) => {
			const node = this.bands[i];
			if (!node) return;
			node.type = b.type;
			this.ramp(node.frequency, b.frequency);
			this.ramp(node.gain, b.gain);
			this.ramp(node.Q, nodeQ(b.type, b.q));
		});

		const { mid, side } = focusGains(s.focus, s.mono);
		const { direct, cross } = stereoMatrix(mid, side);
		for (const g of this.direct) this.ramp(g.gain, direct);
		for (const g of this.cross) this.ramp(g.gain, cross);

		this.ramp(this.panner.pan, s.balance);

		const n = s.nightMode ? NIGHT_ON : NIGHT_OFF;
		this.ramp(this.night.threshold, n.threshold);
		this.ramp(this.night.knee, n.knee);
		this.ramp(this.night.ratio, n.ratio);
		this.night.attack.value = n.attack;
		this.night.release.value = n.release;

		this.ramp(this.volume.gain, s.muted ? 0 : s.volume);
	}

	/** Routes around the EQ entirely when it's switched off, for honest A/B. */
	private setEqActive(active: boolean): void {
		if (this.eqActive === active) return;
		this.eqActive = active;
		this.eqIn.disconnect();
		this.eqIn.connect(active ? this.bands[0]! : this.eqOut);
	}

	/** Log-spaced spectrum bars (0–255) of the processed signal, before volume. */
	spectrum(count = SPECTRUM_BARS): number[] {
		this.analyser.getByteFrequencyData(this.fft);
		return logBins(this.fft, this.ctx.sampleRate, count);
	}
}
