"use client";

import {
  useId,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { FileAudio, FlaskConical, Mic, Minus, Plus, Upload } from "lucide-react";
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
import { Input } from "./ui/input";
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
import { LANGUAGES, type LanguageOption } from "@/lib/languages";
import { isMockAudioAvailable } from "@/lib/mock-audio";
import { MAX_REFINE_BYTES } from "@/lib/backend/client";
import type { SpeakerConfig, SpeakerRole } from "@/lib/backend/types";
import { createRecording, startRefinement } from "@/lib/recordings-store";
import { Spinner } from "./ui/spinner";

type RecordingMode = "record" | "upload";

/**
 * The backend requires each speaker's `role` to be one of these values but
 * doesn't use it beyond echoing it back — the app has no speaker-role
 * concept, so this just cycles through the allowed values.
 */
const SPEAKER_ROLE_CYCLE: SpeakerRole[] = ["doctor", "patient", "interpreter"];

type RecordingConfigDialogProps = {
  mode: RecordingMode;
};

type LanguageOptionGroup = {
  value: string;
  items: LanguageOption[];
};

type LanguageSelectComboboxProps = {
  id: string;
  items: LanguageOptionGroup[];
  value: LanguageOption[];
  onValueChange: (value: LanguageOption[]) => void;
  invalid: boolean;
  errorId: string;
};

function LanguageSelectCombobox({
  id,
  items,
  value,
  onValueChange,
  invalid,
  errorId,
}: LanguageSelectComboboxProps) {
  const anchor = useComboboxAnchor();

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

export default function RecordingConfigDialog({
  mode,
}: RecordingConfigDialogProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const fileInputId = `${id}-file`;
  const numSpeakersId = `${id}-num-speakers`;
  const targetLanguagesId = `${id}-target-languages`;
  const speakerLanguagesId = `${id}-speaker-languages`;
  const [numSpeakers, setNumSpeakers] = useState(3);
  const [targetLanguages, setTargetLanguages] = useState<LanguageOption[]>([]);
  const [speakerLanguages, setSpeakerLanguages] = useState<LanguageOption[]>(
    [],
  );
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  const isUpload = mode === "upload";
  const targetLanguagesInvalid =
    hasSubmitted && targetLanguages.length === 0;
  const speakerLanguagesInvalid =
    hasSubmitted && speakerLanguages.length === 0;
  const fileInvalid = isUpload && hasSubmitted && selectedFile === null;

  const decrementSpeakers = () => {
    setNumSpeakers((current) => Math.max(1, current - 1));
  };

  const incrementSpeakers = () => {
    setNumSpeakers((current) => Math.min(8, current + 1));
  };

  const languageOptions = useMemo<LanguageOptionGroup[]>(
    () => [
      {
        value: "Frequent",
        items: LANGUAGES.frequent,
      },
      {
        value: "Others",
        items: LANGUAGES.others,
      },
    ],
    [],
  );

  const onFileSelected = (file?: File) => {
    if (!file) return;

    if (file.size > MAX_REFINE_BYTES) {
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setFileError(
        `This file is larger than the ${Math.floor(MAX_REFINE_BYTES / 1024 / 1024)} MB limit.`,
      );
      return;
    }

    if (file.type && !file.type.startsWith("audio/")) {
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setFileError("Choose an audio file.");
      return;
    }

    setFileError(null);
    setSelectedFile(file);
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    onFileSelected(event.dataTransfer.files?.[0]);
  };

  const startSession = ({ mockAudio }: { mockAudio: boolean }) => {
    setHasSubmitted(true);

    if (
      targetLanguages.length === 0 ||
      speakerLanguages.length === 0 ||
      (isUpload && selectedFile === null) ||
      isStarting
    ) {
      return;
    }

    setIsStarting(true);

    const languageCodes = speakerLanguages.map((language) => language.code);
    const speakers: SpeakerConfig[] = Array.from(
      { length: numSpeakers },
      (_, index) => ({
        id: `speaker-${index + 1}`,
        role: SPEAKER_ROLE_CYCLE[index % SPEAKER_ROLE_CYCLE.length],
        languages: languageCodes,
      }),
    );

    const recording = createRecording({
      speakers,
      targetLanguages: targetLanguages.map((language) => language.code),
      startedVia: mode,
      audioBlob: selectedFile ?? undefined,
      audioFileName: selectedFile?.name,
      mockAudio,
    });

    if (isUpload) {
      // The store updates to "refining" synchronously, so the destination
      // opens on the processed/review tab with an accurate loading state.
      void startRefinement(recording.id);
    }

    router.push(`/recordings/${recording.id}`);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startSession({ mockAudio: false });
  };

  const title = isUpload
    ? "Upload an existing recording"
    : "Start a new recording";
  const description = isUpload
    ? "Choose a recording and configure its speakers and languages."
    : "Configure the speakers and languages for the recording.";
  const actionLabel = isUpload ? "Upload File" : "Start Recording";
  const ActionIcon = isUpload ? Upload : Mic;

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant={isUpload ? "outline" : "default"}>
            <ActionIcon data-icon="inline-start" />
            {actionLabel}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            {isUpload && (
              <Field data-invalid={fileInvalid || fileError !== null}>
                <FieldLabel htmlFor={fileInputId}>Recording file</FieldLabel>
                <input
                  ref={fileInputRef}
                  id={fileInputId}
                  type="file"
                  accept="audio/*"
                  className="sr-only"
                  aria-invalid={fileInvalid || fileError !== null}
                  aria-describedby={
                    fileInvalid || fileError ? `${fileInputId}-error` : undefined
                  }
                  onChange={(event) =>
                    onFileSelected(event.target.files?.[0])
                  }
                />
                <label
                  htmlFor={fileInputId}
                  className="flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-3xl border border-dashed bg-muted/30 p-6 text-center transition-colors hover:bg-muted/60 data-[dragging=true]:bg-muted"
                  data-dragging={isDragging}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                >
                  {selectedFile ? <FileAudio /> : <Upload />}
                  <span className="font-medium">
                    {selectedFile
                      ? selectedFile.name
                      : "Drop an audio file here or click to browse"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Audio files up to {Math.floor(MAX_REFINE_BYTES / 1024 / 1024)} MB
                  </span>
                </label>
                {(fileInvalid || fileError) && (
                  <FieldError id={`${fileInputId}-error`}>
                    {fileError ?? "Choose a recording to upload."}
                  </FieldError>
                )}
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor={numSpeakersId}>
                Number of speakers
              </FieldLabel>
              <FieldDescription>
                The number of speakers who will speak during the recording.
              </FieldDescription>
              <div className="flex flex-row gap-3">
                <Button
                  type="button"
                  onClick={decrementSpeakers}
                  variant="outline"
                >
                  <Minus />
                </Button>
                <Input
                  id={numSpeakersId}
                  type="number"
                  max={8}
                  value={numSpeakers}
                  onChange={(event) => {
                    const nextValue = Number(event.target.value);
                    setNumSpeakers(
                      Number.isNaN(nextValue)
                        ? 1
                        : Math.min(8, Math.max(1, nextValue)),
                    );
                  }}
                  min={1}
                  className="w-20 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <Button
                  type="button"
                  onClick={incrementSpeakers}
                  variant="outline"
                >
                  <Plus />
                </Button>
              </div>
            </Field>
            <Field data-invalid={targetLanguagesInvalid}>
              <FieldLabel htmlFor={targetLanguagesId}>
                Target languages
              </FieldLabel>
              <FieldDescription>Languages to translate into.</FieldDescription>
              <LanguageSelectCombobox
                id={targetLanguagesId}
                items={languageOptions}
                value={targetLanguages}
                onValueChange={setTargetLanguages}
                invalid={targetLanguagesInvalid}
                errorId={`${targetLanguagesId}-error`}
              />
              {targetLanguagesInvalid && (
                <FieldError id={`${targetLanguagesId}-error`}>
                  Select at least one target language.
                </FieldError>
              )}
            </Field>
            <Field data-invalid={speakerLanguagesInvalid}>
              <FieldLabel htmlFor={speakerLanguagesId}>
                Speaker languages
              </FieldLabel>
              <FieldDescription>
                Languages that may be spoken during the recording.
              </FieldDescription>
              <LanguageSelectCombobox
                id={speakerLanguagesId}
                items={languageOptions}
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
          </FieldGroup>
          <DialogFooter>
            <DialogClose
              render={
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              }
            />
            {!isUpload && isMockAudioAvailable && (
              <Button
                type="button"
                variant="secondary"
                disabled={isStarting}
                onClick={() => startSession({ mockAudio: true })}
              >
                <FlaskConical data-icon="inline-start" />
                Mock Audio
              </Button>
            )}
            <Button type="submit" disabled={isStarting}>
              {isStarting ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <ActionIcon data-icon="inline-start" />
              )}
              {isUpload ? "Process Recording" : actionLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
