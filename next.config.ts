import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // The mock-audio route reads this file from disk at runtime, so it has to be
  // copied into the standalone output explicitly.
  outputFileTracingIncludes: {
    "/api/dev/mock-audio": ["./res/test-45.mp3"],
  },
};

export default nextConfig;
