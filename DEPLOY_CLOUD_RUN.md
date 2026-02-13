# SmartPress - Complete Cloud Run Deployment Guide

Deploy both frontend (Next.js) and backend (FastAPI) to Google Cloud Run.

## Why Cloud Run for Both?

✅ **Single platform** - Everything in Google Cloud  
✅ **No CORS issues** - Same domain/infrastructure  
✅ **Cost-effective** - Free tier covers most usage  
✅ **Easy scaling** - Auto-scales based on traffic  
✅ **Simple deployment** - One command per service  

---

## Prerequisites

1. **Google Cloud Account**: https://cloud.google.com
2. **Google Cloud CLI**: https://cloud.google.com/sdk/docs/install
3. **Docker** (optional for local testing)

---

## Quick Deploy (Recommended)

### Step 1: Set Up GCP

```bash
# Login
gcloud auth login

# Create project (or use existing)
gcloud config set project smartpress-production

# Enable APIs
gcloud services enable cloudbuild.googleapis.com run.googleapis.com
```

### Step 2: Deploy Backend

```bash
cd backend

gcloud run deploy smartpress-backend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 300s \
  --max-instances 10

# Save the backend URL (you'll need it)
```

### Step 3: Deploy Frontend

```bash
cd ..  # Back to smart-compressor directory

gcloud run deploy smartpress-frontend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --max-instances 10
```

### Step 4: Get Your URLs

```bash
# Backend URL
gcloud run services describe smartpress-backend \
  --region us-central1 \
  --format 'value(status.url)'

# Frontend URL
gcloud run services describe smartpress-frontend \
  --region us-central1 \
  --format 'value(status.url)'
```

**Done!** Your apps are live! 🎉

---

## Connect Frontend to Backend

After deployment, you need to update the frontend to use the backend URL.

### Option 1: Environment Variable (Recommended)

```bash
# Update frontend deployment with backend URL
gcloud run services update smartpress-frontend \
  --region us-central1 \
  --set-env-vars NEXT_PUBLIC_API_URL=https://smartpress-backend-xxx.run.app
```

Then update `components/Compressor.tsx`:

```typescript
// At the top of the file
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Replace fetch URLs with:
const response = await fetch(`${API_URL}/compress`, { ... });
```

### Option 2: Hardcode Backend URL

Update `components/Compressor.tsx`:

```typescript
// Replace:
const response = await fetch("http://localhost:8000/compress", ...);

// With your backend URL:
const response = await fetch("https://smartpress-backend-xxx.run.app/compress", ...);
```

### Update Backend CORS

Update `backend/main.py`:

```python
origins = [
    "https://smartpress-frontend-xxx.run.app",  # Your frontend URL
    "http://localhost:3000"  # Keep for local dev
]
```

Redeploy backend:
```bash
cd backend
gcloud run deploy smartpress-backend --source .
```

---

## Configuration Details

### Frontend (Next.js)
- **Memory**: 512 MB (enough for Next.js)
- **CPU**: 1 vCPU
- **Timeout**: 60s (default)
- **Port**: 8080 (auto-configured)
- **Build**: Multi-stage Docker with standalone output

### Backend (FastAPI + FFmpeg)
- **Memory**: 2 GB (needed for video processing)
- **CPU**: 2 vCPUs (faster compression)
- **Timeout**: 300s (5 minutes for large videos)
- **Port**: 8080
- **Build**: Python 3.11 + FFmpeg

---

## Architecture

```
User → Cloud Run Frontend (Next.js)
          ↓
      Cloud Run Backend (FastAPI + FFmpeg)
```

Both services:
- Auto-scale to zero when idle (free!)
- Scale up based on traffic
- Have HTTPS automatically
- Get automatic SSL certificates

---

## Cost Estimate

### Free Tier (per month)
- 2 million requests
- 360,000 GB-seconds
- 180,000 vCPU-seconds

### Typical Usage (1000 users/month)
- **Frontend**: ~$0-1 (mostly cached)
- **Backend**: ~$1-3 (video processing)
- **Total**: **~$1-4/month**

Most usage stays **within free tier**!

---

## Custom Domain (Optional)

### Map Custom Domain

```bash
# Map domain to frontend
gcloud run domain-mappings create \
  --service smartpress-frontend \
  --domain smartpress.yourdomain.com \
  --region us-central1

# Map subdomain to backend
gcloud run domain-mappings create \
  --service smartpress-backend \
  --domain api.smartpress.yourdomain.com \
  --region us-central1
```

Then update DNS records as instructed.

---

## Local Testing

### Test Frontend Docker Build

```bash
# Build
docker build -t smartpress-frontend .

# Run
docker run -p 3000:8080 smartpress-frontend

# Visit http://localhost:3000
```

### Test Backend Docker Build

```bash
cd backend

# Build
docker build -t smartpress-backend .

# Run
docker run -p 8000:8080 smartpress-backend

# Visit http://localhost:8000/docs
```

---

## Deployment Updates

### Update Frontend

```bash
# After code changes
gcloud run deploy smartpress-frontend --source .
```

### Update Backend

```bash
cd backend
gcloud run deploy smartpress-backend --source .
```

### View Logs

```bash
# Frontend logs
gcloud run services logs read smartpress-frontend --region us-central1

# Backend logs
gcloud run services logs read smartpress-backend --region us-central1
```

---

## CI/CD with GitHub Actions

Create `.github/workflows/deploy-cloud-run.yml`:

```yaml
name: Deploy to Cloud Run

on:
  push:
    branches: [main]

jobs:
  deploy-backend:
    runs-on: ubuntu-latest
    if: contains(github.event.head_commit.modified, 'backend/')
    steps:
      - uses: actions/checkout@v3
      - uses: google-github-actions/auth@v1
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}
      - name: Deploy Backend
        run: |
          gcloud run deploy smartpress-backend \
            --source ./backend \
            --region us-central1

  deploy-frontend:
    runs-on: ubuntu-latest
    if: contains(github.event.head_commit.modified, 'smart-compressor/')
    steps:
      - uses: actions/checkout@v3
      - uses: google-github-actions/auth@v1
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}
      - name: Deploy Frontend
        run: |
          gcloud run deploy smartpress-frontend \
            --source . \
            --region us-central1
```

---

## Troubleshooting

### Frontend Build Fails
```bash
# Check build logs
gcloud builds list --limit=1
gcloud builds log [BUILD_ID]
```

**Common issues:**
- Missing `output: 'standalone'` in `next.config.ts` ✅ Fixed
- Node memory limit - increase to `--memory 1Gi` during build

### Backend Connection Issues

**CORS Error:**
- Update `origins` in `backend/main.py`
- Redeploy backend

**502 Bad Gateway:**
- Check backend logs for crashes
- Increase memory: `--memory 4Gi`
- Check FFmpeg installation in Docker

### Slow Cold Starts

```bash
# Keep minimum instances warm (costs more)
gcloud run services update smartpress-frontend \
  --min-instances 1

gcloud run services update smartpress-backend \
  --min-instances 1
```

---

## Comparison: Cloud Run vs Netlify

| Feature | Cloud Run (Both) | Netlify (Frontend) + Cloud Run (Backend) |
|---------|------------------|------------------------------------------|
| **Cost** | $1-4/month | $0-2/month |
| **Setup** | Simpler (one platform) | More complex (two platforms) |
| **Performance** | Good | Better (Netlify CDN) |
| **CORS** | No issues | Requires configuration |
| **Deployment** | One command each | Different processes |
| **Global CDN** | Google CDN | Netlify CDN (faster) |

**Recommendation**: 
- **Cloud Run for both** = Simpler, unified
- **Netlify + Cloud Run** = Better performance, slightly more complex

---

## Next Steps

1. ✅ Deploy backend to Cloud Run
2. ✅ Deploy frontend to Cloud Run
3. ✅ Get both URLs
4. ✅ Update frontend to use backend URL
5. ✅ Update backend CORS
6. ✅ Test end-to-end
7. Optional: Set up custom domain
8. Optional: Configure CI/CD

---

**Ready to deploy!** Run the Quick Deploy commands above. 🚀
