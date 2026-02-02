import os
import time
import shutil
import ffmpeg
import google.generativeai as genai
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pathlib import Path
from dotenv import load_dotenv
from typing import Dict, Any

# Load environment variables
load_dotenv()

# --- CONFIGURATION ---
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
if not GOOGLE_API_KEY:
    raise ValueError("GOOGLE_API_KEY not found in environment variables. Please create a .env file.")
genai.configure(api_key=GOOGLE_API_KEY)

# Constants
UPLOAD_DIR = Path("temp_uploads")
PROCESSED_DIR = Path("temp_processed")
FRONTEND_URL = "http://localhost:3000"
BACKEND_URL = "http://localhost:8000"
GEMINI_MODEL = "gemini-1.5-flash"  # Fast model for video analysis
GEMINI_TIMEOUT = 600  # 10 minutes
VIDEO_PROCESSING_CHECK_INTERVAL = 2  # seconds

# FFmpeg compression settings
FFMPEG_VIDEO_CODEC = "libx264"
FFMPEG_CRF = 28  # Constant Rate Factor (lower = better quality, higher = smaller file)
FFMPEG_PRESET = "fast"
FFMPEG_AUDIO_CODEC = "aac"

# Ensure directories exist
UPLOAD_DIR.mkdir(exist_ok=True)
PROCESSED_DIR.mkdir(exist_ok=True)

# --- FastAPI App Initialization ---
app = FastAPI(title="SmartPress Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Helper Functions ---
def format_file_size(size_bytes: int) -> str:
    """Convert bytes to human-readable format."""
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size_bytes < 1024.0:
            return f"{size_bytes:.2f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.2f} TB"


def cleanup_file(file_path: Path) -> None:
    """Safely remove a file if it exists."""
    try:
        if file_path.exists():
            os.remove(file_path)
    except Exception as e:
        print(f"Warning: Failed to cleanup {file_path}: {e}")


# --- API Endpoints ---
@app.get("/")
def read_root() -> Dict[str, str]:
    """Health check endpoint."""
    return {"status": "SmartPress Backend Ready", "version": "1.0.0"}


@app.post("/compress-video")
def compress_video(file: UploadFile = File(...)) -> Dict[str, Any]:
    """
    Compress a video file using server-side FFmpeg.
    
    Args:
        file: Uploaded video file
        
    Returns:
        Dict containing status, download URL, and file sizes
    """
    input_path = UPLOAD_DIR / file.filename
    output_filename = f"smartpress_{file.filename}"
    output_path = PROCESSED_DIR / output_filename
    
    try:
        # Save uploaded file
        with open(input_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        original_size = os.path.getsize(input_path)
        print(f"Processing: {file.filename} ({format_file_size(original_size)})")

        # Compress video using FFmpeg
        stream = ffmpeg.input(str(input_path))
        stream = ffmpeg.output(
            stream, 
            str(output_path), 
            vcodec=FFMPEG_VIDEO_CODEC, 
            crf=FFMPEG_CRF, 
            preset=FFMPEG_PRESET, 
            acodec=FFMPEG_AUDIO_CODEC
        )
        ffmpeg.run(stream, overwrite_output=True, quiet=True)

        new_size = os.path.getsize(output_path)
        reduction_percent = ((original_size - new_size) / original_size) * 100
        
        print(f"Compression complete: {format_file_size(original_size)} → {format_file_size(new_size)} ({reduction_percent:.1f}% reduction)")
        
        return {
            "status": "success",
            "download_url": f"{BACKEND_URL}/download/{output_filename}",
            "original_size": original_size,
            "new_size": new_size
        }

    except Exception as e:
        print(f"Compression error: {e}")
        raise HTTPException(status_code=500, detail=f"Video compression failed: {str(e)}")
    
    finally:
        cleanup_file(input_path)


@app.post("/analyze-video")
def analyze_video(file: UploadFile = File(...)) -> Dict[str, str]:
    """
    Analyze video content using Google Gemini 1.5 Pro AI.
    
    Args:
        file: Uploaded video file
        
    Returns:
        Dict containing status and AI-generated analysis (title, description, hashtags)
    """
    temp_path = UPLOAD_DIR / f"analyze_{file.filename}"
    video_file = None
    
    try:
        # Save uploaded file
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        file_size_mb = temp_path.stat().st_size / (1024 * 1024)
        print(f"AI Analysis requested: {file.filename} ({file_size_mb:.2f} MB)")

        print("Uploading to Gemini...")
        video_file = genai.upload_file(path=str(temp_path))
        print(f"Upload complete! File URI: {video_file.name}")
        
        # Wait for Gemini to process the video
        wait_time = 0
        while video_file.state.name == "PROCESSING":
            print(f"Gemini is processing video... ({wait_time}s elapsed)")
            time.sleep(VIDEO_PROCESSING_CHECK_INTERVAL)
            wait_time += VIDEO_PROCESSING_CHECK_INTERVAL
            video_file = genai.get_file(video_file.name)

        if video_file.state.name == "FAILED":
            raise ValueError("Gemini failed to process video")
        
        print(f"Video processing complete! Total wait time: {wait_time}s")

        # Generate AI analysis
        print("Generating AI analysis...")
        model = genai.GenerativeModel(model_name=GEMINI_MODEL)
        
        prompt = """
        Watch this video carefully. 
        1. Generate a catchy, viral-worthy Title (max 60 characters).
        2. Write an engaging SEO description (2-3 sentences).
        3. Suggest 5 relevant hashtags for social media.
        
        Return your response in valid JSON format: 
        { "title": "", "description": "", "hashtags": [] }
        """
        
        response = model.generate_content(
            [video_file, prompt], 
            request_options={"timeout": GEMINI_TIMEOUT}
        )
        
        # Extract JSON from response (handle markdown code blocks)
        analysis_text = response.text.replace("```json", "").replace("```", "").strip()
        
        print("AI Analysis complete!")
        return {"status": "success", "analysis": analysis_text}

    except Exception as e:
        error_msg = f"AI Analysis failed: {str(e)}"
        print(error_msg)
        raise HTTPException(status_code=500, detail=error_msg)
    
    finally:
        # Cleanup local file
        cleanup_file(temp_path)
        
        # Cleanup Gemini cloud file
        if video_file:
            try:
                genai.delete_file(video_file.name)
                print("Cleaned up Gemini cloud storage")
            except Exception as e:
                print(f"Warning: Failed to cleanup Gemini file: {e}")


@app.get("/download/{filename}")
async def download_file(filename: str):
    """
    Download a processed video file.
    
    Args:
        filename: Name of the file to download
        
    Returns:
        FileResponse with the requested file
    """
    file_path = PROCESSED_DIR / filename
    if file_path.exists():
        return FileResponse(file_path, filename=filename)
    
    raise HTTPException(status_code=404, detail="File not found")
