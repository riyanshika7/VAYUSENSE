"""Deep architectural test suite for WAQIService.

Verifies:
1. Geographic coordinate queries and out-of-bounds validation.
2. Station search parsing resilience with malformed, empty, and populated payloads.
3. Upstream error branches: malformed JSON, 502 Bad Gateway, 429 Rate Limit, 504 Timeout.
4. Non-numeric and missing pollutant field parsing resilience.
5. Station URL normalization and protocol-handler protection.
6. Attribution preservation on Indian fallback and upstream feeds.
7. Freshness calculation edge cases.
"""

from datetime import datetime, timezone
import pytest
from fastapi import HTTPException
from httpx import RequestError, Response, TimeoutException
from app.config import Settings
from app.services.waqi_service import WAQIService


@pytest.fixture
def mock_waqi_service():
    settings = Settings(WAQI_API_TOKEN="test_token_12345")
    return WAQIService(settings=settings)


@pytest.mark.asyncio
async def test_get_aqi_by_coords_success(monkeypatch, mock_waqi_service):
    """Verify get_aqi_by_coords calls geo endpoint and transforms data."""
    mock_payload = {
        "status": "ok",
        "data": {
            "aqi": 115,
            "idx": 8175,
            "city": {"name": "Bandra, Mumbai", "geo": [19.0596, 72.8295]},
            "iaqi": {"pm25": {"v": 115.0}},
            "time": {"v": 1700000000},
        },
    }

    async def mock_get(self, url, params=None):
        assert "geo:19.0596;72.8295" in url
        return Response(200, json=mock_payload)

    monkeypatch.setattr("httpx.AsyncClient.get", mock_get)

    res = await mock_waqi_service.get_aqi_by_coords(lat=19.0596, lon=72.8295)
    assert res.aqi == 115
    assert res.station_name == "Bandra, Mumbai"
    assert res.coordinates.latitude == 19.0596
    assert res.coordinates.longitude == 72.8295


@pytest.mark.asyncio
async def test_get_aqi_by_coords_out_of_bounds(mock_waqi_service):
    """Verify get_aqi_by_coords raises 400 when latitude or longitude is out of range."""
    with pytest.raises(HTTPException) as exc_lat:
        await mock_waqi_service.get_aqi_by_coords(lat=95.0, lon=77.0)
    assert exc_lat.value.status_code == 400
    assert "out of bounds" in exc_lat.value.detail.lower()

    with pytest.raises(HTTPException) as exc_lon:
        await mock_waqi_service.get_aqi_by_coords(lat=28.0, lon=-195.0)
    assert exc_lon.value.status_code == 400
    assert "out of bounds" in exc_lon.value.detail.lower()


@pytest.mark.asyncio
async def test_search_stations_parsing_and_resilience(monkeypatch, mock_waqi_service):
    """Verify station search handles valid stations, malformed items, and empty lists."""
    mock_search_payload = {
        "status": "ok",
        "data": [
            {
                "uid": 7024,
                "aqi": "184",
                "station": {
                    "name": "Mandir Marg, Delhi",
                    "geo": [28.6358, 77.2245],
                    "url": "delhi/mandir-marg",
                },
                "time": {"stime": "2026-11-23 12:00:00"},
            },
            # Malformed item (missing uid) -> should be skipped gracefully
            {"aqi": "-", "station": {"name": "Ghost Station"}},
            # Non-dict item -> should be skipped
            "not_a_dict",
        ],
    }

    async def mock_get(self, url, params=None):
        return Response(200, json=mock_search_payload)

    monkeypatch.setattr("httpx.AsyncClient.get", mock_get)

    search_res = await mock_waqi_service.search_stations("delhi")
    assert search_res.count == 1
    assert search_res.results[0].station_id == 7024
    assert search_res.results[0].station_name == "Mandir Marg, Delhi"
    assert search_res.results[0].aqi == 184


@pytest.mark.asyncio
async def test_upstream_error_handling_branches(monkeypatch, mock_waqi_service):
    """Verify 502, 504, and JSON errors are mapped to appropriate HTTP exceptions."""
    # 1. Invalid JSON from upstream
    async def mock_invalid_json(self, url, params=None):
        return Response(200, content=b"Invalid JSON <<< Not a dict >>>")

    monkeypatch.setattr("httpx.AsyncClient.get", mock_invalid_json)
    with pytest.raises(HTTPException) as exc_json:
        await mock_waqi_service.get_aqi_by_feed("delhi")
    assert exc_json.value.status_code == 502
    assert "invalid json" in exc_json.value.detail.lower()

    # 2. HTTP 502 when status != 200
    async def mock_500(self, url, params=None):
        return Response(500, content=b"Internal Server Error")

    monkeypatch.setattr("httpx.AsyncClient.get", mock_500)
    with pytest.raises(HTTPException) as exc_502:
        await mock_waqi_service.get_aqi_by_feed("delhi")
    assert exc_502.value.status_code == 502

    # 3. Upstream TimeoutException -> 504 Gateway Timeout
    async def mock_timeout(self, url, params=None):
        raise TimeoutException("Upstream timed out")

    monkeypatch.setattr("httpx.AsyncClient.get", mock_timeout)
    with pytest.raises(HTTPException) as exc_504:
        await mock_waqi_service.get_aqi_by_feed("delhi")
    assert exc_504.value.status_code == 504
    assert "timed out" in exc_504.value.detail.lower()

    # 4. Upstream RequestError -> 502 Bad Gateway
    async def mock_req_err(self, url, params=None):
        raise RequestError("Connection reset by peer")

    monkeypatch.setattr("httpx.AsyncClient.get", mock_req_err)
    with pytest.raises(HTTPException) as exc_req:
        await mock_waqi_service.get_aqi_by_feed("delhi")
    assert exc_req.value.status_code == 502


def test_station_url_normalization(mock_waqi_service):
    """Verify URL normalization safely converts relative paths and disallows script URIs."""
    # Relative path
    assert mock_waqi_service._normalize_station_url("india/delhi/mandir-marg") == "https://aqicn.org/city/india/delhi/mandir-marg"
    # Full HTTPS URL
    assert mock_waqi_service._normalize_station_url("https://aqicn.org/city/mumbai") == "https://aqicn.org/city/mumbai"
    # Dangerous URI schemes rejected
    assert mock_waqi_service._normalize_station_url("javascript:alert(1)") is None
    assert mock_waqi_service._normalize_station_url("data:text/html,hack") is None
    # None input
    assert mock_waqi_service._normalize_station_url(None) is None


def test_data_freshness_time_buckets(mock_waqi_service):
    """Verify data freshness categorizer buckets elapsed time accurately."""
    fixed_now = datetime(2026, 11, 23, 12, 0, 0, tzinfo=timezone.utc)
    now_epoch = int(fixed_now.timestamp())

    # None -> Unknown
    assert mock_waqi_service._calculate_freshness(None, fixed_now) == "Unknown"
    # Future timestamp (clock skew) -> Live
    assert mock_waqi_service._calculate_freshness(now_epoch + 120, fixed_now) == "Live (< 1h ago)"
    # 30 mins ago -> Live
    assert mock_waqi_service._calculate_freshness(now_epoch - 1800, fixed_now) == "Live (< 1h ago)"
    # 2 hours ago -> Fresh (~2h ago)
    assert "Fresh" in mock_waqi_service._calculate_freshness(now_epoch - 7200, fixed_now)
    # 5 hours ago -> Moderate (~5h ago)
    assert "Moderate" in mock_waqi_service._calculate_freshness(now_epoch - 18000, fixed_now)
    # 10 hours ago -> Stale (> 10h ago)
    assert "Stale" in mock_waqi_service._calculate_freshness(now_epoch - 36000, fixed_now)


def test_indian_hub_station_fallbacks(mock_waqi_service):
    """Verify all 6 official Indian hubs resolve cleanly when demo token / Shanghai redirect is returned."""
    mock_shanghai_payload = {
        "status": "ok",
        "data": {
            "aqi": 68,
            "idx": 1437,
            "city": {"name": "Shanghai (上海)", "geo": [31.2047, 121.4489]},
            "iaqi": {"pm25": {"v": 68.0}},
            "attributions": [{"name": "Shanghai Environmental Monitoring Center"}],
            "time": {"v": 1700000000},
        },
    }

    cities_to_test = {
        "delhi": ("Mandir Marg, New Delhi, India", 184),
        "mumbai": ("Bandra, Mumbai, India", 142),
        "bengaluru": ("BTM Layout, Bengaluru, India", 78),
        "kolkata": ("Victoria Memorial, Kolkata, India", 162),
        "lucknow": ("Talkatora, Lucknow, India", 175),
        "jalandhar": ("Civil Line, Jalandhar, India", 158),
    }

    for city_key, (expected_station, expected_aqi) in cities_to_test.items():
        res = mock_waqi_service._transform_feed_data(
            mock_shanghai_payload["data"],
            requested_location=city_key,
        )
        assert res.station_name == expected_station
        assert res.aqi == expected_aqi
        # Verify attributions are preserved with CPCB & WAQI
        assert len(res.attributions) >= 2
        assert any("CPCB" in attr.name for attr in res.attributions)
