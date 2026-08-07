import {
  CircleHelp,
  Languages,
  Stethoscope,
  User,
  type LucideIcon,
} from "lucide-react";

import type { SpeakerRole } from "@/lib/backend/types";

export interface RoleMeta {
  label: string;
  icon: LucideIcon;
  /** Tiny role label above a bubble / card. */
  labelClass: string;
  /** Bubble background tint. */
  bubbleClass: string;
  /** Which side of the conversation the bubble sits on. */
  align: "start" | "end" | "center";
}

const ROLE_META: Record<SpeakerRole, RoleMeta> = {
  doctor: {
    label: "Doctor",
    icon: Stethoscope,
    labelClass: "text-sky-700 dark:text-sky-300",
    bubbleClass: "bg-sky-500/10",
    align: "start",
  },
  patient: {
    label: "Patient",
    icon: User,
    labelClass: "text-emerald-700 dark:text-emerald-300",
    bubbleClass: "bg-emerald-500/10",
    align: "end",
  },
  interpreter: {
    label: "Interpreter",
    icon: Languages,
    labelClass: "text-violet-700 dark:text-violet-300",
    bubbleClass: "bg-violet-500/10",
    align: "center",
  },
};

const UNKNOWN_META: RoleMeta = {
  label: "Unknown speaker",
  icon: CircleHelp,
  labelClass: "text-muted-foreground",
  bubbleClass: "bg-muted",
  align: "start",
};

export function roleMeta(role: SpeakerRole | null): RoleMeta {
  return role ? ROLE_META[role] : UNKNOWN_META;
}

/**
 * Bubble tints for the anonymous voice labels the live session emits
 * (SPEAKER_00, …). Roles are unknown during a live session, so colour is the
 * only speaker cue — the tints below deliberately match the role palette so a
 * segment does not change hue family when the refined transcript names it.
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
