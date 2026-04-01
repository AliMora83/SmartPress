# SmartPress — Intelligent File Compression

> Owner: Ali Mora | Location: Johannesburg, ZA
> Last updated: 2026-04-01 | Version: 1.1.0

## 🎯 Mission

Provide a fast, professional, and visually stunning web interface for batch image and video compression, leveraging Next.js 15 and a Python-powered FFmpeg backend.

## 🏗 Stack

- **Frontend**: Next.js 15 (App Router) / TypeScript / Tailwind CSS
- **Backend**: Python FastAPI / FFmpeg (Docker-ready)
- **Typography**: Montserrat (Extra Bold for titles)
- **Deployment**: Vercel (Frontend) / Google Cloud Run (Backend)

## 📋 Build Phases

### Phase 1 ✅ MVP Stabilisation
*Focus: Stabilization without architectural changes.*

- [x] Initial UI redesign with fixed sidebar and Montserrat branding.
- [x] Backend FastAPI scaffold with FFmpeg integration.
- [x] **Task 1.1** — ffprobe Validation Layer: Implement a pre-compression check using `ffprobe` to catch corrupt files and unsupported codecs before processing begins.
- [x] **Task 1.2** — BackgroundTask Transition: Move `ffmpeg.run` into FastAPI `BackgroundTasks`; API returns 202 Accepted immediately to prevent frontend timeouts on large files.
- [x] **Task 1.3** — Structured Error Schema: Map FFmpeg exit codes to the canonical JSON error model (`CORRUPT_MEDIA`, `FILE_TOO_LARGE`, `UNSUPPORTED_FORMAT`, `FFMPEG_TIMEOUT`, etc.). See `Error Handling` file.

### Phase 2 🔄 The Asynchronous Leap
*Focus: Decoupling compute from the API.*

- [ ] **Task 2.1** — Cloud Run Jobs Integration: Move heavy FFmpeg execution out of the main API container into **Cloud Run Jobs**.
- [ ] **Task 2.2** — Status Polling API: Implement `/status/{job_id}` endpoint; frontend transitions from single "waiting" state to progress-tracking (Queued → Processing → Finalizing).
- [ ] **Task 2.3** — Persistent Storage (GCS): Replace `temp_uploads` and `temp_processed` local directories with **Google Cloud Storage** buckets for durability and scaling.

### Phase 3 🧠 Intelligent Diagnostics & Scale
*Focus: AI Integration and high-capacity handling.*

- [ ] **Task 3.1** — Gemini Log Interpreter: Integrate **Vertex AI (Gemini 1.5 Flash)** to analyze FFmpeg `stderr` on failure and generate user-friendly remediation tips.
- [ ] **Task 3.2** — Direct-to-GCS Uploads: Implement **Signed URLs** so the browser uploads files directly to Cloud Storage, bypassing Cloud Run request size limits.
- [ ] **Task 3.3** — Edge Delivery: Enable **Cloud CDN** for the `processed/` bucket for rapid downloads for users in Southern Africa and beyond.

## 👥 Agent Assignments

| Agent | Role |
|---|---|
| Claude | UX & Product Decisions |
| Comet | Documentation & Audit |
| Gemini | Architecture & UI Proposals |
| AG (Antigravity) | Implementation — executes AG-Update.md |

## 📋 Review Log

| Date | Agent | Action | Notes |
|---|---|---|---|
| 2026-04-01 | Comet (Perplexity) | Reviewed & approved SmartPress Evolution Plan (`SmartPress-Update`) | Phase 1 tasks confirmed complete based on `Error Handling` and `Stabilise FFmpeg` suggestion files. Phase 2 & 3 added to build phases. Claude: ensure UI accommodates Job Status states (Queued, Processing, Finalizing). Comet: verify Cloud Run Jobs IAM/Pub-Sub trigger permissions in Phase 2.1. |

> Note to AI: Read AI_CHANGELOG.md and AGENT-ONBOARDING.md on every new chat session.
