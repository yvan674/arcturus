"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, Upload } from "lucide-react";

import {
  SpeakerConfigForm,
  defaultSessionSetup,
  type SessionSetup,
} from "@/components/speaker-config-form";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { MAX_REFINE_BYTES } from "@/lib/backend/client";
import { createRecording, startRefinement } from "@/lib/recordings-store";

/**
 * This page is used to create or start a new recording
 */
export default function RecordingsStartPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [setup, setSetup] = useState<SessionSetup>(defaultSessionSetup);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  const onFileSelected = (file?: File) => {
    if (!file) return;
    if (file.size > MAX_REFINE_BYTES) {
      setSelectedFile(null);
      setFileError(
        `This file is larger than the ${Math.floor(MAX_REFINE_BYTES / 1000 / 1000)} MB limit.`,
      );
      return;
    }
    setFileError(null);
    setSelectedFile(file);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    onFileSelected(event.dataTransfer.files?.[0]);
  };

  const startUploadFlow = () => {
    if (!selectedFile || isStarting) return;
    setIsStarting(true);
    const recording = createRecording({
      speakers: setup.speakers,
      startedVia: "upload",
      audioBlob: selectedFile,
    });
    // Fire and forget: the store keeps updating across the navigation.
    void startRefinement(recording.id);
    router.push(`/recordings/${recording.id}`);
  };

  const startLiveFlow = () => {
    if (isStarting) return;
    setIsStarting(true);
    const recording = createRecording({
      speakers: setup.speakers,
      startedVia: "record",
    });
    router.push(`/recordings/${recording.id}`);
  };

  return (
    <>
      <header className="sticky top-0 flex h-12 shrink-0 items-center gap-2 border-b bg-background p-4">
        <h1 className="text-base font-medium text-foreground">
          Create new recording
        </h1>
      </header>

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-6">
        <div className="text-sm text-muted-foreground">
          Configure who is in the consultation, then upload an existing
          recording or start a live session.
        </div>

        <SpeakerConfigForm value={setup} onChange={setSetup} />

        <Separator />

        <div className="flex flex-row gap-6">
          <div className="flex flex-1 flex-col items-center gap-4 text-center">
            <div className="rounded-3xl bg-muted p-4">
              <Upload className="size-5" />
            </div>
            <div className="flex flex-col items-center gap-1 text-center">
              <h2 className="font-medium">Upload Recording</h2>
              <p className="text-sm text-muted-foreground">
                Process an existing recording into a reviewed transcript
              </p>
            </div>
            <div
              className="w-full max-w-sm rounded-3xl border-2 border-dashed border-muted-foreground/40 bg-muted/20 px-4 py-6 text-sm text-muted-foreground"
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
            >
              <p>Drag and drop your recording here</p>
              <p className="mt-1 text-xs">
                Audio files up to 100 MB (webm, mp3, wav, m4a, …)
              </p>
              {selectedFile ? (
                <p className="mt-3 text-foreground">
                  Selected: {selectedFile.name}
                </p>
              ) : null}
              {fileError ? (
                <p className="mt-3 text-destructive">{fileError}</p>
              ) : null}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(event) => onFileSelected(event.target.files?.[0])}
            />
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
              >
                Choose file
              </Button>
              <Button
                onClick={startUploadFlow}
                disabled={!selectedFile || isStarting}
              >
                {isStarting && (
                  <Spinner data-icon="inline-start" className="size-4" />
                )}
                Process recording
              </Button>
            </div>
          </div>

          <Separator orientation="vertical" />

          <div className="flex flex-1 flex-col items-center gap-4 text-center">
            <div className="rounded-3xl bg-muted p-4">
              <Mic className="size-5" />
            </div>
            <div className="flex flex-col items-center gap-1 text-center">
              <h2 className="font-medium">New Recording</h2>
              <p className="text-sm text-muted-foreground">
                Start a live transcription session with your microphone
              </p>
            </div>
            <Button onClick={startLiveFlow} disabled={isStarting}>
              <Mic data-icon="inline-start" />
              Start Recording
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
