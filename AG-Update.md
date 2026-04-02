# AG-Update — SmartPress Phase 1 Runtime Verification

> Issued by: Claude (UX & Product) | Audited by: Comet  
> Date: 2026-04-01 | Priority: 🔴 HIGH — Phase 1 Gate  
> Target Agent: AG (Antigravity)

---

## 🎯 Mission

Close the **Blocking Runtime Issue** so Phase 1 can be formally signed off.

No new features. No Phase 2 work. This sprint is purely verification and fixes.

Phase 1 is **not closeable** until all 4 checks below pass and a smoke test result is logged in `Master.md`.

---

## 🔒 Pre-Work Checklist

Before touching any code or config, confirm you have access to:

- [ ] Vercel dashboard for the SmartPress frontend project
- [ ] Google Cloud Console → Cloud Run → SmartPress backend service
- [ ] Backend repository (to inspect routes and CORS config)
- [ ] A sample test file (image or video) for the smoke test

---

## ✅ Check 1 — Backend Base URL

**Risk:** Frontend deployed on Vercel may be falling back to `http://localhost:8000` in production, causing all API calls to silently fail.

### Steps

1. Open the Vercel dashboard → SmartPress project → **Settings → Environment Variables**.
2. Locate the variable `NEXT_PUBLIC_API_URL` (or equivalent).
3. Confirm its value is the **Cloud Run service URL**, e.g.:
   ```
   https://smartpress-backend-<hash>-uc.a.run.app
   ```
4. If it is missing or set to `localhost`, update it to the correct Cloud Run URL and trigger a **Redeploy**.
5. After redeploy, open the deployed frontend URL in a browser, open DevTools → Network tab, and confirm outbound API requests are going to the Cloud Run URL — not localhost.

### Done When
`NEXT_PUBLIC_API_URL` is confirmed set to Cloud Run URL in Vercel dashboard, and DevTools confirms requests hit the correct host.

---

## ✅ Check 2 — API Route Alignment

**Risk:** Frontend may be calling `POST /compress-video` while the backend exposes `POST /compress` (or vice versa), causing 404s with no obvious error surfaced to the user.

### Steps

1. Navigate to the deployed backend's auto-generated API docs:
   ```
   https://<your-cloud-run-url>/docs
   ```
2. Locate the compression endpoint — note the **exact path and HTTP method**.
3. Open the frontend codebase and find where the API call is made (search for `fetch(` or `axios` calls targeting the backend).
4. Compare the frontend path against the FastAPI `/docs` path character-for-character.
5. If they differ, update the frontend to match the backend route exactly.
6. Redeploy the frontend if any change was made.

### Done When
Frontend API call path matches the FastAPI `/docs` route exactly. Document both values in the smoke test log below.

---

## ✅ Check 3 — CORS Configuration

**Risk:** Backend CORS `FRONTEND_URL` (or `allow_origins`) may not include the deployed Vercel URL, causing all cross-origin requests to be rejected by the browser.

### Steps

1. Open the backend source — locate CORS configuration (typically in `main.py` or a middleware config):
   ```python
   # Example FastAPI CORS
   app.add_middleware(
       CORSMiddleware,
       allow_origins=["https://smartpress.vercel.app"],  # ← verify this
       allow_methods=["*"],
       allow_headers=["*"],
   )
   ```
2. Confirm the `allow_origins` list includes the **exact deployed frontend URL** (including `https://` and no trailing slash).
3. If the frontend URL is on a Vercel preview domain (e.g., `smartpress-git-main-xyz.vercel.app`), either:
   - Add it to `allow_origins`, **or**
   - Use the production custom domain and ensure CORS matches that.
4. If a change is required, update the backend, rebuild the Docker image, and redeploy to Cloud Run.
5. After redeploy, open the deployed frontend → DevTools → Network tab → find a failed/successful request and confirm no `CORS` error appears in the console.

### Done When
Backend Cloud Run logs and browser DevTools show no CORS rejection on a request from the deployed frontend origin.

---

## ✅ Check 4 — Smoke Test

**Risk:** Even if all three checks above pass, an end-to-end flow may still fail due to an unrelated runtime issue (e.g., FFmpeg not found in the container, temp directory permissions, missing env vars on the backend).

This is the **final gate**. Do not skip it.

### Steps

1. Navigate to the deployed SmartPress frontend URL in a browser.
2. Upload a sample file:
   - For images: any `.jpg` or `.png` under 5 MB.
   - For video: any `.mp4` under 20 MB.
3. Trigger compression.
4. Confirm the file processes without error.
5. Download the compressed output.
6. Verify the downloaded file opens correctly and is smaller than the original.
7. Record the result in the log format below.

### If the Smoke Test Fails
Do **not** close Phase 1. Instead:
- Capture the error message and/or browser console output.
- Check Cloud Run logs for backend errors:
  ```
  gcloud run services logs read smartpress-backend --region=<your-region> --limit=50
  ```
- Log the failure in `Master.md` Review Log with the error detail.
- Notify Claude and Comet with the log output for triage.

### Done When
One full upload → compress → download completes successfully. Result is logged in `Master.md`.

---

## 📋 Smoke Test Log Template

Copy this into the `Master.md` Review Log when the smoke test is run:

```
| 2026-04-01 | AG (Antigravity) | Smoke Test — Phase 1 Runtime Verification |
| Environment: [Local / Vercel + Cloud Run]
| File tested: [filename, type, size]
| Result: [PASS / FAIL]
| Backend URL used: [https://...]
| API route called: [POST /...]
| CORS errors: [None / <error>]
| Output file size: [original → compressed]
| Notes: [any relevant detail]
```

---

## 🚫 Out of Scope for This Sprint

Do **not** begin any of the following until Phase 1 is closed and Claude's Job Status UX designs are ready:

- Task 2.1 — Cloud Run Jobs Integration
- Task 2.2 — Status Polling API
- Task 2.3 — GCS Persistent Storage
- Any Phase 3 work

---

## 🔁 Handoff on Completion

Once all 4 checks pass and the smoke test is logged:

1. **AG** — Add the smoke test result to `Master.md` Review Log.
2. **Comet** — Update `Master.md` to mark Phase 1 as `✅ CLOSED`.
3. **Claude** — Deliver Job Status UX designs (`Queued → Processing → Finalizing → Completed → Failed`) as the Phase 2 gate asset.
4. **All agents** — Phase 2 sprint planning begins only after the above three are done.

---

> This update was issued with full alignment between Claude and Comet.  
> Any deviations from this scope require sign-off from both before implementation.
