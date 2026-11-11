"""Server-side file type detection. The client's Content-Type and file name are never trusted for the type."""
import io
import re
import unicodedata
import warnings
import zipfile
from dataclasses import dataclass
from typing import Optional

from PIL import Image, ImageOps

Image.MAX_IMAGE_PIXELS = 50_000_000


@dataclass(frozen=True)
class Detected:
    mime: str
    ext: str
    inline: bool  # safe to render in the browser (images, video, PDF); everything else is forced to download


_OFFICE = {
    "docx": ("word/", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    "xlsx": ("xl/", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    "pptx": ("ppt/", "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
}
_TEXT_EXT = {"txt": "text/plain", "md": "text/markdown", "csv": "text/csv"}


def _ext(name: str) -> str:
    return name.rsplit(".", 1)[-1].lower() if "." in name else ""


def detect(data: bytes, filename: str) -> Optional[Detected]:
    h = data[:32]
    if h.startswith(b"\xff\xd8\xff"):
        return Detected("image/jpeg", "jpg", True)
    if h.startswith(b"\x89PNG\r\n\x1a\n"):
        return Detected("image/png", "png", True)
    if h[:6] in (b"GIF87a", b"GIF89a"):
        return Detected("image/gif", "gif", True)
    if h[:4] == b"RIFF" and h[8:12] == b"WEBP":
        return Detected("image/webp", "webp", True)
    if h[4:8] == b"ftyp":
        brand = h[8:12]
        if brand in (b"heic", b"heix", b"mif1", b"msf1", b"heim", b"heis"):
            return Detected("image/heic", "heic", False)
        if brand == b"qt  ":
            return Detected("video/quicktime", "mov", True)
        return Detected("video/mp4", "mp4", True)
    if h.startswith(b"\x1a\x45\xdf\xa3"):
        return Detected("video/webm", "webm", True)
    if h.startswith(b"%PDF-"):
        return Detected("application/pdf", "pdf", True)

    ext = _ext(filename)
    if h.startswith(b"PK\x03\x04") and ext in _OFFICE:
        prefix, mime = _OFFICE[ext]
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                names = z.namelist()
                if len(names) > 5000 or "[Content_Types].xml" not in names or not any(n.startswith(prefix) for n in names):
                    return None
                # Zip-bomb guard: reject archives that claim to expand enormously.
                if sum(i.file_size for i in z.infolist()) > 500 * 1024 * 1024:
                    return None
        except zipfile.BadZipFile:
            return None
        return Detected(mime, ext, False)
    if ext in _TEXT_EXT:
        try:
            data.decode("utf-8")
        except UnicodeDecodeError:
            return None
        return Detected(_TEXT_EXT[ext], ext, False)
    return None


def sanitize_image(data: bytes, det: Detected) -> bytes:
    """Re-encode still images. Strips EXIF (e.g. GPS location) and destroys polyglot/payload tricks."""
    if det.mime not in ("image/jpeg", "image/png", "image/webp"):
        return data
    with warnings.catch_warnings():
        warnings.simplefilter("error", Image.DecompressionBombWarning)
        with Image.open(io.BytesIO(data)) as img:
            img.load()
            if getattr(img, "is_animated", False):
                return data
            # Bake the EXIF orientation into the pixels before the metadata is dropped.
            img = ImageOps.exif_transpose(img)
            fmt = {"image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WEBP"}[det.mime]
            if fmt == "JPEG" and img.mode not in ("RGB", "L"):
                img = img.convert("RGB")
            out = io.BytesIO()
            kwargs = {"quality": 90} if fmt in ("JPEG", "WEBP") else {"optimize": True}
            img.save(out, format=fmt, **kwargs)
            return out.getvalue()


_UNSAFE_NAME = re.compile(r"[^A-Za-z0-9 ._()\-]+")


def safe_filename(name: str, ext: str) -> str:
    """Display name only (storage uses random ids). Keeps it short, printable and with the detected extension."""
    name = unicodedata.normalize("NFKC", (name or "").replace("\\", "/").rsplit("/", 1)[-1])
    stem = name.rsplit(".", 1)[0] if "." in name else name
    stem = _UNSAFE_NAME.sub("_", stem).strip(" ._-")[:120] or "file"
    stem = re.sub(r"\.{2,}", ".", stem)
    return f"{stem}.{ext}"
