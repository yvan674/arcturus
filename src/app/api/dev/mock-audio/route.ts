import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Serves `res/test-45.mp3` to the "Mock audio" debugging flow, which streams it
 * over WS /v1/live instead of capturing a microphone. Available in every
 * environment, since this app is an internal backend-testing tool. The file is
 * bundled into the standalone build via `outputFileTracingIncludes`.
 */
export async function GET() {
  const file = await readFile(path.join(process.cwd(), "res", "test-45.mp3"));

  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
