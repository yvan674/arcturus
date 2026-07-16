/**
 * Types mirroring the Arcturus backend contracts.
 * See BACKEND_DOCUMENTATION.md — the backend is stateless, so the frontend
 * keeps the session config, the audio, every live event, and the refinement
 * result.
 */

export type SpeakerRole = "doctor" | "patient" | "interpreter";

export interface SpeakerConfig {
  /** Any string we choose; all speaker attribution refers back to it. */
  id: string;
  role: SpeakerRole;
  /** ISO 639-1 codes the speaker may use (at least one). */
  languages: string[];
}

/** Text frame sent once after opening WS /v1/live. */
export interface SessionStartMessage {
  type: "session.start";
  speakers: SpeakerConfig[];
  /**
   * Everything gets translated into each of these languages (≥ 1). Each entry
   * costs one upstream translation session, so keep it to what we render.
   */
  target_languages: string[];
  audio: { format: "webm-opus" | "pcm16-24k" };
}

/** Server → client events on WS /v1/live. */
export type LiveServerEvent =
  | { type: "session.ready" }
  | { type: "transcript.source.delta"; segment_id: string; text: string }
  | {
      type: "transcript.translation.delta";
      segment_id: string;
      language: string;
      text: string;
    }
  | {
      type: "segment.completed";
      segment_id: string;
      t0: number;
      t1: number;
      source_text: string;
      /**
       * ISO 639-1 code → full translated text. Languages arrive at their own
       * pace: an entry may be missing here and show up in a later upsert.
       */
      translations: Record<string, string>;
      speaker_id: string | null;
      role: SpeakerRole | null;
      speaker_confidence: number | null;
    }
  | {
      type: "speaker.update";
      segment_id: string;
      speaker_id: string | null;
      role: SpeakerRole | null;
      speaker_confidence: number | null;
    }
  | { type: "error"; code: string; message: string; recoverable: boolean }
  | { type: "session.ended" };

/** One chronological speaking turn in the refined transcript. */
export interface RefinedTurn {
  speaker_id: string | null;
  role: SpeakerRole | null;
  t0: number;
  t1: number;
  text: string;
  translations: { language: string; text: string }[];
}

/** Response of POST /v1/refine. */
export interface RefineResult {
  turns: RefinedTurn[];
  /** Review remarks a human should see; surface next to the transcript. */
  notes: string[];
  detected_language: string;
  duration: number;
}
