/**
 * Bubble tints for speaker ids — the anonymous voice labels the live session
 * emits (SPEAKER_00, …) as well as the `speaker-1`, `speaker-2`, … ids we
 * assign for refinement. There's no concept of who a speaker "is"; colour and
 * the "Speaker N" label are the only cues distinguishing them.
 */
const SPEAKER_TINTS = [
  "bg-sky-500/10 ring-sky-500/20",
  "bg-emerald-500/10 ring-emerald-500/20",
  "bg-violet-500/10 ring-violet-500/20",
  "bg-amber-500/10 ring-amber-500/20",
  "bg-rose-500/10 ring-rose-500/20",
  "bg-teal-500/10 ring-teal-500/20",
] as const;

const NO_SPEAKER_TINT = "bg-muted ring-foreground/5";

/**
 * Maps a speaker label to a stable tint. Labels are stable within a session
 * but may be revised for a segment mid-session, so this is a pure function of
 * the id — the bubble simply re-tints when a `speaker.update` arrives.
 */
export function speakerTint(speakerId: string | null): string {
  if (!speakerId) return NO_SPEAKER_TINT;
  return SPEAKER_TINTS[speakerIndex(speakerId) % SPEAKER_TINTS.length];
}

/** "Speaker 3" from a `speaker-3`/`SPEAKER_03`-style id; the raw id otherwise. */
export function speakerLabel(speakerId: string | null): string {
  if (!speakerId) return "Unknown speaker";
  const trailingDigits = /(\d+)$/.exec(speakerId);
  return trailingDigits ? `Speaker ${Number(trailingDigits[1])}` : `Speaker ${speakerId}`;
}

/** Trailing digits of SPEAKER_07-style labels; a hash for anything else. */
function speakerIndex(speakerId: string): number {
  const trailingDigits = /(\d+)$/.exec(speakerId);
  if (trailingDigits) return Number(trailingDigits[1]);

  let hash = 0;
  for (let i = 0; i < speakerId.length; i += 1) {
    hash = (hash * 31 + speakerId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** Formats seconds of audio as m:ss. */
export function formatAudioTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
