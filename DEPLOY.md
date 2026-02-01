# SmartPress - Netlify Deployment Guide

## Automatic Deployment

Your SmartPress app is configured for Netlify deployment with the `netlify.toml` file.

### Deploy Steps

1. **Connect Repository**
   - Visit: https://app.netlify.com/start/repos/AliMora83%2FSmartPress
   - Click "Connect to GitHub"
   - Authorize Netlify

2. **Configure Build Settings**
   - Build command: `npm run build` (auto-configured)
   - Publish directory: `.next` (auto-configured)
   - Node version: 18 (auto-configured)

3. **Deploy**
   - Click "Deploy site"
   - Netlify will automatically build and deploy
   - Your site will be live at: `https://[random-name].netlify.app`

### Environment Variables (Optional)

If you need to add environment variables:
1. Go to Site Settings → Environment Variables
2. Add any required variables

### Custom Domain (Optional)

1. Go to Domain Settings
2. Click "Add custom domain"
3. Follow DNS configuration instructions

## Important Notes

### Backend Considerations
⚠️ **Note**: This deployment only includes the **frontend** (Next.js app).

The **backend** (FastAPI + FFmpeg) requires separate deployment because:
- Netlify doesn't support Python backends with FFmpeg
- Video processing requires server-side resources

**Backend Deployment Options:**
1. **Railway**: Easy Python deployment with FFmpeg support
2. **Render**: Free tier with custom Dockerfile
3. **Vercel Serverless Functions**: Limited for video processing
4. **AWS/GCP/Azure**: Full control but more complex

**After Backend Deployment:**
1. Update the API URL in your frontend code
2. Replace `http://localhost:8000` with your backend URL
3. Configure CORS on backend to allow your Netlify domain

### Client-Side Compression
The frontend can still perform **client-side compression** using FFmpeg.wasm without the backend!

## Build Configuration Explained

### netlify.toml Settings

```toml
[build]
  command = "npm run build"        # Builds Next.js app
  publish = ".next"                # Output directory

[[plugins]]
  package = "@netlify/plugin-nextjs"  # Official Next.js plugin

[build.environment]
  NODE_VERSION = "18"              # Node.js version
```

### Security Headers
- `X-Frame-Options`: Prevents clickjacking
- `X-XSS-Protection`: Cross-site scripting protection
- `X-Content-Type-Options`: MIME type sniffing protection
- `Referrer-Policy`: Controls referrer information

### Cache Headers
- Images cached for 1 year (immutable)
- Improves performance on repeat visits

## Deployment Checklist

- [x] `netlify.toml` configuration created
- [x] Next.js build settings configured
- [x] Security headers added
- [x] Cache optimization configured
- [ ] Connect GitHub repository on Netlify
- [ ] Deploy frontend
- [ ] Deploy backend separately (if needed)
- [ ] Update API URLs in frontend
- [ ] Configure custom domain (optional)
- [ ] Test deployed application

## Troubleshooting

### Build Fails
- Check build logs on Netlify dashboard
- Ensure all dependencies are in `package.json`
- Verify Node version compatibility

### 404 Errors
- Check redirect rules in `netlify.toml`
- Ensure Next.js routing is properly configured

### Images Not Loading
- Verify images are in `/public` directory
- Check paths are relative (e.g., `/Smart_Bot.png`)

## Next Steps

1. **Deploy to Netlify** using the link above
2. **Consider backend deployment** for full functionality
3. **Test the deployed site** thoroughly
4. **Configure custom domain** if desired

Your SmartPress frontend is ready for Netlify deployment! 🚀
