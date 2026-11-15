"use client";

import { Minus, Plus } from "lucide-react";

import { Button } from "./ui/button";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxSeparator,
  ComboboxValue,
  useComboboxAnchor,
} from "./ui/combobox";
import { Input } from "./ui/input";
import { LANGUAGES, type LanguageOption } from "@/lib/languages";
import type { SpeakerConfig, SpeakerRole } from "@/lib/backend/types";

/**
 * Shared pieces of the speaker/language configuration used both when creating
 * a recording and when re-running refinement on an existing one.
 */

export const MIN_SPEAKERS = 1;
export const MAX_SPEAKERS = 8;

/**
 * The backend requires each speaker's `role` to be one of these values but
 * doesn't use it beyond echoing it back — the app has no speaker-role
 * concept, so this just cycles through the allowed values.
 */
const SPEAKER_ROLE_CYCLE: SpeakerRole[] = ["doctor", "patient", "interpreter"];

/** Every speaker may use any of the given languages. */
export function buildSpeakers(
  numSpeakers: number,
  languageCodes: string[],
): SpeakerConfig[] {
  return Array.from({ length: numSpeakers }, (_, index) => ({
    id: `speaker-${index + 1}`,
    role: SPEAKER_ROLE_CYCLE[index % SPEAKER_ROLE_CYCLE.length],
    languages: languageCodes,
  }));
}

export type LanguageOptionGroup = {
  value: string;
  items: LanguageOption[];
};

export const LANGUAGE_OPTION_GROUPS: LanguageOptionGroup[] = [
  { value: "Frequent", items: LANGUAGES.frequent },
  { value: "Others", items: LANGUAGES.others },
];

/**
 * Maps stored ISO codes back to combobox options. Codes not in the language
 * list (e.g. from older recordings) are kept with an uppercase label so they
 * aren't silently dropped on re-submit.
 */
export function languageOptionsFromCodes(codes: string[]): LanguageOption[] {
  const all = [...LANGUAGES.frequent, ...LANGUAGES.others];
  return [...new Set(codes)].map(
    (code) =>
      all.find((option) => option.code === code) ?? {
        code,
        label: code.toUpperCase(),
      },
  );
}

type LanguageSelectComboboxProps = {
  id: string;
  value: LanguageOption[];
  onValueChange: (value: LanguageOption[]) => void;
  invalid: boolean;
  errorId: string;
};

export function LanguageSelectCombobox({
  id,
  value,
  onValueChange,
  invalid,
  errorId,
}: LanguageSelectComboboxProps) {
  const anchor = useComboboxAnchor();
  const items = LANGUAGE_OPTION_GROUPS;

  return (
    <Combobox
      multiple
      autoHighlight
      items={items}
      value={value}
      onValueChange={onValueChange}
      itemToStringLabel={(language) => language.label}
      itemToStringValue={(language) => language.code}
      isItemEqualToValue={(language, selectedLanguage) =>
        language.code === selectedLanguage.code
      }
    >
      <ComboboxChips ref={anchor} className="w-full">
        <ComboboxValue>
          {(values: LanguageOption[]) => (
            <>
              {values.map((language) => (
                <ComboboxChip key={language.code}>
                  {language.label}
                </ComboboxChip>
              ))}
              <ComboboxChipsInput
                id={id}
                placeholder="Select languages"
                aria-invalid={invalid}
                aria-describedby={invalid ? errorId : undefined}
              />
            </>
          )}
        </ComboboxValue>
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>No languages found.</ComboboxEmpty>
        <ComboboxList>
          {(group: LanguageOptionGroup, index: number) => (
            <ComboboxGroup key={group.value} items={group.items}>
              <ComboboxLabel>{group.value}</ComboboxLabel>
              <ComboboxCollection>
                {(language: LanguageOption) => (
                  <ComboboxItem key={language.code} value={language}>
                    {language.label}
                  </ComboboxItem>
                )}
              </ComboboxCollection>
              {index < items.length - 1 && <ComboboxSeparator />}
            </ComboboxGroup>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

function clampSpeakers(value: number): number {
  return Math.min(MAX_SPEAKERS, Math.max(MIN_SPEAKERS, value));
}

/** − [n] + stepper for the number of speakers. */
export function SpeakerCountInput({
  id,
  value,
  onValueChange,
}: {
  id: string;
  value: number;
  onValueChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-row gap-3">
      <Button
        type="button"
        onClick={() => onValueChange(clampSpeakers(value - 1))}
        variant="outline"
        aria-label="Fewer speakers"
      >
        <Minus />
      </Button>
      <Input
        id={id}
        type="number"
        min={MIN_SPEAKERS}
        max={MAX_SPEAKERS}
        value={value}
        onChange={(event) => {
          const nextValue = Number(event.target.value);
          onValueChange(
            Number.isNaN(nextValue) ? MIN_SPEAKERS : clampSpeakers(nextValue),
          );
        }}
        className="w-20 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <Button
        type="button"
        onClick={() => onValueChange(clampSpeakers(value + 1))}
        variant="outline"
        aria-label="More speakers"
      >
        <Plus />
      </Button>
    </div>
  );
}
