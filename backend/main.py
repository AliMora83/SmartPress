
from fastapi import FastAPI, UploadFile, File, HTTPException, Form, BackgroundTasks, Query, Request
import os
import time
import shutil
import ffmpeg
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pathlib import Path
from dotenv import load_dotenv
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
import zipfile
import io

from job_store import job_store, JobStatus
from compression_worker import run_compression
from storage import create_storage_backend

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

# GCS bucket names (used when GCS is enabled)
GCS_BUCKET_UPLOADS = os.getenv("GCS_BUCKET_UPLOADS", "smartpress-uploads")
GCS_BUCKET_PROCESSED = os.getenv("GCS_BUCKET_PROCESSED", "smartpress-processed")

# FFmpeg compression settings
FFMPEG_VIDEO_CODEC = "libx264"
FFMPEG_CRF = 28  # Constant Rate Factor (lower = better quality, higher = smaller file)
FFMPEG_PRESET = "fast"
FFMPEG_AUDIO_CODEC = "aac"

# Ensure directories exist
UPLOAD_DIR.mkdir(exist_ok=True)
PROCESSED_DIR.mkdir(exist_ok=True)

# Initialize storage backend (GCS or local fallback)
storage_backend = create_storage_backend(base_dir=PROCESSED_DIR)

# --- FastAPI App Initialization ---
app = FastAPI(title="SmartPress Backend", version="2.0.0")

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
    # Also clean up expired jobs
    removed = job_store.cleanup_expired()
    if removed > 0:
        print(f"Cleaned up {removed} expired job records")


def _validate_upload(file: UploadFile) -> int:
    """Validate file type and size. Returns file size in bytes."""
    content_type = file.content_type or ""

    # Fallback: if MIME type is generic (e.g. from CLI tools), infer from filename
    if content_type in ("application/octet-stream", "") and file.filename:
        ext_map = {
            ".mp4": "video/mp4", ".mov": "video/quicktime", ".avi": "video/x-msvideo",
            ".flv": "video/x-flv", ".webm": "video/webm",
            ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
        }
        ext = Path(file.filename).suffix.lower()
        content_type = ext_map.get(ext, content_type)

    if content_type not in ALLOWED_VIDEO_MIME_TYPES and content_type not in ALLOWED_IMAGE_MIME_TYPES:
        raise FileUploadError(
            detail=f"Invalid file type: {content_type}. Only MP4, MOV, AVI, FLV, WEBM videos, and JPG, PNG images are allowed.",
            status_code=415,
        )

    file.file.seek(0, os.SEEK_END)
    file_size = file.file.tell()
    file.file.seek(0)

    if file_size > MAX_FILE_SIZE_BYTES:
        raise FileUploadError(detail=f"File too large. Max allowed is {MAX_FILE_SIZE_MB}MB", status_code=413)

    return file_size


# --- API Endpoints ---

@app.get("/")
def read_root(background_tasks: BackgroundTasks) -> Dict[str, str]:
    """Health check endpoint + triggers cleanup."""
    background_tasks.add_task(cleanup_old_files)
    return {"status": "SmartPress Backend Ready", "version": "2.0.0"}


@app.get("/health")
def health_check() -> Dict[str, Any]:
    """Detailed health check with active job count."""
    return {
        "status": "healthy",
        "version": "2.0.0",
        "active_jobs": job_store.active_count(),
        "timestamp": time.time(),
    }


class UploadUrlRequest(BaseModel):
    filename: str
    content_type: str

class UploadUrlResponse(BaseModel):
    upload_url: str
    storage_key: str

@app.post("/upload-url", response_model=UploadUrlResponse)
async def get_upload_url(request: UploadUrlRequest) -> Dict[str, str]:
    import uuid
    storage_key = f"{uuid.uuid4().hex}_{request.filename}"
    upload_url = storage_backend.generate_upload_url(
        storage_key, 
        GCS_BUCKET_UPLOADS, 
        request.content_type
    )
    return {"upload_url": upload_url, "storage_key": storage_key}

@app.put("/local-upload/{bucket_name}/{key}")
async def local_upload(bucket_name: str, key: str, request: Request):
    """Mock endpoint to handle direct uploads in local dev."""
    # Determine if GCS is actually active
    import os
    use_gcs = os.getenv("USE_GCS", "false").lower() == "true"
    gcs_creds = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    if use_gcs and gcs_creds:
        # We shouldn't receive traffic here if real GCS is used, but just in case
        raise HTTPException(status_code=400, detail="Local upload disabled when GCS is active")
        
    target_path = PROCESSED_DIR / bucket_name / key
    target_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(target_path, "wb") as f:
        async for chunk in request.stream():
            f.write(chunk)
            
    return {"status": "ok"}


@app.post("/compress-video")
async def compress_video(
    background_tasks: BackgroundTasks,
    file: Optional[UploadFile] = File(None),
    storage_key: Optional[str] = Form(None),
    filename: Optional[str] = Form(None),
    original_size: Optional[int] = Form(None),
    crf: int = Form(28),
    use_async: bool = Query(default=True, alias="async"),
) -> Dict[str, Any]:
    """
    Compress a video file using server-side FFmpeg.

    Query params:
        async (bool): If true (default), returns 202 + job_id for polling.
                      If false, processes synchronously (Phase 1 compat).

    Args:
        file: Uploaded video file
        crf: Constant Rate Factor (user quality setting)

    Returns:
        Async mode: 202 with job_id and status_url
        Sync mode: 200 with download_url and file sizes
    """
    if storage_key:
        if not filename or original_size is None:
            raise HTTPException(status_code=400, detail="filename and original_size form fields are required when using storage_key")
        
        actual_filename = filename
        actual_original_size = original_size
        
        input_path = UPLOAD_DIR / storage_key
        try:
            storage_backend.download(storage_key, GCS_BUCKET_UPLOADS, input_path)
            print(f"Downloaded {storage_key} from storage to {input_path}")
        except Exception as e:
            print(f"Failed to download {storage_key} from storage: {e}")
            raise FileNotFoundErrorCustom(detail=f"Uploaded file {storage_key} not found in storage.")
    else:
        if not file:
            raise HTTPException(status_code=400, detail="Either file or storage_key must be provided")
            
        # Validate upload
        actual_original_size = _validate_upload(file)
        actual_filename = file.filename or "upload.mp4"
        print(f"Received file: {actual_filename}, type: {file.content_type}, size: {format_file_size(actual_original_size)}")

        input_path = UPLOAD_DIR / actual_filename
        # Save uploaded file to disk
        print(f"Saving uploaded file to {input_path}")
        with open(input_path, "wb") as buffer:
            import shutil
            shutil.copyfileobj(file.file, buffer)

    output_filename = f"smartpress_{actual_filename}"
    output_path = PROCESSED_DIR / output_filename

    # ── ASYNC MODE (Phase 2) ──
    if use_async:
        # Create job record
        job = job_store.create_job(filename=actual_filename, original_size=actual_original_size)
        print(f"[Async] Created job {job.job_id[:8]} for {actual_filename}")

        # Enqueue compression in background
        background_tasks.add_task(
            run_compression,
            job_id=job.job_id,
            input_path=input_path,
            output_path=output_path,
            crf=crf,
            storage=storage_backend,
            processed_bucket=GCS_BUCKET_PROCESSED,
            backend_url=BACKEND_URL,
            video_codec=FFMPEG_VIDEO_CODEC,
            preset=FFMPEG_PRESET,
            audio_codec=FFMPEG_AUDIO_CODEC,
        )

        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=202,
            content={
                "status": "accepted",
                "job_id": job.job_id,
                "status_url": f"{BACKEND_URL}/status/{job.job_id}",
                "message": "Compression job queued. Poll the status_url for progress.",
            },
        )

    # ── SYNC MODE (Phase 1 backward compatibility) ──
    try:
        print(f"[Sync] Processing: {actual_filename} (CRF: {crf})")

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
        reduction_percent = ((actual_original_size - new_size) / actual_original_size) * 100

        print(f"[Sync] Compression complete: {format_file_size(actual_original_size)} → {format_file_size(new_size)} ({reduction_percent:.1f}% reduction)")

        return {
            "status": "success",
            "download_url": f"{BACKEND_URL}/download/{output_filename}",
            "original_size": actual_original_size,
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


@app.get("/status/{job_id}")
async def get_job_status(job_id: str) -> Dict[str, Any]:
    """
    Get the current status of a compression job.

    Returns the full job record including:
    - status: queued | processing | finalizing | completed | failed
    - progress: 0-100
    - download_url: available when status is 'completed'
    - error/error_code: available when status is 'failed'
    """
    record = job_store.get_job(job_id)
    if record is None:
        raise HTTPException(
            status_code=404,
            detail=f"Job {job_id} not found or has expired.",
        )
    return record.to_dict()


@app.get("/download/{filename}")
async def download_file(filename: str):
    """
    Download a processed video file.

    Args:
        filename: Name of the file to download

    Returns:
        FileResponse with the requested file
    """
    # Check in the main processed directory
    file_path = PROCESSED_DIR / filename

    # Also check in the storage subdirectory (local storage backend uses bucket subdir)
    storage_path = PROCESSED_DIR / GCS_BUCKET_PROCESSED / filename

    if file_path.exists():
        return FileResponse(file_path, filename=filename)
    elif storage_path.exists():
        return FileResponse(storage_path, filename=filename)

    raise FileNotFoundErrorCustom(detail="File not found")

@app.get("/download-batch")
async def download_batch(files: str = Query(..., description="Comma separated list of filenames")):
    """
    Download multiple processed files as a single zip archive.
    
    Args:
        files: A comma-separated list of filenames.
        
    Returns:
        FileResponse of the zip file.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No filenames provided")
        
    # We will create a temp file for the zip
    import uuid
    zip_filename = f"batch_{uuid.uuid4().hex[:8]}.zip"
    zip_path = PROCESSED_DIR / zip_filename
    
    file_list = [f.strip() for f in files.split(',') if f.strip()]
    
    try:
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for filename in file_list:
                file_path = PROCESSED_DIR / filename
                storage_path = PROCESSED_DIR / GCS_BUCKET_PROCESSED / filename
                
                # Determine which path exists
                actual_path = file_path if file_path.exists() else storage_path
                
                if actual_path.exists():
                    # Add to zip
                    zipf.write(actual_path, arcname=filename)
                else:
                    print(f"Warning: File {filename} requested for batch download not found.")
                    
        return FileResponse(
            zip_path, 
            filename="smartpress_batch.zip",
            media_type="application/zip",
            # We don't delete immediately because FileResponse needs to read it.
            # It will be cleaned up by the background task (cleanup_old_files)
        )
    except Exception as e:
        cleanup_file(zip_path)
        raise HTTPException(status_code=500, detail=f"Failed to create zip: {str(e)}")
