"""
SmartPress — Job Store (Phase 2)

Thread-safe in-memory job tracking with automatic TTL expiry.
Each compression job progresses through: queued → processing → finalizing → completed/failed.
"""

import threading
import time
import uuid
from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import Dict, Optional


class JobStatus(str, Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    FINALIZING = "finalizing"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class JobRecord:
    job_id: str
    status: JobStatus
    filename: str
    original_size: int
    progress: int = 0  # 0-100
    new_size: Optional[int] = None
    download_url: Optional[str] = None
    error: Optional[str] = None
    error_code: Optional[str] = None  # CORRUPT_MEDIA, FFMPEG_TIMEOUT, etc.
    created_at: float = field(default_factory=time.time)
    completed_at: Optional[float] = None

    def to_dict(self) -> dict:
        """Serialize for JSON response."""
        data = asdict(self)
        data["status"] = self.status.value
        return data


class JobStore:
    """Thread-safe in-memory job store with automatic TTL cleanup."""

    def __init__(self, ttl_seconds: int = 3600):
        self._jobs: Dict[str, JobRecord] = {}
        self._lock = threading.Lock()
        self._ttl = ttl_seconds

    def create_job(self, filename: str, original_size: int) -> JobRecord:
        """Create a new job in QUEUED state. Returns the JobRecord."""
        job_id = str(uuid.uuid4())
        record = JobRecord(
            job_id=job_id,
            status=JobStatus.QUEUED,
            filename=filename,
            original_size=original_size,
        )
        with self._lock:
            self._jobs[job_id] = record
        return record

    def get_job(self, job_id: str) -> Optional[JobRecord]:
        """Retrieve a job by ID. Returns None if not found or expired."""
        with self._lock:
            record = self._jobs.get(job_id)
            if record is None:
                return None
            # Check TTL — only expire completed/failed jobs
            if record.status in (JobStatus.COMPLETED, JobStatus.FAILED):
                age = time.time() - (record.completed_at or record.created_at)
                if age > self._ttl:
                    del self._jobs[job_id]
                    return None
            return record

    def update_status(
        self,
        job_id: str,
        status: JobStatus,
        progress: Optional[int] = None,
        new_size: Optional[int] = None,
        download_url: Optional[str] = None,
        error: Optional[str] = None,
        error_code: Optional[str] = None,
    ) -> None:
        """Update a job's status and optional fields."""
        with self._lock:
            record = self._jobs.get(job_id)
            if record is None:
                return
            record.status = status
            if progress is not None:
                record.progress = progress
            if new_size is not None:
                record.new_size = new_size
            if download_url is not None:
                record.download_url = download_url
            if error is not None:
                record.error = error
            if error_code is not None:
                record.error_code = error_code
            if status in (JobStatus.COMPLETED, JobStatus.FAILED):
                record.completed_at = time.time()

    def active_count(self) -> int:
        """Return the number of non-terminal jobs."""
        with self._lock:
            return sum(
                1 for j in self._jobs.values()
                if j.status not in (JobStatus.COMPLETED, JobStatus.FAILED)
            )

    def cleanup_expired(self) -> int:
        """Remove expired completed/failed jobs. Returns count removed."""
        now = time.time()
        removed = 0
        with self._lock:
            expired_ids = [
                jid for jid, rec in self._jobs.items()
                if rec.status in (JobStatus.COMPLETED, JobStatus.FAILED)
                and (now - (rec.completed_at or rec.created_at)) > self._ttl
            ]
            for jid in expired_ids:
                del self._jobs[jid]
                removed += 1
        return removed


# Global singleton — shared across the application
job_store = JobStore(ttl_seconds=3600)
