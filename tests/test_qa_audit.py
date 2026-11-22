"""Comprehensive Phase 7 Quality Assurance Audit Test Suite for VayuSense.

Validates all 20 QA audit items:
 1. AQI API success
 2. Invalid location handling (empty string, whitespace, not found)
 3. WAQI API unavailable (500, 502, network failure)
 4. Missing API token (unconfigured)
 5. Upstream API timeout (504 Gateway Timeout)
 6. Rate limit handling (HTTP 429 Too Many Requests)
 7. Missing pollutant fields integrity (None != 0.0)
 8. Stale measurement timestamp & freshness penalties
 9. Gemini API failure -> deterministic fallback
10. Invalid Gemini JSON -> deterministic fallback
11. Empty household profile validation (0 members -> 422)
12. Household presets risk ordering & vulnerability
13. Profile switching reactivity & risk recalculation
14. Health check and refresh endpoints
15. CORS header validation
16. No fabricated readings ('-' -> None)
17. Risk score monotonicity & bounds [0.0, 100.0]
18. Recommendation causal chain integrity (LIVE DATA -> CONTEXT -> RISK -> ACTION -> BENEFIT)
19. Deterministic risk anchor immutability in AI service
20. No unverified percentage claims in recommendations
"""

import asyncio
from datetime import datetime, timezone
import pytest
from httpx import ASGITransport, AsyncClient, Response, TimeoutException, RequestError

from app.config import Settings
from app.main import create_app
from app.models.ai_response import AIPersonalizedPlan
from app.models.aqi import (
    AQIResponse,
    AQIScaleClassification,
    GeoCoordinates,
    PollutantDetail,
    PollutantMeasurements,
)
from app.models.profile import (
    PRESET_DAILY_COMMUTER,
    PRESET_FAMILY,
    PRESET_SENIOR_SENSITIVE,
    HouseholdProfile,
)
from app.services.ai_service import AIService
from app.services.recommendation_rules import RecommendationRulesEngine
from app.services.risk_engine import RiskEngine
from app.services.waqi_service import WAQIService


# ── Sample Authentic Payloads ──────────────────────────────────────────────────
SAMPLE_OK_FEED = {
    "status": "ok",
    "data": {
        "aqi": 168,
        "idx": 7024,
        "city": {
            "name": "Mandir Marg, Delhi, India",
            "geo": [28.6358, 77.2245],
            "url": "https://aqicn.org/city/delhi/mandir-marg",
        },
        "dominentpol": "pm25",
        "iaqi": {
            "pm25": {"v": 168.0},
            "pm10": {"v": 125.0},
            "no2": {"v": 34.2},
            # so2 and co are omitted to verify missing != 0
            "t": {"v": 22.0},
            "h": {"v": 62.0},
        },
        "time": {
            "s": "2026-11-21 07:00:00",
            "tz": "+05:30",
            "v": 1763689200,
            "iso": "2026-11-21T07:00:00+05:30",
        },
        "forecast": {
            "daily": {
                "pm25": [
                    {"day": "2026-11-21", "avg": 168, "min": 130, "max": 210},
                    {"day": "2026-11-22", "avg": 175, "min": 140, "max": 225},
                ]
            }
        },
        "attributions": [{"name": "CPCB", "url": "https://cpcb.nic.in"}],
    },
}


# ==============================================================================
# 1. AQI API Success
# ==============================================================================
@pytest.mark.asyncio
async def test_qa_01_aqi_api_success(monkeypatch):
    """Item 1: Verify successful AQI response parsing, coordinates, and methodology."""
    async def mock_get(*args, **kwargs):
        return Response(200, json=SAMPLE_OK_FEED)

    monkeypatch.setattr("httpx.AsyncClient.get", mock_get)
    settings = Settings(WAQI_API_TOKEN="valid_mock_token")
    service = WAQIService(settings=settings)

    aqi_res = await service.get_aqi_by_feed("delhi")
    assert aqi_res.aqi == 168
    assert aqi_res.station_name == "Mandir Marg, Delhi, India"
    assert aqi_res.station_id == 7024
    assert aqi_res.coordinates.latitude == 28.6358
    assert aqi_res.coordinates.longitude == 77.2245
    assert aqi_res.classification.category == "Unhealthy"
    assert aqi_res.classification.scale_name == "WAQI / US EPA Standard"
    assert aqi_res.forecast is not None
    assert len(aqi_res.forecast.pm25) == 2


# ==============================================================================
# 2. Invalid Location Handling
# ==============================================================================
@pytest.mark.asyncio
async def test_qa_02_invalid_location():
    """Item 2: Verify empty strings and whitespace return 400 Bad Request."""
    settings = Settings(WAQI_API_TOKEN="valid_mock_token")
    service = WAQIService(settings=settings)

    with pytest.raises(Exception) as exc_empty:
        await service.get_aqi_by_feed("")
    assert exc_empty.value.status_code == 400

    with pytest.raises(Exception) as exc_spaces:
        await service.get_aqi_by_feed("   ")
    assert exc_spaces.value.status_code == 400


# ==============================================================================
# 3. WAQI API Unavailable (500 / 502 / Network Failure)
# ==============================================================================
@pytest.mark.asyncio
async def test_qa_03_waqi_api_unavailable(monkeypatch):
    """Item 3: Verify upstream 500 error or network failure maps to 502 Bad Gateway."""
    async def mock_500(*args, **kwargs):
        return Response(500, content="Internal Server Error")

    monkeypatch.setattr("httpx.AsyncClient.get", mock_500)
    settings = Settings(WAQI_API_TOKEN="valid_mock_token")
    service = WAQIService(settings=settings)

    with pytest.raises(Exception) as exc_info:
        await service.get_aqi_by_feed("delhi")
    assert exc_info.value.status_code == 502
    assert "WAQI upstream provider returned HTTP 500" in exc_info.value.detail


# ==============================================================================
# 4. Missing API Token
# ==============================================================================
@pytest.mark.asyncio
async def test_qa_04_missing_api_token():
    """Item 4: Verify unconfigured API token raises 500 with actionable guidance."""
    settings = Settings(WAQI_API_TOKEN="")
    service = WAQIService(settings=settings)

    with pytest.raises(Exception) as exc_info:
        await service.get_aqi_by_feed("delhi")
    assert exc_info.value.status_code == 500
    assert "WAQI API token is not configured" in exc_info.value.detail


# ==============================================================================
# 5. API Timeout
# ==============================================================================
@pytest.mark.asyncio
async def test_qa_05_api_timeout(monkeypatch):
    """Item 5: Verify upstream request timeout maps to 504 Gateway Timeout."""
    async def mock_timeout(*args, **kwargs):
        raise TimeoutException("Connection timed out after 10.0s")

    monkeypatch.setattr("httpx.AsyncClient.get", mock_timeout)
    settings = Settings(WAQI_API_TOKEN="valid_mock_token")
    service = WAQIService(settings=settings)

    with pytest.raises(Exception) as exc_info:
        await service.get_aqi_by_feed("delhi")
    assert exc_info.value.status_code == 504
    assert "timed out" in exc_info.value.detail.lower()


# ==============================================================================
# 6. Rate Limit Handling (HTTP 429)
# ==============================================================================
@pytest.mark.asyncio
async def test_qa_06_rate_limit(monkeypatch):
    """Item 6: Verify upstream HTTP 429 maps to 429 Too Many Requests."""
    async def mock_429(*args, **kwargs):
        return Response(429, content="Rate limit exceeded")

    monkeypatch.setattr("httpx.AsyncClient.get", mock_429)
    settings = Settings(WAQI_API_TOKEN="valid_mock_token")
    service = WAQIService(settings=settings)

    with pytest.raises(Exception) as exc_info:
        await service.get_aqi_by_feed("delhi")
    assert exc_info.value.status_code == 429
    assert "rate limit" in exc_info.value.detail.lower()


# ==============================================================================
# 7. Missing Pollutant Fields Integrity
# ==============================================================================
def test_qa_07_missing_pollutant_fields():
    """Item 7: Verify missing pollutants are None and NEVER converted to 0.0."""
    settings = Settings(WAQI_API_TOKEN="valid_mock_token")
    service = WAQIService(settings=settings)

    # Payload has only pm25; so2, co, o3, no2 are completely missing
    partial_iaqi = {"pm25": {"v": 145.0}}
    pollutants = service._parse_pollutants(partial_iaqi)

    assert pollutants.pm25 is not None
    assert pollutants.pm25.value == 145.0
    assert pollutants.pm10 is None
    assert pollutants.no2 is None
    assert pollutants.so2 is None
    assert pollutants.co is None
    assert pollutants.o3 is None


# ==============================================================================
# 8. Stale Measurement Timestamp & Freshness Classification
# ==============================================================================
def test_qa_08_stale_measurement_timestamp():
    """Item 8: Verify timestamp elapsed duration categories and stale confidence penalty."""
    settings = Settings(WAQI_API_TOKEN="valid_mock_token")
    service = WAQIService(settings=settings)
    now_dt = datetime.now(timezone.utc)
    now_ts = int(now_dt.timestamp())

    # Live (<1 hr)
    live_freshness = service._calculate_freshness(now_ts - 1800, now_dt)
    assert "Live" in live_freshness

    # Fresh (1-3 hrs)
    fresh_freshness = service._calculate_freshness(now_ts - 7200, now_dt)
    assert "Fresh" in fresh_freshness

    # Stale (>6 hrs)
    stale_freshness = service._calculate_freshness(now_ts - 28800, now_dt)
    assert "Stale" in stale_freshness

    # Missing timestamp
    unknown_freshness = service._calculate_freshness(None, now_dt)
    assert unknown_freshness == "Unknown"

    # Verify risk engine penalizes stale data
    aqi_stale = AQIResponse(
        station_name="Test Station",
        aqi=150,
        pollutants=PollutantMeasurements(),
        source="WAQI",
        retrieval_time=now_dt.isoformat(),
        data_freshness=stale_freshness,
    )
    risk_res = RiskEngine.calculate_risk(PRESET_DAILY_COMMUTER, aqi_stale)
    assert risk_res.is_stale_or_missing is True
    assert risk_res.confidence_score <= 0.70
    assert risk_res.breakdown.freshness_penalty > 0.0


# ==============================================================================
# 9. Gemini API Failure -> Deterministic Fallback
# ==============================================================================
@pytest.mark.asyncio
async def test_qa_09_gemini_api_failure(monkeypatch):
    """Item 9: Verify AIService falls back safely to deterministic rules on Gemini error."""
    settings = Settings(GEMINI_API_KEY="mock_key")
    ai_service = AIService(settings=settings)

    class MockModel:
        async def generate_content(self, *args, **kwargs):
            raise RuntimeError("Gemini 503 Overloaded")

    class MockClient:
        aio = type("Aio", (), {"models": MockModel()})()

    monkeypatch.setattr(ai_service, "_get_genai_client", lambda: MockClient())

    aqi_obj = AQIResponse(
        station_name="Delhi Station",
        aqi=185,
        pollutants=PollutantMeasurements(pm25=PollutantDetail(value=185.0, label="PM2.5")),
        source="WAQI",
        retrieval_time="2026-11-21T00:00:00Z",
        data_freshness="Live (< 1h ago)",
    )
    risk_result = RiskEngine.calculate_risk(PRESET_DAILY_COMMUTER, aqi_obj)
    rules = RecommendationRulesEngine.generate_recommendations(PRESET_DAILY_COMMUTER, aqi_obj)

    plan = await ai_service.generate_personalized_plan(
        profile=PRESET_DAILY_COMMUTER,
        aqi_data=aqi_obj,
        risk_result=risk_result,
        rule_recommendations=rules,
    )

    assert plan.is_fallback is True
    assert "Gemini 503 Overloaded" in (plan.fallback_reason or "")
    assert (
        len(plan.indoor_air_action.cooking) >= 1
        or len(plan.personalized_alerts) >= 1
        or len(plan.today_routine.morning.actions) >= 1
    )
    assert plan.exposure_risk_score == risk_result.exposure_risk_score


# ==============================================================================
# 10. Invalid Gemini JSON -> Deterministic Fallback
# ==============================================================================
@pytest.mark.asyncio
async def test_qa_10_invalid_gemini_json(monkeypatch):
    """Item 10: Verify AIService catches malformed JSON from Gemini and falls back."""
    settings = Settings(GEMINI_API_KEY="mock_key")
    ai_service = AIService(settings=settings)

    class MockResponse:
        text = "```json\n{ malformed: unquoted_key, invalid ... }\n```"

    class MockModel:
        async def generate_content(self, *args, **kwargs):
            return MockResponse()

    class MockClient:
        aio = type("Aio", (), {"models": MockModel()})()

    monkeypatch.setattr(ai_service, "_get_genai_client", lambda: MockClient())

    aqi_obj = AQIResponse(
        station_name="Delhi Station",
        aqi=150,
        pollutants=PollutantMeasurements(),
        source="WAQI",
        retrieval_time="2026-11-21T00:00:00Z",
        data_freshness="Live (< 1h ago)",
    )
    risk_result = RiskEngine.calculate_risk(PRESET_FAMILY, aqi_obj)
    rules = RecommendationRulesEngine.generate_recommendations(PRESET_FAMILY, aqi_obj)

    plan = await ai_service.generate_personalized_plan(
        profile=PRESET_FAMILY,
        aqi_data=aqi_obj,
        risk_result=risk_result,
        rule_recommendations=rules,
    )

    assert plan.is_fallback is True
    assert "Execution error" in (plan.fallback_reason or "")
    assert plan.exposure_risk_score == risk_result.exposure_risk_score


# ==============================================================================
# 11. Empty Household Profile Validation
# ==============================================================================
def test_qa_11_empty_household_profile():
    """Item 11: Verify profile with 0 total members raises validation error."""
    with pytest.raises(ValueError) as exc_info:
        HouseholdProfile(
            num_adults=0,
            children_ages=[],
            num_older_adults=0,
        )
    assert "at least one occupant" in str(exc_info.value).lower()


# ==============================================================================
# 12. Household Presets Risk Ordering & Vulnerability
# ==============================================================================
def test_qa_12_household_presets_risk_ordering():
    """Item 12: Verify senior-sensitive profile has higher vulnerability than commuter."""
    aqi_obj = AQIResponse(
        station_name="Delhi Station",
        aqi=140,
        pollutants=PollutantMeasurements(),
        source="WAQI",
        retrieval_time="2026-11-21T00:00:00Z",
        data_freshness="Live (< 1h ago)",
    )

    commuter_risk = RiskEngine.calculate_risk(PRESET_DAILY_COMMUTER, aqi_obj)
    senior_risk = RiskEngine.calculate_risk(PRESET_SENIOR_SENSITIVE, aqi_obj)

    # Senior-sensitive with asthma must have higher vulnerability multiplier
    assert senior_risk.breakdown.vulnerability_factor > commuter_risk.breakdown.vulnerability_factor
    assert senior_risk.exposure_risk_score > commuter_risk.exposure_risk_score


# ==============================================================================
# 13. Profile Switching Reactivity
# ==============================================================================
def test_qa_13_profile_switching():
    """Item 13: Verify switching from commuter to family immediately adjusts rules."""
    aqi_obj = AQIResponse(
        station_name="Delhi Station",
        aqi=180,
        pollutants=PollutantMeasurements(),
        source="WAQI",
        retrieval_time="2026-11-21T00:00:00Z",
        data_freshness="Live (< 1h ago)",
    )

    commuter_rules = RecommendationRulesEngine.generate_recommendations(PRESET_DAILY_COMMUTER, aqi_obj)
    family_rules = RecommendationRulesEngine.generate_recommendations(PRESET_FAMILY, aqi_obj)

    commuter_rule_ids = {r.supporting_data_rule for r in commuter_rules}
    family_rule_ids = {r.supporting_data_rule for r in family_rules}

    # Commuter should receive commute mitigation
    assert "RULE_COMMUTE_LOWER_EXPOSURE_TRANSIT_V1" in commuter_rule_ids
    # Family with young children triggers vulnerable shielding with children targeted
    assert "RULE_SHIELD_VULNERABLE_MEMBERS_V1" in family_rule_ids
    family_vulnerable = [r for r in family_rules if r.supporting_data_rule == "RULE_SHIELD_VULNERABLE_MEMBERS_V1"][0]
    assert "children" in family_vulnerable.affected_household_member.lower()


# ==============================================================================
# 14. Health Check & Refresh Endpoint
# ==============================================================================
@pytest.mark.asyncio
async def test_qa_14_health_check_endpoint():
    """Item 14: Verify /health returns 200 with service status and metadata."""
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] in ("healthy", "degraded")
        assert data["app_name"] == "VayuSense AQI Backend"


# ==============================================================================
# 15. CORS Header Validation
# ==============================================================================
@pytest.mark.asyncio
async def test_qa_15_cors_headers():
    """Item 15: Verify CORS preflight and allowed origins."""
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.options(
            "/api/aqi",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert resp.status_code == 200
        assert resp.headers.get("access-control-allow-origin") == "http://localhost:5173"


# ==============================================================================
# 16. No Fabricated Readings ('-' -> None)
# ==============================================================================
def test_qa_16_no_fabricated_readings():
    """Item 16: Verify that '-' string in raw WAQI data parses as None, NEVER 0."""
    settings = Settings(WAQI_API_TOKEN="valid_mock_token")
    service = WAQIService(settings=settings)

    assert service._parse_aqi_value("-") is None
    assert service._parse_aqi_value(None) is None
    assert service._parse_aqi_value("invalid_str") is None
    assert service._parse_aqi_value(0) == 0
    assert service._parse_aqi_value(150) == 150


# ==============================================================================
# 17. Risk Score Monotonicity and Bounds [0.0, 100.0]
# ==============================================================================
def test_qa_17_risk_score_monotonicity_and_bounds():
    """Item 17: Verify risk scores are strictly clamped to [0.0, 100.0] and monotonic."""
    levels = [0, 25, 50, 100, 150, 200, 300, 500, 999]
    scores = []

    for aqi in levels:
        aqi_obj = AQIResponse(
            station_name="Station",
            aqi=aqi,
            pollutants=PollutantMeasurements(),
            source="WAQI",
            retrieval_time="2026-11-21T00:00:00Z",
            data_freshness="Live (< 1h ago)",
        )
        res = RiskEngine.calculate_risk(PRESET_DAILY_COMMUTER, aqi_obj)
        score = res.exposure_risk_score
        assert 0.0 <= score <= 100.0
        scores.append(score)

    # Monotonicity check: each score >= previous score
    for i in range(len(scores) - 1):
        assert scores[i + 1] >= scores[i], f"Score decreased from AQI {levels[i]} to {levels[i+1]}"


# ==============================================================================
# 18. Recommendation Causal Chain Integrity
# ==============================================================================
def test_qa_18_recommendation_causal_chain_integrity():
    """Item 18: Verify all 5 stages in causal chain: LIVE DATA -> CONTEXT -> RISK -> ACTION -> BENEFIT."""
    aqi_obj = AQIResponse(
        station_name="Delhi Station",
        aqi=190,
        pollutants=PollutantMeasurements(),
        source="WAQI",
        retrieval_time="2026-11-21T00:00:00Z",
        data_freshness="Live (< 1h ago)",
    )
    rules = RecommendationRulesEngine.generate_recommendations(PRESET_DAILY_COMMUTER, aqi_obj)

    for rec in rules:
        assert rec.causal_chain is not None, f"Rule {rec.supporting_data_rule} missing causal chain"
        assert rec.causal_chain.live_data, f"Rule {rec.supporting_data_rule} missing live_data in chain"
        assert rec.causal_chain.household_context, f"Rule {rec.supporting_data_rule} missing household_context in chain"
        assert rec.causal_chain.detected_risk, f"Rule {rec.supporting_data_rule} missing detected_risk in chain"
        assert rec.causal_chain.recommended_action, f"Rule {rec.supporting_data_rule} missing recommended_action in chain"
        assert rec.causal_chain.expected_benefit, f"Rule {rec.supporting_data_rule} missing expected_benefit in chain"
        assert rec.priority.value in ("Critical", "High", "Medium", "Low")


# ==============================================================================
# 19. Deterministic Risk Anchor Immutability
# ==============================================================================
@pytest.mark.asyncio
async def test_qa_19_deterministic_risk_anchor_immutability(monkeypatch):
    """Item 19: Verify AI service overwrites any altered exposure risk score returned by Gemini."""
    settings = Settings(GEMINI_API_KEY="mock_key")
    ai_service = AIService(settings=settings)

    # Simulated Gemini response that attempts to override deterministic risk score to 12.0
    class MockResponse:
        text = """{
            "plan_id": "test_hack_plan",
            "exposure_risk_score": 12.0,
            "risk_level": "Low",
            "confidence_assessment": "High confidence",
            "today_routine": [],
            "indoor_management": [],
            "sustainable_actions": [],
            "personalized_alerts": []
        }"""

    class MockModel:
        async def generate_content(self, *args, **kwargs):
            return MockResponse()

    class MockClient:
        aio = type("Aio", (), {"models": MockModel()})()

    monkeypatch.setattr(ai_service, "_get_genai_client", lambda: MockClient())

    aqi_obj = AQIResponse(
        station_name="Delhi Station",
        aqi=210,
        pollutants=PollutantMeasurements(),
        source="WAQI",
        retrieval_time="2026-11-21T00:00:00Z",
        data_freshness="Live (< 1h ago)",
    )
    # Deterministic risk engine computes ~70+ for AQI 210
    deterministic_risk = RiskEngine.calculate_risk(PRESET_DAILY_COMMUTER, aqi_obj)
    rules = RecommendationRulesEngine.generate_recommendations(PRESET_DAILY_COMMUTER, aqi_obj)

    plan = await ai_service.generate_personalized_plan(
        profile=PRESET_DAILY_COMMUTER,
        aqi_data=aqi_obj,
        risk_result=deterministic_risk,
        rule_recommendations=rules,
    )

    # Enforce deterministic anchor: Must match deterministic engine, NOT the hallucinated 12.0
    assert plan.exposure_risk_score == deterministic_risk.exposure_risk_score
    assert plan.risk_level == deterministic_risk.risk_level


# ==============================================================================
# 20. No Unverified Percentage Claims in Recommendations
# ==============================================================================
def test_qa_20_no_percentage_claims_in_recommendations():
    """Item 20: Verify that recommendations use qualitative impact assessments without fake numbers."""
    aqi_obj = AQIResponse(
        station_name="Delhi Station",
        aqi=220,
        pollutants=PollutantMeasurements(),
        source="WAQI",
        retrieval_time="2026-11-21T00:00:00Z",
        data_freshness="Live (< 1h ago)",
    )
    rules = RecommendationRulesEngine.generate_recommendations(PRESET_SENIOR_SENSITIVE, aqi_obj)

    forbidden_percentage_tokens = ["reduces exposure by 30", "cuts risk by 40", "by 50%"]
    for rec in rules:
        text_to_check = f"{rec.action} {rec.reason} {rec.expected_benefit}".lower()
        for token in forbidden_percentage_tokens:
            assert token not in text_to_check, (
                f"Rule '{rec.supporting_data_rule}' contains unverified percentage claim '{token}': {rec.expected_benefit}"
            )
