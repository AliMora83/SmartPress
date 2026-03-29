# 🧐 🤖 SmartPress – Master.md
> Last updated: 2026-03-29 | Owner: Ali Mora | Namka Ecosystem

---

## ⚠️ For AI Agents
This is the single source of truth for this project.
Read this entire file before taking any action.
Do not rely on chat history alone — this file persists across all sessions.
After completing work, add a Review Log entry below.

---

## 📌 Project Snapshot

| Field | Value |
|-------|-------|
| **Project Name** | SmartPress |
| **Repo** | https://github.com/AliMora83/SmartPress |
| **Stack** | TypeScript / Next.js 15 / Python / FastAPI / FFmpeg / Tailwind CSS |
| **Status** | Active |
| **Priority** | 🟡 Priority 2 |
| **Assigned Agent** | Comet / Claude |
| **Dashboard Visible** | Yes |
| **Last Updated** | 2026-03-29 |

---

## 🎯 Project Goal

SmartPress is a fast, smart compression tool for images (JPG, PNG) and videos (MP4), featuring a two-column UI with Smart-Bot branding, batch operations, and a Python FastAPI backend powered by FFmpeg. The goal is to ship a stable, zero-auth MVP that anyone can self-host or deploy to Vercel + Cloud Run in minutes.

---

## 🏗 Architecture

### Stack
- **Framework:** Next.js 15
- **Language:** TypeScript
- **Styling:** Tailwind CSS + Montserrat (Extra Bold)
- **Database:** None (stateless file processing)
- **Auth:** None (public tool)
- **AI:** None (FFmpeg-powered backend)
- **Hosting:** Vercel (frontend) / Docker + Google Cloud Run (backend)

### Data Flow
```
User → Next.js 15 (Vercel) → FastAPI Backend (Cloud Run) → FFmpeg subprocess → Compressed Output → Client Download
```

---

## 📋 Current Status

### ✅ Completed
- [x] Project scaffolding — Next.js 15 + TypeScript + Tailwind CSS
- [x] Python FastAPI backend with FFmpeg integration
- [x] Two-column UI with Smart-Bot mascot branding
- [x] Image compression (JPG, PNG)
- [x] Video compression (MP4)
- [x] Batch Compress All + Download All functionality
- [x] `smartpress_*` output file naming convention
- [x] Dockerfile + Cloud Run deployment config
- [x] DEPLOY.md and DEPLOY_CLOUD_RUN.md guides
- [x] MACP protocol and initial Master.md

### 🔄 In Progress
- [ ] FFmpeg pipeline stability validation
- [ ] Error handling for unsupported media formats

### 🔜 Next Steps
- [ ] Add progress indicator for large video file compression
- [ ] WebP and AVIF output format support
- [ ] User-defined quality sliders per format
- [ ] Deploy frontend to Vercel + backend to Cloud Run

### 🚫 Blockers
- None

---

## 🔑 Key Decisions
> Log important architectural or product decisions here so agents don't re-debate them.

| Date | Decision | Reason |
|------|----------|--------|
| 2026-03-29 | Python FastAPI + FFmpeg for backend | FFmpeg is the industry standard for media processing; FastAPI is lightweight and async-friendly |
| 2026-03-29 | Next.js 15 for frontend | TypeScript support, Vercel deployment, fast dev cycle |
| 2026-03-29 | Stateless architecture (no DB/auth) | SmartPress is a utility tool — no user accounts needed for MVP |
| 2026-03-29 | Docker + Cloud Run for backend deployment | `.gcloudignore` + `Dockerfile` already present in repo |

---

## 📁 File Structure

```
SmartPress/
├── AGENT-ONBOARDING.md      # Agent rules (same across all projects)
├── Master.md                # This file — source of truth
├── README.md                # Human-readable overview
├── DEPLOY.md                # Deployment guide
├── DEPLOY_CLOUD_RUN.md      # Cloud Run deployment guide
├── Dockerfile               # Backend containerisation
├── app/                     # Next.js app directory
├── components/              # React components
├── backend/                 # Python FastAPI + FFmpeg
└── public/                  # Smart-Bot mascot + static assets
```

---

## 📋 Review Log

> Agents: append new entries at the TOP of this section (newest first)

---

### Review Entry — 2026-03-29
**Agent**: Comet (Perplexity)
**Status**: Agent Reviewed
**Topic**: Initial Master.md structure & architecture review

#### Analysis
Reviewed existing README.md, project structure, Dockerfile, and deployment configs. Two-tier architecture confirmed: Next.js 15 frontend (Vercel) + Python FastAPI backend (Docker/Cloud Run). FFmpeg invoked via Python subprocess. Batch operations are sequential — no parallel queue yet. Project is stateless with no DB or auth required for MVP. CI/CD workflow exists under `.github/workflows/`.

#### Recommendations
- Validate FFmpeg pipeline stability and add error handling for unsupported formats
- Add a progress bar / streaming feedback for large video files
- Consider WebP and AVIF output support post-MVP

#### Next Action
> ⚡ **Claude to cross-check** FFmpeg pipeline, validate error handling for unsupported formats, and mark architecture decisions as `Ratified`.

---

## 🔗 Related Resources

- [AGENT-ONBOARDING.md](./AGENT-ONBOARDING.md) - Agent rules & MACP protocol
- [README.md](./README.md) - Project overview
- [DEPLOY.md](./DEPLOY.md) - Deployment guide
- [DEPLOY_CLOUD_RUN.md](./DEPLOY_CLOUD_RUN.md) - Cloud Run deployment
- [Namka Control Dashboard](https://control.namka.cloud) - *(coming soon)*

---

*This is a living document. AI agents update this file with reviews, status changes, and recommendations.*
*Newest Review Log entries go at the TOP.*
