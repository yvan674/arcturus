"use client";

import { useEffect, useMemo, useRef } from "react";
import { Languages, Mic, Square } from "lucide-react";

import { formatAudioTime, roleMeta } from "@/components/speaker-meta";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useLiveSession } from "@/hooks/use-live-session";
import { languageLabel } from "@/components/speaker-config-form";
import {
  startRefinement,
  type LiveSegment,
  type RecordingSession,
} from "@/lib/recordings-store";
import { cn } from "@/lib/utils";

/**
 * The live session view: translation-app style bubbles that pop up as
 * speakers talk. Segments stay hidden until the backend can attribute them
 * to a speaker.
 */
export default function LiveTranscriptionView({
  recording,
  onRefine,
}: {
  recording: RecordingSession;
  onRefine: () => void;
}) {
  const { status, error, elapsedSeconds, start, stop } = useLiveSession(
    recording.id,
    recording.speakers,
  );

  // A session started from "Start Recording" begins streaming right away.
  const autostarted = useRef(false);
  useEffect(() => {
    if (
      !autostarted.current &&
      recording.startedVia === "record" &&
      recording.status === "new"
    ) {
      autostarted.current = true;
      void start();
    }
  }, [recording.startedVia, recording.status, start]);

  const segments = useMemo(() => {
    const all = Object.values(recording.liveSegments);
    return {
      attributed: all
        .filter((s) => s.completed && s.speakerId !== null)
        .sort((a, b) => (a.t0 ?? 0) - (b.t0 ?? 0)),
      unattributedCount: all.filter(
        (s) => s.completed && s.speakerId === null,
      ).length,
      transcribing: all.some((s) => !s.completed && s.sourceText.length > 0),
    };
  }, [recording.liveSegments]);

  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [segments.attributed.length, segments.transcribing]);

  const sessionOver =
    recording.status === "live-ended" ||
    status === "ended" ||
    status === "error";

  if (recording.startedVia === "upload") {
    return (
      <EmptyState>
        This recording was uploaded, so there is no live session for it. The
        reviewed transcript is in the Review Recording tab.
      </EmptyState>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 pb-24">
      <SessionToolbar
        status={status}
        error={error}
        elapsedSeconds={elapsedSeconds}
        canRefine={sessionOver && recording.audioBlob !== null}
        onStart={() => void start()}
        onStop={stop}
        onRefine={() => {
          void startRefinement(recording.id);
          onRefine();
        }}
      />

      {segments.attributed.length === 0 && status === "live" && (
        <EmptyState>
          Listening — attributed speech will appear here as bubbles.
        </EmptyState>
      )}

      <div className="flex flex-col gap-3">
        {segments.attributed.map((segment) => (
          <SegmentBubble key={segment.segmentId} segment={segment} />
        ))}

        {segments.transcribing && status === "live" && (
          <div className="flex animate-pulse items-center gap-2 self-center rounded-full bg-muted px-4 py-1.5 text-xs text-muted-foreground">
            <Mic className="size-3" />
            Transcribing…
          </div>
        )}

        {segments.unattributedCount > 0 && (
          <p className="self-center text-xs text-muted-foreground">
            {segments.unattributedCount} segment
            {segments.unattributedCount > 1 ? "s" : ""} waiting for speaker
            attribution
          </p>
        )}
      </div>
      <div ref={bottomRef} />
    </div>
  );
}

function SessionToolbar({
  status,
  error,
  elapsedSeconds,
  canRefine,
  onStart,
  onStop,
  onRefine,
}: {
  status: ReturnType<typeof useLiveSession>["status"];
  error: string | null;
  elapsedSeconds: number;
  canRefine: boolean;
  onStart: () => void;
  onStop: () => void;
  onRefine: () => void;
}) {
  return (
    <div className="sticky top-14 z-10 flex flex-col gap-2 rounded-3xl border bg-background/95 p-3 shadow-sm backdrop-blur">
      <div className="flex items-center gap-3">
        {status === "connecting" && (
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner className="size-4" /> Connecting…
          </span>
        )}
        {status === "live" && (
          <span className="flex items-center gap-2 text-sm font-medium">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex size-2.5 rounded-full bg-red-500" />
            </span>
            Recording · {formatAudioTime(elapsedSeconds)}
          </span>
        )}
        {status === "stopping" && (
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner className="size-4" /> Finishing session…
          </span>
        )}
        {(status === "ended" || status === "error") && (
          <span className="text-sm text-muted-foreground">Session ended</span>
        )}
        {status === "idle" && (
          <span className="text-sm text-muted-foreground">
            Ready to start the live session
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {status === "idle" && (
            <Button size="sm" onClick={onStart}>
              <Mic data-icon="inline-start" />
              Start session
            </Button>
          )}
          {status === "live" && (
            <Button size="sm" variant="destructive" onClick={onStop}>
              <Square data-icon="inline-start" />
              Stop
            </Button>
          )}
          {canRefine && (
            <Button size="sm" onClick={onRefine}>
              <Languages data-icon="inline-start" />
              Refine recording
            </Button>
          )}
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function SegmentBubble({ segment }: { segment: LiveSegment }) {
  const meta = roleMeta(segment.role);
  const translations = Object.entries(segment.translations)
    .filter(([, text]) => text.length > 0)
    .sort(([a], [b]) => a.localeCompare(b));
  const Icon = meta.icon;
  const lowConfidence =
    segment.speakerConfidence !== null && segment.speakerConfidence < 0.5;

  return (
    <div
      className={cn(
        "flex max-w-[80%] flex-col gap-1 rounded-3xl px-4 py-3 shadow-sm ring-1 ring-foreground/5",
        meta.bubbleClass,
        meta.align === "start" && "self-start rounded-bl-md",
        meta.align === "end" && "self-end rounded-br-md",
        meta.align === "center" && "max-w-[70%] self-center",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-1.5 text-xs font-medium",
          meta.labelClass,
        )}
      >
        <Icon className="size-3.5" />
        {meta.label}
        {lowConfidence && (
          <span className="font-normal text-muted-foreground">
            · uncertain
          </span>
        )}
        {segment.t0 !== null && (
          <span className="font-normal text-muted-foreground">
            · {formatAudioTime(segment.t0)}
          </span>
        )}
      </div>
      <p className="text-base leading-snug">{segment.sourceText}</p>
      {translations.map(([language, text]) => (
        <p
          key={language}
          className="mt-1 border-t border-foreground/10 pt-2 text-sm leading-snug text-muted-foreground italic"
        >
          <span className="mr-1.5 rounded-full bg-foreground/5 px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase not-italic">
            {languageLabel(language)}
          </span>
          {text}
        </p>
      ))}
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-dashed p-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
