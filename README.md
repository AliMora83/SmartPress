# SmartPress

Fast, smart compression for images and video.

## Features

- 🎨 **Beautiful UI** - Two-column layout with Smart-Bot mascot branding
- 🚀 **Fast Compression** - Client-side and server-side compression support
- 📦 **Batch Operations** - Compress All and Download All functionality  
- 🎯 **Multiple Formats** - Support for images (JPG, PNG) and videos (MP4)
- 🤖 **Smart Branding** - Montserrat typography with responsive design

## Tech Stack

- **Frontend**: Next.js 15 with TypeScript
- **Backend**: Python FastAPI with FFmpeg
- **Styling**: Tailwind CSS
- **Fonts**: Montserrat (Extra Bold)

## Getting Started

### Frontend

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

The backend API will run on [http://localhost:8000](http://localhost:8000).

## Project Structure

```
smart-compressor/
├── app/                 # Next.js app directory
├── components/          # React components
├── backend/            # Python FastAPI backend
├── public/             # Static assets (Smart-Bot mascot, icons)
└── README.md
```

## Features in Detail

### UI Redesign
- Fixed left sidebar with Smart-Bot branding
- Scrollable right content area
- Adaptive upload box positioning
- Montserrat typography (108px title, 24px subtitle)

### Batch Operations
- **Compress All**: Process multiple files sequentially
- **Download All**: Download all compressed files at once

### Filename Prefix
All compressed files are prefixed with `smartpress_` for easy identification.

## Learn More

To learn more about Next.js, check out:
- [Next.js Documentation](https://nextjs.org/docs)
- [Learn Next.js](https://nextjs.org/learn)

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new).

Check out the [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
