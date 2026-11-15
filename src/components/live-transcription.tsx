"use client";

import { useEffect, useMemo, useRef } from "react";
import { Languages, Mic, Square } from "lucide-react";

import { formatAudioTime, speakerTint } from "@/components/speaker-meta";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useLiveSession } from "@/hooks/use-live-session";
import { useTypewriterText } from "@/hooks/use-typewriter-text";
import type { MedicalTerm } from "@/lib/backend/types";
import { languageLabel } from "@/lib/languages";
import {
  startRefinement,
  type LiveSegment,
  type LiveTurn,
  type RecordingSession,
} from "@/lib/recordings-store";
import { cn } from "@/lib/utils";

/**
 * The live session view: one bubble per speech turn, in audio order. A bubble
 * opens on turn.started (before any text) and its segments type into it in
 * place as source deltas, confirmations and translations arrive. Turns are not
 * speaker-attributed, so a turn whose segments carry different speaker_ids is
 * split into one bubble per speaker run. Bubbles are tinted by the
 * session-stable speaker_id but all stay on the same side — roles are only
 * resolved in the refined transcript, and a segment may be re-attributed
 * mid-session, which just re-tints its bubble.
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

  const sessionOver =
    recording.status === "live-ended" ||
    status === "ended" ||
    status === "error";
  const sessionActive = status === "live" || status === "stopping";

  const bubbles = useMemo(
    () =>
      buildBubbles(recording.liveSegments, recording.liveTurns ?? {}).filter(
        // A turn with no text yet shows a typing indicator while the session
        // runs; if the session ended before its turn.ended, drop it.
        (bubble) => bubble.segments.length > 0 || (sessionActive && bubble.open),
      ),
    [recording.liveSegments, recording.liveTurns, sessionActive],
  );

  const bottomRef = useRef<HTMLDivElement>(null);
  const textLength = bubbles.reduce(
    (n, bubble) =>
      bubble.segments.reduce((m, s) => m + s.sourceText.length, n),
    0,
  );
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [bubbles.length, textLength]);

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

      {bubbles.length === 0 && status === "live" && (
        <EmptyState>
          Listening — speech will appear here as bubbles.
        </EmptyState>
      )}

      <div className="flex flex-col gap-3">
        {bubbles.map((bubble) => (
          <TurnBubble key={bubble.key} bubble={bubble} />
        ))}
      </div>

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

interface Bubble {
  key: string;
  t0: number | null;
  speakerId: string | null;
  /** The turn may still gain segments (no turn.ended yet). */
  open: boolean;
  segments: LiveSegment[];
}

/**
 * Groups segments into turn bubbles, ordered by audio time. Segments finish
 * out of order, so they're sorted by t0 within the turn; those still without
 * a t0 (not yet confirmed) go last. Recordings saved before turns existed
 * have no turnId, so each completed segment becomes its own bubble.
 */
function buildBubbles(
  segments: Record<string, LiveSegment>,
  turns: Record<string, LiveTurn>,
): Bubble[] {
  const groups = new Map<
    string,
    { t0: number | null; open: boolean; segments: LiveSegment[] }
  >();

  for (const turn of Object.values(turns)) {
    groups.set(turn.turnId, { t0: turn.t0, open: !turn.ended, segments: [] });
  }

  for (const segment of Object.values(segments)) {
    const visible = segment.completed || segment.sourceText.length > 0;
    if (!segment.turnId) {
      // Legacy segment: only completed ones were ever shown as bubbles.
      if (segment.completed) {
        groups.set(`segment:${segment.segmentId}`, {
          t0: segment.t0,
          open: false,
          segments: [segment],
        });
      }
      continue;
    }
    let group = groups.get(segment.turnId);
    if (!group) {
      group = { t0: null, open: false, segments: [] };
      groups.set(segment.turnId, group);
    }
    if (visible) group.segments.push(segment);
  }

  const bubbles: Bubble[] = [];
  const orderedGroups = [...groups.entries()]
    .map(([key, group]) => {
      group.segments.sort(
        (a, b) => (a.t0 ?? Infinity) - (b.t0 ?? Infinity),
      );
      return {
        key,
        ...group,
        t0: group.t0 ?? group.segments[0]?.t0 ?? null,
      };
    })
    .sort((a, b) => (a.t0 ?? Infinity) - (b.t0 ?? Infinity));

  for (const group of orderedGroups) {
    if (group.segments.length === 0) {
      bubbles.push({
        key: group.key,
        t0: group.t0,
        speakerId: null,
        open: group.open,
        segments: [],
      });
      continue;
    }

    // Split by speaker: a segment without a speaker yet joins the current
    // run; a different known speaker starts a new bubble.
    const runs: Bubble[] = [];
    for (const segment of group.segments) {
      const run = runs.at(-1);
      if (
        run &&
        (segment.speakerId === null ||
          run.speakerId === null ||
          segment.speakerId === run.speakerId)
      ) {
        run.segments.push(segment);
        run.speakerId ??= segment.speakerId;
      } else {
        runs.push({
          // The turn id keeps the first run's bubble mounted across splits.
          key: runs.length === 0 ? group.key : `${group.key}:${segment.segmentId}`,
          t0: runs.length === 0 ? group.t0 : segment.t0,
          speakerId: segment.speakerId,
          open: false,
          segments: [segment],
        });
      }
    }
    const lastRun = runs.at(-1);
    if (lastRun) lastRun.open = group.open;
    bubbles.push(...runs);
  }

  return bubbles;
}

function TurnBubble({ bubble }: { bubble: Bubble }) {
  return (
    <div
      className={cn(
        // Speaker labels can be revised while the session runs, so the tint
        // animates rather than snapping to the new colour.
        "flex max-w-[85%] flex-col gap-1 self-start rounded-3xl rounded-bl-md px-4 py-3 shadow-sm ring-1 transition-colors duration-300",
        speakerTint(bubble.speakerId),
      )}
    >
      {bubble.t0 !== null && (
        <div className="text-xs font-medium text-muted-foreground">
          {formatAudioTime(bubble.t0)}
        </div>
      )}
      {bubble.segments.length === 0 ? (
        <TypingIndicator />
      ) : (
        <div className="flex flex-col gap-2">
          {bubble.segments.map((segment) => (
            <SegmentContent key={segment.segmentId} segment={segment} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One segment inside a turn bubble. Source and translations are overwritten
 * in place as revisions arrive (and once more when the LLM-corrected final
 * lands), so each line is typed through useTypewriterText rather than
 * rendered from the raw store value. Translations stay visibly provisional
 * until segment.completed.
 */
function SegmentContent({ segment }: { segment: LiveSegment }) {
  const sourceText = useTypewriterText(segment.sourceText);
  const provisional = !segment.completed;

  return (
    <div className="flex flex-col gap-1">
      <p className="text-base leading-snug">
        <HighlightedText
          text={sourceText}
          terms={segment.medicalTerms ?? []}
        />
      </p>
      {sortedTranslations(segment.translations).map(([language, text]) => (
        <AnimatedTranslationLine
          key={language}
          language={language}
          text={text}
          provisional={provisional}
        />
      ))}
      {segment.sourceConfirmed && provisional && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Spinner className="size-3" /> Translating…
        </p>
      )}
      {segment.translationStatus === "failed" && (
        <p className="text-sm leading-snug text-destructive italic">
          Translation failed for this segment.
        </p>
      )}
    </div>
  );
}

/**
 * Source text with the LLM's possibly-misheard medical terms marked. The
 * offsets refer to the text the server analysed, which may not be what's on
 * screen (a newer hypothesis, or a typewriter animation mid-way), so each term
 * falls back to a text search and is skipped if it can't be found.
 */
function HighlightedText({
  text,
  terms,
}: {
  text: string;
  terms: MedicalTerm[];
}) {
  const ranges = resolveTermRanges(text, terms);
  if (ranges.length === 0) return text;

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(
      <mark
        key={start}
        title="Possible medical term — may have been misheard. The refined transcript will check it."
        className="rounded-sm bg-amber-400/25 px-0.5 text-inherit underline decoration-amber-500 decoration-dotted underline-offset-4"
      >
        {text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

/** Non-overlapping [start, end) UTF-16 ranges of the terms found in `text`. */
function resolveTermRanges(
  text: string,
  terms: MedicalTerm[],
): [number, number][] {
  const ranges: [number, number][] = [];
  for (const term of terms) {
    if (!term.text) continue;
    let start = codePointToUtf16Index(text, term.start);
    let end = codePointToUtf16Index(text, term.end);
    if (start === null || end === null || text.slice(start, end) !== term.text) {
      const found = text.indexOf(term.text);
      if (found === -1) continue;
      start = found;
      end = found + term.text.length;
    }
    ranges.push([start, end]);
  }

  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range[0] < last[1]) continue;
    merged.push(range);
  }
  return merged;
}

/** The backend counts offsets in code points; JS strings index UTF-16 units. */
function codePointToUtf16Index(text: string, codePoints: number): number | null {
  let index = 0;
  for (let i = 0; i < codePoints; i++) {
    if (index >= text.length) return null;
    index += (text.codePointAt(index) ?? 0) > 0xffff ? 2 : 1;
  }
  return index;
}

function TypingIndicator() {
  return (
    <div
      className="flex h-6 items-center gap-1"
      aria-label="Someone is speaking"
    >
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  );
}

function AnimatedTranslationLine({
  language,
  text,
  provisional,
}: {
  language: string;
  text: string;
  provisional: boolean;
}) {
  const animated = useTypewriterText(text);
  return (
    <TranslationLine
      language={language}
      text={animated}
      provisional={provisional}
    />
  );
}

function TranslationLine({
  language,
  text,
  provisional = false,
}: {
  language: string;
  text: string;
  provisional?: boolean;
}) {
  return (
    <p
      className={cn(
        "text-sm leading-snug text-muted-foreground italic transition-opacity duration-300",
        provisional && "opacity-60",
      )}
    >
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
