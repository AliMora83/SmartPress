# SmartPress

A fast, offline-capable, local-first compressor for **images and PDFs**. Everything runs in
the browser: no backend, no accounts, no database, no network calls at runtime. Video was
split out to its own repo at tag `v3.0.0-pre-split`.

**Stack:** Next.js 16 (App Router) / React 19 / TypeScript / Tailwind CSS.
Native browser decode + vendored wasm encoders.

## Plan of record

[`SmartPress-v3-Plan.md`](./SmartPress-v3-Plan.md) owns the phases, sprints and open
decision gates. Read it before starting work. It supersedes the v2 build phases.
Changelog lives in [`AI-Logs.md`](./AI-Logs.md) — append an entry when a sprint closes.

## Always-On Constraint

SmartPress must remain **functional at the end of every sprint**. No sprint may leave the
product in a broken or offline state. At minimum, in at least one verified environment
(local or deployed):

- Frontend loads without fatal errors.
- A user can complete one full flow: **upload → compress → download**.
- Errors are rendered as structured UX states (typed error model), not generic crashes or
  silent failures.

## No runtime CDN

Every `.wasm` binary is vendored into `/public` and imported from a local path. No
`unpkg`, no jsDelivr, no runtime fetch to any external origin. v2 fetched ffmpeg-core from
`unpkg.com`, which is exactly what made offline impossible. A new external fetch is a bug,
not a shortcut.

## Working rules

- **Single source of truth for version:** `package.json`. Everything else reads from it —
  never hardcode a version string.
- **No blocking loader.** The dropzone renders immediately; codecs load on first use with
  the spinner scoped to the affected row.
- **Respect sprint scope.** The plan marks work as belonging to a specific sprint. Dead
  code left behind by an in-scope change is expected and gets cleaned in its own sprint —
  leaving it is correct, removing it early creates review noise.
- **EXIF orientation is load-bearing.** Always decode with
  `createImageBitmap(file, { imageOrientation: "from-image" })`, and apply orientation
  before stripping metadata, or portrait phone photos come out sideways.
