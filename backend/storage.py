"""
SmartPress — Storage Abstraction (Phase 2)

Provides a unified interface for file storage with two backends:
- GCSStorage: Production — uploads to Google Cloud Storage, serves via signed URLs
- LocalStorage: Development fallback — uses local temp directories

The app auto-selects GCS if credentials are available, otherwise falls back to local.
"""

import os
import time
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Optional

# GCS import is conditional — app works without it
try:
    from google.cloud import storage as gcs_storage
    GCS_AVAILABLE = True
except ImportError:
    GCS_AVAILABLE = False


class StorageBackend(ABC):
    """Abstract base class for file storage operations."""

    @abstractmethod
    def upload(self, local_path: Path, key: str, bucket_name: str) -> str:
        """Upload a local file to storage. Returns the storage key/path."""
        ...

    @abstractmethod
    def get_download_url(self, key: str, bucket_name: str, expiry_seconds: int = 3600) -> str:
        """Get a download URL for a stored file."""
        ...

    @abstractmethod
    def delete(self, key: str, bucket_name: str) -> None:
        """Delete a file from storage."""
        ...

    @abstractmethod
    def exists(self, key: str, bucket_name: str) -> bool:
        """Check if a file exists in storage."""
        ...


class GCSStorage(StorageBackend):
    """Google Cloud Storage backend for production use."""

    def __init__(self):
        if not GCS_AVAILABLE:
            raise RuntimeError("google-cloud-storage is not installed")
        self._client = gcs_storage.Client()

    def upload(self, local_path: Path, key: str, bucket_name: str) -> str:
        bucket = self._client.bucket(bucket_name)
        blob = bucket.blob(key)
        blob.upload_from_filename(str(local_path))
        print(f"[GCS] Uploaded {local_path.name} → gs://{bucket_name}/{key}")
        return key

    def get_download_url(self, key: str, bucket_name: str, expiry_seconds: int = 3600) -> str:
        from datetime import timedelta
        bucket = self._client.bucket(bucket_name)
        blob = bucket.blob(key)
        url = blob.generate_signed_url(
            version="v4",
            expiration=timedelta(seconds=expiry_seconds),
            method="GET",
        )
        return url

    def delete(self, key: str, bucket_name: str) -> None:
        bucket = self._client.bucket(bucket_name)
        blob = bucket.blob(key)
        try:
            blob.delete()
            print(f"[GCS] Deleted gs://{bucket_name}/{key}")
        except Exception as e:
            print(f"[GCS] Failed to delete gs://{bucket_name}/{key}: {e}")

    def exists(self, key: str, bucket_name: str) -> bool:
        bucket = self._client.bucket(bucket_name)
        blob = bucket.blob(key)
        return blob.exists()


class LocalStorage(StorageBackend):
    """Local filesystem storage for development. Mimics GCS interface."""

    def __init__(self, base_dir: Path):
        self._base_dir = base_dir
        self._base_dir.mkdir(parents=True, exist_ok=True)
        self._backend_url = os.getenv("BACKEND_URL", "http://localhost:8000")

    def _resolve_path(self, key: str, bucket_name: str) -> Path:
        """Resolve a storage key to a local filesystem path."""
        target_dir = self._base_dir / bucket_name
        target_dir.mkdir(parents=True, exist_ok=True)
        return target_dir / key

    def upload(self, local_path: Path, key: str, bucket_name: str) -> str:
        import shutil
        dest = self._resolve_path(key, bucket_name)
        shutil.copy2(str(local_path), str(dest))
        print(f"[LocalStorage] Copied {local_path.name} → {dest}")
        return key

    def get_download_url(self, key: str, bucket_name: str, expiry_seconds: int = 3600) -> str:
        # For local dev, return the direct download endpoint URL
        return f"{self._backend_url}/download/{key}"

    def delete(self, key: str, bucket_name: str) -> None:
        path = self._resolve_path(key, bucket_name)
        try:
            if path.exists():
                os.remove(path)
                print(f"[LocalStorage] Deleted {path}")
        except Exception as e:
            print(f"[LocalStorage] Failed to delete {path}: {e}")

    def exists(self, key: str, bucket_name: str) -> bool:
        return self._resolve_path(key, bucket_name).exists()


def create_storage_backend(base_dir: Path) -> StorageBackend:
    """
    Factory function: creates the appropriate storage backend.
    Uses GCS if credentials are available, otherwise falls back to local storage.
    """
    gcs_creds = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    use_gcs = os.getenv("USE_GCS", "false").lower() == "true"

    if GCS_AVAILABLE and use_gcs and gcs_creds:
        try:
            backend = GCSStorage()
            print("[Storage] Using Google Cloud Storage backend")
            return backend
        except Exception as e:
            print(f"[Storage] GCS initialization failed ({e}), falling back to local storage")

    backend = LocalStorage(base_dir=base_dir)
    print("[Storage] Using local filesystem storage (dev mode)")
    return backend
