"use client";

import { useId, useState, type FormEvent, type ReactElement } from "react";
import { RefreshCwIcon } from "lucide-react";

import { Button } from "./ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "./ui/field";
import {
  buildSpeakers,
  LanguageSelectCombobox,
  languageOptionsFromCodes,
  SpeakerCountInput,
} from "./speaker-config-fields";
import type { LanguageOption } from "@/lib/languages";
import {
  startRefinement,
  type RecordingSession,
} from "@/lib/recordings-store";
import { useTerminology } from "@/lib/terminology-store";

function initialSpeakerLanguages(
  recording: RecordingSession,
): LanguageOption[] {
  return languageOptionsFromCodes(
    recording.speakers.flatMap((speaker) => speaker.languages),
  );
}

/**
 * Re-runs offline refinement on a recording, letting the user adjust the
 * conversation parameters first. The current terminology list (Settings) is
 * always sent, so this is also how a changed dictionary gets applied.
 */
export default function RefineConfigDialog({
  recording,
  trigger,
}: {
  recording: RecordingSession;
  trigger: ReactElement;
}) {
  const id = useId();
  const numSpeakersId = `${id}-num-speakers`;
  const speakerLanguagesId = `${id}-speaker-languages`;
  const terminology = useTerminology();

  const [open, setOpen] = useState(false);
  const [numSpeakers, setNumSpeakers] = useState(recording.speakers.length);
  const [speakerLanguages, setSpeakerLanguages] = useState(() =>
    initialSpeakerLanguages(recording),
  );
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const speakerLanguagesInvalid =
    hasSubmitted && speakerLanguages.length === 0;

  const handleOpenChange = (nextOpen: boolean) => {
    // Start from the recording's current config every time it opens.
    if (nextOpen) {
      setNumSpeakers(recording.speakers.length);
      setSpeakerLanguages(initialSpeakerLanguages(recording));
      setHasSubmitted(false);
    }
    setOpen(nextOpen);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setHasSubmitted(true);
    if (speakerLanguages.length === 0) return;

    void startRefinement(recording.id, {
      speakers: buildSpeakers(
        numSpeakers,
        speakerLanguages.map((language) => language.code),
      ),
    });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-lg">
        <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Refine again</DialogTitle>
            <DialogDescription>
              Process the recording again with updated settings. The current
              transcript stays visible until the new one is ready.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={numSpeakersId}>Number of speakers</FieldLabel>
              <FieldDescription>
                The number of people speaking in the recording.
              </FieldDescription>
              <SpeakerCountInput
                id={numSpeakersId}
                value={numSpeakers}
                onValueChange={setNumSpeakers}
              />
            </Field>
            <Field data-invalid={speakerLanguagesInvalid}>
              <FieldLabel htmlFor={speakerLanguagesId}>
                Speaker languages
              </FieldLabel>
              <FieldDescription>
                Languages spoken in the recording. Each turn is translated into
                the other languages.
              </FieldDescription>
              <LanguageSelectCombobox
                id={speakerLanguagesId}
                value={speakerLanguages}
                onValueChange={setSpeakerLanguages}
                invalid={speakerLanguagesInvalid}
                errorId={`${speakerLanguagesId}-error`}
              />
              {speakerLanguagesInvalid && (
                <FieldError id={`${speakerLanguagesId}-error`}>
                  Select at least one speaker language.
                </FieldError>
              )}
            </Field>
            <Field>
              <FieldLabel>Terminology</FieldLabel>
              <FieldDescription>
                {terminology.length > 0
                  ? `${terminology.length} ${terminology.length === 1 ? "term" : "terms"} from Settings will be used.`
                  : "No terminology set. Add terms in Settings to help recover medical terms."}
              </FieldDescription>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose
              render={
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              }
            />
            <Button type="submit">
              <RefreshCwIcon data-icon="inline-start" />
              Refine
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
