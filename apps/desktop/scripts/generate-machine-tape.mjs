import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { format } from 'vite-plus/fmt';
import { formatOptions } from '../../../scripts/format-policy.mjs';

const source = process.argv[2];
if (!source) throw new Error('Pass the original IBM_M2_sound.ogg from Wikimedia Commons.');
const originalHash = 'e620684e9b03b62319fb48da6149392cfd4042615e17a891554f8a9f6ac8515e';
if (createHash('sha256').update(readFileSync(source)).digest('hex') !== originalHash)
  throw new Error('The original recording does not match the documented Commons revision.');

const sampleRate = 16_000;
const duration = 4.1;
const sampleCount = Math.round(duration * sampleRate);
const firstSample = Math.round(0.08 * sampleRate);
const decoded = spawnSync('ffmpeg', [
  '-v',
  'error',
  '-i',
  source,
  '-ac',
  '1',
  '-ar',
  String(sampleRate),
  '-f',
  's16le',
  'pipe:1',
]);
if (decoded.status !== 0 || decoded.stdout.length < (firstSample + sampleCount) * 2)
  throw new Error(
    decoded.error?.message ||
      decoded.stderr.toString() ||
      `Unexpected PCM length: ${decoded.stdout.length}.`,
  );
const original = Int16Array.from({ length: sampleCount }, (_, index) =>
  decoded.stdout.readInt16LE((firstSample + index) * 2),
);
const speaker = new Int16Array(original.length);
const binSize = sampleRate / 200;
const levels = Array.from({ length: Math.floor(original.length / binSize) }, (_, index) =>
  Math.sqrt(
    original
      .slice(index * binSize, (index + 1) * binSize)
      .reduce((sum, value) => sum + value ** 2, 0) / binSize,
  ),
);
const onsets = [];
for (let index = 4; index < levels.length; index++) {
  const preceding = levels.slice(index - 4, index).reduce((sum, value) => sum + value, 0) / 4;
  if (
    levels[index] >= 780 &&
    levels[index] > preceding * 2.35 &&
    index - (onsets.at(-1) ?? -10) >= 7
  )
    onsets.push(index);
}
const pitches = [523, 392, 659, 440, 587, 494];
onsets.forEach((onset, index) => {
  const energy = Math.max(...levels.slice(onset, onset + 4));
  const pitch = pitches[index % pitches.length];
  const length = Math.min(720, ((onsets[index + 1] ?? levels.length) - onset) * binSize - 80);
  const gain = Math.min(12_000, 2_100 + energy * 1.25);
  for (let sample = 0; sample < length; sample++) {
    const envelope = Math.min(1, sample / 24, (length - sample - 1) / 136);
    const square = (sample * pitch) % sampleRate < sampleRate / 2 ? 1 : -1;
    speaker[onset * binSize + sample] = Math.round(gain * square * envelope);
  }
});

const assetFolder = new URL('../public/sounds/machine-tape/', import.meta.url);
mkdirSync(assetFolder, { recursive: true });
const sides = { A: original, B: speaker };
const waveform = {};
for (const [side, samples] of Object.entries(sides)) {
  const wav = Buffer.alloc(44 + samples.length * 2);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((value, index) => wav.writeInt16LE(value, 44 + index * 2));
  writeFileSync(new URL(`ibm-m2-${side.toLowerCase()}.wav`, assetFolder), wav);
  waveform[side] = Array.from({ length: 112 }, (_, index) => {
    const bin = samples.slice(
      Math.floor((index * samples.length) / 112),
      Math.floor(((index + 1) * samples.length) / 112),
    );
    return [
      Math.round((Math.min(0, ...bin) * 63) / 32768),
      Math.round((Math.max(0, ...bin) * 63) / 32767),
    ];
  });
}
const projection = new URL(
  '../src/lib/apps/sound-recorder/machine-tape.generated.ts',
  import.meta.url,
);
const typescript = `export const MACHINE_TAPE = ${JSON.stringify({ duration, onsets: onsets.map((onset) => onset * 5), waveform })} as const;\n`;
const formatted = await format(fileURLToPath(projection), typescript, formatOptions);
if (formatted.errors.length)
  throw new Error(formatted.errors.map(({ message }) => message).join('\n'));
writeFileSync(projection, formatted.code);
console.log(`Wrote ${duration}s per side, ${onsets.length} transcribed strikes.`);
