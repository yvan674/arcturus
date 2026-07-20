import type { RefineResult, SpeakerConfig } from "./types";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

/** Maximum audio size accepted by POST /v1/refine. */
export const MAX_REFINE_BYTES = 25 * 1024 * 1024;

/** WebSocket URL for the live transcription session. */
export function liveSessionUrl(): string {
  return BACKEND_URL.replace(/^http/, "ws") + "/v1/live";
}

/**
 * Uploads the finished recording for the high-quality offline pass.
 * Slow endpoint — expect tens of seconds; callers should show progress.
 */
export async function refineRecording(
  audio: Blob,
  speakers: SpeakerConfig[],
): Promise<RefineResult> {
  if (audio.size > MAX_REFINE_BYTES) {
    throw new Error("Recording is larger than the 25 MB limit.");
  }

  const form = new FormData();
  form.append("audio", audio, "session.webm");
  form.append("config", JSON.stringify({ speakers }));

  const res = await fetch(`${BACKEND_URL}/v1/refine`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    throw new Error(await refineErrorMessage(res));
  }

  return (await res.json()) as RefineResult;
}

async function refineErrorMessage(res: Response): Promise<string> {
  switch (res.status) {
    case 413:
      return "Recording is larger than the 25 MB limit.";
    case 422:
      return "The backend could not read the recording or its configuration.";
    case 503:
      return "The transcription service is not configured (missing API key).";
    default: {
      const body = await res.text().catch(() => "");
      return `Refinement failed (${res.status})${body ? `: ${body.slice(0, 200)}` : ""}`;
    }
  }
}
