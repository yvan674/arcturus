"use client";

import { useState } from "react";
import Link from "next/link";

import LiveTranscriptionView from "@/components/live-transcription";
import ReviewRecordingView from "@/components/review-recording";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { buttonVariants } from "@/components/ui/button";
import { useRecordingId } from "@/lib/get-recording-id";
import {
  useRecording,
  type RecordingSession,
} from "@/lib/recordings-store";

type TabValue = "live" | "processed";

function defaultTab(recording: RecordingSession): TabValue {
  if (recording.startedVia === "upload") return "processed";
  if (
    recording.status === "refining" ||
    recording.status === "refined" ||
    recording.status === "refine-error"
  ) {
    return "processed";
  }
  return "live";
}

export default function RecordingPage() {
  const recordingId = useRecordingId();
  const recording = useRecording(recordingId);

  const [tab, setTab] = useState<TabValue | null>(null);
  const activeTab = tab ?? (recording ? defaultTab(recording) : "live");

  if (!recording) {
    return (
      <>
        <header className="sticky top-0 flex h-12 shrink-0 items-center gap-2 border-b bg-background p-4">
          <h1 className="text-base font-medium text-foreground">
            Recording not found
          </h1>
        </header>
        <div className="mx-auto mt-12 flex max-w-md flex-col items-center gap-4 text-center text-sm text-muted-foreground">
          <p>
            This recording is not available. Recordings currently live in
            memory only, so they are lost when the page reloads.
          </p>
          <Link
            href="/recordings"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Create a new recording
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center justify-between gap-2 border-b bg-background p-4">
        <h1 className="text-base font-medium text-foreground">
          {recording.title}
        </h1>
        <h2 className="text-base text-muted-foreground">
          {new Date(recording.createdAt).toLocaleString(undefined, {
            weekday: "long",
            day: "numeric",
            month: "long",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </h2>
      </header>
      <Tabs
        value={activeTab}
        onValueChange={(value) => setTab(value as TabValue)}
        className="w-full p-4"
      >
        <TabsList className="mx-auto w-[50dvw]">
          <TabsTrigger value="live">Live Transcription</TabsTrigger>
          <TabsTrigger value="processed">Review Recording</TabsTrigger>
        </TabsList>
        <TabsContent value="live" className="pt-4">
          <LiveTranscriptionView
            recording={recording}
            onRefine={() => setTab("processed")}
          />
        </TabsContent>
        <TabsContent value="processed" className="pt-4">
          <ReviewRecordingView recording={recording} />
        </TabsContent>
      </Tabs>
    </>
  );
}
