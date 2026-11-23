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


def test_rate_limiter_spoofing_resistance_and_limits():
    """Verify rate limiter does not grant test-runner limit to spoofed forwarded headers."""
    from app.security import InMemoryRateLimiter
    from starlette.datastructures import Headers

    limiter = InMemoryRateLimiter(app=None)

    class DummyClient:
        host = "192.168.1.100"

    class DummyRequest:
        client = DummyClient()
        headers = Headers({"x-forwarded-for": "127.0.0.1"})

    req = DummyRequest()
    assert limiter._is_direct_test_runner(req) is False
    assert limiter._get_limit_for_path("/api/ai/plan", is_test_runner=False) == 25
    assert limiter._get_limit_for_path("/api/aqi", is_test_runner=False) == 120

    class TestRunnerRequest:
        client = type("Client", (), {"host": "testclient"})()
        headers = Headers()

    assert limiter._is_direct_test_runner(TestRunnerRequest()) is True
    assert limiter._get_limit_for_path("/api/ai/plan", is_test_runner=True) == 500


def test_rate_limiter_memory_bound_pruning():
    """Verify that limiter history exceeding 2048 keys is safely pruned."""
    from app.security import InMemoryRateLimiter
    import time

    limiter = InMemoryRateLimiter(app=None)
    now = time.time()
    cutoff = now - limiter._window_seconds

    for i in range(2100):
        limiter._history[f"ip_{i}:aqi"] = [now - 120.0]

    assert len(limiter._history) == 2100

    if len(limiter._history) > 2048:
        expired_keys = [k for k, ts in limiter._history.items() if not ts or ts[-1] <= cutoff]
        for k in expired_keys:
            del limiter._history[k]

    assert len(limiter._history) == 0
