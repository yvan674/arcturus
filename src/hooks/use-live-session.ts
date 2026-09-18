"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { liveSessionUrl } from "@/lib/backend/client";
import type {
  LiveServerEvent,
  SessionStartMessage,
  SpeakerConfig,
} from "@/lib/backend/types";
import {
  concatSamples,
  encodeWav,
  loadMockAudioSamples,
  MOCK_AUDIO_CHUNK_MS,
  MOCK_AUDIO_SAMPLES_PER_CHUNK,
  type PcmSamples,
} from "@/lib/mock-audio";
import {
  setLiveSegmentSourceText,
  setLiveSegmentTranslation,
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
 *
 * With `mockAudio`, the microphone is replaced by res/test-45.mp3 played back
 * in real time as pcm16-24k frames — a debugging aid, dev builds only.
 */
export function useLiveSession(
  recordingId: string,
  speakers: SpeakerConfig[],
  targetLanguages: string[],
  mockAudio = false,
) {
  const [status, setStatus] = useState<LiveSessionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusRef = useRef<LiveSessionStatus>("idle");
  /** Mock session: the decoded file, and the part of it actually streamed. */
  const mockSamplesRef = useRef<PcmSamples | null>(null);
  const mockSentRef = useRef<PcmSamples[]>([]);
  const mockTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const setStatusBoth = useCallback((next: LiveSessionStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const stopMockFeed = useCallback(() => {
    if (mockTimerRef.current) {
      clearInterval(mockTimerRef.current);
      mockTimerRef.current = null;
    }
  }, []);

  const cleanupMedia = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    stopMockFeed();
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [stopMockFeed]);

  const finalizeRecording = useCallback(() => {
    // Keep the full recording locally: it is the input for /v1/refine. For a
    // mock session that is exactly the audio that was streamed, so stopping
    // early refines the same audio the live transcript came from.
    const sentSamples = mockAudio ? concatSamples(mockSentRef.current) : null;
    const blob =
      sentSamples !== null
        ? sentSamples.length > 0
          ? encodeWav(sentSamples)
          : new Blob([])
        : new Blob(chunksRef.current, { type: "audio/webm" });
    const filename = mockAudio ? "mock-session.wav" : "session.webm";

    updateRecording(recordingId, {
      status: "live-ended",
      audioBlob: blob.size > 0 ? blob : null,
      audioFileName: blob.size > 0 ? filename : null,
    });
  }, [mockAudio, recordingId]);

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

  /** Ends the session; the server flushes remaining events, then closes. */
  const stop = useCallback(() => {
    if (statusRef.current !== "live") return;
    setStatusBoth("stopping");

    stopMockFeed();
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
  }, [setStatusBoth, stopMockFeed]);

  /** Paces the decoded file out in 100 ms frames, as a microphone would. */
  const startMockFeed = useCallback(() => {
    const samples = mockSamplesRef.current;
    if (!samples) return false;

    let offset = 0;
    mockTimerRef.current = setInterval(() => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      const end = Math.min(offset + MOCK_AUDIO_SAMPLES_PER_CHUNK, samples.length);
      const chunk = samples.subarray(offset, end);
      offset = end;
      if (chunk.length > 0) {
        mockSentRef.current.push(chunk);
        // Int16Array is little-endian on every platform we target, which is
        // what pcm16-24k expects.
        ws.send(chunk);
      }
      // The file is finite; when it runs out the session ends by itself, the
      // same way pressing Stop would.
      if (offset >= samples.length) stop();
    }, MOCK_AUDIO_CHUNK_MS);
    return true;
  }, [stop]);

  const handleServerEvent = useCallback(
    (event: LiveServerEvent) => {
      switch (event.type) {
        case "session.ready": {
          const recorder = recorderRef.current;
          let started = false;
          if (mockAudio) {
            started = startMockFeed();
          } else if (recorder && recorder.state === "inactive") {
            recorder.start(100); // 100 ms chunks
            started = true;
          }
          if (started) {
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
          setLiveSegmentSourceText(
            recordingId,
            event.segment_id,
            event.revision,
            event.text,
          );
          break;
        case "transcript.translation.update":
          // `event.source_text` is that snapshot's source, which can lag the
          // current one — only the translations map is applied here.
          setLiveSegmentTranslation(
            recordingId,
            event.segment_id,
            event.revision,
            event.translations,
          );
          break;
        case "segment.completed":
          upsertLiveSegment(recordingId, {
            segmentId: event.segment_id,
            t0: event.t0,
            t1: event.t1,
            sourceText: event.source_text,
            translations: event.translations,
            translationStatus: event.translation_status,
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
          if (event.segment_id) {
            // Per-segment failure (e.g. refinement_failed): the following
            // segment.completed carries translation_status: "failed", which
            // the bubble already surfaces — no session-wide banner needed.
            break;
          }
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
    [
      cleanupMedia,
      failSession,
      finalizeRecording,
      mockAudio,
      recordingId,
      setStatusBoth,
      startMockFeed,
    ],
  );

  const start = useCallback(async () => {
    if (statusRef.current === "connecting" || statusRef.current === "live") {
      return;
    }
    setError(null);
    setElapsedSeconds(0);
    chunksRef.current = [];
    mockSamplesRef.current = null;
    mockSentRef.current = [];
    setStatusBoth("connecting");

    let audioFormat: SessionStartMessage["audio"]["format"];

    if (mockAudio) {
      try {
        mockSamplesRef.current = await loadMockAudioSamples();
      } catch (loadError) {
        setStatusBoth("error");
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load the mock recording.",
        );
        return;
      }
      audioFormat = "pcm16-24k";
    } else {
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
      audioFormat = "webm-opus";
    }

    const ws = new WebSocket(liveSessionUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      // Speaker languages bias Whisper's auto-detection; translation output is
      // controlled independently by the targets selected during setup.
      const possibleLanguages = [
        ...new Set(speakers.flatMap((s) => s.languages)),
      ];
      const sessionStart: SessionStartMessage = {
        type: "session.start",
        // The diarizer only needs an upper bound on distinct voices; mapping
        // its anonymous labels to people happens on our side (if at all).
        max_speakers: Math.max(speakers.length, 1),
        target_languages: targetLanguages,
        possible_languages: possibleLanguages,
        audio: { format: audioFormat },
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
  }, [
    failSession,
    handleServerEvent,
    mockAudio,
    setStatusBoth,
    speakers,
    targetLanguages,
  ]);

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
