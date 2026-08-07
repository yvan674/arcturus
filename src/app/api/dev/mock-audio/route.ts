import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Serves `res/test-45.mp3` to the "Mock audio" debugging flow, which streams it
 * over WS /v1/live instead of capturing a microphone. The file lives outside
 * `public/` on purpose, so it is only reachable while developing.
 */
export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return new Response("Not found", { status: 404 });
  }

  const file = await readFile(path.join(process.cwd(), "res", "test-45.mp3"));

  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
