# SmartPress Backend

AI-powered video and image compression service with Gemini 1.5 Pro integration.

## Features

- ⚡ **Server-side video compression** using FFmpeg
- 🧠 **AI video analysis** with Google Gemini 1.5 Pro
- 📊 **Automatic metadata generation** (titles, descriptions, hashtags)
- 🎯 **Optimized compression** with configurable quality settings

## Setup

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Install FFmpeg

**macOS (Homebrew):**
```bash
brew install ffmpeg
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install ffmpeg
```

**Windows:**
Download from [ffmpeg.org](https://ffmpeg.org/download.html)

### 3. Configure Environment Variables

Create a `.env` file in the backend directory:

```bash
GOOGLE_API_KEY=your_google_api_key_here
```

Get your API key from [Google AI Studio](https://aistudio.google.com/)

## Running the Server

```bash
uvicorn main:app --reload --port 8000
```

Or with the virtual environment:
```bash
./venv/bin/uvicorn main:app --reload --port 8000
```

## API Endpoints

### `GET /`
Health check endpoint.

**Response:**
```json
{
  "status": "SmartPress Backend Ready",
  "version": "1.0.0"
}
```

### `POST /compress-video`
Compress a video file.

**Request:** Multipart form data with video file

**Response:**
```json
{
  "status": "success",
  "download_url": "http://localhost:8000/download/compressed_video.mp4",
  "original_size": 25000000,
  "new_size": 23000000
}
```

### `POST /analyze-video`
Analyze video with AI and generate metadata.

**Request:** Multipart form data with video file

**Response:**
```json
{
  "status": "success",
  "analysis": "{\"title\": \"...\", \"description\": \"...\", \"hashtags\": [...]}"
}
```

### `GET /download/{filename}`
Download a processed video file.

## Configuration

Edit constants in `main.py`:

```python
FFMPEG_CRF = 28              # Quality (0-51, lower = better)
FFMPEG_PRESET = "fast"       # Speed preset
GEMINI_TIMEOUT = 600         # AI timeout (seconds)
```

## Project Structure

```
backend/
├── main.py              # FastAPI application
├── requirements.txt     # Python dependencies
├── .env                 # Environment variables (gitignored)
├── .env.example         # Example environment file
├── temp_uploads/        # Temporary upload storage
└── temp_processed/      # Processed video storage
```

## Error Handling

- **500 Error:** Check backend logs for FFmpeg or API errors
- **404 models/gemini-1.5-pro:** Verify API key is correct
- **Timeout:** Large videos (>50MB) may take 5-10 minutes to process

## Development

The server runs with `--reload` flag for auto-reloading on code changes.

Watch logs in terminal for processing status:
```
Processing: video.mp4 (24.63 MB)
Gemini is processing video... (10s elapsed)
AI Analysis complete!
```
