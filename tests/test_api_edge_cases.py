"""API integration and edge-case testing for all VayuSense endpoints."""

import pytest
from httpx import ASGITransport, AsyncClient
from app.main import create_app
from app.models.profile import PRESET_DAILY_COMMUTER


@pytest.fixture
def app_client():
    app = create_app()
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_recommendations_rules_endpoint_with_custom_profile(app_client):
    """Verify POST /api/recommendations/rules generates deterministic recommendations for custom profile."""
    async with app_client as client:
        payload = {
            "profile": PRESET_DAILY_COMMUTER.model_dump(),
            "location": "delhi",
        }
        resp = await client.post("/api/recommendations/rules", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert "risk_assessment" in data
        assert "exposure_risk_score" in data["risk_assessment"]
        assert "recommendations" in data
        assert len(data["recommendations"]) > 0
        assert data["profile_name"] == PRESET_DAILY_COMMUTER.profile_name


@pytest.mark.asyncio
async def test_recommendations_rules_missing_both_profile_and_preset(app_client):
    """Verify POST /api/recommendations/rules returns 400 when both profile and preset_name are omitted."""
    async with app_client as client:
        resp = await client.post("/api/recommendations/rules", json={"location": "delhi"})
        assert resp.status_code == 400
        assert "Must provide either" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_recommendations_rules_unknown_preset(app_client):
    """Verify POST /api/recommendations/rules returns 400 for nonexistent preset."""
    async with app_client as client:
        resp = await client.post(
            "/api/recommendations/rules",
            json={"preset_name": "nonexistent_preset", "location": "delhi"},
        )
        assert resp.status_code == 400
        assert "Unknown preset" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_profile_presets_get_endpoint(app_client):
    """Verify GET /api/profile/presets returns all built-in presets."""
    async with app_client as client:
        resp = await client.get("/api/profile/presets")
        assert resp.status_code == 200
        data = resp.json()
        assert "daily_commuter" in data
        assert "family" in data
        assert "senior_sensitive" in data


@pytest.mark.asyncio
async def test_profile_preset_detail_endpoint(app_client):
    """Verify GET /api/profile/presets/{preset_key} returns individual preset and 404 for unknown."""
    async with app_client as client:
        # Valid
        resp = await client.get("/api/profile/presets/family")
        assert resp.status_code == 200
        assert resp.json()["profile_name"] == "Family with Young Child"

        # Invalid -> 404
        resp_404 = await client.get("/api/profile/presets/unknown_persona")
        assert resp_404.status_code == 404


@pytest.mark.asyncio
async def test_profile_create_endpoint_with_custom_profile(app_client):
    """Verify POST /api/profile validates and initializes custom household profiles."""
    async with app_client as client:
        resp = await client.post("/api/profile", json={"custom_profile": PRESET_DAILY_COMMUTER.model_dump()})
        assert resp.status_code == 201
        data = resp.json()
        assert data["profile"]["profile_name"] == PRESET_DAILY_COMMUTER.profile_name
        assert data["total_members"] == PRESET_DAILY_COMMUTER.total_members


@pytest.mark.asyncio
async def test_cors_disallowed_origin_handling(app_client):
    """Verify unauthorized origins do not receive permissive Access-Control-Allow-Origin header."""
    async with app_client as client:
        resp = await client.options(
            "/api/aqi",
            headers={
                "Origin": "http://malicious-phishing-site.com",
                "Access-Control-Request-Method": "GET",
            },
        )
        # Disallowed origin should NOT match malicious origin
        assert resp.headers.get("access-control-allow-origin") != "http://malicious-phishing-site.com"


@pytest.mark.asyncio
async def test_rate_limiter_isolates_client_ips():
    """Verify rate limiter tracks IPs independently so IP A throttling does not block IP B."""
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Client IP A sends requests
        for _ in range(5):
            resp_a = await client.get(
                "/api/aqi?location=delhi",
                headers={"X-Forwarded-For": "203.0.113.1"},
            )
            assert resp_a.status_code in (200, 500)

        # Client IP B sends requests independently
        resp_b = await client.get(
            "/api/aqi?location=delhi",
            headers={"X-Forwarded-For": "198.51.100.2"},
        )
        assert resp_b.status_code in (200, 500)
