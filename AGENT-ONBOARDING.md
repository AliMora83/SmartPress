# 🤖 Agent Onboarding – Namka Ecosystem
> Read this file completely before taking any action.

---

## 👤 Owner
**Ali Mora** | Johannesburg, ZA | Building AI-assisted SaaS at velocity

---

## ⚠️ Agent Rules — Non-Negotiable

1. **Read Master.md FIRST** — before any decision, any code, any recommendation
2. **Never contradict Master.md** without explicitly flagging the conflict
3. **Never rely on chat history alone** — chat context gets lost; Master.md is permanent
4. **After completing work** — add a Review Log entry to this project's Master.md
5. **Cross-check before acting** — if unsure, flag it for another agent to validate (MACP)
6. **Update status honestly** — do not mark something complete unless it is verifiably done
7. **Dashboard sync** — any status change here will reflect on control.namka.cloud

---

## 🌐 The Namka Ecosystem

### What This Is
Ali manages 10+ AI-assisted SaaS projects. Each project has its own:
- `Master.md` — project-level source of truth
- `README.md` — human-readable overview

The **Namka Control Dashboard** (control.namka.cloud) aggregates all project
Master.md files into a single mission control view. Your updates here are
visible on the dashboard.

### The Chain of Truth
```
Your Project Master.md
        ↓
Namka Control Dashboard (reads all project Master.md files)
        ↓
Ali sees all projects in one place
```

---

## 🤖 Multi-Agent Coordination Protocol (MACP)

### Why It Exists
AI agents hallucinate. Long chat sessions lose context. MACP is the solution:
- Master.md is the **memory layer** — persists across all sessions
- Agent reviews are the **audit trail** — who said what and when
- Cross-checking is the **quality gate** — one agent validates another

### Agent Roles

| Agent | Role | Focus |
|-------|------|-------|
| **Gemini** | Architecture & Analysis | Multi-project oversight, strategic decisions |
| **Claude** | Frontend & UX | React/TypeScript, dashboard, UI components |
| **Antigravity** | Rapid Implementation | Full-stack execution, backend APIs |
| **Comet** | Cross-Checking & Coordination | Review validation, consistency checks |
| **Qwen** | Backend & APIs | Python, Odoo, data pipelines |

### MACP Workflow
1. Agent reads Master.md
2. Agent does the work
3. Agent writes a Review Log entry in Master.md
4. Another agent cross-checks the entry
5. Ali approves on the dashboard → status locked in

---

## 📋 How to Write a Review Log Entry

Add this block to the project's Master.md under `## 📋 Review Log`:

```markdown
### Review Entry — YYYY-MM-DD
**Agent**: [Your name]
**Status**: [Completed / In Progress / Blocked]
**Topic**: [What you worked on]

#### Analysis
[What you found, built, or decided]

#### Recommendations
[What should happen next]

#### Next Action
> ⚡ **[Agent name] to proceed**: [Specific next step]
```

---

## 🔗 Key Links

- **Dashboard**: https://control.namka.cloud *(coming soon)*
- **Parent Repo**: https://github.com/AliMora83/Namka-Mission-Control
- **Dashboard Repo**: https://github.com/AliMora83/namka-control

---

*This file is the same across all Namka projects. Do not modify per-project.*
