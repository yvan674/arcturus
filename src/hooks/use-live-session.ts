"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { liveSessionUrl } from "@/lib/backend/client";
import type {
  LiveServerEvent,
  SessionStartMessage,
  SpeakerConfig,
} from "@/lib/backend/types";
import {
  setLiveSegmentSourceText,
  updateRecording,
  upsertLiveSegment,
} from "@/lib/recordings-store";

export type LiveSessionStatus =
  | "idle"
  | "connecting"
  | "live"
  | "stopping"
  | "ended"
  | "error";

const RECORDER_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
] as const;

/**
 * Drives one live transcription session: streams mic audio over WS /v1/live,
 * records the same chunks locally for /v1/refine, and writes every server
 * event into the recordings store (upsert by segment_id).
 */
export function useLiveSession(recordingId: string, speakers: SpeakerConfig[]) {
  const [status, setStatus] = useState<LiveSessionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusRef = useRef<LiveSessionStatus>("idle");

  const setStatusBoth = useCallback((next: LiveSessionStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const cleanupMedia = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const finalizeRecording = useCallback(() => {
    // Keep the full recording locally: it is the input for /v1/refine.
    const blob = new Blob(chunksRef.current, { type: "audio/webm" });
    updateRecording(recordingId, {
      status: "live-ended",
      audioBlob: blob.size > 0 ? blob : null,
    });
  }, [recordingId]);

  const failSession = useCallback(
    (message: string) => {
      cleanupMedia();
      wsRef.current?.close();
      wsRef.current = null;
      setError(message);
      setStatusBoth("error");
      finalizeRecording();
    },
    [cleanupMedia, finalizeRecording, setStatusBoth],
  );

  const handleServerEvent = useCallback(
    (event: LiveServerEvent) => {
      switch (event.type) {
        case "session.ready": {
          const recorder = recorderRef.current;
          if (recorder && recorder.state === "inactive") {
            recorder.start(100); // 100 ms chunks
            setStatusBoth("live");
            updateRecording(recordingId, { status: "live" });
            timerRef.current = setInterval(
              () => setElapsedSeconds((s) => s + 1),
              1000,
            );
          }
          break;
        }
        case "transcript.source.delta":
          setLiveSegmentSourceText(recordingId, event.segment_id, event.text);
          break;
        case "segment.completed":
          upsertLiveSegment(recordingId, {
            segmentId: event.segment_id,
            t0: event.t0,
            t1: event.t1,
            sourceText: event.source_text,
            translations: event.translations,
            speakerId: event.speaker_id,
            speakerConfidence: event.speaker_confidence,
            completed: true,
          });
          break;
        case "speaker.update":
          upsertLiveSegment(recordingId, {
            segmentId: event.segment_id,
            speakerId: event.speaker_id,
            speakerConfidence: event.speaker_confidence,
          });
          break;
        case "error":
          if (event.recoverable) {
            // e.g. diarization_unavailable: segments come without speaker
            // labels but everything else still works.
            setError(event.message);
          } else {
            failSession(event.message);
          }
          break;
        case "session.ended": {
          cleanupMedia();
          wsRef.current?.close();
          wsRef.current = null;
          setStatusBoth("ended");
          finalizeRecording();
          break;
        }
      }
    },
    [cleanupMedia, failSession, finalizeRecording, recordingId, setStatusBoth],
  );

  const start = useCallback(async () => {
    if (statusRef.current === "connecting" || statusRef.current === "live") {
      return;
    }
    setError(null);
    setElapsedSeconds(0);
    chunksRef.current = [];
    setStatusBoth("connecting");

    const mimeType = RECORDER_MIME_CANDIDATES.find((candidate) =>
      typeof MediaRecorder !== "undefined"
        ? MediaRecorder.isTypeSupported(candidate)
        : false,
    );
    if (!mimeType) {
      setStatusBoth("error");
      setError(
        "This browser cannot record webm/opus audio. Please use Chrome, Edge or Firefox.",
      );
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setStatusBoth("error");
      setError("Microphone access was denied.");
      return;
    }
    streamRef.current = stream;

    const recorder = new MediaRecorder(stream, { mimeType });
    recorderRef.current = recorder;
    recorder.ondataavailable = (e) => {
      if (e.data.size === 0) return;
      chunksRef.current.push(e.data); // kept for /v1/refine later
      const ws = wsRef.current;
      // Stream continuously, including silence — no voice gating.
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(e.data);
    };

    const ws = new WebSocket(liveSessionUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      // Every language any speaker may use; also biases Whisper's
      // auto-detection via possible_languages.
      const languages = [...new Set(speakers.flatMap((s) => s.languages))];
      const sessionStart: SessionStartMessage = {
        type: "session.start",
        // The diarizer only needs an upper bound on distinct voices; mapping
        // its anonymous labels to people happens on our side (if at all).
        max_speakers: Math.max(speakers.length, 1),
        // Translate into every language spoken in the room so all parties
        // can follow live.
        target_languages: languages,
        possible_languages: languages,
        audio: { format: "webm-opus" },
      };
      ws.send(JSON.stringify(sessionStart));
    };

    ws.onmessage = (message) => {
      if (typeof message.data !== "string") return;
      try {
        handleServerEvent(JSON.parse(message.data) as LiveServerEvent);
      } catch {
        // Ignore unparseable frames.
      }
    };

    ws.onerror = () => {
      if (statusRef.current !== "ended") {
        failSession("Connection to the transcription service failed.");
      }
    };

    ws.onclose = () => {
      // Server closes with 1000 after session.ended; anything earlier means
      // the session is gone (the server keeps no state).
      if (statusRef.current === "live" || statusRef.current === "stopping") {
        failSession("The live session was interrupted.");
      } else if (statusRef.current === "connecting") {
        failSession("Could not reach the transcription service.");
      }
    };
  }, [failSession, handleServerEvent, setStatusBoth, speakers]);

  /** Ends the session; the server flushes remaining events, then closes. */
  const stop = useCallback(() => {
    if (statusRef.current !== "live") return;
    setStatusBoth("stopping");

    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      // Flush the final chunk before announcing the end of the session.
      recorder.onstop = () => {
        wsRef.current?.send(JSON.stringify({ type: "session.end" }));
      };
      recorder.stop();
    } else {
      wsRef.current?.send(JSON.stringify({ type: "session.end" }));
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [setStatusBoth]);

  // Tear everything down if the component unmounts mid-session.
  useEffect(() => {
    return () => {
      cleanupMedia();
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [cleanupMedia]);

  return { status, error, elapsedSeconds, start, stop };
}
