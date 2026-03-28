# 🎯 [Project Name] – AI-Assisted Development

> **Template Version:** 1.0 | **Last Updated:** YYYY-MM-DD | **Owner:** [Your Name]
> **Mission Control:** [https://github.com/AliMora83/Namka-Mission-Control/blob/main/Master.md](https://github.com/AliMora83/Namka-Mission-Control/blob/main/Master.md)

---

## 📖 How to Use This Template

**For Ali:** Copy this template into each new project repo as `Master.md` in the root directory. Update the project-specific sections (Project Overview, Tech Stack, etc.).

**For AI Agents:** Before starting work on this project:
1. Read this `Master.md` file first
2. Check the **AI Reviews & Artifacts** section for existing architectural decisions
3. Follow the **Multi-Agent Context Protocol (MACP)** below
4. Commit your review to this file when done

---

## 🚀 Project Overview

**Description:** [Brief 1-2 sentence description of what this project does]

**Status:** [Not Started / In Progress / Live / On Hold]

**Priority:** [Priority 1 - Ship Now / Priority 2 - Active Development / Priority 3 - Backlog]

**Stack:** [e.g., TypeScript / React / Next.js / Firebase]

**Repo:** [https://github.com/AliMora83/[repo-name]](https://github.com/AliMora83/[repo-name])

**Live URL:** [https://example.com](https://example.com) _(if deployed)_

**AI Model Assigned:** [Claude / Gemini / Qwen / Comet]

---

## 🎯 Current Goal

**Next Milestone:** [Clear, concrete goal — e.g., "Launch MVP with auth + dashboard"]

**Next Step:** [Immediate actionable task — e.g., "Build user authentication flow"]

**Blocker:** [None / Needs payment gateway decision / Needs Ali's approval]

**Effort Estimate:** [S / M / L / XL]

**Progress:** [0-100%] _(optional)_

---

## 🏗 Tech Stack & Dependencies

- **Frontend:** [React, Tailwind CSS, shadcn/ui, etc.]
- **Backend:** [Node.js, Firebase, Supabase, etc.]
- **Database:** [PostgreSQL, Firebase Firestore, etc.]
- **Auth:** [Firebase Auth, Clerk, etc.]
- **Deployment:** [Vercel, Netlify, etc.]
- **APIs:** [List any external APIs used]

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
- [Decision 3]

#### Implementation Notes

[Any code snippets, architecture diagrams, or important technical details]

#### Next Step

[What the next agent should do, or what needs Ali's approval]

---

> 🔁 **Next:** [Agent name] to cross-check and mark as `Ratified`, or Ali to approve.
```

### Example Review Entry

---

### 2026-03-28 — Authentication Flow (Claude / Anthropic)

**Status:** `Agent Reviewed` — pending Gemini cross-check
**Reviewed by:** Claude (Anthropic)
**Scope:** User authentication using Firebase Auth + email/password

#### Key Decisions

1. **Auth provider:** Firebase Auth (free tier supports 10K active users)
2. **Sign-in methods:** Email/password + Google OAuth
3. **Session management:** Firebase handles tokens automatically
4. **Protected routes:** Use Next.js middleware to check auth state

#### Implementation Notes

```typescript
// lib/auth.ts
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

export async function signIn(email: string, password: string) {
  const auth = getAuth();
  return signInWithEmailAndPassword(auth, email, password);
}
```

#### Next Step

Gemini to review and confirm Firebase Auth setup, then build the sign-in UI components.

---

> 🔁 **Next:** Gemini to cross-check and mark as `Ratified`.

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

- **Status:** [Active / On Hold / Completed]
- **Next Step:** [Current actionable task]
- **Blocker:** [None / Needs Ali's approval / Needs decision]
- **AI Model:** [Claude / Gemini / Qwen / Comet]
- **Effort:** [S / M / L / XL]
- **Progress:** [0-100%] _(optional)_
- **Last Commit:** [Auto-pulled from GitHub]

---

## 📝 Notes & Decisions

### Decision Log

| Date | Decision | Rationale | Decided By |
|------|----------|-----------|------------|
| YYYY-MM-DD | [Decision made] | [Why this was chosen] | Ali / Agent |

### Known Issues

- [Issue 1]
- [Issue 2]

### Future Enhancements

- [Feature idea 1]
- [Feature idea 2]

---

## 🔗 Quick Links

- **Repo:** [https://github.com/AliMora83/[repo-name]](https://github.com/AliMora83/[repo-name])
- **Live URL:** [https://example.com](https://example.com)
- **Mission Control:** [https://github.com/AliMora83/Namka-Mission-Control/blob/main/Master.md](https://github.com/AliMora83/Namka-Mission-Control/blob/main/Master.md)
- **Design/Figma:** [Link if applicable]
- **Documentation:** [Link if applicable]

---

_Last updated by: [Agent Name] on YYYY-MM-DD_
