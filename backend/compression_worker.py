"""
SmartPress — Compression Worker (Phase 2)

Extracted FFmpeg compression logic that runs in a background thread.
Parses FFmpeg stderr for real-time progress updates and reports
status changes through the job store.
"""

import os
import re
import subprocess
import time
from pathlib import Path
from typing import Optional

from job_store import job_store, JobStatus
from storage import StorageBackend


# FFmpeg error code mapping — matches Phase 1 structured error schema
FFMPEG_ERROR_MAP = {
    "Invalid data found": ("CORRUPT_MEDIA", "The file appears to be corrupt or has an invalid header."),
    "No such file or directory": ("FILE_NOT_FOUND", "The uploaded file could not be located for processing."),
    "Unknown decoder": ("UNSUPPORTED_FORMAT", "This file format or codec is not supported."),
    "Invalid codec": ("UNSUPPORTED_FORMAT", "This file uses an unsupported codec."),
    "Conversion failed": ("COMPRESSION_FAILED", "FFmpeg could not convert the file."),
    "Output file is empty": ("COMPRESSION_FAILED", "Compression produced an empty output file."),
}


def _get_duration(input_path: Path) -> Optional[float]:
    """Use ffprobe to get the total duration of a media file in seconds."""
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                str(input_path),
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode == 0 and result.stdout.strip():
            return float(result.stdout.strip())
    except (subprocess.TimeoutExpired, ValueError, Exception) as e:
        print(f"[Worker] ffprobe duration check failed: {e}")
    return None


def _parse_progress(stderr_line: str, total_duration: Optional[float]) -> Optional[int]:
    """
    Parse FFmpeg stderr output for progress.
    Looks for 'time=HH:MM:SS.ss' and calculates percentage against total duration.
    """
    if total_duration is None or total_duration <= 0:
        return None

    match = re.search(r"time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})", stderr_line)
    if match:
        hours, minutes, seconds, centiseconds = match.groups()
        current_time = (
            int(hours) * 3600
            + int(minutes) * 60
            + int(seconds)
            + int(centiseconds) / 100
        )
        progress = min(int((current_time / total_duration) * 100), 99)
        return progress
    return None


def _classify_error(stderr_output: str) -> tuple[str, str]:
    """Map FFmpeg stderr output to a structured error code and user-friendly message."""
    for pattern, (code, message) in FFMPEG_ERROR_MAP.items():
        if pattern.lower() in stderr_output.lower():
            return code, message
    return "COMPRESSION_FAILED", "An unexpected error occurred during compression."


def run_compression(
    job_id: str,
    input_path: Path,
    output_path: Path,
    crf: int,
    storage: StorageBackend,
    processed_bucket: str,
    backend_url: str,
    video_codec: str = "libx264",
    preset: str = "fast",
    audio_codec: str = "aac",
    timeout_seconds: int = 600,
) -> None:
    """
    Run FFmpeg compression in a background thread.

    Updates the job store with real-time progress and final results.
    On success, uploads the processed file to storage and sets the download URL.
    On failure, records the structured error.
    """
    try:
        # --- PROCESSING ---
        job_store.update_status(job_id, JobStatus.PROCESSING, progress=0)

        # Get duration for progress calculation
        total_duration = _get_duration(input_path)
        print(f"[Worker] Job {job_id[:8]}: duration={total_duration}s, crf={crf}")

        # Build FFmpeg command
        cmd = [
            "ffmpeg",
            "-i", str(input_path),
            "-vcodec", video_codec,
            "-crf", str(crf),
            "-preset", preset,
            "-acodec", audio_codec,
            "-y",  # Overwrite output
            "-progress", "pipe:2",  # Write progress to stderr
            str(output_path),
        ]

        # Run FFmpeg as subprocess with stderr pipe for progress
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )

        # Read stderr line by line for progress updates
        stderr_lines = []
        start_time = time.time()

        for line in iter(process.stderr.readline, ""):
            stderr_lines.append(line)

            # Check timeout
            if time.time() - start_time > timeout_seconds:
                process.kill()
                job_store.update_status(
                    job_id,
                    JobStatus.FAILED,
                    error="Compression timed out. The file may be too large or complex.",
                    error_code="FFMPEG_TIMEOUT",
                )
                _cleanup(input_path, output_path)
                return

            # Parse and update progress
            progress = _parse_progress(line, total_duration)
            if progress is not None:
                job_store.update_status(job_id, JobStatus.PROCESSING, progress=progress)

        process.wait()

        # Check if FFmpeg succeeded
        if process.returncode != 0:
            stderr_output = "".join(stderr_lines)
            error_code, error_message = _classify_error(stderr_output)
            print(f"[Worker] Job {job_id[:8]} FAILED: {error_code} — {stderr_output[:200]}")
            job_store.update_status(
                job_id,
                JobStatus.FAILED,
                error=error_message,
                error_code=error_code,
            )
            _cleanup(input_path, output_path)
            return

        # --- FINALIZING ---
        job_store.update_status(job_id, JobStatus.FINALIZING, progress=99)

        if not output_path.exists() or output_path.stat().st_size == 0:
            job_store.update_status(
                job_id,
                JobStatus.FAILED,
                error="Compression produced an empty or missing output file.",
                error_code="COMPRESSION_FAILED",
            )
            _cleanup(input_path, output_path)
            return

        new_size = output_path.stat().st_size

        # Upload processed file to storage
        storage_key = output_path.name
        storage.upload(output_path, storage_key, processed_bucket)
        download_url = storage.get_download_url(storage_key, processed_bucket)

        # --- COMPLETED ---
        job_store.update_status(
            job_id,
            JobStatus.COMPLETED,
            progress=100,
            new_size=new_size,
            download_url=download_url,
        )

        original_size = job_store.get_job(job_id).original_size if job_store.get_job(job_id) else 0
        reduction = ((original_size - new_size) / original_size * 100) if original_size > 0 else 0
        print(f"[Worker] Job {job_id[:8]} COMPLETED: {original_size} → {new_size} bytes ({reduction:.1f}% reduction)")

    except Exception as e:
        print(f"[Worker] Job {job_id[:8]} unexpected error: {e}")
        job_store.update_status(
            job_id,
            JobStatus.FAILED,
            error=f"An unexpected error occurred: {str(e)}",
            error_code="INTERNAL_ERROR",
        )

    finally:
        # Always clean up input file; output stays in storage
        _cleanup(input_path, None)


def _cleanup(input_path: Path, output_path: Optional[Path]) -> None:
    """Safely remove temp files."""
    for path in [input_path, output_path]:
        if path is not None:
            try:
                if path.exists():
                    os.remove(path)
            except Exception as e:
                print(f"[Worker] Cleanup warning for {path}: {e}")
