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
       * Full source hypothesis for the segment, replacing whatever was shown
       * before — progressive Whisper hypotheses can revise earlier words, so
       * never concatenate. `revision` increases per segment (not across the
       * session); ignore any revision that isn't greater than the last one
       * applied.
       */
      type: "transcript.source.delta";
      segment_id: string;
      revision: number;
      text: string;
    }
  | {
      /**
       * Full provisional translations of the source snapshot identified by
       * `revision` (a *separate* counter from the source delta's revision).
       * Can lag the source, so `source_text` here may be stale — never use it
       * to overwrite newer source text, only the `translations` map.
       */
      type: "transcript.translation.update";
      segment_id: string;
      revision: number;
      source_text: string;
      translations: Record<string, string>;
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
       * Empty when `translation_status` is "failed".
       */
      translations: Record<string, string>;
      /** "failed" closes the segment without claiming provisional translations were final. */
      translation_status: "completed" | "failed";
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
  | {
      type: "error";
      code: string;
      message: string;
      recoverable: boolean;
      /** Set for a per-segment failure (e.g. refinement_failed); null/absent for session-wide errors. */
      segment_id?: string | null;
    }
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
  // Only reported when a terminology list was submitted; run between
  // transcribing and reviewing.
  | "phonemizing"
  | "matching"
  | "verifying"
  | "resolving"
  | "reviewing";

/** The diarizer's internal steps; only reported while `phase` is diarizing. */
export type RefineJobStep =
  | "segmentation"
  | "speaker_counting"
  | "embeddings"
  | "discrete_diarization";

/** Response of GET /v1/refine/jobs/{job_id}. */
export interface RefineJob {
  job_id: string;
  status: "queued" | "running" | "completed" | "failed";
  phase: RefineJobPhase | null;
  /** Null outside the diarizing phase. */
  step: RefineJobStep | null;
  message: string;
  /**
   * Rough overall estimate from fixed phase weights, never going backwards —
   * good for a progress bar, not for an ETA.
   */
  percent: number;
  /**
   * Progress inside the current phase: diarizer chunks while diarizing,
   * finished vs. total speaker turns while transcribing. Null in phases that
   * are a single blocking call.
   */
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
