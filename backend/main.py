
from fastapi import FastAPI, UploadFile, File, HTTPException, Form, BackgroundTasks
import os
import time
import shutil
import ffmpeg
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pathlib import Path
from dotenv import load_dotenv
from typing import Dict, Any, List

# --- Custom Exception Classes ---
class FileUploadError(HTTPException):
    def __init__(self, detail: str = "File upload failed", status_code: int = 400):
        super().__init__(status_code=status_code, detail=detail)

class CompressionError(HTTPException):
    def __init__(self, detail: str = "Video compression failed", status_code: int = 500):
        super().__init__(status_code=status_code, detail=detail)

class FileNotFoundErrorCustom(HTTPException):
    def __init__(self, detail: str = "File not found", status_code: int = 404):
        super().__init__(status_code=status_code, detail=detail)

# Load environment variables
load_dotenv()

# --- CONFIGURATION ---
MAX_FILE_SIZE_MB = 1000 # Max 1GB file size for uploads
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024
ALLOWED_VIDEO_MIME_TYPES = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/x-flv", "video/webm"]
ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png"]

# Constants
UPLOAD_DIR = Path("temp_uploads")
PROCESSED_DIR = Path("temp_processed")
MAX_FILE_AGE = 3600  # 1 hour in seconds

# Get URLs from environment variables (with local defaults)
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")

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

# Parse allowed origins (handle comma-separated list if needed)
allowed_origins = [origin.strip() for origin in FRONTEND_URL.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
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


def cleanup_old_files():
    """Remove files older than MAX_FILE_AGE from temp directories."""
    now = time.time()
    for folder in [UPLOAD_DIR, PROCESSED_DIR]:
        for path in folder.glob("*"):
            if path.is_file() and (now - path.stat().st_mtime) > MAX_FILE_AGE:
                try:
                    os.remove(path)
                    print(f"Cleaned up old file: {path.name}")
                except Exception as e:
                    print(f"Failed to cleanup {path.name}: {e}")

# --- API Endpoints ---
@app.get("/")
def read_root(background_tasks: BackgroundTasks) -> Dict[str, str]:
    """Health check endpoint + triggers cleanup."""
    background_tasks.add_task(cleanup_old_files)
    return {"status": "SmartPress Backend Ready", "version": "1.0.0"}


@app.post("/compress-video")
async def compress_video(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    crf: int = Form(28)
) -> Dict[str, Any]:
    """
    Compress a video file using server-side FFmpeg.

    Args:
        file: Uploaded video file
        crf: Constant Rate Factor (user quality setting)

    Returns:
        Dict containing status, download URL, and file sizes
    """
    input_path = UPLOAD_DIR / file.filename
    output_filename = f"smartpress_{file.filename}"
    output_path = PROCESSED_DIR / output_filename

    try:
        # Validate file type
        if file.content_type not in ALLOWED_VIDEO_MIME_TYPES and file.content_type not in ALLOWED_IMAGE_MIME_TYPES:
            raise FileUploadError(detail=f"Invalid file type: {file.content_type}. Only MP4, MOV, AVI, FLV, WEBM videos, and JPG, PNG images are allowed.", status_code=415)

        # Validate file size
        file.file.seek(0, os.SEEK_END) # Move cursor to end to get size
        file_size = file.file.tell() # Get current position (which is file size)
        file.file.seek(0) # Reset cursor to the beginning
        if file_size > MAX_FILE_SIZE_BYTES:
            raise FileUploadError(detail=f"File too large. Max allowed is {MAX_FILE_SIZE_MB}MB", status_code=413)
        print(f"Received file: {file.filename}, type: {file.content_type}, size: {format_file_size(file_size)}")

        print(f"Saving uploaded file to {input_path}")
        # Save uploaded file
        with open(input_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        original_size = os.path.getsize(input_path)
        print(f"Processing: {file.filename} (CRF: {crf})")

        # Compress video using FFmpeg
        stream = ffmpeg.input(str(input_path))
        stream = ffmpeg.output(
            stream,
            str(output_path),
            vcodec=FFMPEG_VIDEO_CODEC,
            crf=crf,
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

    except ffmpeg.Error as e:
        print(f"FFmpeg compression error: {e.stderr.decode()}")
        raise CompressionError(detail=f"Video compression failed: {e.stderr.decode()}")
    except FileUploadError as e:
        # Re-raise FileUploadError directly
        raise e
    except Exception as e:
        print(f"An unexpected error occurred during compression: {e}")
        raise CompressionError(detail=f"An unexpected error occurred: {str(e)}")

    finally:
        cleanup_file(input_path)
        background_tasks.add_task(cleanup_old_files)


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

    raise FileNotFoundErrorCustom(detail="File not found")
