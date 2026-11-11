import json

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .config import get_settings

CSP = (
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: blob: https://*.googleusercontent.com; media-src 'self' blob:; connect-src 'self'; "
    "font-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
)
_UNSAFE = {"POST", "PUT", "PATCH", "DELETE"}


async def _reject(send: Send, status: int, detail: str) -> None:
    body = json.dumps({"detail": detail}).encode()
    await send({"type": "http.response.start", "status": status,
                "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())]})
    await send({"type": "http.response.body", "body": body})


class SecurityHeadersMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        s = get_settings()
        self.base = [
            (b"x-content-type-options", b"nosniff"),
            (b"x-frame-options", b"DENY"),
            (b"referrer-policy", b"no-referrer"),
            (b"permissions-policy", b"camera=(), microphone=(), geolocation=(), payment=()"),
            (b"cross-origin-opener-policy", b"same-origin"),
        ]
        if s.secure_cookies:
            self.base.append((b"strict-transport-security", b"max-age=31536000; includeSubDomains"))

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        is_api = scope["path"].startswith("/api/")

        async def wrapped(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                present = {k.lower() for k, _ in headers}
                for k, v in self.base:
                    if k not in present:
                        headers.append((k, v))
                if b"content-security-policy" not in present:
                    headers.append((b"content-security-policy", CSP.encode()))
                if is_api and b"cache-control" not in present:
                    headers.append((b"cache-control", b"no-store"))
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, wrapped)


class OriginCheckMiddleware:
    """Reject cross-site state-changing requests (CSRF defence in depth, also covers login/register)."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        self.allowed = {get_settings().public_origin.encode()}

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and scope["method"] in _UNSAFE:
            headers = dict(scope["headers"])
            origin = headers.get(b"origin")
            # Host was already validated by TrustedHostMiddleware, so same-origin requests are safe to accept.
            same = f"{scope.get('scheme', 'http')}://".encode() + headers.get(b"host", b"")
            if origin is not None and origin not in self.allowed and origin != same:
                return await _reject(send, 403, "bad_origin")
            if origin is None and headers.get(b"sec-fetch-site") == b"cross-site":
                return await _reject(send, 403, "bad_origin")
        await self.app(scope, receive, send)


class BodySizeLimitMiddleware:
    """Caps request bodies: small for JSON, larger for multipart uploads. Enforced while streaming."""

    def __init__(self, app: ASGIApp, json_limit: int = 1024 * 1024) -> None:
        self.app = app
        self.json_limit = json_limit
        self.upload_limit = get_settings().max_upload_bytes + 1024 * 1024

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        headers = dict(scope["headers"])
        ctype = headers.get(b"content-type", b"")
        limit = self.upload_limit if ctype.startswith(b"multipart/form-data") else self.json_limit
        declared = headers.get(b"content-length")
        if declared is not None and declared.isdigit() and int(declared) > limit:
            return await _reject(send, 413, "payload_too_large")

        received = 0
        too_big = False

        async def limited() -> Message:
            nonlocal received, too_big
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    too_big = True
                    return {"type": "http.disconnect"}
            return message

        started = False

        async def guarded_send(message: Message) -> None:
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, limited, guarded_send)
        except Exception:
            if too_big and not started:
                return await _reject(send, 413, "payload_too_large")
            raise
        if too_big and not started:
            await _reject(send, 413, "payload_too_large")
