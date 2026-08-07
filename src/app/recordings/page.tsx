import { Mic, Upload } from "lucide-react";

import RecordingConfigDialog from "@/components/recording-config-dialog";
import { Separator } from "@/components/ui/separator";

/**
 * This page is used to create or start a new recording
 */
export default function RecordingsStartPage() {
  return (
    <>
      <header className="sticky top-0 flex h-12 shrink-0 items-center gap-2 border-b bg-background p-4">
        <h1 className="text-base font-medium text-foreground">
          Create new recording
        </h1>
      </header>

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-6">
        <div className="flex flex-row gap-6">
          <div className="flex flex-1 flex-col items-center gap-4 text-center">
            <div className="rounded-3xl bg-muted p-4">
              <Upload className="size-5" />
            </div>
            <div className="flex flex-col items-center gap-1 text-center">
              <h2 className="font-medium">Upload Existing Recording</h2>
              <p className="text-sm text-muted-foreground">
                Process an existing recording into a reviewed transcript
              </p>
            </div>
            <RecordingConfigDialog mode="upload" />
          </div>

          <Separator orientation="vertical" />

          <div className="flex flex-1 flex-col items-center gap-4 text-center">
            <div className="rounded-3xl bg-muted p-4">
              <Mic className="size-5" />
            </div>
            <div className="flex flex-col items-center gap-1 text-center">
              <h2 className="font-medium">Start New Recording</h2>
              <p className="text-sm text-muted-foreground">
                Start a live transcription session with your microphone
              </p>
            </div>
            <RecordingConfigDialog mode="record" />
          </div>
        </div>
      </div>
    </>
  );
}
