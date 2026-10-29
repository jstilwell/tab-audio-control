// A tiny static server for the engine specs. The same server answers on
// localhost and 127.0.0.1, which the browser treats as two origins — handy for
// testing cross-origin (tainted) media.
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname);
const TYPES: Record<string, string> = {
	'.html': 'text/html',
	'.js': 'text/javascript',
	'.wav': 'audio/wav'
};

/** 2 s stereo 440 Hz sine, 16-bit PCM. */
export function toneWav(seconds = 2, rate = 44100, freq = 440, amp = 0.3): Buffer {
	const frames = seconds * rate;
	const buf = Buffer.alloc(44 + frames * 4);
	buf.write('RIFF', 0);
	buf.writeUInt32LE(36 + frames * 4, 4);
	buf.write('WAVEfmt ', 8);
	buf.writeUInt32LE(16, 16);
	buf.writeUInt16LE(1, 20);
	buf.writeUInt16LE(2, 22);
	buf.writeUInt32LE(rate, 24);
	buf.writeUInt32LE(rate * 4, 28);
	buf.writeUInt16LE(4, 32);
	buf.writeUInt16LE(16, 34);
	buf.write('data', 36);
	buf.writeUInt32LE(frames * 4, 40);
	for (let i = 0; i < frames; i++) {
		const v = Math.round(Math.sin((2 * Math.PI * freq * i) / rate) * amp * 32767);
		buf.writeInt16LE(v, 44 + i * 4);
		buf.writeInt16LE(v, 46 + i * 4);
	}
	return buf;
}

const routes: Record<string, () => Promise<Buffer> | Buffer> = {
	'/tone.wav': () => toneWav(),
	'/content.js': () => readFile(resolve(ROOT, '../../dist/content.js')),
	'/harness.js': () => readFile(resolve(ROOT, '.build/harness.js'))
};

export async function startServer(): Promise<{ server: Server; port: number }> {
	const server = createServer(async (req, res) => {
		const path = new URL(req.url ?? '/', 'http://x').pathname;
		try {
			const body = routes[path]
				? await routes[path]()
				: await readFile(join(ROOT, 'site', normalize(path).replace(/^(\.\.[/\\])+/, '')));
			res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
			res.end(body);
		} catch {
			res.writeHead(404).end();
		}
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	const address = server.address();
	if (!address || typeof address === 'string') throw new Error('no port');
	return { server, port: address.port };
}
