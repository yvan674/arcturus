"use client";

import { TriangleAlert } from "lucide-react";

import { languageLabel } from "@/components/speaker-config-form";
import { formatAudioTime, roleMeta } from "@/components/speaker-meta";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import type { RefinedTurn } from "@/lib/backend/types";
import {
  startRefinement,
  type RecordingSession,
} from "@/lib/recordings-store";
import { cn } from "@/lib/utils";

/**
 * The reviewed (offline-refined) transcript: one card per speaking turn,
 * original text plus clearly distinct translations, and reviewer notes.
 */
export default function ReviewRecordingView({
  recording,
}: {
  recording: RecordingSession;
}) {
  if (recording.status === "refining") {
    return (
      <CenteredCard
        title="Refining recording…"
        description="Transcribing, attributing speakers and translating. This can take up to a minute for long consultations."
      >
        <Spinner className="size-6" />
      </CenteredCard>
    );
  }

  if (recording.status === "refine-error") {
    return (
      <CenteredCard
        title="Refinement failed"
        description={recording.refineError ?? "Something went wrong."}
      >
        {recording.audioBlob && (
          <Button onClick={() => void startRefinement(recording.id)}>
            Try again
          </Button>
        )}
      </CenteredCard>
    );
  }

  if (!recording.refined) {
    return (
      <CenteredCard
        title="No reviewed transcript yet"
        description={
          recording.audioBlob
            ? "The recording has not been processed yet."
            : "Finish the live session first — the recording is then processed into a reviewed transcript."
        }
      >
        {recording.audioBlob && (
          <Button onClick={() => void startRefinement(recording.id)}>
            Process recording
          </Button>
        )}
      </CenteredCard>
    );
  }

  const { turns, notes, detected_language, duration } = recording.refined;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 pb-24">
      <p className="text-xs text-muted-foreground">
        Detected language: {detected_language} · Duration:{" "}
        {formatAudioTime(duration)} · {turns.length} turns
      </p>

      {notes.length > 0 && (
        <div className="flex flex-col gap-2 rounded-3xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <div className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-300">
            <TriangleAlert className="size-4" />
            Review notes
          </div>
          <ul className="ml-5 list-disc space-y-1 text-foreground/80">
            {notes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </div>
      )}

      {turns.map((turn, index) => (
        <TurnCard key={index} turn={turn} />
      ))}
    </div>
  );
}

function TurnCard({ turn }: { turn: RefinedTurn }) {
  const meta = roleMeta(turn.role);
  const Icon = meta.icon;

  return (
    <Card size="sm" className="shadow-sm">
      <CardHeader>
        <CardTitle
          className={cn(
            "flex items-center gap-1.5 text-xs font-medium",
            meta.labelClass,
          )}
        >
          <Icon className="size-3.5" />
          {meta.label}
          <span className="font-normal text-muted-foreground">
            · {formatAudioTime(turn.t0)}–{formatAudioTime(turn.t1)}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-base leading-snug text-foreground">{turn.text}</p>
        {turn.translations.map((translation) => (
          <p
            key={translation.language}
            className="rounded-2xl bg-muted/60 px-3 py-2 text-sm leading-snug text-muted-foreground italic"
          >
            <span className="mr-1.5 rounded-full bg-foreground/5 px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase not-italic">
              {languageLabel(translation.language)}
            </span>
            {translation.text}
          </p>
        ))}
      </CardContent>
    </Card>
  );
}

function CenteredCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <Card size="sm" className="mx-auto mt-8 w-full max-w-md text-center">
      <CardHeader className="justify-items-center">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {children && (
        <CardContent className="flex justify-center">{children}</CardContent>
      )}
    </Card>
  );
}
