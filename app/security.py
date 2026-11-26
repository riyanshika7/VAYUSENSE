"""Security middleware, rate limiting, and request sanitization for VayuSense."""

import asyncio
import ipaddress
import time
from collections import defaultdict
from typing import Any, Awaitable, Callable, Dict, List, Optional, Sequence, Set, Tuple, Union

from fastapi import HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.config import get_settings

IPNetwork = Union[ipaddress.IPv4Network, ipaddress.IPv6Network]
Scope = Dict[str, Any]
Message = Dict[str, Any]
Receive = Callable[[], Awaitable[Message]]
Send = Callable[[Message], Awaitable[None]]
ASGIApp = Callable[[Scope, Receive, Send], Awaitable[None]]


def _parse_content_length(header_value: str) -> int:
    """Validate HTTP Content-Length header as a non-negative integer."""
    stripped = header_value.strip()
    if not stripped or not stripped.isdigit():
        raise ValueError("Content-Length must be a non-negative integer")
    return int(stripped)


def _parse_valid_ip(raw: str) -> Optional[str]:
    """Strictly parse an IP literal with `ipaddress`, normalizing IPv4-mapped IPv6 to IPv4."""
    candidate = raw.strip()
    if not candidate:
        return None
    try:
        addr = ipaddress.ip_address(candidate)
    except ValueError:
        return None
    if isinstance(addr, ipaddress.IPv6Address) and addr.ipv4_mapped is not None:
        return str(addr.ipv4_mapped)
    return str(addr)


def _normalize_peer_host(host: Optional[str]) -> str:
    """Normalize socket peer host; preserve non-IP local harness tokens like 'testclient'."""
    if not host:
        return "unknown"
    stripped = host.strip()
    if not stripped:
        return "unknown"
    if stripped in ("testclient", "localhost"):
        return stripped
    parsed = _parse_valid_ip(stripped)
    return parsed if parsed is not None else "unknown"


class _PayloadTooLargeError(HTTPException):
    """Internal HTTP 413 sentinel raised immediately when streamed request bytes exceed max_bytes."""


_CONTROL_FLOW_EXCEPTIONS = (
    asyncio.CancelledError,
    KeyboardInterrupt,
    SystemExit,
    GeneratorExit,
)


def _contains_control_flow_exception(exc: BaseException) -> bool:
    """Recursively check whether an exception tree contains cancellation or process-control signals."""
    if isinstance(exc, _CONTROL_FLOW_EXCEPTIONS):
        return True
    sub_exceptions = getattr(exc, "exceptions", None)
    if sub_exceptions:
        return any(_contains_control_flow_exception(sub) for sub in sub_exceptions)
    return False


def _is_payload_too_large_tree(exc: BaseException) -> bool:
    """Return True only when every leaf in the exception tree is `_PayloadTooLargeError`."""
    if isinstance(exc, _PayloadTooLargeError):
        return True
    sub_exceptions = getattr(exc, "exceptions", None)
    if sub_exceptions:
        return all(_is_payload_too_large_tree(sub) for sub in sub_exceptions)
    return False


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Injects defensive HTTP security headers into all responses."""

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
        response.headers["X-Permitted-Cross-Domain-Policies"] = "none"
        return response


class RequestSizeLimitMiddleware:
    """Pure ASGI middleware enforcing maximum request body size without buffering payloads.

    Checks declared `Content-Length` headers upfront and wraps ASGI `receive` to count
    actual incoming `http.request` body chunks, blocking chunked or understated payloads
    exceeding `max_bytes` with a single HTTP 413 response.
    """

    def __init__(self, app: ASGIApp, max_bytes: int = 1_048_576):  # 1 MB default
        self.app = app
        self.max_bytes = max_bytes

    async def _send_json_error(
        self,
        scope: Scope,
        receive: Receive,
        send: Send,
        status_code: int,
        detail: str,
    ) -> None:
        response = JSONResponse(status_code=status_code, content={"detail": detail})
        await response(scope, receive, send)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        content_length_headers: List[str] = []
        for name, value in scope.get("headers") or ():
            if name.lower() == b"content-length":
                try:
                    content_length_headers.append(value.decode("latin-1"))
                except UnicodeDecodeError:
                    await self._send_json_error(
                        scope, receive, send, 400, "Invalid Content-Length header."
                    )
                    return

        if content_length_headers:
            parsed_lengths: List[int] = []
            for raw_len in content_length_headers:
                try:
                    parsed_lengths.append(_parse_content_length(raw_len))
                except ValueError:
                    await self._send_json_error(
                        scope, receive, send, 400, "Invalid Content-Length header."
                    )
                    return
            if len(set(parsed_lengths)) != 1:
                await self._send_json_error(
                    scope, receive, send, 400, "Conflicting Content-Length headers."
                )
                return
            if parsed_lengths[0] > self.max_bytes:
                await self._send_json_error(
                    scope,
                    receive,
                    send,
                    413,
                    f"Payload too large. Maximum request size is {self.max_bytes} bytes (1MB).",
                )
                return

        total_bytes = 0
        limit_exceeded = False
        response_started = False
        too_large_detail = f"Payload too large. Maximum request size is {self.max_bytes} bytes (1MB)."

        async def guarded_send(message: Message) -> None:
            nonlocal response_started
            if message.get("type") == "http.response.start":
                if response_started:
                    return
                response_started = True
            await send(message)

        async def limited_receive() -> Message:
            nonlocal total_bytes, limit_exceeded
            if limit_exceeded:
                raise _PayloadTooLargeError(status_code=413, detail=too_large_detail)
            message = await receive()
            if message.get("type") == "http.request":
                body_chunk = message.get("body", b"")
                total_bytes += len(body_chunk)
                if total_bytes > self.max_bytes:
                    limit_exceeded = True
                    raise _PayloadTooLargeError(status_code=413, detail=too_large_detail)
            return message

        try:
            await self.app(scope, limited_receive, guarded_send)
        except BaseException as exc:
            # Unwrap TaskGroup / BaseExceptionGroup wrappers only for pure _PayloadTooLargeError trees
            # before any response has started; never swallow cancellation, shutdown, or unrelated errors.
            if not response_started and not _contains_control_flow_exception(exc) and _is_payload_too_large_tree(exc):
                await self._send_json_error(scope, receive, guarded_send, 413, too_large_detail)
                return
            raise


class InMemoryRateLimiter(BaseHTTPMiddleware):
    """In-memory sliding-window rate limiter protecting expensive AI and AQI endpoints.

    Supports two strict client-IP modes:
    1. Explicit Render/Cloudflare edge mode (`trusted_client_ip_header="cf-connecting-ip"`):
       Assumes the public Render web-service ingress is Cloudflare-protected (without Cloudflare
       Worker subrequests overriding the canonical edge header) and accepts exactly one
       ipaddress-validated `CF-Connecting-IP` value, falling back to the normalized socket peer.
    2. Generic reverse-proxy mode (`trusted_proxies=[...]`):
       Defaults strictly to `request.client.host` when `trusted_proxies` is empty; only trusts
       `X-Forwarded-For` from matching immediate peers, inspecting all header lines right-to-left
       and failing closed to the socket peer if any inspected hop is malformed.
    """

    def __init__(
        self,
        app,
        trusted_proxies: Optional[Sequence[str]] = None,
        trusted_client_ip_header: Optional[str] = None,
    ):
        super().__init__(app)
        self._history: Dict[str, List[float]] = defaultdict(list)
        self._window_seconds = 60.0
        settings = get_settings()
        configured_proxies = list(trusted_proxies) if trusted_proxies is not None else list(settings.TRUSTED_PROXIES)
        self._trusted_client_ip_header = (
            settings.TRUSTED_CLIENT_IP_HEADER
            if trusted_client_ip_header is None
            else trusted_client_ip_header.strip().lower()
        )
        self._trusted_proxy_hosts, self._trusted_proxy_nets = self._compile_trusted_proxies(configured_proxies)

    @staticmethod
    def _compile_trusted_proxies(entries: Sequence[str]) -> Tuple[Set[str], List[IPNetwork]]:
        hosts: Set[str] = set()
        nets: List[IPNetwork] = []
        for raw in entries:
            entry = raw.strip()
            if not entry:
                continue
            try:
                if "/" in entry:
                    nets.append(ipaddress.ip_network(entry, strict=False))
                else:
                    normalized = _parse_valid_ip(entry)
                    hosts.add(normalized if normalized is not None else entry)
            except ValueError:
                hosts.add(entry)
        return hosts, nets

    def _is_trusted_proxy(self, host: Optional[str]) -> bool:
        if not host:
            return False
        normalized = _parse_valid_ip(host) or host.strip()
        if normalized in self._trusted_proxy_hosts:
            return True
        try:
            addr = ipaddress.ip_address(normalized)
        except ValueError:
            return False
        return any(addr in net for net in self._trusted_proxy_nets)

    def _is_direct_test_runner(self, request: Request) -> bool:
        """Verify whether the socket connection is genuinely from local test runner or loopback."""
        peer = _normalize_peer_host(request.client.host if request.client else None)
        if peer in ("testclient", "localhost", "127.0.0.1"):
            xff_values = [v.strip() for v in request.headers.getlist("x-forwarded-for") if v.strip()]
            cf_values = [v.strip() for v in request.headers.getlist("cf-connecting-ip") if v.strip()]
            if not xff_values and not cf_values:
                return True
            if not cf_values and all(v in ("127.0.0.1", "localhost", "testclient") for v in xff_values):
                return True
        return False

    def _extract_render_cf_ip(self, request: Request, fallback_peer: str) -> str:
        """Extract canonical Cloudflare CF-Connecting-IP when explicitly enabled for Render."""
        values = request.headers.getlist("cf-connecting-ip")
        if len(values) != 1:
            return fallback_peer
        raw = values[0].strip()
        if not raw or "," in raw:
            return fallback_peer
        parsed = _parse_valid_ip(raw)
        return parsed if parsed is not None else fallback_peer

    def _get_client_ip(self, request: Request) -> str:
        """Resolve validated client IP without trusting spoofed headers or broad private CIDRs."""
        raw_peer = request.client.host if request.client and request.client.host else None
        fallback_peer = _normalize_peer_host(raw_peer)

        if self._trusted_client_ip_header == "cf-connecting-ip":
            return self._extract_render_cf_ip(request, fallback_peer)

        if self._is_trusted_proxy(raw_peer):
            header_lines = request.headers.getlist("x-forwarded-for")
            if header_lines:
                hops = [part.strip() for line in header_lines for part in line.split(",")]
                if not any(hops):
                    return fallback_peer
                for hop in reversed(hops):
                    parsed_hop = _parse_valid_ip(hop)
                    if parsed_hop is None:
                        return fallback_peer
                    if not self._is_trusted_proxy(parsed_hop):
                        return parsed_hop
                return fallback_peer

        return fallback_peer

    def _prune_expired_history(self, cutoff: float) -> int:
        """Remove rate-limit buckets whose timestamps have all aged out beyond `cutoff`."""
        expired_keys = [k for k, ts in self._history.items() if not ts or ts[-1] <= cutoff]
        for k in expired_keys:
            del self._history[k]
        return len(expired_keys)

    def _get_limit_for_path(self, path: str, is_test_runner: bool) -> int:
        # High allowance for local test runner
        if is_test_runner:
            return 500

        # AI endpoints are computationally/financially expensive
        if path.startswith("/api/ai/"):
            return 25  # 25 requests/min per IP

        # General API endpoints
        if path.startswith("/api/"):
            return 120  # 120 requests/min per IP

        return 300  # Default for health/docs

    async def dispatch(self, request: Request, call_next) -> Response:
        # Preflight OPTIONS requests must never be throttled (breaks CORS)
        if request.method == "OPTIONS":
            return await call_next(request)

        client_ip = self._get_client_ip(request)
        is_test_runner = self._is_direct_test_runner(request)
        path = request.url.path
        limit = self._get_limit_for_path(path, is_test_runner)

        now = time.time()
        cutoff = now - self._window_seconds

        # Periodic memory-bound protection against unbounded history growth
        if len(self._history) > 2048:
            self._prune_expired_history(cutoff)

        # Resilient path bucket extraction
        segments = [s for s in path.split("/") if s]
        bucket = segments[1] if len(segments) > 1 else (segments[0] if segments else "root")
        key = f"{client_ip}:{bucket}"
        timestamps = [t for t in self._history[key] if t > cutoff]

        if len(timestamps) >= limit:
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Please slow down and try again."},
                headers={"Retry-After": "60"},
            )

        timestamps.append(now)
        self._history[key] = timestamps

        return await call_next(request)
