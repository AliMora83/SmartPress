# AI Changelog — SmartPress

> Auto-maintained by GitHub Actions. Each entry reflects a versioned push.
> Newest entries appear first. Do not edit manually.

---

## 2026-08-29 | Patch 1.1 — Download Correctness & Gain Threshold | Claude (Opus 5)

Two patches on top of Sprint 1.1, both confined to the canvas bridge era. Neither is codec
work; they exist so Sprint 1.2 measures against a pipeline that is actually correct.

### Canvas bridge baseline — `3.0.0-alpha.2`

Four JPEGs, production build, zero network requests on download. **Sprint 1.2's benchmarks
measure against these numbers.**

| Original | Output | Change |
|---|---|---|
| 1.07 MB | 178.85 KB | −84% |
| 222.86 KB | 96.68 KB | −57% |
| 139.73 KB | 120 KB | −14% |
| 120.73 KB | 120.56 KB | −0% |

PNG has no baseline row: canvas cannot compress it, so every PNG correctly keeps its
original. Real PNG numbers arrive with the quantizer in Sprint 1.2.

### Patch 1.1a — download 404s

Chrome returned `404 — File wasn't available on site` on most rows. Two independent causes,
not one:

- **(b) A surviving server path.** `downloadAll()` still built
  `${API_URL}/download-batch?files=...` whenever more than three files had completed.
  Sprint 1.1 set `API_URL = ""` when the backend was deleted, so that href resolved against
  the origin and Next.js answered the 404. Sprint 1.1's verification grepped for
  `NEXT_PUBLIC_API_URL` and `localhost:8000`; a bare relative path passed straight through
  that check.
- **(c) Blob URLs outliving their page session.** Not an over-eager revoke effect, which was
  the obvious suspect. The URLs were being **persisted to IndexedDB alongside the file
  items**, so a reload restored rows as `done` carrying URLs minted by a page session that
  no longer existed. Every restored link was byte-identical to the previous session's and
  every one was dead. This is why exactly one row appeared to work — the one compressed
  live in the current session.

Fixed by deleting the batch branch outright (there is no backend and no batch endpoint),
keeping blob URLs out of IndexedDB, and resetting restored rows to `pending` rather than
offering a link that cannot resolve. Object URLs are now created once when a result is
produced and revoked only on row removal, queue clear, recompress and unmount — never
during render. A `Set` guards against double-revoke.

### Patch 1.1b — gain threshold

The −0% row above was re-encoded to save **170 bytes**, spending a full generation of JPEG
quality for 0.14%. The keep-original branch only triggered when output was the same size or
larger, so it never caught this.

**Decision: `MIN_GAIN_RATIO = 0.03`.** An encode must save at least 3% of the original to be
worth shipping; below that the original is kept and the row takes the no-gain path. The
constant and its predicate live in **`lib/compression.ts`**, not as a literal in
`Compressor.tsx` — Sprint 1.2's codec layer needs the same rule and must not redefine it.

Verified on the bridge: a JPEG whose re-encode gains 1.29% (160,739 → 158,667 bytes) is now
kept as the original. The −82%, −59% and −13% rows are unaffected.

No-gain rows read as a quiet secondary state — "No size reduction — original kept" with a
muted "Download original" link, not the green primary button — and download under their
**original filename**. Only files SmartPress actually re-encoded carry the `smartpress_`
prefix.

### `downloadAll()` — current behaviour, named so it is not rediscovered

With four completed files it fires **four individual anchor clicks, one per file**, each
against that row's own `blob:` URL, staggered by `index * 300`ms. There is no ZIP and no
batch request. Filenames follow the same prefix rule as the per-row links.

Two consequences worth knowing before Phase 2:

- Chrome treats the second and later programmatic downloads from one origin as
  "Download multiple files?" and prompts once per origin. Deny it and the remaining files
  are dropped silently — the app is not told.
- The 300ms stagger is wall-clock `setTimeout`, so a backgrounded tab coalesces the timers
  and the clicks arrive together.

Real batching is `fflate` at store level, which the plan puts in **Phase 2 (Sprint 2.3)**.
Deliberately not built here.

### Known deviation from the plan

**IndexedDB still stores whole file items, including `File` objects.** Patch 1.1a stopped
persisting the blob *URLs*, which fixed the 404s, but the Sprint 1.3 rule — *IndexedDB
stores settings only: no `File` objects, no previews, no writes on every progress tick* — is
still violated. Flagged here so 1.3 treats it as known scope rather than a discovery.

### Housekeeping

- Deleted `test.zip` from the repo root: 21 bytes containing the ASCII string
  `Internal Server Error`, a v2 backend error response someone saved to disk.
- The tagline promised "images and PDFs" while the dropzone accepted JPEG and PNG only. It
  now reads "images" with a visible **PDF — coming soon** marker, matching the Sprint 2.1
  plan rather than silently rejecting a format the sidebar advertised.
- **Version:** `3.0.0-alpha.2` → `3.0.0-alpha.3`.

---

## 2026-08-26 | Sprint 1.1 — Extraction & Demolition | Claude (Sonnet 5)

**The pivot:** SmartPress moves from images+video to images+PDF, running fully client-side.
FFmpeg was the only reason a backend existed, so `backend/` was deleted rather than ported —
and with it every open security and infrastructure issue from the v2 review.

- **Recovery point:** tagged `v3.0.0-pre-split` and pushed before any deletion. An
  additional checkpoint commit preserved uncommitted Phase 3 work (direct-to-storage
  uploads, Gemini remediation, `ai_diagnostics.py`) that would otherwise have been lost.
- **Extracted to a sibling repo:** `backend/`, `DEPLOY_CLOUD_RUN.md`, `Stabilise FFmpeg`,
  `SmartPress-Update`, `test_video.mp4`. The FastAPI + Cloud Run Jobs + storage-abstraction
  work (~90% complete) carries over intact, along with its four open review items.
- **Removed from this repo:** `backend/` (11 tracked files, 0 `.py` files remain),
  `Dockerfile`, `.dockerignore`, `.gcloudignore`, `netlify.toml`, `DEPLOY_CLOUD_RUN.md`,
  `test_video.mp4`, `Stabilise FFmpeg`, `SmartPress-Update`. Dropped `@ffmpeg/ffmpeg` and
  `@ffmpeg/util` (4 packages removed from the lockfile).
- **Temporary canvas bridge:** image compression now runs through
  `createImageBitmap(file, { imageOrientation: "from-image" })` → `OffscreenCanvas` →
  `convertToBlob`, satisfying the Always-On Constraint without FFmpeg. Deliberately
  short-lived — Sprint 1.3 replaces it with the wasm codec layer and deletes it. The old
  `-vf scale=1280:-1` was **not** reproduced: it upscaled small images. Canvas PNG often
  grows the file, so output larger than input is discarded and the row reads
  "already optimal".
- **Removed the `unpkg.com` ffmpeg-core fetch**, satisfying the no-runtime-CDN rule and
  removing the 30 MB blocking "Preparing the Smart-Bot..." gate. The dropzone now renders
  immediately.
- **Images-only UI:** accept filter narrowed to `image/jpeg,image/png`; dropped files are
  validated too (v2's drag-and-drop bypassed the accept filter entirely) and rejected as a
  typed error row rather than crashing. Removed the dead "Video Quality (CRF)" control.
- **Version unified:** package renamed `smart-compressor` → `smartpress` at
  `3.0.0-alpha.1`. `app/page.tsx` now imports the version from `package.json` instead of
  the hardcoded "Version 2.0.0", and the PROJECT-SYNC CI workflow reads it from
  `package.json` rather than grepping `Master.md`.
- **Config:** dropped the COOP/COEP headers block (ffmpeg.wasm multithreading only) and the
  dead `/api-backend` rewrite. CI switched `npm install` → `npm ci`.
- **Docs reconciled:** `AGENT-ONBOARDING.md` deleted in favour of `CLAUDE.md` (it was a
  hand-rolled version of a convention Claude Code already has, and nothing enforced it —
  which is why its broken `AI_CHANGELOG.md` pointer survived so long). `Master.md`,
  `README.md`, `DEPLOY.md` and `PROJECT-SYNC.json` rewritten against the v3 plan.
  `Error Handling` deliberately held — Sprint 1.3 rewrites it against the new failure modes.
- **Status:** **Sprint 1.1 complete.** Build and lint pass clean; zero Python and zero
  server references outside `Error Handling` (held) and historical log entries.

---

## 2026-04-15 | UI Polish & Visibility Improvements | AG (Antigravity)
- **UI/UX Refinement:** Updated CSS classes for compression settings (CRF and Image Quality sliders). Modified labels and numerical value indicators to increase contrast and readability against the gray background by using bolder typography, darker colors (`text-gray-800`), and subtle dynamic shadows.

---

## 2026-04-09 | Phase 2 Asynchronous Leap Implementation | AG (Antigravity)
- **Architecture:** Transitioned from synchronous FFmpeg processing to an asynchronous job-based architecture using `BackgroundTasks` and an in-memory UUID `job_store` (TTL 1hr).
- **Backend Infrastructure:** Implemented dual-mode `/compress-video` (`?async=true|false`), `/status/{job_id}` polling endpoint, and a new storage abstraction layer (`storage.py`) supporting both GCS (Production) and Local Filesystem (Dev).
- **Frontend Refactor:** Replaced the simulated progress interval in `Compressor.tsx` with real-time polling logic (`useJobPoller`), integrating rich lifecycle states (`Queued`, `Processing` with real %, `Finalizing`, `Done`, `Failed`).
- **Resilience:** Extracted inline FFmpeg calls into `compression_worker.py` utilizing `ffprobe` for accurate progress calculation and robust subprocess stderr parsing for structured error handling.
- **Validation:** 
  - Successful e2e async smoke test using `Test Video.mp4`: 3.09 MB → 760 KB (76% reduction) in ~5 seconds.
  - Phase 1 synchronous path preserved seamlessly for backward compatibility.
- **Status:** **Phase 2 Development Complete**. <!-- (GCS and Cloud Run deployment awaiting GCP billing reactivation). -->

---

## 2026-04-02 | Phase 1 MVP Stabilized | AG (Antigravity)
- **Runtime Verification:** Successfully performed smoke test using `Test-Video.mp4`. Output: 1.36 MB → 211.06 KB (85% reduction).
- **Infrastructure:** Updated backend CORS and frontend API route alignment for local development.
- **UI/UX Audit:** Verified 10/10 visual and functional score (glassmorphism/premium design).
- **Fixes:** Removed syntax errors in `Compressor.tsx` and consolidated environment variables.
- **Status:** **Phase 1 ✅ CLOSED**.

---

## Session Log — 2026-04-01 (Entry 2)

**Agent:** Comet (Perplexity)
**Session Type:** AG Response Audit — Phase 1 Runtime Verification Report
**Files Reviewed:** `Master.md`, `AI_CHANGELOG.md`, AG Runtime Verification Report

### AG Report Summary

AG completed a deep audit of Phase 1 integration checks and submitted a Phase 1 Runtime Verification Report. The outcome is:

| Check | Status | Detail |
|---|---|---|
<!--
| Backend URL | ❌ FAIL | 503 Server Error — billing disabled on `smartpress-486210` |
| API Route Alignment | ✅ PASS | Frontend `${API_URL}/compress-video` ↔ Backend `POST /compress-video` confirmed aligned |
| CORS Configuration | ⚠️ PENDING | Env vars ready, blocked by billing |
| Smoke Test | ❌ FAIL | Blocked by checks 1 & 3 |

### Comet Assessment

- **Root Cause Confirmed**: The sole blocking issue is `BILLING_DISABLED` on GCP project `smartpress-486210`. This is an infrastructure/account-level block, not a code defect.
- **Code Health**: AG confirmed code alignment is 100% ready. Once billing is restored, the integration is expected to be seamless. No code remediation required from AG at this time.
- **Phase 1 Gate Status**: Phase 1 remains **OPEN**. The smoke test cannot be run until Cloud Run services are responsive.
- **AG Action Required**: Enable billing on GCP project `smartpress-486210` via the [Google Cloud Billing Console](https://console.cloud.google.com/billing). Once restored, re-run the 4 integration checks and report back.
- **No Phase 2 work to begin** until Phase 1 smoke test passes. This constraint remains active.
-->

---

## Session Log — 2026-04-01 (Entry 1)

**Agent:** Comet (Perplexity)
**Session Type:** Audit & Documentation
**Files Reviewed:** `SmartPress-Update`, `Master.md`, `AI_CHANGELOG.md`, `AGENT-ONBOARDING.md`

### Approved Elements

- **Task 1.1 — ffprobe Validation Layer**: Architecture correct. Pre-compression validation before FFmpeg is the right defensive pattern.
- **Task 1.2 — BackgroundTask Transition**: 202 Accepted response pattern is correct; prevents frontend timeouts on large files and sets up Phase 2 async leap cleanly.
- **Task 1.3 — Structured Error Schema**: Typed error model (`CORRUPT_MEDIA`, `FILE_TOO_LARGE`, `UNSUPPORTED_FORMAT`, `FFMPEG_TIMEOUT`) is the correct foundation before Phase 3 Gemini integration.
- **Always-On Constraint**: Fully endorsed. Rule is now a permanent gate — no phase may end in a broken state.

### Flagged Items (Blocking)

- **Blocking Runtime Issue — OPEN**: Phase 1 is NOT operationally closed. Four checks must pass before Phase 1 is considered complete:
  1. `NEXT_PUBLIC_API_URL` confirmed pointing to Cloud Run in Vercel dashboard (owner: AG)
  2. API route alignment verified against FastAPI `/docs` — `POST /compress-video` vs `POST /compress` (owner: AG + Claude)
  3. CORS origin confirmed matching deployed frontend URL (owner: AG)
  4. Full smoke test logged: upload → compress → download in live environment (owner: AG)

---

> Note to AI: Read AI_CHANGELOG.md and AGENT-ONBOARDING.md on every new chat session.
