import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 'standalone' is required for Docker/Cloud Run but conflicts with Netlify
  output: process.env.NETLIFY ? undefined : "standalone",

  // Required for FFmpeg.wasm multithreading
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },
};

export default nextConfig;
