## 📌 AG-Update Meta

- Phase: Phase 3
- Sprint: Sprint 1 — Data Layer
- Issued by: Claude (UX & Product Owner)
- Date: 2026-04-04
- Time: 17:45 SAST
- Status: READY

***

# AG-Update — Phase 3 Sprint 1: Data Layer

> **Source of truth:** `Master.md` v1.0.32 — Phase 3 approved items
> **AG:** Read this file top to bottom before touching any code. Execute in exact sequence. Do not begin Sprint 2 work.

---

## 🎯 Objective

Replace the current dashboard data source (single `Master.md` parse via `/api/master`) with a dedicated `/api/projects` aggregation route that fetches `PROJECT-SYNC.json` from all 7 active repos in parallel, applies interim caching, and renders typed project cards on the Dashboard.

This implements **Master.md Phase 3 Item 1: "Implement caching for GitHub API calls"**.

---

## 📦 Repos to Aggregate

AG must fetch `PROJECT-SYNC.json` from each of these repos. All are under the `AliMora83` GitHub account:

| # | Repo | PROJECT-SYNC.json path |
|---|---|---|
| 1 | `namka-control` | `/PROJECT-SYNC.json` |
| 2 | `Odoo-POS-Terminal` | `/PROJECT-SYNC.json` |
| 3 | `SmartPress` | `/PROJECT-SYNC.json` |
| 4 | `Atlas-Website` | `/PROJECT-SYNC.json` |
| 5 | `Kora-Tutor` | `/PROJECT-SYNC.json` |
| 6 | `EventSaas` | `/PROJECT-SYNC.json` |
| 7 | `Odoo-BA-API` | `/PROJECT-SYNC.json` |

---

## 🗂️ Files to Create or Modify

### 1. CREATE — `src/types/project-sync.ts`

Create a TypeScript interface that matches the live `PROJECT-SYNC.json` schema exactly.

```typescript
export interface ProjectSync {
  project: string;
  repo: string;
  branch: string;
  stack: string;
  status: "Active" | "In Progress" | "Maintenance" | "Complete";
  priority: 1 | 2 | 3;
  priority_label: string;
  progress_percent: number;
  progress_label: string;
  current_phase: string;
  next_step: string;
  blocker: string | null;
  live_url: string;
  deploy_target: string;
  agents: string[];
  version: string;
  last_push: {
    timestamp: string;
    actor: string;
    commit_message: string;
    sha: string;
  };
  last_updated: string;
}
```

---

### 2. CREATE — `src/app/api/projects/route.ts`

Aggregate `PROJECT-SYNC.json` from all 7 repos in parallel using `Promise.allSettled`. Failed fetches must not break the response — return partial data with an error flag per repo.

```typescript
import { NextResponse } from "next/server";
import { ProjectSync } from "@/types/project-sync";

// Interim caching: revalidate every 5 minutes.
// Sprint 2 will replace this with Supabase realtime once ratified.
export const revalidate = 300;

const REPOS = [
  "namka-control",
  "Odoo-POS-Terminal",
  "SmartPress",
  "Atlas-Website",
  "Kora-Tutor",
  "EventSaas",
  "Odoo-BA-API",
];

const GITHUB_OWNER = "AliMora83";

async function fetchProjectSync(repo: string): Promise<ProjectSync | null> {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${repo}/contents/PROJECT-SYNC.json`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github.v3.raw",
    },
    next: { revalidate: 300 },
  });

  if (!res.ok) {
    console.error(`[api/projects] Failed to fetch ${repo}: ${res.status}`);
    return null;
  }

  return res.json() as Promise<ProjectSync>;
}

export async function GET() {
  const results = await Promise.allSettled(
    REPOS.map((repo) => fetchProjectSync(repo))
  );

  const projects: ProjectSync[] = [];
  const errors: string[] = [];

  results.forEach((result, index) => {
    if (result.status === "fulfilled" && result.value !== null) {
      projects.push(result.value);
    } else {
      errors.push(REPOS[index]);
    }
  });

  return NextResponse.json({
    projects,
    errors: errors.length > 0 ? errors : null,
    fetched_at: new Date().toISOString(),
  });
}
```

---

### 3. MODIFY — `src/app/api/master/route.ts`

Add a scope comment at the top of the file to make its governance-only role explicit and prevent future drift.

Add this comment block immediately after the imports:

```typescript
/**
 * /api/master — Governance data only.
 *
 * This route fetches Master.md from the namka-control repo and returns
 * parsed governance metadata: version, current phase, last updated, and
 * review log entries.
 *
 * It does NOT return project card data. Project card data is served by
 * /api/projects which aggregates PROJECT-SYNC.json from all active repos.
 *
 * Do not add project portfolio data to this route.
 */
```

---

### 4. MODIFY — Dashboard component (project cards section)

Wire the Dashboard's project card rendering to `/api/projects` instead of deriving project data from the `/api/master` parse.

AG must:

- Identify the component currently rendering project cards (likely in `src/app/page.tsx` or a `ProjectCard` / `Dashboard` component).
- Add a `fetch("/api/projects")` call on the server side (Server Component) or via `useEffect` (Client Component) depending on current architecture.
- Map `ProjectSync[]` to project card props.
- Ensure each card renders at minimum: `project` name, `status`, `priority_label`, `progress_percent`, `next_step`, `blocker` (null = no badge), `live_url`, `last_updated`.
- If `blocker` is not null, render a visible red indicator on the card.
- If `/api/projects` returns an `errors` array (partial failure), render an `ErrorCard` placeholder for each failed repo — do not silently drop it.

---

### 5. VERIFY — `next.config.ts`

Confirm `output: 'standalone'` is present. If missing, add it.

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
```

---

## ✅ Acceptance Gate

AG must not mark this sprint COMPLETE until all of the following pass:

| # | Check | Pass Condition |
|---|---|---|
| 1 | All 7 project cards render | Dashboard shows all 7 repos without blank cards |
| 2 | Partial failure handled | Manually remove `GITHUB_TOKEN` temporarily — ErrorCard appears, no crash |
| 3 | Caching active | `revalidate = 300` present in `/api/projects/route.ts` |
| 4 | `/api/master` scoped | Governance comment block present in master route |
| 5 | `blocker` badge | SmartPress card shows red indicator (blocker is non-null) |
| 6 | TypeScript clean | `npm run build` passes with zero type errors |
| 7 | `output: standalone` | Confirmed in `next.config.ts` |

---

## 🚫 Out of Scope for This Sprint

AG must not implement any of the following — they belong to future sprints pending ratification:

- Supabase integration of any kind
- Progress bar UI component
- Zero-downtime deploy / health check endpoint
- Lighthouse performance audit
- Filter or sort controls
- Any change to `Master.md`, `Master-Update.md`, or `AI-Logs.md` other than the execution report

---

## 📝 After Execution

AG records outcomes in `AI-Logs.md` using this format:

```md
## AG Execution Log — Phase 3 Sprint 1

- Date: YYYY-MM-DD
- Status: COMPLETE | BLOCKED
- Work order: AG-Update.md (Session 11)

### Completed
- [ ] `src/types/project-sync.ts` created
- [ ] `src/app/api/projects/route.ts` created
- [ ] `/api/master` scope comment added
- [ ] Dashboard wired to `/api/projects`
- [ ] `next.config.ts` verified

### Acceptance Gate Results
| Check | Result | Notes |
|---|---|---|
| All 7 cards render | ✅ / ❌ | |
| Partial failure handled | ✅ / ❌ | |
| Caching active | ✅ / ❌ | |
| /api/master scoped | ✅ / ❌ | |
| Blocker badge | ✅ / ❌ | |
| TypeScript build clean | ✅ / ❌ | |
| output: standalone | ✅ / ❌ | |

### Blockers
- None / [describe if any]

### Next Step
- Report back to Claude for Sprint 2 gate review.
```
