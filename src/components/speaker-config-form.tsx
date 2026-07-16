"use client";

import { ChevronDown, Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  FieldDescription,
  FieldGroup,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import type { SpeakerConfig, SpeakerRole } from "@/lib/backend/types";
import { cn } from "@/lib/utils";

export const LANGUAGES: { code: string; label: string }[] = [
  { code: "de", label: "German" },
  { code: "en", label: "English" },
  { code: "fr", label: "French" },
  { code: "it", label: "Italian" },
  { code: "ar", label: "Arabic" },
  { code: "tr", label: "Turkish" },
  { code: "es", label: "Spanish" },
  { code: "pt", label: "Portuguese" },
  { code: "sq", label: "Albanian" },
  { code: "sr", label: "Serbian" },
  { code: "bs", label: "Bosnian" },
  { code: "hr", label: "Croatian" },
  { code: "ru", label: "Russian" },
  { code: "uk", label: "Ukrainian" },
  { code: "pl", label: "Polish" },
  { code: "ro", label: "Romanian" },
  { code: "ku", label: "Kurdish" },
  { code: "fa", label: "Persian" },
  { code: "ps", label: "Pashto" },
  { code: "so", label: "Somali" },
  { code: "ti", label: "Tigrinya" },
  { code: "am", label: "Amharic" },
  { code: "zh", label: "Chinese" },
  { code: "vi", label: "Vietnamese" },
  { code: "th", label: "Thai" },
];

export function languageLabel(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.label ?? code.toUpperCase();
}

const ROLES: { value: SpeakerRole; label: string }[] = [
  { value: "doctor", label: "Doctor" },
  { value: "patient", label: "Patient" },
  { value: "interpreter", label: "Interpreter" },
];

export const MIN_SPEAKERS = 1;
export const MAX_SPEAKERS = 3;
const MAX_LANGUAGES_PER_SPEAKER = 3;

export interface SessionSetup {
  speakers: SpeakerConfig[];
}

export function defaultSessionSetup(): SessionSetup {
  return {
    speakers: [
      { id: "speaker-1", role: "doctor", languages: ["de"] },
      { id: "speaker-2", role: "patient", languages: ["en"] },
    ],
  };
}

function NativeSelect({
  className,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <div className={cn("relative", className)}>
      <select
        className="h-9 w-full appearance-none rounded-3xl border border-transparent bg-input/50 pr-8 pl-3 text-sm transition-[color,box-shadow,background-color] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-50"
        {...props}
      />
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

/**
 * Controlled form for the session configuration shared by both backends:
 * who is in the room and which languages they speak. Live captions are
 * translated into every language listed here, so no separate target
 * language is needed.
 */
export function SpeakerConfigForm({
  value,
  onChange,
}: {
  value: SessionSetup;
  onChange: (next: SessionSetup) => void;
}) {
  const updateSpeaker = (index: number, patch: Partial<SpeakerConfig>) => {
    const speakers = value.speakers.map((speaker, i) =>
      i === index ? { ...speaker, ...patch } : speaker,
    );
    onChange({ ...value, speakers });
  };

  const addSpeaker = () => {
    if (value.speakers.length >= MAX_SPEAKERS) return;
    const hasInterpreter = value.speakers.some(
      (s) => s.role === "interpreter",
    );
    onChange({
      ...value,
      speakers: [
        ...value.speakers,
        {
          id: `speaker-${Date.now()}`,
          role: hasInterpreter ? "patient" : "interpreter",
          languages: hasInterpreter
            ? ["en"]
            : // The interpreter repeats what the doctor and patient say in
              // the other party's language, so default to both of theirs.
              [...new Set(value.speakers.flatMap((s) => s.languages))],
        },
      ],
    });
  };

  const removeSpeaker = (index: number) => {
    if (value.speakers.length <= MIN_SPEAKERS) return;
    onChange({
      ...value,
      speakers: value.speakers.filter((_, i) => i !== index),
    });
  };

  return (
    <FieldGroup className="gap-6">
      <FieldSet>
        <FieldLegend>Speakers</FieldLegend>
        <FieldDescription>
          Who is in the room and which languages they may use. During a live
          session everything is translated into each of these languages, so
          every party can follow along. The interpreter repeats what the
          doctor and patient say in the other party&apos;s language.
        </FieldDescription>
        <div className="flex flex-col gap-3">
          {value.speakers.map((speaker, index) => (
            <div
              key={speaker.id}
              className="flex flex-col gap-3 rounded-3xl border p-4"
            >
              <div className="flex items-center gap-2">
                <NativeSelect
                  aria-label={`Speaker ${index + 1} role`}
                  className="w-40"
                  value={speaker.role}
                  onChange={(e) =>
                    updateSpeaker(index, {
                      role: e.target.value as SpeakerRole,
                    })
                  }
                >
                  {ROLES.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </NativeSelect>
                {value.speakers.length > MIN_SPEAKERS && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="ml-auto text-muted-foreground"
                    aria-label={`Remove speaker ${index + 1}`}
                    onClick={() => removeSpeaker(index)}
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {speaker.languages.map((language, languageIndex) => (
                  <div
                    key={`${language}-${languageIndex}`}
                    className="flex items-center gap-1"
                  >
                    <NativeSelect
                      aria-label={`Speaker ${index + 1} language ${languageIndex + 1}`}
                      className="w-36"
                      value={language}
                      onChange={(e) =>
                        updateSpeaker(index, {
                          languages: speaker.languages.map((l, i) =>
                            i === languageIndex ? e.target.value : l,
                          ),
                        })
                      }
                    >
                      {LANGUAGES.map((l) => (
                        <option key={l.code} value={l.code}>
                          {l.label}
                        </option>
                      ))}
                    </NativeSelect>
                    {speaker.languages.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="text-muted-foreground"
                        aria-label={`Remove language ${languageIndex + 1} from speaker ${index + 1}`}
                        onClick={() =>
                          updateSpeaker(index, {
                            languages: speaker.languages.filter(
                              (_, i) => i !== languageIndex,
                            ),
                          })
                        }
                      >
                        <X />
                      </Button>
                    )}
                  </div>
                ))}
                {speaker.languages.length < MAX_LANGUAGES_PER_SPEAKER && (
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() =>
                      updateSpeaker(index, {
                        languages: [...speaker.languages, "en"],
                      })
                    }
                  >
                    <Plus data-icon="inline-start" />
                    Language
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
        {value.speakers.length < MAX_SPEAKERS && (
          <Button variant="outline" size="sm" onClick={addSpeaker}>
            <Plus data-icon="inline-start" />
            Add speaker
          </Button>
        )}
      </FieldSet>
    </FieldGroup>
  );
}
