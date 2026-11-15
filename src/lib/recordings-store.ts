"use client";

import { useSyncExternalStore } from "react";

import { pollRefinement, submitRefinement } from "./backend/client";
import type {
  MedicalTerm,
  RefineJobPhase,
  RefineJobStep,
  RefineResult,
  SpeakerConfig,
} from "./backend/types";
import { getTerminology } from "./terminology-store";

/**
 * The backend is stateless, so the frontend is the source of truth for the
 * session config, the audio recording, every live event, and the refinement
 * result. The in-memory state is the React-facing cache; complete recording
 * objects (including audio Blobs) are persisted in IndexedDB, while the small
 * ordered id index is mirrored in localStorage.
 */

export interface LiveSegment {
  segmentId: string;
  /**
   * The speech turn (bubble) this segment belongs to. Absent on recordings
   * saved before the backend emitted turns — those render one bubble per
   * segment.
   */
  turnId?: string | null;
  t0: number | null;
  t1: number | null;
  sourceText: string;
  /** Last applied transcript.source.delta revision; -1 before any arrives. */
  sourceRevision: number;
  /**
   * Set by transcript.source.completed: speech recognition is done and the
   * LLM correction/translation is running. Later deltas and partial
   * translations are ignored. Absent on recordings saved before this existed.
   */
  sourceConfirmed?: boolean;
  /**
   * ISO 639-1 code → translated text for that language. Empty while the
   * segment is only a live source hypothesis; set wholesale by
   * segment.completed or transcript.translation.update, which always carry
   * the full map for that segment.
   */
  translations: Record<string, string>;
  /**
   * Last applied transcript.translation.update revision; -1 before any
   * arrives. A separate counter from sourceRevision — the two update
   * independently and must never be conflated.
   */
  translationRevision: number;
  /** Set by segment.completed; null until then. */
  translationStatus: "completed" | "failed" | null;
  /** Anonymous voice label (e.g. voice_0), stable within the session. */
  speakerId: string | null;
  speakerConfidence: number | null;
  /**
   * Terms the LLM flagged as possibly misheard. Offsets refer to the source
   * text of the event that delivered them, which may differ from the text on
   * screen — resolve against the displayed text before highlighting.
   */
  medicalTerms?: MedicalTerm[];
  /** False until segment.completed arrives for this segment. */
  completed: boolean;
}

/** One VAD speech turn — rendered as a speech bubble from turn.started on. */
export interface LiveTurn {
  turnId: string;
  /** Null only if turn.ended arrived for a turn we never saw start. */
  t0: number | null;
  /** turn.ended arrived: no further segments will join this turn. */
  ended: boolean;
}

export type RecordingStatus =
  /** Created for a live session that has not started streaming yet. */
  | "new"
  /** Live session in progress. */
  | "live"
  /** Live session over; audio kept locally, not refined yet. */
  | "live-ended"
  /** Audio is being sent to POST /v1/refine. */
  | "uploading"
  /** The submitted refinement job is queued or running. */
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
  /** ISO 639-1 codes used for translated live captions. */
  targetLanguages: string[];
  status: RecordingStatus;
  startedVia: "record" | "upload";
  /** Dev-only: stream res/test-45.mp3 instead of capturing a microphone. */
  mockAudio?: boolean;
  /** Keyed by segment_id — segment.completed upserts, speaker.update patches. */
  liveSegments: Record<string, LiveSegment>;
  /**
   * Keyed by turn_id. Turns that ended without any segment (noise) are
   * removed. Absent on recordings saved before the backend emitted turns.
   */
  liveTurns?: Record<string, LiveTurn>;
  /** The recording itself; required for /v1/refine. */
  audioBlob: Blob | null;
  audioFileName: string | null;
  refineJobId: string | null;
  refinePhase: RefineJobPhase | null;
  /** The diarizer's internal step; only set while the phase is diarizing. */
  refineStep: RefineJobStep | null;
  refineMessage: string | null;
  refineProgress: number | null;
  /** Whether this job was submitted with a terminology list (extra phases run). */
  refineTerminologyEnabled: boolean;
  /** Progress inside the current phase; null in single-call phases. */
  refineCompletedUnits: number | null;
  refineTotalUnits: number | null;
  refined: RefineResult | null;
  refineError: string | null;
}

interface StoreState {
  recordings: Record<string, RecordingSession>;
  /** Newest first. */
  order: string[];
  hydrated: boolean;
}

const DATABASE_NAME = "arcturus-recordings";
const DATABASE_VERSION = 1;
const RECORDINGS_OBJECT_STORE = "recordings";
const ORDER_STORAGE_KEY = "arcturus.recordings.order.v1";
const SCHEMA_STORAGE_KEY = "arcturus.recordings.schema";

let state: StoreState = { recordings: {}, order: [], hydrated: false };
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

const EMPTY_STATE: StoreState = {
  recordings: {},
  order: [],
  hydrated: false,
};

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

export function useRecordingsHydrated(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
    .hydrated;
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

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(RECORDINGS_OBJECT_STORE)) {
        database.createObjectStore(RECORDINGS_OBJECT_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const databasePromise =
  typeof indexedDB === "undefined" ? null : openDatabase();

function readStoredOrder(): string[] {
  try {
    const value = localStorage.getItem(ORDER_STORAGE_KEY);
    if (!value) return [];
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

function persistOrder(): void {
  try {
    localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(state.order));
    localStorage.setItem(SCHEMA_STORAGE_KEY, String(DATABASE_VERSION));
  } catch (error) {
    console.warn("Could not persist the recordings index.", error);
  }
}

function getAllPersistedRecordings(
  database: IDBDatabase,
): Promise<RecordingSession[]> {
  return new Promise((resolve, reject) => {
    const request = database
      .transaction(RECORDINGS_OBJECT_STORE, "readonly")
      .objectStore(RECORDINGS_OBJECT_STORE)
      .getAll();
    request.onsuccess = () => resolve(request.result as RecordingSession[]);
    request.onerror = () => reject(request.error);
  });
}

function persistRecording(recording: RecordingSession): void {
  if (!databasePromise) return;

  void databasePromise
    .then(
      (database) =>
        new Promise<void>((resolve, reject) => {
          const transaction = database.transaction(
            RECORDINGS_OBJECT_STORE,
            "readwrite",
          );
          transaction.objectStore(RECORDINGS_OBJECT_STORE).put(recording);
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
        }),
    )
    .catch((error) => {
      console.warn("Could not persist recording.", error);
    });
}

async function hydrateFromStorage(): Promise<void> {
  if (!databasePromise) {
    state = { ...state, hydrated: true };
    emit();
    return;
  }

  try {
    const persisted = await getAllPersistedRecordings(await databasePromise);
    const persistedRecordings = Object.fromEntries(
      persisted.map((recording) => [recording.id, recording]),
    );
    const storedOrder = readStoredOrder();
    const missingFromOrder = persisted
      .filter((recording) => !storedOrder.includes(recording.id))
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((recording) => recording.id);

    // Entries created while IndexedDB was loading take precedence.
    const recordings = { ...persistedRecordings, ...state.recordings };
    const order = [
      ...state.order,
      ...storedOrder,
      ...missingFromOrder,
    ].filter(
      (id, index, ids) =>
        recordings[id] !== undefined && ids.indexOf(id) === index,
    );

    state = { recordings, order, hydrated: true };
    persistOrder();
  } catch (error) {
    console.warn("Could not load persisted recordings.", error);
    state = { ...state, hydrated: true };
  }

  emit();
}

if (typeof window !== "undefined") {
  void hydrateFromStorage();
  void navigator.storage?.persist?.().catch(() => false);
}

export function createRecording(input: {
  speakers: SpeakerConfig[];
  targetLanguages: string[];
  startedVia: "record" | "upload";
  audioBlob?: Blob;
  audioFileName?: string;
  mockAudio?: boolean;
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
    targetLanguages: input.targetLanguages,
    status: "new",
    startedVia: input.startedVia,
    mockAudio: input.mockAudio ?? false,
    liveSegments: {},
    liveTurns: {},
    audioBlob: input.audioBlob ?? null,
    audioFileName: input.audioFileName ?? null,
    refineJobId: null,
    refinePhase: null,
    refineStep: null,
    refineMessage: null,
    refineProgress: null,
    refineTerminologyEnabled: false,
    refineCompletedUnits: null,
    refineTotalUnits: null,
    refined: null,
    refineError: null,
  };

  state = {
    ...state,
    recordings: { ...state.recordings, [recording.id]: recording },
    order: [recording.id, ...state.order],
  };
  persistOrder();
  persistRecording(recording);
  emit();
  return recording;
}

export function updateRecording(
  id: string,
  patch: Partial<Omit<RecordingSession, "id">>,
): void {
  const existing = state.recordings[id];
  if (!existing) return;

  const updated = { ...existing, ...patch };
  state = {
    ...state,
    recordings: { ...state.recordings, [id]: updated },
  };
  persistRecording(updated);
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
    turnId: null,
    t0: null,
    t1: null,
    sourceText: "",
    sourceRevision: -1,
    sourceConfirmed: false,
    translations: {},
    translationRevision: -1,
    translationStatus: null,
    speakerId: null,
    speakerConfidence: null,
    medicalTerms: [],
    completed: false,
  };

  // segment.completed always carries the full, authoritative translations
  // map for that segment (correction + every requested language come from
  // one chat-completions call) — replace wholesale, never merge.
  const translations = segment.translations
    ? { ...segment.translations }
    : existing.translations;

  updateRecording(recordingId, {
    liveSegments: {
      ...recording.liveSegments,
      [segment.segmentId]: {
        ...existing,
        ...segment,
        translations,
      },
    },
  });
}

/**
 * Set a segment's live source hypothesis from transcript.source.delta.
 * `text` is the latest full hypothesis, not an increment — replace, don't
 * append, since progressive Whisper hypotheses can revise earlier words.
 * Revisions increase per segment; a stale or repeated revision is dropped.
 */
export function setLiveSegmentSourceText(
  recordingId: string,
  segmentId: string,
  turnId: string,
  revision: number,
  text: string,
): void {
  const existing = state.recordings[recordingId]?.liveSegments[segmentId];
  // transcript.source.completed / segment.completed already carried the
  // confirmed text; late deltas are stale.
  if (existing?.completed || existing?.sourceConfirmed) return;
  if (existing && revision <= existing.sourceRevision) return;
  upsertLiveSegment(recordingId, {
    segmentId,
    turnId,
    sourceText: text,
    sourceRevision: revision,
  });
}

/**
 * Apply transcript.source.completed: the confirmed STT text, timing and
 * current speaker, sent before the LLM correction/translation. Provisional
 * translations are kept (still shown as provisional) until segment.completed.
 */
export function confirmLiveSegmentSource(
  recordingId: string,
  segment: {
    segmentId: string;
    turnId: string;
    sourceText: string;
    t0: number;
    t1: number;
    speakerId: string | null;
    speakerConfidence: number | null;
  },
): void {
  const existing = state.recordings[recordingId]?.liveSegments[segment.segmentId];
  if (existing?.completed) return;
  upsertLiveSegment(recordingId, { ...segment, sourceConfirmed: true });
}

/**
 * Set a segment's provisional translations from transcript.translation.update.
 * Uses its own revision counter, independent of the source delta's — a
 * translation can lag the source, so this never touches sourceText/
 * sourceRevision, only the translations map.
 */
export function setLiveSegmentTranslation(
  recordingId: string,
  segmentId: string,
  turnId: string,
  revision: number,
  translations: Record<string, string>,
  medicalTerms: MedicalTerm[],
): void {
  const existing = state.recordings[recordingId]?.liveSegments[segmentId];
  if (existing?.completed || existing?.sourceConfirmed) return;
  if (existing && revision <= existing.translationRevision) return;
  upsertLiveSegment(recordingId, {
    segmentId,
    turnId,
    translations,
    translationRevision: revision,
    medicalTerms,
  });
}

/** turn.started: open a bubble for the turn before any text arrives. */
export function startLiveTurn(
  recordingId: string,
  turnId: string,
  t0: number,
): void {
  const recording = state.recordings[recordingId];
  if (!recording) return;
  const turns = recording.liveTurns ?? {};
  updateRecording(recordingId, {
    liveTurns: {
      ...turns,
      [turnId]: { turnId, t0, ended: turns[turnId]?.ended ?? false },
    },
  });
}

/**
 * turn.ended: no further segments join the turn. A turn that ended without
 * any segment was noise (VAD false positive or silence), so its bubble is
 * removed.
 */
export function endLiveTurn(recordingId: string, turnId: string): void {
  const recording = state.recordings[recordingId];
  if (!recording) return;
  const { [turnId]: turn, ...otherTurns } = recording.liveTurns ?? {};
  const hasSegments = Object.values(recording.liveSegments).some(
    (segment) => segment.turnId === turnId,
  );
  updateRecording(recordingId, {
    liveTurns: hasSegments
      ? { ...otherTurns, [turnId]: { turnId, t0: turn?.t0 ?? null, ended: true } }
      : otherTurns,
  });
}

/**
 * Runs the offline refinement pass and stores the result. Safe to call from
 * anywhere; the store keeps working across navigation.
 *
 * Can be re-run on an already refined recording (e.g. after the terminology
 * list changed). Passing `speakers` replaces the recording's speaker config
 * for this and later runs. The previous `refined` result is kept until the new
 * one arrives, so it stays viewable while processing and if the run fails.
 */
export async function startRefinement(
  recordingId: string,
  options: { speakers?: SpeakerConfig[] } = {},
): Promise<void> {
  const recording = state.recordings[recordingId];
  const audioBlob = recording?.audioBlob;
  if (
    !audioBlob ||
    recording.status === "uploading" ||
    recording.status === "refining"
  ) {
    return;
  }

  const terminology = getTerminology();
  const speakers = options.speakers ?? recording.speakers;

  updateRecording(recordingId, {
    speakers,
    status: "uploading",
    refineError: null,
    refineJobId: null,
    refinePhase: null,
    refineStep: null,
    refineMessage: "Uploading recording",
    refineProgress: 0,
    refineTerminologyEnabled: terminology.length > 0,
    refineCompletedUnits: null,
    refineTotalUnits: null,
  });

  try {
    const submission = await submitRefinement(
      audioBlob,
      speakers,
      recording.audioFileName ?? "session.webm",
      terminology,
      {
        onProgress: (percent) => {
          updateRecording(recordingId, { refineProgress: percent });
        },
      },
    );
    updateRecording(recordingId, {
      status: "refining",
      refineJobId: submission.job_id,
      refineMessage: "Waiting to process recording",
      refineProgress: 0,
    });

    const refined = await pollRefinement(submission.job_id, (job) => {
      updateRecording(recordingId, {
        refinePhase: job.phase,
        refineStep: job.step,
        refineMessage: job.message,
        refineProgress: job.percent,
        refineCompletedUnits: job.completed_units,
        refineTotalUnits: job.total_units,
      });
    });
    updateRecording(recordingId, {
      status: "refined",
      refinePhase: null,
      refineStep: null,
      refineMessage: "Processing complete",
      refineProgress: 100,
      refineCompletedUnits: null,
      refineTotalUnits: null,
      refined,
    });
  } catch (error) {
    updateRecording(recordingId, {
      status: "refine-error",
      refineError:
        error instanceof Error ? error.message : "Refinement failed.",
    });
  }
}
