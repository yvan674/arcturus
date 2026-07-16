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

/** Formats seconds of audio as m:ss. */
export function formatAudioTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
