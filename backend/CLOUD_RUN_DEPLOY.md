# SmartPress Backend - Google Cloud Run Deployment

## Prerequisites

1. **Google Cloud Account**: https://cloud.google.com
2. **Google Cloud CLI**: Install from https://cloud.google.com/sdk/docs/install
3. **Docker**: Install from https://docs.docker.com/get-docker/

## Quick Deploy (Automated)

### Step 1: Set Up GCP Project

```bash
# Login to Google Cloud
gcloud auth login

# Create a new project (or use existing)
gcloud projects create smartpress-backend --name="SmartPress Backend"

# Set the project
gcloud config set project smartpress-backend

# Enable required APIs
gcloud services enable cloudbuild.googleapis.com run.googleapis.com
```

### Step 2: Deploy to Cloud Run

```bash
# Navigate to backend directory
cd backend

# Deploy (this builds and deploys in one command)
gcloud run deploy smartpress-backend \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 300s \
  --max-instances 10
```

**That's it!** Google Cloud will:
- Build your Docker image
- Push to Google Container Registry
- Deploy to Cloud Run
- Give you a live URL like: `https://smartpress-backend-xxx-uc.a.run.app`

## Manual Deploy (Step-by-Step)

### Step 1: Build Docker Image Locally (Optional)

```bash
cd backend

# Test build locally
docker build -t smartpress-backend .

# Test run locally
docker run -p 8080:8080 smartpress-backend

# Test at http://localhost:8080
```

### Step 2: Build in Google Cloud

```bash
# Submit build to Cloud Build
gcloud builds submit --tag gcr.io/smartpress-backend/smartpress-backend

# This creates a container image in Google Container Registry
```

### Step 3: Deploy to Cloud Run

```bash
gcloud run deploy smartpress-backend \
  --image gcr.io/smartpress-backend/smartpress-backend \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 300s
```

### Step 4: Get Your Backend URL

```bash
gcloud run services describe smartpress-backend \
  --region us-central1 \
  --format 'value(status.url)'
```

## Configuration Options

### Memory & CPU
- **Default**: 512MB RAM, 1 CPU
- **Recommended**: 2GB RAM, 2 CPUs (for video processing)
- **Max**: 8GB RAM, 4 CPUs

```bash
--memory 2Gi --cpu 2
```

### Timeout
- **Default**: 60 seconds
- **Recommended**: 300 seconds (5 minutes for large videos)

```bash
--timeout 300s
```

### Scaling
- **Min instances**: 0 (scales to zero when idle - free!)
- **Max instances**: 10 (prevents runaway costs)

```bash
--min-instances 0 --max-instances 10
```

### Region
Choose closest to your users:
- `us-central1` (Iowa, USA)
- `us-east1` (South Carolina, USA)
- `europe-west1` (Belgium, Europe)
- `asia-east1` (Taiwan, Asia)

## Environment Variables (Optional)

If you need to set environment variables:

```bash
gcloud run deploy smartpress-backend \
  --set-env-vars "KEY1=value1,KEY2=value2"
```

Or use a `.env.yaml` file:

```yaml
KEY1: value1
KEY2: value2
```

```bash
gcloud run deploy smartpress-backend \
  --env-vars-file .env.yaml
```

## Update Frontend with Backend URL

After deployment, update your frontend to use the Cloud Run URL:

1. **Get your backend URL**:
   ```bash
   gcloud run services describe smartpress-backend \
     --region us-central1 \
     --format 'value(status.url)'
   ```

2. **Update frontend** (`components/Compressor.tsx`):
   ```typescript
   // Replace this:
   const response = await fetch("http://localhost:8000/compress", ...);
   
   // With your Cloud Run URL:
   const response = await fetch("https://smartpress-backend-xxx.run.app/compress", ...);
   ```

3. **Update backend CORS** (`backend/main.py`):
   ```python
   origins = [
       "https://your-netlify-site.netlify.app",
       "http://localhost:3000"  # Keep for local dev
   ]
   ```

## Costs Estimate

### Free Tier (per month)
- 2 million requests
- 360,000 GB-seconds (memory)
- 180,000 vCPU-seconds

### After Free Tier
- **Requests**: $0.40 per million
- **Memory**: $0.0000025 per GB-second
- **CPU**: $0.00001 per vCPU-second
- **Networking**: $0.12 per GB (egress)

**Example cost** (1000 compressions/month):
- Requests: ~$0.00
- Compute: ~$0.50
- **Total**: ~$0.50/month (well within free tier!)

## Monitoring & Logs

### View Logs
```bash
gcloud run services logs read smartpress-backend \
  --region us-central1 \
  --limit 50
```

### View Metrics
```bash
# Open Cloud Console
gcloud run services describe smartpress-backend \
  --region us-central1
```

Or visit: https://console.cloud.google.com/run

## Troubleshooting

### Build Fails
- Check Dockerfile syntax
- Ensure `requirements.txt` is complete
- Verify FFmpeg installation command

### 502 Bad Gateway
- Check application starts on PORT environment variable
- Verify `CMD` in Dockerfile uses `$PORT`
- Check logs for startup errors

### Timeout Errors
- Increase `--timeout` to 300s or more
- Optimize video compression settings
- Consider splitting large video processing

### CORS Errors
- Verify CORS origins in `main.py`
- Add your Netlify domain to allowed origins
- Check preflight requests are handled

## CI/CD (Automated Deployment)

Add to `.github/workflows/deploy-backend.yml`:

```yaml
name: Deploy to Cloud Run

on:
  push:
    branches: [main]
    paths: ['backend/**']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - id: auth
        uses: google-github-actions/auth@v1
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}
      
      - name: Deploy to Cloud Run
        run: |
          gcloud run deploy smartpress-backend \
            --source ./backend \
            --region us-central1 \
            --platform managed
```

## Next Steps

1. ✅ Deploy backend to Cloud Run
2. ✅ Get backend URL
3. ✅ Update frontend with backend URL
4. ✅ Update CORS settings
5. ✅ Deploy frontend to Netlify
6. ✅ Test end-to-end
7. ✅ Monitor costs and performance

## Useful Commands

```bash
# List all Cloud Run services
gcloud run services list

# Delete service
gcloud run services delete smartpress-backend --region us-central1

# Update service (redeploy with new code)
gcloud run deploy smartpress-backend --source .

# View service details
gcloud run services describe smartpress-backend --region us-central1
```

---

**Your backend is ready for Cloud Run deployment!** 🚀

The free tier is very generous - perfect for SmartPress!
