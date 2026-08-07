"use client";

import { useEffect, useMemo, useRef } from "react";
import { Languages, Mic, Square } from "lucide-react";

import { formatAudioTime, speakerTint } from "@/components/speaker-meta";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useLiveSession } from "@/hooks/use-live-session";
import { languageLabel } from "@/lib/languages";
import {
  startRefinement,
  type LiveSegment,
  type RecordingSession,
} from "@/lib/recordings-store";
import { cn } from "@/lib/utils";

/**
 * The live session view: one bubble per completed segment, in audio order.
 * Bubbles are tinted by the session-stable speaker_id but all stay on the same
 * side — roles are only resolved in the refined transcript, and a segment may
 * be re-attributed mid-session, which just re-tints its bubble. Segments still
 * in flight stream into a buffer at the bottom and become bubbles once
 * segment.completed arrives.
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
    // Recordings created before target-language selection was added retain the
    // original behavior: translate into every configured speaker language.
    recording.targetLanguages ?? [
      ...new Set(recording.speakers.flatMap((speaker) => speaker.languages)),
    ],
    recording.mockAudio ?? false,
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

  const { completed, pending } = useMemo(() => {
    const all = Object.values(recording.liveSegments);
    return {
      completed: all
        .filter((s) => s.completed)
        .sort((a, b) => (a.t0 ?? 0) - (b.t0 ?? 0)),
      pending: all.filter((s) => !s.completed && s.sourceText.length > 0),
    };
  }, [recording.liveSegments]);

  const bottomRef = useRef<HTMLDivElement>(null);
  const pendingTextLength = pending.reduce(
    (n, s) => n + s.sourceText.length,
    0,
  );
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [completed.length, pendingTextLength]);

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
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <SessionToolbar
        status={status}
        mockAudio={recording.mockAudio ?? false}
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

      {completed.length === 0 && pending.length === 0 && status === "live" && (
        <EmptyState>
          Listening — speech will appear here as bubbles.
        </EmptyState>
      )}

      <div className="flex flex-col gap-3">
        {completed.map((segment) => (
          <SegmentBubble key={segment.segmentId} segment={segment} />
        ))}
      </div>

      {(status === "live" || status === "stopping") && (
        <TranscriptionBuffer pending={pending} />
      )}
      <div ref={bottomRef} className="pb-20" />
    </div>
  );
}

function SessionToolbar({
  status,
  mockAudio,
  error,
  elapsedSeconds,
  canRefine,
  onStart,
  onStop,
  onRefine,
}: {
  status: ReturnType<typeof useLiveSession>["status"];
  mockAudio: boolean;
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
        {mockAudio && (
          <span className="rounded-full bg-foreground/5 px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase text-muted-foreground">
            Mock audio
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
  const translations = sortedTranslations(segment.translations);

  return (
    <div
      className={cn(
        // Speaker labels can be revised while the session runs, so the tint
        // animates rather than snapping to the new colour.
        "flex max-w-[85%] flex-col gap-1 self-start rounded-3xl rounded-bl-md px-4 py-3 shadow-sm ring-1 transition-colors duration-300",
        speakerTint(segment.speakerId),
      )}
    >
      {segment.t0 !== null && (
        <div className="text-xs font-medium text-muted-foreground">
          {formatAudioTime(segment.t0)}
        </div>
      )}
      <p className="text-base leading-snug">{segment.sourceText}</p>
      {translations.map(([language, text]) => (
        <TranslationLine key={language} language={language} text={text} />
      ))}
    </div>
  );
}

/**
 * The buffer at the bottom of the screen: segments the server is still
 * transcribing, updating live as source and translation deltas arrive.
 */
function TranscriptionBuffer({ pending }: { pending: LiveSegment[] }) {
  return (
    <div className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-3xl border bg-background/95 p-4 shadow-md backdrop-blur">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Mic className={cn("size-3", pending.length > 0 && "animate-pulse")} />
        {pending.length > 0 ? "Transcribing…" : "Listening…"}
      </div>
      {pending.map((segment) => (
        <div key={segment.segmentId} className="flex flex-col gap-1">
          <p className="text-base leading-snug">{segment.sourceText}</p>
          {sortedTranslations(segment.translations).map(([language, text]) => (
            <TranslationLine key={language} language={language} text={text} />
          ))}
        </div>
      ))}
    </div>
  );
}

function TranslationLine({
  language,
  text,
}: {
  language: string;
  text: string;
}) {
  return (
    <p className="text-sm leading-snug text-muted-foreground italic">
      <span className="mr-1.5 rounded-full bg-foreground/5 px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase not-italic">
        {languageLabel(language)}
      </span>
      {text}
    </p>
  );
}

function sortedTranslations(
  translations: Record<string, string>,
): [string, string][] {
  return Object.entries(translations)
    .filter(([, text]) => text.length > 0)
    .sort(([a], [b]) => a.localeCompare(b));
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-dashed p-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
