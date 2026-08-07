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
  /**
   * Upper bound on how many distinct voices the diarizer looks for. The server
   * does not know who the participants are — segments come back with anonymous
   * voice labels (e.g. SPEAKER_00) and mapping them to people is our job.
   */
  max_speakers: number;
  /**
   * Everything gets translated into each of these languages (≥ 1). Each entry
   * costs one upstream translation session, so keep it to what we render.
   */
  target_languages: string[];
  /**
   * ISO codes or language names that may be spoken (1–20 entries). Biases
   * Whisper's auto-detection; does not limit it to this list.
   */
  possible_languages?: string[];
  /**
   * Extra Whisper prompt context (domain terms, participant names, preferred
   * spellings), up to 500 characters. A soft hint, not guaranteed to be
   * followed.
   */
  additional_instructions?: string;
  audio: { format: "webm-opus" | "pcm16-24k" };
}

/** Server → client events on WS /v1/live. */
export type LiveServerEvent =
  | { type: "session.ready" }
  | {
      /**
       * Upsert by segment_id: `text` is the latest full source hypothesis
       * for the segment, replacing whatever was shown before — progressive
       * Whisper hypotheses can revise earlier words, so never concatenate.
       */
      type: "transcript.source.delta";
      segment_id: string;
      text: string;
    }
  | {
      type: "segment.completed";
      segment_id: string;
      t0: number;
      t1: number;
      source_text: string;
      /**
       * ISO 639-1 code → full translated text, one entry per
       * target_languages entry. Correction and all translations come from
       * one async chat-completions call and arrive together here — this
       * always fully replaces the segment, never merge with a prior value.
       */
      translations: Record<string, string>;
      /** Anonymous voice label (e.g. SPEAKER_00), stable within the session. */
      speaker_id: string | null;
      speaker_confidence: number | null;
    }
  | {
      type: "speaker.update";
      segment_id: string;
      speaker_id: string | null;
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
export interface RefineJobSubmission {
  job_id: string;
}

export type RefineJobPhase =
  | "decoding"
  | "diarizing"
  | "transcribing"
  | "reviewing";

/** Response of GET /v1/refine/jobs/{job_id}. */
export interface RefineJob {
  job_id: string;
  status: "queued" | "running" | "completed" | "failed";
  phase: RefineJobPhase | null;
  message: string;
  percent: number;
  completed_units: number | null;
  total_units: number | null;
  filename: string;
  audio_duration: number | null;
  result_id: string | null;
  error: string | null;
}

/** Response of GET /v1/refine/transcripts/{result_id}. */
export interface RefineResult {
  turns: RefinedTurn[];
  /** Review remarks a human should see; surface next to the transcript. */
  notes: string[];
  detected_language: string;
  duration: number;
}
