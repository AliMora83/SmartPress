# SmartPress — Intelligent File Compression

> Owner: Ali Mora | Location: Johannesburg, ZA  
> Last updated: 2026-04-02 | Version: 1.2.0

## 🎯 Mission

Provide a fast, professional, and visually stunning web interface for batch image and video compression, leveraging Next.js 15 and a Python-powered FFmpeg backend.

## 🏗 Stack

- **Frontend**: Next.js 15 (App Router) / TypeScript / Tailwind CSS
- **Backend**: Python FastAPI / FFmpeg (Docker-ready)
- **Typography**: Montserrat (Extra Bold for titles)
- **Deployment**: Vercel (Frontend) / Google Cloud Run (Backend)

---

## ✅ Always-On Constraint

SmartPress must remain **functional at the end of every phase**. No phase may leave the product in a broken or offline state.

### Definition of “Functional”

At minimum, the following must work in at least one verified environment (local or deployed):

- Frontend loads without fatal errors.
- Backend responds successfully to a health check (`/` or `/health`).
- A user can complete one full flow: **upload → compress → download**.
- Errors are rendered as structured UX states (typed error model), not generic crashes or silent failures.

---

## 📋 Build Phases

### Phase 1 ✅ MVP Stabilisation

*Focus: Stabilization without architectural changes, with a working synchronous flow.*

**Objectives**

- Implement a working synchronous compression path:
  - upload file → validate → compress with FFmpeg → return compressed output.
- Add robust `ffprobe` validation and a canonical error model.
- Ensure the app is operational in local dev and at least one deployed environment.

**Tasks**

- [x] Initial UI redesign with fixed sidebar and Montserrat branding.
- [x] Backend FastAPI scaffold with FFmpeg integration.
- [x] **Task 1.1** — ffprobe Validation Layer: Implement a pre-compression check using `ffprobe` to catch corrupt files and unsupported codecs before processing begins.
- [x] **Task 1.2** — BackgroundTask Transition: Move `ffmpeg.run` into FastAPI `BackgroundTasks`; API returns 202 Accepted immediately to prevent frontend timeouts on large files.
- [x] **Task 1.3** — Structured Error Schema: Map FFmpeg exit codes to the canonical JSON error model (`CORRUPT_MEDIA`, `FILE_TOO_LARGE`, `UNSUPPORTED_FORMAT`, `FFMPEG_TIMEOUT`, etc.). See `Error Handling` file.
- [x] **Phase 1 Runtime Verification**: Resolved syntax errors and performed a successful smoke test with `Test-Video.mp4`.

**Phase 1 Status: ✅ CLOSED**

---

### Phase 2 🔄 The Asynchronous Leap

*Focus: Decoupling compute from the API while staying usable throughout.*

**Objectives**

- Move heavy FFmpeg workloads off the request-response thread (Cloud Run Jobs).
- Introduce job-based processing with status polling.
- Preserve an operational compression path throughout migration.

**Tasks**

- [ ] **Task 2.1** — Cloud Run Jobs Integration: Move heavy FFmpeg execution out of the main API container into **Cloud Run Jobs**.
- [ ] **Task 2.2** — Status Polling API:
  - Implement `/status/{job_id}` endpoint.
  - Frontend transitions from a single “waiting” state to progress-tracking states:
    - `Queued`, `Processing`, `Finalizing`, `Completed`, `Failed`.
- [ ] **Task 2.3** — Persistent Storage (GCS):
  - Replace `temp_uploads` and `temp_processed` local directories with **Google Cloud Storage** buckets for durability and scaling.

**Phase 2 Runtime Rule**

- Do **not** remove or break the existing working compression flow until:
  - Cloud Run Jobs + status polling are fully verified.
- Job-based processing must be introduced as an **additive improvement**, not a breaking replacement.
- End-of-phase check:
  - A user can still complete upload → compress → download via the current UX (synchronous or job-based).
  - Status states are reflected correctly in the UI.

---

### Phase 3 🧠 Intelligent Diagnostics & Scale

*Focus: AI integration and high-capacity handling, with graceful degradation.*

**Objectives**

- Use Gemini to interpret FFmpeg logs into human-friendly messages and remediation tips.
- Optimize upload and delivery paths using signed URLs and CDN.
- Ensure core compression works even if AI/CDN are down.

**Tasks**

- [ ] **Task 3.1** — Gemini Log Interpreter:
  - Integrate **Vertex AI (Gemini 1.5 Flash)** to analyze FFmpeg `stderr` on failure.
  - Generate user-friendly remediation tips (e.g., “File header missing, try re-exporting from your editor.”).
- [ ] **Task 3.2** — Direct-to-GCS Uploads:
  - Implement **Signed URLs** so the browser uploads files directly to Cloud Storage, bypassing Cloud Run request size limits and reducing memory/CPU on the API.
- [ ] **Task 3.3** — Edge Delivery:
  - Enable **Cloud CDN** for the `processed/` bucket for rapid downloads for users in Southern Africa and beyond.

**Phase 3 Runtime Rule**

- Compression must still work if:
  - Gemini log interpretation is unavailable or misconfigured.
  - Cloud CDN is misconfigured or temporarily disabled.
- AI and edge features are **enhancements**, not hard dependencies for the core upload → compress → download flow.

---

## ✅ Blocking Runtime Issue

**Status: CLOSED (2026-04-02)**  
**Priority:** High  
**Owners:** Claude (review), AG (fix), Comet (documentation follow-up)

All 4 integration checks (Backend Base URL, API Route Alignment, CORS, and Smoke Test) have been completed successfully.

---

## 👥 Agent Assignments

| Agent          | Role                                   |
|----------------|----------------------------------------|
| Claude         | UX & Product Decisions                |
| Comet          | Documentation & Audit                 |
| Gemini         | Architecture & UI Proposals           |
| AG (Antigravity) | Implementation — executes AG-Update.md |

---

## 📋 Review Log

| Date | Agent | Activity |
|:---|:---|:---|
| 2026-04-02 | AG (Antigravity) | Smoke Test — Phase 1 Runtime Verification |

**Smoke Test Details (PASS):**
- **Environment:** Local Development (Next.js 15 + FastAPI)
- **File tested:** `Test-Video.mp4` (1.36 MB)
- **Result:** **PASS**
- **Output:** 211.06 KB (85% reduction)
- **Download:** Verified successful download from backend.
- **Error Handling:** Verified recoverable error for malformed test files.
- **Visual Audit Score:** 10/10

| 2026-04-01 | Comet (Perplexity) | Reviewed & approved SmartPress Evolution Plan (`SmartPress-Update`) and added Always-On Constraint + Blocking Runtime Issue | Phase 1 tasks documented as complete from an implementation/planning perspective, but operational runtime verification is still required before Phase 1 is considered fully closed. Claude: ensure UI accommodates Job Status states (Queued, Processing, Finalizing). Comet: verify Cloud Run Jobs IAM/Pub-Sub trigger permissions in Phase 2.1. |
| 2026-04-01 | Comet (Perplexity) | Reviewed `SmartPress-Update` incl. Claude sign-off response. Approved: Sprint 1 tasks (1.1 ffprobe, 1.2 BackgroundTask, 1.3 Error Schema). Flagged: Blocking Runtime Issue remains open. | Phase 1 gate is smoke test. AG owns fix; Claude owns UX design for status states; Comet monitors documentation. |

> Note to AI: Read AI_CHANGELOG.md and AGENT-ONBOARDING.md on every new chat session.
