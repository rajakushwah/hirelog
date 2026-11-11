import hashlib
import io
import os
import zipfile

from app.config import get_settings

APK = get_settings().android_apk_path


def _write(files: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for name, data in files.items():
            z.writestr(name, data)
    APK.parent.mkdir(parents=True, exist_ok=True)
    APK.write_bytes(buf.getvalue())
    os.utime(APK, None)
    return buf.getvalue()


async def test_downloads_require_sign_in(anon):
    _write({"AndroidManifest.xml": b"m"})
    assert (await anon.get("/api/downloads/android")).status_code == 401
    assert (await anon.get("/api/downloads/android/HireLog-1.0.0-beta.apk")).status_code == 401
    APK.unlink()


async def test_android_unavailable_without_apk(client):
    APK.unlink(missing_ok=True)
    r = await client.get("/api/downloads/android")
    assert r.status_code == 200 and r.json()["available"] is False
    assert (await client.get("/api/downloads/android/HireLog-1.0.0-beta.apk")).status_code == 404


async def test_non_apk_zip_is_not_offered(client):
    _write({"index.html": b"<script>alert(1)</script>"})
    assert (await client.get("/api/downloads/android")).json()["available"] is False


async def test_android_download(client):
    data = _write({"AndroidManifest.xml": b"\x03\x00manifest", "classes.dex": b"dex\n035" + b"x" * 4000})
    info = (await client.get("/api/downloads/android")).json()
    assert info["available"] and info["version"] == "1.0.0-beta"
    assert info["size"] == len(data) and info["sha256"] == hashlib.sha256(data).hexdigest()
    assert info["url"] == "/api/downloads/android/HireLog-1.0.0-beta.apk"

    r = await client.get(info["url"], headers={"Accept-Encoding": "gzip"})
    assert r.status_code == 200 and r.content == data
    assert r.headers["content-type"] == "application/vnd.android.package-archive"
    assert "attachment" in r.headers["content-disposition"]
    assert "content-encoding" not in r.headers and r.headers["x-content-type-options"] == "nosniff"

    partial = await client.get(info["url"], headers={"Range": "bytes=0-9"})
    assert partial.status_code == 206 and partial.content == data[:10]

    assert (await client.get("/api/downloads/android/..%2F..%2Fhirelog.db")).status_code == 404
    assert (await client.get("/api/downloads/android/other.apk")).status_code == 404
    APK.unlink()
