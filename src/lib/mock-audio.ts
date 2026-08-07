/**
 * Development-only mock microphone: `res/test-45.mp3` decoded to the raw PCM
 * the live session accepts (`pcm16-24k`), so a session can be driven without
 * anyone speaking. Only reachable while `NODE_ENV === "development"`.
 */

/** Matches the backend's `pcm16-24k` format: mono, little-endian, 24 kHz. */
export const MOCK_AUDIO_SAMPLE_RATE = 24_000;

/** Milliseconds of audio per streamed frame, mirroring MediaRecorder(100). */
export const MOCK_AUDIO_CHUNK_MS = 100;

export const MOCK_AUDIO_SAMPLES_PER_CHUNK =
  (MOCK_AUDIO_SAMPLE_RATE * MOCK_AUDIO_CHUNK_MS) / 1000;

const MOCK_AUDIO_URL = "/api/dev/mock-audio";

/** PCM16 samples backed by a plain ArrayBuffer, as Blob and WebSocket want. */
export type PcmSamples = Int16Array<ArrayBuffer>;

export const isMockAudioAvailable = process.env.NODE_ENV === "development";

/** Fetches and decodes the mock recording into 24 kHz mono PCM16 samples. */
export async function loadMockAudioSamples(): Promise<PcmSamples> {
  const response = await fetch(MOCK_AUDIO_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(
      `Could not load res/test-45.mp3 for the mock session (${response.status}).`,
    );
  }
  const encoded = await response.arrayBuffer();

  // decodeAudioData resamples to the context's rate but keeps the channel
  // count, so the downmix to mono is still ours to do.
  const context = new OfflineAudioContext(1, 1, MOCK_AUDIO_SAMPLE_RATE);
  const decoded = await context.decodeAudioData(encoded);
  const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) =>
    decoded.getChannelData(i),
  );

  const samples = new Int16Array(decoded.length);
  for (let i = 0; i < decoded.length; i += 1) {
    let sum = 0;
    for (const channel of channels) sum += channel[i];
    const value = Math.max(-1, Math.min(1, sum / channels.length));
    samples[i] = Math.round(value * 32_767);
  }
  return samples;
}

export function concatSamples(chunks: PcmSamples[]): PcmSamples {
  const total = chunks.reduce((n, chunk) => n + chunk.length, 0);
  const samples = new Int16Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    samples.set(chunk, offset);
    offset += chunk.length;
  }
  return samples;
}

/**
 * Wraps PCM16 samples in a WAV container so the same audio that was streamed
 * live can be posted to /v1/refine afterwards.
 */
export function encodeWav(
  samples: PcmSamples,
  sampleRate = MOCK_AUDIO_SAMPLE_RATE,
): Blob {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const dataBytes = samples.byteLength;

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);

  return new Blob([header, samples], { type: "audio/wav" });
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}
