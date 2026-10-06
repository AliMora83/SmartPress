import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';
import type { NextConfig } from 'next';

export default function config(phase: string): NextConfig {
  const dev = phase === PHASE_DEVELOPMENT_SERVER;
  return {
    // Static export for Hostinger (LiteSpeed). No server runtime: see public/.htaccess.
    output: 'export',
    trailingSlash: true,
    images: { unoptimized: true },
    // Build target: "web" (default) | "desktop" (Tauri, Sprint 3.3). Inlined at build time.
    env: { NEXT_PUBLIC_TARGET: process.env.NEXT_PUBLIC_TARGET ?? 'web' },
    // app/bench/page.dev.tsx is the codec benchmark. It exists only under `next dev`:
    // the production build does not treat `.dev.tsx` as a page, so there is no /bench route.
    pageExtensions: dev ? ['tsx', 'ts', 'dev.tsx'] : ['tsx', 'ts'],
  };
}
