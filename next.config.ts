/** @type {import('next').NextConfig} */
const nextConfig = {
  // Use standalone output for Docker/Cloud Run, but standard output for Netlify
  output: process.env.NETLIFY ? undefined : 'standalone',
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
