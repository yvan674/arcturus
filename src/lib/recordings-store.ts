"use client";

import { useSyncExternalStore } from "react";

import { refineRecording } from "./backend/client";
import type {
  RefineResult,
  SpeakerConfig,
  SpeakerRole,
} from "./backend/types";

/**
 * The backend is stateless, so the frontend is the source of truth for the
 * session config, the audio recording, every live event, and the refinement
 * result. This module keeps all of that in memory for the current browser
 * session (persistence comes later).
 */

export interface LiveSegment {
  segmentId: string;
  t0: number | null;
  t1: number | null;
  sourceText: string;
  /** ISO 639-1 code → translated text received so far for that language. */
  translations: Record<string, string>;
  speakerId: string | null;
  role: SpeakerRole | null;
  speakerConfidence: number | null;
  /** False while only deltas have arrived for this segment. */
  completed: boolean;
}

export type RecordingStatus =
  /** Created for a live session that has not started streaming yet. */
  | "new"
  /** Live session in progress. */
  | "live"
  /** Live session over; audio kept locally, not refined yet. */
  | "live-ended"
  /** POST /v1/refine in flight. */
  | "refining"
  /** Refined transcript available. */
  | "refined"
  /** Refinement failed; audio still available for retry. */
  | "refine-error";

export interface RecordingSession {
  id: string;
  title: string;
  createdAt: number;
  speakers: SpeakerConfig[];
  status: RecordingStatus;
  startedVia: "record" | "upload";
  /** Keyed by segment_id — segment.completed upserts, speaker.update patches. */
  liveSegments: Record<string, LiveSegment>;
  /** The recording itself; required for /v1/refine. */
  audioBlob: Blob | null;
  refined: RefineResult | null;
  refineError: string | null;
}

interface StoreState {
  recordings: Record<string, RecordingSession>;
  /** Newest first. */
  order: string[];
}

let state: StoreState = { recordings: {}, order: [] };
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): StoreState {
  return state;
}

const EMPTY_STATE: StoreState = { recordings: {}, order: [] };

function getServerSnapshot(): StoreState {
  return EMPTY_STATE;
}

export function useRecordingsList(): RecordingSession[] {
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  return snapshot.order.map((id) => snapshot.recordings[id]);
}

export function useRecording(id: string): RecordingSession | undefined {
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  return snapshot.recordings[id];
}

const ID_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** 20-char alphanumeric id, matching the Firestore auto-id shape. */
function generateRecordingId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(bytes, (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join("");
}

export function createRecording(input: {
  speakers: SpeakerConfig[];
  startedVia: "record" | "upload";
  audioBlob?: Blob;
}): RecordingSession {
  const now = Date.now();
  const recording: RecordingSession = {
    id: generateRecordingId(),
    title: `Consultation ${new Date(now).toLocaleString(undefined, {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })}`,
    createdAt: now,
    speakers: input.speakers,
    status: "new",
    startedVia: input.startedVia,
    liveSegments: {},
    audioBlob: input.audioBlob ?? null,
    refined: null,
    refineError: null,
  };

  state = {
    recordings: { ...state.recordings, [recording.id]: recording },
    order: [recording.id, ...state.order],
  };
  emit();
  return recording;
}

export function updateRecording(
  id: string,
  patch: Partial<Omit<RecordingSession, "id">>,
): void {
  const existing = state.recordings[id];
  if (!existing) return;

  state = {
    ...state,
    recordings: { ...state.recordings, [id]: { ...existing, ...patch } },
  };
  emit();
}

/** Upsert by segment_id, per the live-event rendering rules. */
export function upsertLiveSegment(
  recordingId: string,
  segment: Partial<LiveSegment> & { segmentId: string },
): void {
  const recording = state.recordings[recordingId];
  if (!recording) return;

  const existing: LiveSegment = recording.liveSegments[segment.segmentId] ?? {
    segmentId: segment.segmentId,
    t0: null,
    t1: null,
    sourceText: "",
    translations: {},
    speakerId: null,
    role: null,
    speakerConfidence: null,
    completed: false,
  };

  updateRecording(recordingId, {
    liveSegments: {
      ...recording.liveSegments,
      [segment.segmentId]: {
        ...existing,
        ...segment,
        // Languages arrive at their own pace: a re-sent segment.completed may
        // still miss a language that already streamed in — merge, don't drop.
        translations: { ...existing.translations, ...segment.translations },
      },
    },
  });
}

/** Append delta text to a segment's source transcript. */
export function appendLiveSegmentSourceText(
  recordingId: string,
  segmentId: string,
  text: string,
): void {
  const existing = state.recordings[recordingId]?.liveSegments[segmentId];
  upsertLiveSegment(recordingId, {
    segmentId,
    sourceText: (existing?.sourceText ?? "") + text,
  });
}

/** Append delta text to a segment's translation for one language. */
export function appendLiveSegmentTranslation(
  recordingId: string,
  segmentId: string,
  language: string,
  text: string,
): void {
  const existing = state.recordings[recordingId]?.liveSegments[segmentId];
  upsertLiveSegment(recordingId, {
    segmentId,
    translations: { [language]: (existing?.translations[language] ?? "") + text },
  });
}

/**
 * Runs the offline refinement pass and stores the result. Safe to call from
 * anywhere; the store keeps working across navigation.
 */
export async function startRefinement(recordingId: string): Promise<void> {
  const recording = state.recordings[recordingId];
  if (!recording?.audioBlob || recording.status === "refining") return;

  updateRecording(recordingId, { status: "refining", refineError: null });

  try {
    const refined = await refineRecording(
      recording.audioBlob,
      recording.speakers,
    );
    updateRecording(recordingId, { status: "refined", refined });
  } catch (error) {
    updateRecording(recordingId, {
      status: "refine-error",
      refineError:
        error instanceof Error ? error.message : "Refinement failed.",
    });
  }
}
