"""Unit and integration tests for VayuSense AQI backend."""

import pytest
from httpx import ASGITransport, AsyncClient, Response

from app.config import Settings
from app.main import create_app
from app.services.waqi_service import WAQIService


# Sample authentic WAQI API payloads for testing upstream transformations
MOCK_WAQI_FEED_DELHI = {
    "status": "ok",
    "data": {
        "aqi": 182,
        "idx": 7024,
        "attributions": [
            {
                "url": "http://www.cpcb.gov.in/",
                "name": "CPCB - Central Pollution Control Board",
                "logo": "India-CPCB.png",
            },
            {
                "url": "https://waqi.info/",
                "name": "World Air Quality Index Project",
            },
        ],
        "city": {
            "geo": [28.63576, 77.22445],
            "name": "Mandir Marg, Delhi, India",
            "url": "https://aqicn.org/city/delhi/mandir-marg",
        },
        "dominentpol": "pm25",
        "iaqi": {
            "co": {"v": 12.4},
            "no2": {"v": 28.1},
            "o3": {"v": 15.0},
            "pm10": {"v": 145.0},
            "pm25": {"v": 182.0},
            # Note: so2 is intentionally omitted from iaqi to test that missing != 0
            "t": {"v": 24.5},
            "h": {"v": 58.0},
            "p": {"v": 1012.0},
            "w": {"v": 2.1},
        },
        "time": {
            "s": "2026-11-20 20:00:00",
            "tz": "+05:30",
            "v": 1763650800,
            "iso": "2026-11-20T20:00:00+05:30",
        },
    },
}

MOCK_WAQI_SEARCH_DELHI = {
    "status": "ok",
    "data": [
        {
            "uid": 7024,
            "aqi": "182",
            "time": {
                "tz": "+05:30",
                "stime": "2026-11-20 20:00:00",
                "v": 1763650800,
            },
            "station": {
                "name": "Mandir Marg, Delhi, India",
                "geo": [28.63576, 77.22445],
                "url": "delhi/mandir-marg",
            },
        },
        {
            "uid": 8011,
            "aqi": "-",  # Station reporting without active AQI
            "time": {
                "tz": "+05:30",
                "stime": "2026-11-20 19:00:00",
                "v": 1763647200,
            },
            "station": {
                "name": "Anand Vihar, Delhi, India",
                "geo": [28.6472, 77.3158],
                "url": "delhi/anand-vihar",
            },
        },
    ],
}


@pytest.fixture
def mock_settings():
    """Fixture providing valid mock settings."""
    return Settings(
        WAQI_API_TOKEN="test_token_12345",
        WAQI_BASE_URL="https://api.waqi.info",
        WAQI_REQUEST_TIMEOUT=5.0,
        APP_NAME="VayuSense AQI Backend",
        APP_VERSION="1.0.0",
        CORS_ORIGINS=["http://localhost:3000", "http://localhost:5173"],
    )


@pytest.mark.asyncio
async def test_health_check_endpoint():
    """Verify health check endpoint returns 200 with accurate metadata."""
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health")
        assert response.status_code == 200
        payload = response.json()
        assert payload["status"] in ("healthy", "degraded")
        assert payload["app_name"] == "VayuSense AQI Backend"
        assert payload["provider"] == "WAQI (aqicn.org)"
        assert "timestamp" in payload


@pytest.mark.asyncio
async def test_aqi_missing_parameters():
    """Verify 400 Bad Request when neither location nor coordinates are given."""
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/aqi")
        assert response.status_code == 400
        assert "Provide either 'location' or both 'lat' and 'lon'" in response.json()["detail"]


@pytest.mark.asyncio
async def test_aqi_conflicting_parameters():
    """Verify 400 Bad Request when both location and coordinates are given."""
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/aqi?location=delhi&lat=28.6&lon=77.2")
        assert response.status_code == 400
        assert "Ambiguous query" in response.json()["detail"]


@pytest.mark.asyncio
async def test_aqi_incomplete_coordinates():
    """Verify 400 Bad Request when only one coordinate axis is given."""
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Lat without lon
        response1 = await client.get("/api/aqi?lat=28.6")
        assert response1.status_code == 400
        assert "Both 'lat' and 'lon' must be provided" in response1.json()["detail"]

        # Lon without lat
        response2 = await client.get("/api/aqi?lon=77.2")
        assert response2.status_code == 400
        assert "Both 'lat' and 'lon' must be provided" in response2.json()["detail"]


@pytest.mark.asyncio
async def test_aqi_coordinates_out_of_bounds():
    """Verify 422 Unprocessable Entity for coordinates exceeding valid ranges."""
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/aqi?lat=120.0&lon=77.2")
        assert response.status_code == 422


@pytest.mark.asyncio
async def test_aqi_search_validation():
    """Verify 400 or 422 when search query is empty."""
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Empty string
        response = await client.get("/api/aqi/search?q=")
        assert response.status_code in (400, 422)

        # Whitespace
        response_ws = await client.get("/api/aqi/search?q=   ")
        assert response_ws.status_code == 400


@pytest.mark.asyncio
async def test_successful_location_search(monkeypatch, mock_settings):
    """Test location search against mocked WAQI upstream."""
    async def mock_get(self, url, params=None):
        return Response(200, json=MOCK_WAQI_SEARCH_DELHI)

    monkeypatch.setattr("httpx.AsyncClient.get", mock_get)

    service = WAQIService(settings=mock_settings)
    search_res = await service.search_stations("delhi")

    assert search_res.query == "delhi"
    assert search_res.count == 2
    assert search_res.results[0].station_id == 7024
    assert search_res.results[0].station_name == "Mandir Marg, Delhi, India"
    assert search_res.results[0].aqi == 182
    assert search_res.results[0].coordinates.latitude == 28.63576
    assert search_res.results[0].coordinates.longitude == 77.22445

    # Verify that '-' in WAQI is parsed as None, NEVER 0
    assert search_res.results[1].station_id == 8011
    assert search_res.results[1].aqi is None


@pytest.mark.asyncio
async def test_successful_aqi_feed_and_methodology(monkeypatch, mock_settings):
    """Verify live AQI response structure, pollutant parsing, and CPCB disclaimers."""
    async def mock_get(self, url, params=None):
        return Response(200, json=MOCK_WAQI_FEED_DELHI)

    monkeypatch.setattr("httpx.AsyncClient.get", mock_get)

    service = WAQIService(settings=mock_settings)
    aqi_data = await service.get_aqi_by_feed("delhi")

    # Basic station details
    assert aqi_data.station_name == "Mandir Marg, Delhi, India"
    assert aqi_data.station_id == 7024
    assert aqi_data.coordinates.latitude == 28.63576
    assert aqi_data.coordinates.longitude == 77.22445
    assert aqi_data.aqi == 182
    assert aqi_data.dominant_pollutant == "pm25"

    # Scale & Methodology: Must be US EPA standard, NOT claimed to be CPCB NAQI
    assert aqi_data.classification is not None
    assert aqi_data.classification.category == "Unhealthy"
    assert aqi_data.classification.scale_name == "WAQI / US EPA Standard"
    assert "CPCB" in aqi_data.classification.methodology_note
    assert "not calibrated" in aqi_data.classification.methodology_note.lower()

    # Pollutant integrity: Missing data is None, NEVER 0.0
    assert aqi_data.pollutants.pm25 is not None
    assert aqi_data.pollutants.pm25.value == 182.0
    assert aqi_data.pollutants.pm10 is not None
    assert aqi_data.pollutants.pm10.value == 145.0
    assert aqi_data.pollutants.no2 is not None
    assert aqi_data.pollutants.no2.value == 28.1
    # SO2 was absent in raw data -> must be None, NOT 0.0!
    assert aqi_data.pollutants.so2 is None

    # Weather sensors
    assert aqi_data.pollutants.meteorological is not None
    assert aqi_data.pollutants.meteorological["t"] == 24.5

    # Freshness
    assert "ago" in aqi_data.data_freshness or aqi_data.data_freshness.startswith("Live")

    # Attributions
    assert len(aqi_data.attributions) == 2
    assert aqi_data.attributions[0].name == "CPCB - Central Pollution Control Board"


@pytest.mark.asyncio
async def test_provider_error_handling_unknown_station(monkeypatch, mock_settings):
    """Verify 404 is returned when WAQI returns 'Unknown station'."""
    async def mock_get(self, url, params=None):
        return Response(200, json={"status": "error", "data": "Unknown station"})

    monkeypatch.setattr("httpx.AsyncClient.get", mock_get)

    service = WAQIService(settings=mock_settings)
    with pytest.raises(Exception) as exc_info:
        await service.get_aqi_by_feed("nonexistent_station_xyz")
    assert exc_info.value.status_code == 404
    assert "not found" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_provider_error_handling_invalid_key(monkeypatch, mock_settings):
    """Verify 502 Bad Gateway is returned when WAQI rejects token."""
    async def mock_get(self, url, params=None):
        return Response(200, json={"status": "error", "data": "Invalid key"})

    monkeypatch.setattr("httpx.AsyncClient.get", mock_get)

    service = WAQIService(settings=mock_settings)
    with pytest.raises(Exception) as exc_info:
        await service.get_aqi_by_feed("delhi")
    assert exc_info.value.status_code == 502
    assert "Invalid WAQI API token" in exc_info.value.detail


@pytest.mark.asyncio
async def test_missing_token_configuration():
    """Verify 500 Internal Server Error when WAQI token is completely missing."""
    empty_settings = Settings(WAQI_API_TOKEN="")
    service = WAQIService(settings=empty_settings)
    with pytest.raises(Exception) as exc_info:
        await service.get_aqi_by_feed("delhi")
    assert exc_info.value.status_code == 500
    assert "WAQI API token is not configured" in exc_info.value.detail


@pytest.mark.asyncio
async def test_cors_headers_present():
    """Verify CORS headers are returned for allowed origins."""
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.options(
            "/api/aqi",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert response.headers.get("access-control-allow-origin") == "http://localhost:3000"


@pytest.mark.asyncio
async def test_successful_forecast_parsing(monkeypatch, mock_settings):
    """Verify WAQI forecast payload is parsed into ForecastData."""
    payload_with_forecast = {
        "status": "ok",
        "data": {
            "aqi": 182,
            "idx": 7024,
            "city": {"name": "Mandir Marg, Delhi"},
            "forecast": {
                "daily": {
                    "pm25": [
                        {"day": "2026-11-20", "avg": 178, "min": 140, "max": 220},
                        {"day": "2026-11-21", "avg": 190, "min": 155, "max": 245},
                    ],
                    "pm10": [
                        {"day": "2026-11-20", "avg": 130, "min": 90, "max": 180},
                    ],
                }
            },
        },
    }

    async def mock_get(*args, **kwargs):
        return Response(200, json=payload_with_forecast)

    monkeypatch.setattr("httpx.AsyncClient.get", mock_get)

    service = WAQIService(settings=mock_settings)
    aqi_data = await service.get_aqi_by_feed("delhi")

    assert aqi_data.forecast is not None
    assert len(aqi_data.forecast.pm25) == 2
    assert aqi_data.forecast.pm25[0].day == "2026-11-20"
    assert aqi_data.forecast.pm25[0].avg == 178
    assert aqi_data.forecast.pm25[0].min == 140
    assert aqi_data.forecast.pm25[0].max == 220
    assert len(aqi_data.forecast.pm10) == 1
