import os
import re
import shutil
import tempfile
from pathlib import Path
from typing import Protocol

_KEY = re.compile(r"^[A-Za-z0-9_]{1,64}(/[A-Za-z0-9_]{1,64}){0,2}$")


class Storage(Protocol):
    """Blob store for attachments. Swap LocalStorage for an S3/MinIO implementation to scale out."""

    def put(self, key: str, data: bytes) -> None: ...
    def get(self, key: str) -> bytes: ...
    def path(self, key: str) -> Path: ...
    def delete(self, key: str) -> None: ...
    def delete_prefix(self, prefix: str) -> None: ...


class LocalStorage:
    def __init__(self, root: Path) -> None:
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)

    def _resolve(self, key: str) -> Path:
        # Keys are built from server-generated ids only; the regex + containment check is defence in depth.
        if not _KEY.match(key):
            raise ValueError("invalid storage key")
        p = (self.root / key).resolve()
        if not p.is_relative_to(self.root):
            raise ValueError("invalid storage key")
        return p

    def put(self, key: str, data: bytes) -> None:
        dest = self._resolve(key)
        dest.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        fd, tmp = tempfile.mkstemp(dir=dest.parent, prefix=".tmp_")
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(data)
                f.flush()
                os.fsync(f.fileno())
            os.chmod(tmp, 0o600)
            os.replace(tmp, dest)
        except BaseException:
            Path(tmp).unlink(missing_ok=True)
            raise

    def get(self, key: str) -> bytes:
        return self._resolve(key).read_bytes()

    def path(self, key: str) -> Path:
        return self._resolve(key)

    def delete(self, key: str) -> None:
        self._resolve(key).unlink(missing_ok=True)

    def delete_prefix(self, prefix: str) -> None:
        p = self._resolve(prefix)
        if p.is_dir():
            shutil.rmtree(p, ignore_errors=True)


_storage: Storage | None = None


def get_storage() -> Storage:
    global _storage
    if _storage is None:
        from .config import get_settings

        _storage = LocalStorage(get_settings().storage_dir)
    return _storage


def reset_storage() -> None:
    global _storage
    _storage = None
