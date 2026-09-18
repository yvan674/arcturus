import type {
  RefineJob,
  RefineJobSubmission,
  RefineResult,
  SpeakerConfig,
} from "./types";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

/** Maximum audio size accepted by POST /v1/refine. */
export const MAX_REFINE_BYTES = 25 * 1024 * 1024;

/** WebSocket URL for the live transcription session. */
export function liveSessionUrl(): string {
  return BACKEND_URL.replace(/^http/, "ws") + "/v1/live";
}

type UploadCallbacks = {
  onProgress?: (percent: number) => void;
};

/** Uploads a recording and returns the background refinement job id. */
export function submitRefinement(
  audio: Blob,
  speakers: SpeakerConfig[],
  filename = "session.webm",
  terminology: string[] = [],
  callbacks: UploadCallbacks = {},
): Promise<RefineJobSubmission> {
  if (audio.size > MAX_REFINE_BYTES) {
    return Promise.reject(
      new Error("Recording is larger than the 25 MB limit."),
    );
  }

  const form = new FormData();
  form.append("audio", audio, filename);
  // Omit the field entirely when empty: sending it (even []) is treated the
  // same by the backend, but omitting is clearer about intent.
  form.append(
    "config",
    JSON.stringify(
      terminology.length > 0 ? { speakers, terminology } : { speakers },
    ),
  );

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `${BACKEND_URL}/v1/refine`);
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        callbacks.onProgress?.(
          Math.min(100, Math.round((event.loaded / event.total) * 100)),
        );
      }
    });
    request.addEventListener("load", () => {
      if (request.status < 200 || request.status >= 300) {
        reject(
          new Error(refineErrorMessage(request.status, request.responseText)),
        );
        return;
      }

      try {
        resolve(JSON.parse(request.responseText) as RefineJobSubmission);
      } catch {
        reject(new Error("The backend returned an invalid refinement job."));
      }
    });
    request.addEventListener("error", () => {
      reject(new Error("Could not upload the recording."));
    });
    request.addEventListener("abort", () => {
      reject(new Error("The recording upload was cancelled."));
    });
    request.send(form);
  });
}

/** Polls a refinement job and fetches its completed transcript. */
export async function pollRefinement(
  jobId: string,
  onProgress: (job: RefineJob) => void,
): Promise<RefineResult> {
  while (true) {
    const response = await fetch(`${BACKEND_URL}/v1/refine/jobs/${jobId}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(await responseErrorMessage(response, "job status"));
    }

    const job = (await response.json()) as RefineJob;
    onProgress(job);

    if (job.status === "failed") {
      throw new Error(job.error ?? "Refinement failed.");
    }

    if (job.status === "completed") {
      if (!job.result_id) {
        throw new Error("The completed refinement has no transcript id.");
      }

      const transcriptResponse = await fetch(
        `${BACKEND_URL}/v1/refine/transcripts/${job.result_id}`,
        { cache: "no-store" },
      );
      if (!transcriptResponse.ok) {
        throw new Error(
          await responseErrorMessage(transcriptResponse, "transcript"),
        );
      }
      return (await transcriptResponse.json()) as RefineResult;
    }

    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
}

function refineErrorMessage(status: number, body: string): string {
  switch (status) {
    case 413:
      return "Recording is larger than the 25 MB limit.";
    case 422:
      return "The backend could not read the recording or its configuration.";
    case 503:
      return "The transcription service is not configured (missing API key).";
    default: {
      return `Refinement failed (${status})${body ? `: ${body.slice(0, 200)}` : ""}`;
    }
  }
}

async function responseErrorMessage(
  response: Response,
  resource: string,
): Promise<string> {
  const body = await response.text().catch(() => "");
  return `Could not load refinement ${resource} (${response.status})${body ? `: ${body.slice(0, 200)}` : ""}`;
}
