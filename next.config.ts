/** @type {import('next').NextConfig} */
const nextConfig = {
  output: process.env.NETLIFY ? undefined : 'standalone', // Required for Docker deployment
  // Required for FFmpeg.wasm multithreading and security
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        source: "/Smart_Bot.png",
        headers: [
            { key: "Cache-Control", value: "public, max-age=31536000, immutable" }
        ]
      },
      {
        source: "/Smart_icon.png",
        headers: [
            { key: "Cache-Control", value: "public, max-age=31536000, immutable" }
        ]
      }
    ];
  },
};

export default nextConfig;
