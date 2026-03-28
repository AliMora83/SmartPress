# 🗜️ SmartPress – AI-Assisted Development

> **Version:** 1.0 | **Last Updated:** 2026-03-29 | **Owner:** Ali Mora
> **Mission Control:** [https://github.com/AliMora83/Namka-Mission-Control/blob/main/Master.md](https://github.com/AliMora83/Namka-Mission-Control/blob/main/Master.md)

---

## 📖 How to Use This File

**For Ali:** Update the Project Overview, Current Goal, and Decision Log as the project evolves.

**For AI Agents:** Before starting work on this project:
1. Read this `Master.md` file first
2. Check the **AI Reviews & Artifacts** section for existing architectural decisions
3. Follow the **Multi-Agent Context Protocol (MACP)** below
4. Commit your review to this file when done

---

## 🚀 Project Overview

**Description:** SmartPress is a fast, smart compression tool for images (JPG, PNG) and videos (MP4), featuring a two-column UI with Smart-Bot branding, batch operations, and a Python FastAPI backend powered by FFmpeg.

**Status:** In Progress

**Priority:** Priority 2 – Active Development

**Stack:** TypeScript / Next.js 15 / Python / FastAPI / FFmpeg / Tailwind CSS

**Repo:** [https://github.com/AliMora83/SmartPress](https://github.com/AliMora83/SmartPress)

**Live URL:** _Not yet deployed_

**AI Model Assigned:** Comet / Claude

---

## 🎯 Current Goal

**Next Milestone:** Ship a stable MVP with working image + video compression and Download All functionality

**Next Step:** Validate FFmpeg pipeline stability and add error handling for unsupported formats

**Blocker:** None

**Effort Estimate:** M

**Progress:** 60%

---

## 🏗 Tech Stack & Dependencies

- **Frontend:** Next.js 15, TypeScript, Tailwind CSS, Montserrat (Extra Bold)
- **Backend:** Python FastAPI
- **Media Processing:** FFmpeg (via Python subprocess)
- **Database:** None (stateless file processing)
- **Auth:** None (public tool)
- **Deployment:** Vercel (frontend), Docker / Cloud Run (backend)
- **APIs:** None (fully self-contained)

---

## 🤖 Multi-Agent Context Protocol (MACP)

> **Critical:** All agents must follow this protocol to prevent hallucinations and ensure coordination.

### Workflow for AI Agents

1. **Read Master.md first** — Check the **AI Reviews & Artifacts** section below for existing decisions.
2. **Review consensus states:**
   - `Unreviewed` → No agent has reviewed this yet
   - `Agent Reviewed` → One agent has reviewed (needs cross-check)
   - `Cross-Checked` → Two agents agree (pending Ali's ratification)
   - `Ratified` → **Locked truth** — do not re-architect without Ali's explicit approval
3. **Document your work:**
   - After completing a task or reviewing architecture, add an entry to **AI Reviews & Artifacts** (format below)
   - Commit the update to this `Master.md` file
   - Mark the entry as `Agent Reviewed`
4. **Cross-check other agents' work:**
   - If you see an `Agent Reviewed` entry, read it and either confirm or flag disagreements
   - Update the status to `Cross-Checked` if you agree
   - If you disagree, add your conflicting review and mark it `Needs Resolution`

### Why This Matters
- **Prevents hallucinations:** Agents won't invent APIs, file paths, or architectures that don't exist
- **Ensures consistency:** All agents work from the same source of truth
- **Saves time:** No rework from conflicting decisions

---

## 🤖 AI Reviews & Artifacts

> This section is the shared context layer for all AI agents working on this project.
> Before starting work, read the relevant entries here to understand existing architectural decisions.

### Review Entry Format

When adding a review, use this format:

```markdown
---
### YYYY-MM-DD — [Task/Feature Name] ([Agent Name] / [Provider])
**Status:** `[Unreviewed / Agent Reviewed / Cross-Checked / Ratified]`
**Reviewed by:** [Agent Name] ([Provider])
**Scope:** [Brief description of what was reviewed/built]

#### Key Decisions
- [Decision 1]
- [Decision 2]

#### Implementation Notes
[Any code snippets, architecture diagrams, or important technical details]

#### Next Step
[What the next agent should do, or what needs Ali's approval]

---
> 🔁 **Next:** [Agent name] to cross-check and mark as `Ratified`, or Ali to approve.
```

---

### 2026-03-29 — Initial Master.md Structure & Architecture Review (Comet / Perplexity)

**Status:** `Agent Reviewed` — pending cross-check

**Reviewed by:** Comet (Perplexity)

**Scope:** Initial creation of Master.md; review of existing README.md, project structure, and tech stack for SmartPress.

#### Key Decisions
1. **Architecture:** Two-tier — Next.js 15 frontend (Vercel) + Python FastAPI backend (Docker/Cloud Run)
2. **Media processing:** FFmpeg invoked via Python subprocess in the FastAPI backend; client-side preview only in the frontend
3. **File naming:** All compressed outputs prefixed with `smartpress_` for easy identification
4. **Batch operations:** Sequential processing (Compress All → Download All) — no parallel queue implemented yet
5. **Auth/DB:** None — SmartPress is a stateless public tool; no user data stored
6. **Deployment:** Frontend on Vercel; backend containerised via Dockerfile + `.gcloudignore` suggests Cloud Run as target

#### Implementation Notes
- Project structure: `app/` (Next.js), `components/` (React), `backend/` (FastAPI + FFmpeg), `public/` (Smart-Bot mascot assets)
- Backend runs on port 8000; frontend proxies compression requests to it
- CI/CD workflow exists under `.github/workflows/` — review before deploying

#### Next Step
Claude or Gemini to cross-check backend FFmpeg pipeline, validate error handling for unsupported formats, and mark as `Ratified`.

---

> 🔁 **Next:** Claude to cross-check and mark as `Ratified`, or Ali to approve architecture decisions above.

---

## 📡 Integration with Mission Control

This project is tracked in **Mission Control** (the central hub for all Ali's projects).

- **Mission Control Master.md:** [https://github.com/AliMora83/Namka-Mission-Control/blob/main/Master.md](https://github.com/AliMora83/Namka-Mission-Control/blob/main/Master.md)
- **Live Dashboard:** `http://localhost:3000` _(when Mission Control is running)_

### How Updates Flow
1. Agent updates this project's `Master.md` (commits review/progress)
2. Mission Control dashboard reads this file via GitHub raw URL
3. Ali sees updated status in Mission Control without manual sync

### Project Metadata (for Mission Control Dashboard)
**These fields are read by Mission Control — keep them updated:**

- **Status:** Active
- **Next Step:** Validate FFmpeg pipeline stability and add error handling
- **Blocker:** None
- **AI Model:** Comet / Claude
- **Effort:** M
- **Progress:** 60%
- **Last Commit:** _(Auto-pulled from GitHub)_

---

## 📝 Notes & Decisions

### Decision Log

| Date | Decision | Rationale | Decided By |
|------|----------|-----------|------------|
| 2026-03-29 | Use Python FastAPI + FFmpeg for backend | FFmpeg is the industry standard for media processing; FastAPI is lightweight and async-friendly | Ali / Comet |
| 2026-03-29 | Next.js 15 for frontend | TypeScript support, Vercel deployment, fast dev cycle | Ali |
| 2026-03-29 | Stateless architecture (no DB/auth) | SmartPress is a utility tool — no user accounts needed for MVP | Ali |
| 2026-03-29 | Docker + Cloud Run for backend deployment | `.gcloudignore` + `Dockerfile` already present in repo | Ali |

### Known Issues
- Error handling for unsupported media formats not yet implemented
- No progress indicator for large video files during compression

### Future Enhancements
- Progress bar / streaming feedback for video compression
- WebP and AVIF output format support
- User-defined quality sliders per format
- Optional: cloud storage integration (GCS / S3) for compressed outputs

---

## 🔗 Quick Links

- **Repo:** [https://github.com/AliMora83/SmartPress](https://github.com/AliMora83/SmartPress)
- **Live URL:** _Not yet deployed_
- **Mission Control:** [https://github.com/AliMora83/Namka-Mission-Control/blob/main/Master.md](https://github.com/AliMora83/Namka-Mission-Control/blob/main/Master.md)
- **Deploy Guide:** [DEPLOY.md](./DEPLOY.md)
- **Cloud Run Deploy Guide:** [DEPLOY_CLOUD_RUN.md](./DEPLOY_CLOUD_RUN.md)

---

_Last updated by: Comet (Perplexity) on 2026-03-29_
