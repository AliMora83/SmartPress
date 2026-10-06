/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export for Hostinger (LiteSpeed). No server runtime: see public/.htaccess.
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  // Build target: "web" (default) | "desktop" (Tauri, Sprint 3.3). Inlined at build time.
  env: { NEXT_PUBLIC_TARGET: process.env.NEXT_PUBLIC_TARGET ?? 'web' },
};

export default nextConfig;
