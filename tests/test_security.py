"""Security-specific tests verifying headers, input validation, rate limiting, and prompt injection defense."""

import pytest
from httpx import ASGITransport, AsyncClient
from app.main import create_app
from app.services.ai_service import _sanitize_error_text, _sanitize_output_text
from app.services.prompt_builder import SYSTEM_PROMPT


@pytest.mark.asyncio
async def test_security_headers_present_on_all_responses():
    """Verify defensive HTTP security headers are set on API responses."""
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/health")
        assert resp.status_code == 200
        headers = resp.headers
        assert headers.get("x-content-type-options") == "nosniff"
        assert headers.get("x-frame-options") == "DENY"
        assert "1; mode=block" in headers.get("x-xss-protection", "")
        assert headers.get("referrer-policy") == "strict-origin-when-cross-origin"
        assert "geolocation=()" in headers.get("permissions-policy", "")


@pytest.mark.asyncio
async def test_request_size_limit_blocks_oversized_payloads():
    """Verify request size middleware blocks bodies exceeding 1 MB with HTTP 413."""
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Simulate oversized payload header
        resp = await client.post(
            "/api/ai/parse-profile",
            headers={"Content-Length": "2097152"},  # 2 MB
            content=b"x" * 10,
        )
        assert resp.status_code == 413
        data = resp.json()
        assert "Payload too large" in data["detail"]


@pytest.mark.asyncio
async def test_path_traversal_in_location_rejected():
    """Verify path traversal characters in location query are blocked with HTTP 400."""
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Attempt directory traversal
        resp = await client.get("/api/aqi?location=../../etc/passwd")
        assert resp.status_code == 400
        assert "Invalid location" in resp.json()["detail"]

        # Attempt slash injection
        resp2 = await client.get("/api/aqi?location=delhi/mumbai")
        assert resp2.status_code == 400
        assert "Invalid location" in resp2.json()["detail"]


@pytest.mark.asyncio
async def test_oversized_search_query_rejected():
    """Verify excessively long search queries (>100 chars) are rejected."""
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        long_q = "a" * 150
        resp = await client.get(f"/api/aqi/search?q={long_q}")
        assert resp.status_code == 422 or resp.status_code == 400


def test_error_message_sanitizer_masks_secrets():
    """Verify _sanitize_error_text redacts API keys and tokens from error messages."""
    secret_key = "AIzaSyD_SECRET_KEY_12345"
    raw_error = f"Upstream error connecting to Google API with key={secret_key} at C:\\Users\\user\\app.py"

    sanitized = _sanitize_error_text(raw_error, secret=secret_key)
    assert secret_key not in sanitized
    assert "[REDACTED]" in sanitized
    assert "C:\\Users" not in sanitized


def test_output_sanitizer_strips_html_tags():
    """Verify _sanitize_output_text strips HTML tags from untrusted LLM outputs."""
    raw_output = "<script>alert('xss')</script>Extracted 2 adults and 1 child.<img src=x onerror=alert(1)>"
    sanitized = _sanitize_output_text(raw_output)
    assert "<script>" not in sanitized
    assert "<img" not in sanitized
    assert "Extracted 2 adults and 1 child." in sanitized


def test_system_prompt_contains_adversarial_guard():
    """Verify system prompt contains explicit anti-injection and prompt guard rules."""
    assert "ADVERSARIAL ROBUSTNESS & INJECTION GUARD" in SYSTEM_PROMPT
    assert "ignore previous instructions" in SYSTEM_PROMPT.lower()


def test_rate_limiter_spoofing_resistance_and_limits(monkeypatch):
    """Verify rate limiter ignores untrusted headers (even with RENDER=1) and enforces limits."""
    from app.security import InMemoryRateLimiter
    from starlette.datastructures import Headers

    monkeypatch.setenv("RENDER", "true")
    limiter = InMemoryRateLimiter(app=None)

    # 1. Direct untrusted peers cannot spoof X-Forwarded-For or CF-Connecting-IP
    for untrusted_peer in ("192.168.1.100", "203.0.113.50", "10.226.90.65", "100.64.0.5", "127.0.0.1"):
        spoofed_req = type("Req", (), {
            "client": type("Client", (), {"host": untrusted_peer})(),
            "headers": Headers({
                "x-forwarded-for": "127.0.0.1, 1.2.3.4",
                "cf-connecting-ip": "198.51.100.1",
            }),
        })()
        assert limiter._get_client_ip(spoofed_req) == untrusted_peer
        assert limiter._is_direct_test_runner(spoofed_req) is False

    assert limiter._get_limit_for_path("/api/ai/plan", is_test_runner=False) == 25
    assert limiter._get_limit_for_path("/api/aqi", is_test_runner=False) == 120

    class TestRunnerRequest:
        client = type("Client", (), {"host": "testclient"})()
        headers = Headers()

    assert limiter._is_direct_test_runner(TestRunnerRequest()) is True
    assert limiter._get_limit_for_path("/api/ai/plan", is_test_runner=True) == 500
    assert limiter._get_limit_for_path("/health", is_test_runner=False) == 300


def test_render_env_defaults_to_socket_peer_without_cf_trust(monkeypatch):
    """Verify RENDER=true and render.yaml default to empty client-IP header and empty trusted proxies."""
    from pathlib import Path
    from app.config import Settings
    from app.security import InMemoryRateLimiter
    from starlette.datastructures import Headers

    monkeypatch.setenv("RENDER", "true")
    settings = Settings(_env_file=None)
    assert settings.TRUSTED_CLIENT_IP_HEADER == ""
    assert settings.TRUSTED_PROXIES == []

    limiter = InMemoryRateLimiter(
        app=None,
        trusted_proxies=settings.TRUSTED_PROXIES,
        trusted_client_ip_header=settings.TRUSTED_CLIENT_IP_HEADER,
    )
    req = type("Req", (), {
        "client": type("Client", (), {"host": "::ffff:10.226.90.65"})(),
        "headers": Headers({
            "cf-connecting-ip": "198.51.100.77",
            "x-forwarded-for": "203.0.113.99",
        }),
    })()
    assert limiter._get_client_ip(req) == "10.226.90.65"

    render_yaml_text = Path("render.yaml").read_text(encoding="utf-8")
    assert "value: cf-connecting-ip" not in render_yaml_text
    assert 'key: TRUSTED_CLIENT_IP_HEADER\n        value: ""' in render_yaml_text


def test_rate_limiter_render_cf_connecting_ip_validation():
    """Verify Render Cloudflare CF-Connecting-IP parsing, IPv6 normalization, and fail-closed fallback."""
    from app.security import InMemoryRateLimiter
    from starlette.datastructures import Headers

    limiter = InMemoryRateLimiter(app=None, trusted_client_ip_header="cf-connecting-ip")

    def make_req(peer, raw_headers):
        return type("Req", (), {
            "client": type("Client", (), {"host": peer})(),
            "headers": Headers(raw=raw_headers),
        })()

    # Valid IPv4 and IPv6 CF-Connecting-IP accepted cleanly
    assert limiter._get_client_ip(make_req("10.226.90.65", [(b"cf-connecting-ip", b"198.51.100.42")])) == "198.51.100.42"
    assert limiter._get_client_ip(make_req("10.226.90.65", [(b"cf-connecting-ip", b"2001:db8::1")])) == "2001:db8::1"

    # IPv4-mapped IPv6 normalized cleanly on header and peer
    assert limiter._get_client_ip(make_req("10.226.90.65", [(b"cf-connecting-ip", b"::ffff:203.0.113.9")])) == "203.0.113.9"

    # Missing header -> safe fallback to normalized socket peer
    assert limiter._get_client_ip(make_req("::ffff:10.0.0.8", [])) == "10.0.0.8"

    # Duplicate header lines or comma-joined ambiguity -> rejected, falls back to socket peer
    assert limiter._get_client_ip(
        make_req("10.226.90.65", [(b"cf-connecting-ip", b"198.51.100.1"), (b"cf-connecting-ip", b"198.51.100.2")])
    ) == "10.226.90.65"
    assert limiter._get_client_ip(
        make_req("10.226.90.65", [(b"cf-connecting-ip", b"198.51.100.1, 198.51.100.2")])
    ) == "10.226.90.65"

    # Malformed, empty, or host:port values rejected safely
    for bad_val in (b"", b"   ", b"not-an-ip", b"198.51.100.4:44321", b"[2001:db8::1]:443"):
        assert limiter._get_client_ip(make_req("10.226.90.65", [(b"cf-connecting-ip", bad_val)])) == "10.226.90.65"


def test_rate_limiter_generic_trusted_proxy_chains():
    """Verify explicit generic trusted proxies parse multi-line X-Forwarded-For right-to-left safely."""
    from app.security import InMemoryRateLimiter
    from starlette.datastructures import Headers

    limiter = InMemoryRateLimiter(app=None, trusted_proxies=["127.0.0.1", "10.1.0.0/16"])

    def make_req(peer, raw_headers):
        return type("Req", (), {
            "client": type("Client", (), {"host": peer})(),
            "headers": Headers(raw=raw_headers),
        })()

    # Right-to-left chain skips explicit trusted proxy hops only
    assert limiter._get_client_ip(
        make_req("127.0.0.1", [(b"x-forwarded-for", b"1.2.3.4, 198.51.100.55, 10.1.2.3")])
    ) == "198.51.100.55"

    # Multiple X-Forwarded-For header lines parsed identically in order
    assert limiter._get_client_ip(
        make_req("127.0.0.1", [
            (b"x-forwarded-for", b"1.2.3.4"),
            (b"x-forwarded-for", b"198.51.100.88, 10.1.9.9"),
        ])
    ) == "198.51.100.88"

    # IPv4-mapped IPv6 peer matches configured IPv4 proxy and normalizes client IP
    assert limiter._get_client_ip(
        make_req("::ffff:127.0.0.1", [(b"x-forwarded-for", b"::ffff:203.0.113.7")])
    ) == "203.0.113.7"

    # Malformed or host:port forwarded hop falls back safely to normalized socket peer
    for bad_chain in (b"198.51.100.1, bad-hop", b"198.51.100.1, 198.51.100.2:8080", b"   "):
        assert limiter._get_client_ip(
            make_req("127.0.0.1", [(b"x-forwarded-for", bad_chain)])
        ) == "127.0.0.1"


def _run_sync_asgi(coro):
    """Drive a pure-Python non-blocking ASGI coroutine without OS socketpair/IOCP event loops."""
    try:
        coro.send(None)
    except StopIteration as exc:
        return exc.value
    raise AssertionError("Expected non-blocking ASGI coroutine to finish synchronously")


def _invoke_size_limit_middleware(body_chunks, headers, max_bytes=1_048_576):
    """Exercise RequestSizeLimitMiddleware directly against chunked/declared ASGI inputs."""
    import json
    from app.security import RequestSizeLimitMiddleware

    app_calls = 0
    received_body = bytearray()

    async def inner_app(scope, receive, send):
        nonlocal app_calls
        app_calls += 1
        while True:
            msg = await receive()
            if msg["type"] == "http.request":
                received_body.extend(msg.get("body", b""))
                if not msg.get("more_body", False):
                    break
        body = json.dumps({"received_bytes": len(received_body)}).encode("utf-8")
        await send({
            "type": "http.response.start",
            "status": 200,
            "headers": [(b"content-type", b"application/json")],
        })
        await send({"type": "http.response.body", "body": body, "more_body": False})

    middleware = RequestSizeLimitMiddleware(inner_app, max_bytes=max_bytes)

    queue = [
        {"type": "http.request", "body": chunk, "more_body": idx < len(body_chunks) - 1}
        for idx, chunk in enumerate(body_chunks)
    ] or [{"type": "http.request", "body": b"", "more_body": False}]

    async def receive():
        return queue.pop(0) if queue else {"type": "http.request", "body": b"", "more_body": False}

    started = []
    sent_body = bytearray()

    async def send(message):
        if message["type"] == "http.response.start":
            started.append(message)
        elif message["type"] == "http.response.body":
            sent_body.extend(message.get("body", b""))

    scope = {"type": "http", "method": "POST", "path": "/api/profile", "headers": headers}
    _run_sync_asgi(middleware(scope, receive, send))
    assert len(started) == 1, f"Expected exactly 1 ASGI response.start, got {len(started)}"
    return started[0]["status"], json.loads(sent_body.decode("utf-8")), app_calls, len(received_body)


def test_request_size_limit_middleware_sync_edge_cases():
    """Verify exact limit, +1 byte chunked overflow, understated/malformed/negative headers, and JSON flow."""
    limit = 1_048_576

    # 1. Body exactly at limit (chunked without Content-Length) -> 200 OK
    half = b"a" * (limit // 2)
    status_ok, payload_ok, calls_ok, rec_ok = _invoke_size_limit_middleware([half, half], headers=[])
    assert status_ok == 200 and payload_ok["received_bytes"] == limit and calls_ok == 1 and rec_ok == limit

    # 2 & 3. Chunked request without Content-Length one byte over limit -> single 413
    status_over, payload_over, _, _ = _invoke_size_limit_middleware([half, half, b"x"], headers=[])
    assert status_over == 413 and "Payload too large" in payload_over["detail"]

    # 4. Understated Content-Length (claims 10 bytes, streams 1MB + 1 byte) -> single 413
    status_under, payload_under, _, _ = _invoke_size_limit_middleware(
        [half, half, b"x"],
        headers=[(b"content-length", b"10")],
    )
    assert status_under == 413 and "Payload too large" in payload_under["detail"]

    # 5 & 6. Malformed, negative, and conflicting Content-Length headers -> 400 without calling inner app
    for bad_headers in (
        [(b"content-length", b"abc")],
        [(b"content-length", b"-10")],
        [(b"content-length", b"10"), (b"content-length", b"20")],
    ):
        st_bad, body_bad, calls_bad, _ = _invoke_size_limit_middleware([b"{}"], headers=bad_headers)
        assert st_bad == 400 and "Content-Length" in body_bad["detail"] and calls_bad == 0

    # Declared Content-Length above limit rejected upfront before reading chunks -> 413, 0 app calls
    st_decl, body_decl, calls_decl, _ = _invoke_size_limit_middleware(
        [b"{}"],
        headers=[(b"content-length", str(limit + 1).encode("ascii"))],
    )
    assert st_decl == 413 and "Payload too large" in body_decl["detail"] and calls_decl == 0

    # 7. Empty request body -> 200 OK
    st_empty, body_empty, calls_empty, _ = _invoke_size_limit_middleware([], headers=[])
    assert st_empty == 200 and body_empty["received_bytes"] == 0 and calls_empty == 1

    # 8. Normal JSON request passes cleanly
    sample_json = b'{"preset_name": "family"}'
    st_json, body_json, calls_json, _ = _invoke_size_limit_middleware(
        [sample_json],
        headers=[(b"content-length", str(len(sample_json)).encode("ascii"))],
    )
    assert st_json == 200 and body_json["received_bytes"] == len(sample_json) and calls_json == 1


def test_request_size_limit_middleware_exception_tree_and_response_state():
    """Verify ExceptionGroup 413 handling, post-start propagation, and non-swallowing of errors."""
    import asyncio
    import json
    from app.security import RequestSizeLimitMiddleware, _PayloadTooLargeError

    # 1. Legitimate ExceptionGroup containing _PayloadTooLargeError -> single 413 when response not started
    async def group_too_large_app(scope, receive, send):
        try:
            await receive()
        except _PayloadTooLargeError as exc:
            raise ExceptionGroup("task group failure", [exc])

    started = []
    sent_body = bytearray()

    async def capture_send(msg):
        if msg["type"] == "http.response.start":
            started.append(msg)
        elif msg["type"] == "http.response.body":
            sent_body.extend(msg.get("body", b""))

    async def oversized_receive():
        return {"type": "http.request", "body": b"x" * 64, "more_body": False}

    mw = RequestSizeLimitMiddleware(group_too_large_app, max_bytes=32)
    scope = {"type": "http", "method": "POST", "path": "/api/profile", "headers": []}
    _run_sync_asgi(mw(scope, oversized_receive, capture_send))
    assert len(started) == 1 and started[0]["status"] == 413
    assert "Payload too large" in json.loads(sent_body.decode("utf-8"))["detail"]

    # 2. _PayloadTooLargeError after response_started -> no second response, exception propagates
    async def after_start_app(scope, receive, send):
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await receive()

    started_after = []

    async def send_after(msg):
        if msg["type"] == "http.response.start":
            started_after.append(msg)

    mw_after = RequestSizeLimitMiddleware(after_start_app, max_bytes=32)
    with pytest.raises(_PayloadTooLargeError):
        _run_sync_asgi(mw_after(scope, oversized_receive, send_after))
    assert len(started_after) == 1 and started_after[0]["status"] == 200

    # 3. Unrelated RuntimeError is never converted to 413 even after limit_exceeded
    async def runtime_error_app(scope, receive, send):
        try:
            await receive()
        except _PayloadTooLargeError:
            pass
        raise RuntimeError("unrelated downstream failure")

    started_rt = []

    async def send_rt(msg):
        if msg["type"] == "http.response.start":
            started_rt.append(msg)

    mw_rt = RequestSizeLimitMiddleware(runtime_error_app, max_bytes=32)
    with pytest.raises(RuntimeError, match="unrelated downstream failure"):
        _run_sync_asgi(mw_rt(scope, oversized_receive, send_rt))
    assert started_rt == []

    # 4. Cancellation inside a BaseExceptionGroup propagates even alongside _PayloadTooLargeError
    async def cancelled_group_app(scope, receive, send):
        try:
            await receive()
        except _PayloadTooLargeError as exc:
            raise BaseExceptionGroup("mixed group", [asyncio.CancelledError(), exc])

    started_cancel = []

    async def send_cancel(msg):
        if msg["type"] == "http.response.start":
            started_cancel.append(msg)

    mw_cancel = RequestSizeLimitMiddleware(cancelled_group_app, max_bytes=32)
    with pytest.raises(BaseExceptionGroup) as exc_info:
        _run_sync_asgi(mw_cancel(scope, oversized_receive, send_cancel))
    assert any(isinstance(e, asyncio.CancelledError) for e in exc_info.value.exceptions)
    assert started_cancel == []


@pytest.mark.asyncio
async def test_request_size_limit_middleware_async_cancellation_propagates():
    """Verify direct task cancellation and grouped CancelledError propagate cleanly in asyncio."""
    import asyncio
    from app.security import RequestSizeLimitMiddleware

    scope = {"type": "http", "method": "POST", "path": "/api/profile", "headers": []}
    started = []

    async def send(msg):
        if msg["type"] == "http.response.start":
            started.append(msg)

    # 1. Direct asyncio task cancellation propagates as CancelledError
    gate = asyncio.Event()

    async def slow_app(sc, receive, se):
        gate.set()
        await asyncio.sleep(10)

    async def dummy_receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    mw = RequestSizeLimitMiddleware(slow_app, max_bytes=1_048_576)
    task = asyncio.create_task(mw(scope, dummy_receive, send))
    await gate.wait()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert started == []

    # 2. CancelledError wrapped inside BaseExceptionGroup propagates unchanged
    async def grouped_cancel_app(sc, receive, se):
        raise BaseExceptionGroup("cancelled task group", [asyncio.CancelledError()])

    mw_group = RequestSizeLimitMiddleware(grouped_cancel_app, max_bytes=1_048_576)
    with pytest.raises(BaseExceptionGroup) as exc_info:
        await mw_group(scope, dummy_receive, send)
    assert any(isinstance(e, asyncio.CancelledError) for e in exc_info.value.exceptions)
    assert started == []


def test_cors_production_validation_and_middleware_sync():
    """Verify production CORS rejects missing/wildcard config, disables credentials, and filters origins."""
    from starlette.middleware.cors import CORSMiddleware
    from app.config import Settings
    from app.main import create_app

    # Missing explicit CORS_ORIGINS in production raises
    with pytest.raises(ValueError, match="CORS_ORIGINS"):
        Settings(_env_file=None, ENVIRONMENT="production")

    # Wildcard CORS_ORIGINS in production raises
    for bad_cors in ('["*"]', "*", '["https://*.example.com"]', ""):
        with pytest.raises(ValueError):
            Settings(_env_file=None, ENVIRONMENT="production", CORS_ORIGINS=bad_cors)

    # Unsupported TRUSTED_CLIENT_IP_HEADER raises
    with pytest.raises(ValueError, match="TRUSTED_CLIENT_IP_HEADER"):
        Settings(_env_file=None, TRUSTED_CLIENT_IP_HEADER="x-forwarded-for")

    # Configured production origin + CORSMiddleware behavior verified synchronously
    prod_settings = Settings(
        _env_file=None,
        ENVIRONMENT="production",
        CORS_ORIGINS='["https://vayusense.example"]',
        TRUSTED_CLIENT_IP_HEADER="cf-connecting-ip",
    )
    app = create_app(settings=prod_settings)
    cors_mw = next(m for m in app.user_middleware if m.cls is CORSMiddleware)
    assert cors_mw.kwargs["allow_credentials"] is False
    assert cors_mw.kwargs["allow_origins"] == ["https://vayusense.example"]
    assert set(cors_mw.kwargs["allow_methods"]) == {"GET", "POST", "OPTIONS", "HEAD"}
    assert set(cors_mw.kwargs["allow_headers"]) == {"Content-Type", "Accept", "Origin"}

    # Verify preflight OPTIONS & origin restriction cleanly against actual CORSMiddleware
    mw_instance = CORSMiddleware(app=lambda s, r, se: None, **cors_mw.kwargs)

    def run_preflight(mw, origin, method="POST", req_headers=b"Content-Type"):
        started = []

        async def send(msg):
            if msg["type"] == "http.response.start":
                started.append(msg)

        scope = {
            "type": "http",
            "method": "OPTIONS",
            "path": "/api/ai/plan",
            "headers": [
                (b"origin", origin.encode("latin-1")),
                (b"access-control-request-method", method.encode("latin-1")),
                (b"access-control-request-headers", req_headers),
            ],
        }

        async def dummy_recv():
            return {"type": "http.request", "body": b"", "more_body": False}

        _run_sync_asgi(mw(scope, dummy_recv, send))
        return started[0]["status"], {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in started[0]["headers"]}

    st_allow, h_allow = run_preflight(mw_instance, "https://vayusense.example", method="POST")
    assert st_allow == 200
    assert h_allow.get("access-control-allow-origin") == "https://vayusense.example"
    assert "access-control-allow-credentials" not in h_allow

    st_deny, h_deny = run_preflight(mw_instance, "https://untrusted.example", method="POST")
    assert st_deny == 400
    assert h_deny.get("access-control-allow-origin") is None

    # Local development origin remains functional with credentials disabled
    dev_app = create_app(settings=Settings(_env_file=None, ENVIRONMENT="development"))
    dev_cors_kw = next(m for m in dev_app.user_middleware if m.cls is CORSMiddleware).kwargs
    dev_mw = CORSMiddleware(app=lambda s, r, se: None, **dev_cors_kw)
    st_dev, h_dev = run_preflight(dev_mw, "http://localhost:5173", method="POST")
    assert st_dev == 200 and h_dev.get("access-control-allow-origin") == "http://localhost:5173"
    assert "access-control-allow-credentials" not in h_dev


@pytest.mark.asyncio
async def test_asgi_chunked_body_limit_blocks_full_fastapi_route():
    """Full FastAPI integration check verifying chunked request > 1MB returns single 413 response."""
    from app.config import Settings

    app = create_app(settings=Settings(_env_file=None, ENVIRONMENT="development"))

    async def chunked_oversized_stream():
        chunk = b"x" * (512 * 1024)
        yield chunk
        yield chunk
        yield b"extra"

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/api/profile",
            content=chunked_oversized_stream(),
            headers={"Content-Type": "application/json"},
        )
        assert resp.status_code == 413
        assert "Payload too large" in resp.json()["detail"]

        ok_resp = await client.post("/api/profile", json={"preset_name": "family"})
        assert ok_resp.status_code == 201


def test_rate_limiter_memory_bound_pruning():
    """Verify that InMemoryRateLimiter._prune_expired_history evicts stale buckets safely."""
    from app.security import InMemoryRateLimiter
    import time

    limiter = InMemoryRateLimiter(app=None)
    now = time.time()
    cutoff = now - limiter._window_seconds

    for i in range(2100):
        limiter._history[f"ip_{i}:aqi"] = [now - 120.0]
    limiter._history["active:aqi"] = [now - 5.0]

    pruned = limiter._prune_expired_history(cutoff)
    assert pruned == 2100
    assert list(limiter._history.keys()) == ["active:aqi"]


def test_router_resolve_household_profile_contracts():
    """Verify shared router profile resolution honors precedence and preserves 400 details."""
    from fastapi import HTTPException
    from app.models.profile import PRESET_DAILY_COMMUTER, PRESET_FAMILY
    from app.routers._helpers import resolve_household_profile

    custom = PRESET_FAMILY.model_copy(update={"profile_name": "Custom"})

    assert resolve_household_profile(custom, "daily_commuter") is custom
    assert resolve_household_profile(custom, "daily_commuter", prefer_preset=True) == PRESET_DAILY_COMMUTER

    with pytest.raises(HTTPException) as exc_unknown:
        resolve_household_profile(None, "unknown_key", preset_error_prefix="Unknown preset")
    assert exc_unknown.value.status_code == 400
    assert "Unknown preset" in exc_unknown.value.detail

    with pytest.raises(HTTPException) as exc_missing:
        resolve_household_profile(None, None)
    assert exc_missing.value.status_code == 400
    assert "Must provide either" in exc_missing.value.detail
