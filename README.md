# Arcturus Frontend

MVP client for live medical interpretation (Dolmetscher) and offline transcript
refinement. Next.js 16 / React 19, rendered almost entirely on the client.

This document covers what the frontend owns and how its parts interact. The
backend's internals and full wire contract are documented in the backend
repository; `src/lib/backend/types.ts` mirrors that contract on this side.

## Responsibility split

The backend is a stateless processing service. Everything that has to survive
a session lives in the frontend.

| Concern | Frontend | Backend |
| --- | --- | --- |
| Session configuration (speaker count, languages) | Owns and persists | Receives per request |
| Audio capture | `MediaRecorder` / mock PCM feed | — |
| Audio retention | Keeps the full recording; source for refinement | Discards after processing |
| Live transcript state | Reduces the event stream into persisted segments/turns | Emits events, stores nothing, no replay |
| Mapping voices to people | Not implemented (see [Speaker identity](#speaker-identity)) | Emits anonymous `voice_N` labels |
| Refinement orchestration | Upload, poll, fetch, persist result, re-run | Runs the job, stores progress and result |
| Terminology list | Owns and persists, sends with each refine job | Uses it for that job only |
| Authentication | Firebase session cookie gating the UI | None |

## Topology

```text
                 +---------------------------- browser -----------------------------+
                 |                                                                   |
 Firebase Auth <-+- login-form  ->  /api/auth/session (Next server, sets cookie)     |
                 |                                                                   |
                 |  use-live-session ----- WS /v1/live -----------------------------+---> backend
                 |        |                                                          |
                 |        v                                                          |
                 |  recordings-store (in-memory + IndexedDB) <--- client.ts ---------+---> backend
                 |        ^                     POST /v1/refine, GET jobs, GET transcripts
                 |        |                                                          |
                 |  live-transcription / review-recording (render from store)        |
                 +-------------------------------------------------------------------+
```

The browser talks to the backend directly; `NEXT_PUBLIC_BACKEND_URL` is
inlined at build time and the WebSocket URL is derived from it
(`http` -> `ws`). The Next.js server only handles the auth cookie and serves
the mock audio file. There is no server-side data layer.

## Persistence

`src/lib/recordings-store.ts` is a module-level external store consumed via
`useSyncExternalStore`. It is the single source of truth for every recording.

- Each `RecordingSession` (config, all live segments and turns, the audio
  `Blob`, refinement progress and result) is written as one object to the
  IndexedDB database `arcturus-recordings`. Every mutation rewrites the whole
  object.
- The newest-first ordering of recording IDs is mirrored in `localStorage`.
- Hydration runs once on module load in the browser. Entries created before
  hydration completes take precedence over persisted ones.
  `navigator.storage.persist()` is requested to reduce eviction risk.
- The terminology list is a separate store (`terminology-store.ts`) in
  `localStorage`, global to the browser profile.
- Recording IDs are 20-character alphanumeric strings shaped like Firestore
  auto-IDs, and the route rejects anything else. Nothing is written to
  Firestore yet; the format just keeps a later move to Firestore possible.

Because the store is module-scoped rather than component-scoped, a refinement
job keeps running and updating state across client-side navigation.

## Recording lifecycle

```text
record:  new -> live -> live-ended -> uploading -> refining -> refined
                                          ^                      |
                                          +---- refine-error <---+  (retry / refine again)
upload:  new -> uploading -> refining -> refined | refine-error
```

`RecordingSession.status` drives which tab opens by default and which actions
are available. A recording can be refined repeatedly. The previous `refined`
result is kept and shown, dimmed, until a new run replaces it.

## Live session

`src/hooks/use-live-session.ts` owns the socket, the recorder and the
event-to-store dispatch.

### Audio

- A single `MediaRecorder` (`audio/webm;codecs=opus`, falling back to
  `audio/webm`) is created before the socket opens, but only started after
  `session.ready`, with a 100 ms timeslice. Every chunk is both sent over the
  socket and appended to an in-memory array. One recorder per session matters
  because only the first chunk contains the container header.
- On stop, `session.end` is sent from `recorder.onstop` so the final chunk
  is sent before the end message. The socket stays open until
  `session.ended`. Until then, final translations and speaker updates can
  still arrive.
- On `session.ended`, a fatal error or an unexpected close, the accumulated
  chunks are concatenated into one `Blob` and persisted on the recording. A
  failed session therefore still produces a refinable recording of whatever
  was captured.

### `session.start` mapping

| Field | Source |
| --- | --- |
| `max_speakers` | Configured speaker count |
| `target_languages` | "Target languages" selected at creation |
| `possible_languages` | Union of the configured speaker languages |
| `audio.format` | `webm-opus`, or `pcm16-24k` in mock mode |

`additional_instructions` is not sent.

### Event reduction

Events are applied through store functions that enforce the ordering rules of
the protocol:

- Source deltas and partial translations are full snapshots. Each one is
  gated by its own per-segment revision counter (`sourceRevision`,
  `translationRevision`). The two counters are independent.
- `transcript.source.completed` sets `sourceConfirmed`. After that, deltas and
  partial translations for the segment are dropped, but existing provisional
  translations stay visible, marked as provisional.
- `segment.completed` replaces the segment's state, including the whole
  translation map, and sets `completed`.
- `speaker.update` patches only the speaker fields, and applies to segments
  in any state.
- `turn.ended` on a turn with no segments deletes the turn (VAD noise).
- Errors that carry a `segment_id` are not surfaced, because the following
  `segment.completed` with `translation_status: "failed"` is rendered on the
  segment itself. Recoverable session errors are shown in a banner. Fatal ones
  end the session.

### Rendering

`live-transcription.tsx` derives bubbles from the store on every change:

1. Group segments by `turn_id`. Turns that have not received text yet render
   a typing indicator while the session is active.
2. Sort turns by `t0`, and segments within a turn by `t0`. Unconfirmed
   segments, which have no `t0` yet, go last. Segments complete out of order,
   so arrival order is not usable.
3. Split each turn into runs of consecutive segments with the same
   `speaker_id`, because the backend's turns are not speaker-attributed. A
   null speaker joins the current run. The first run keeps the turn ID as its
   React key so the bubble does not remount when a split appears.

Text changes go through `useTypewriterText`. It diffs the common prefix and
suffix and animates only the middle, so revised hypotheses appear as in-place
corrections rather than full redraws.

Medical-term offsets are code points into the `source_text` of the event that
carried them. Highlighting converts them to UTF-16 indices and checks that the
slice matches `term.text`. If it does not (newer hypothesis, typewriter
mid-animation), it falls back to `indexOf`, and skips the term if it is not
found. Overlapping ranges are dropped.

## Offline refinement

`startRefinement()` in `recordings-store.ts`, with transport in
`src/lib/backend/client.ts`.

- The input is the persisted audio `Blob`, the recording's speaker config and
  the current terminology list. `terminology` is omitted from the request when
  the list is empty, which also skips the backend's terminology phases.
- The upload uses `XMLHttpRequest` rather than `fetch` to get upload progress.
  Before uploading, the client rejects files larger than 25 MiB. This limit
  is hardcoded to match the backend default, while the backend's limit is
  configurable.
- The job is polled every 2 s. `phase`, `step`, `percent` and the unit
  counters are copied into the recording on each poll. The progress UI picks
  its phase list according to whether terminology was sent
  (`refineTerminologyEnabled`), since the backend reports a different phase
  sequence in each case.
- "Refine again" (`refine-config-dialog.tsx`) can change the speaker count and
  languages. The new speaker config replaces the stored one for this run and
  later runs. Changing the terminology in Settings and refining again is the
  only way to apply a new dictionary to an existing recording.
- Uploaded files take the same path, but skip the live session entirely.

## Speaker identity

The frontend does not resolve who is speaking, in either mode.

- **Live**: segments carry anonymous, session-scoped `voice_N` labels. They
  are used only to tint bubbles and split turns. Labels can change
  mid-session, which re-tints the bubble.
- **Refinement**: the backend requires each speaker to have a `role`
  (`doctor` | `patient` | `interpreter`). The UI has no notion of roles, so
  `buildSpeakers()` creates synthetic `speaker-1..N` IDs, cycles through the
  roles, and gives every speaker every selected language. As a result,
  each refined turn is translated into every selected language except the one
  it was spoken in.
- Live voice labels and refined speaker IDs are separate namespaces with no
  mapping between them.

A production client that knows its participants (and their languages) should
send real roles and per-speaker languages. That gives better role mapping and
avoids unneeded translations.

## Mock audio

The "Mock Audio" option streams `res/test-45.mp3` instead of the microphone.
The file is served by `/api/dev/mock-audio`, decoded to 24 kHz mono PCM16 with
`OfflineAudioContext`, and sent as `pcm16-24k` frames every 100 ms to
approximate a real microphone. The frames that were actually sent are wrapped
in a WAV container and stored as the recording, so refinement processes the
same audio as the live run, even if it was stopped early. The route and file
ship in production builds (`outputFileTracingIncludes` in `next.config.ts`).

## Authentication

1. Email/password sign-in with the Firebase client SDK produces an ID token.
2. `POST /api/auth/session` exchanges it for a five-day, `httpOnly` Firebase
   session cookie through the Admin SDK. The client then signs out of Firebase
   immediately, so the cookie is the only credential.
3. `src/proxy.ts` (Next 16's replacement for `middleware.ts`) redirects
   `/recordings/*` to `/login` if the cookie is absent. It only checks that
   the cookie exists. The signature is verified only by
   `getCurrentUser()` on `/`.

The backend is called without credentials, and the frontend identity never
reaches it.

## Known MVP gaps

These are deliberate omissions or known defects. A production version should
address them:

- **Local-only data.** Recordings, audio and terminology exist in one browser
  profile. They are not partitioned by user, synced, or backed up. Large audio
  blobs count against the IndexedDB quota.
- **Refinement is not resumed after a reload.** `refineJobId` is persisted,
  but the polling loop is not. A reload during `uploading`/`refining` leaves
  the recording stuck in that status, and `startRefinement()` refuses to run
  while it is in that status. Resuming from `GET /v1/refine/jobs/{id}` on
  hydration would fix this.
- **Live audio is held in memory until the session ends.** Reloading or
  navigating away mid-session discards the captured chunks and leaves status
  `live`. No chunks are written to storage incrementally.
- **No live reconnect.** Any socket failure ends the session. The backend's
  live path is not resumable, so a reconnect would be a new session with new
  voice labels and a new time origin. Merging the two would be a frontend
  concern.
- **Authorization is cosmetic.** Route gating checks only that the cookie
  exists. The backend is unauthenticated, with `CORS: *`.
- **No transcript editing** of the refined result.
- `additional_instructions` (live Whisper context) is never sent.

## Development

```sh
pnpm install
pnpm dev             # uses .env
pnpm dev:remote      # uses .env.remote (e.g. a deployed backend)
```

Required environment (all inlined at build time):

```text
NEXT_PUBLIC_BACKEND_URL                 # http(s) base URL; ws(s) is derived
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
```

The Admin SDK reads `firebase_adminsdk.json` from the working directory if
present. Otherwise it falls back to Application Default Credentials (Cloud
Run). The `Dockerfile` builds a standalone output and takes the
`NEXT_PUBLIC_*` values as build args.

## Source map

| Path | Role |
| --- | --- |
| `src/lib/backend/types.ts` | Typed mirror of the backend contract |
| `src/lib/backend/client.ts` | Refine upload/poll/fetch, WS URL |
| `src/hooks/use-live-session.ts` | Live socket, recorder, event dispatch |
| `src/lib/recordings-store.ts` | Store, persistence, event reducers, refinement orchestration |
| `src/lib/terminology-store.ts` | Terminology list |
| `src/components/live-transcription.tsx` | Bubble derivation, term highlighting |
| `src/components/review-recording.tsx` | Refinement progress and refined transcript |
| `src/components/speaker-config-fields.tsx` | Speaker config construction shared by create/re-refine |
| `src/lib/mock-audio.ts` | PCM decode, WAV encode for mock sessions |
| `src/proxy.ts`, `src/app/api/auth/*` | Session cookie auth |
