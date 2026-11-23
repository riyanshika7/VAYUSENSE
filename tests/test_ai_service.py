"""Unit and integration tests for Phase 3: Gemini AI Service, Prompt Builder, and Plan Endpoint."""

import pytest
from httpx import ASGITransport, AsyncClient

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
)
from app.services.ai_service import AIService
from app.services.prompt_builder import PromptBuilder
from app.services.recommendation_rules import RecommendationRulesEngine
from app.services.risk_engine import RiskEngine


@pytest.fixture(autouse=True)
def disable_external_gemini_in_unit_tests(monkeypatch):
    """Ensure unit tests do not attempt real outbound network requests."""
    monkeypatch.setattr(AIService, "_get_genai_client", lambda self: None)


def sample_aqi(aqi: int = 185) -> AQIResponse:
    """Helper creating a sample AQIResponse."""
    return AQIResponse(
        location_name="Delhi",
        station_name="Mandir Marg, Delhi",
        station_id=7024,
        coordinates=GeoCoordinates(latitude=28.635, longitude=77.224),
        aqi=aqi,
        classification=AQIScaleClassification(
            category="Unhealthy",
            color_hex="#FF0000",
            health_implications="Health warnings",
        ),
        dominant_pollutant="pm25",
        pollutants=PollutantMeasurements(
            pm25=PollutantDetail(value=185.0, label="PM2.5"),
            pm10=PollutantDetail(value=140.0, label="PM10"),
            # so2, no2, co intentionally None to verify only available pollutants are in prompt
        ),
        source="WAQI",
        retrieval_time="2026-11-21T01:00:00Z",
        data_freshness="Live (< 1h ago)",
    )


# ==============================================================================
# Prompt Builder Tests
# ==============================================================================

def test_prompt_builder_includes_required_elements_compactly():
    """Verify prompt builder includes verified data, score, schedule, and omits absent pollutants."""
    aqi_data = sample_aqi(185)
    risk_result = RiskEngine.calculate_risk(PRESET_DAILY_COMMUTER, aqi_data)
    rules = RecommendationRulesEngine.generate_recommendations(PRESET_DAILY_COMMUTER, aqi_data)

    user_prompt = PromptBuilder.build_user_prompt(
        profile=PRESET_DAILY_COMMUTER,
        aqi_data=aqi_data,
        risk_result=risk_result,
        rule_recommendations=rules,
    )

    # Required elements
    assert "environmental_data" in user_prompt
    assert "185" in user_prompt
    assert "Mandir Marg, Delhi" in user_prompt
    assert "deterministic_risk_assessment" in user_prompt
    assert str(risk_result.exposure_risk_score) in user_prompt
    assert "household_profile" in user_prompt
    assert "deterministic_rules_triggered" in user_prompt

    # Only available pollutants are reported
    assert "pm25" in user_prompt
    assert "so2" not in user_prompt  # Because so2 was None


def test_prompt_builder_handles_missing_aqi_gracefully():
    """Verify prompt builder marks status missing when no AQI is provided."""
    risk_result = RiskEngine.calculate_risk(PRESET_FAMILY, None)
    rules = RecommendationRulesEngine.generate_recommendations(PRESET_FAMILY, None)

    user_prompt = PromptBuilder.build_user_prompt(
        profile=PRESET_FAMILY,
        aqi_data=None,
        risk_result=risk_result,
        rule_recommendations=rules,
    )

    assert '"status": "missing"' in user_prompt
    assert '"is_stale_or_missing": true' in user_prompt


# ==============================================================================
# Deterministic Fallback Plan Tests
# ==============================================================================

def test_fallback_plan_completeness_and_schema_conformance():
    """Verify deterministic fallback plan populates all 5 categories (A, B, C, D, E) without percentage claims."""
    aqi_data = sample_aqi(175)
    risk_result = RiskEngine.calculate_risk(PRESET_SENIOR_SENSITIVE, aqi_data)
    rules = RecommendationRulesEngine.generate_recommendations(PRESET_SENIOR_SENSITIVE, aqi_data)

    fallback_plan = AIService.build_deterministic_fallback_plan(
        profile=PRESET_SENIOR_SENSITIVE,
        aqi_data=aqi_data,
        risk_result=risk_result,
        rules=rules,
        fallback_reason="Unit test simulation",
    )

    assert isinstance(fallback_plan, AIPersonalizedPlan)
    assert fallback_plan.is_fallback is True
    assert fallback_plan.model_used == "Deterministic-Rules-Fallback"

    # Rule constraint: AI/fallback must never alter the deterministic risk score
    assert fallback_plan.exposure_risk_score == risk_result.exposure_risk_score
    assert fallback_plan.risk_level == risk_result.risk_level

    # Category A: Today's Routine
    assert fallback_plan.today_routine.morning.actions
    assert fallback_plan.today_routine.afternoon.actions
    assert fallback_plan.today_routine.evening.actions
    assert fallback_plan.today_routine.night.actions

    # Category B: Indoor Air Action
    assert fallback_plan.indoor_air_action.cooking
    assert fallback_plan.indoor_air_action.ventilation
    assert fallback_plan.indoor_air_action.dust_and_cleaning
    assert fallback_plan.indoor_air_action.incense_and_combustion
    assert fallback_plan.indoor_air_action.purifier_and_bedrooms

    # Category C: Sustainable Swaps
    assert len(fallback_plan.sustainable_swaps.swaps) >= 2

    # Category D: Explainability in every action
    for seg in (
        fallback_plan.today_routine.morning,
        fallback_plan.today_routine.afternoon,
        fallback_plan.today_routine.evening,
        fallback_plan.today_routine.night,
    ):
        for act in seg.actions:
            assert act.action
            assert act.why_now
            assert act.trigger_condition
            assert act.beneficiary
            assert act.expected_mechanism
            assert act.tradeoff_or_limitation
            assert "%" not in act.expected_mechanism, f"Found unverified percentage: {act.expected_mechanism}"

    # Category E: Personalized Alerts
    assert len(fallback_plan.personalized_alerts) > 0

    # Medical disclaimer
    assert "medical diagnosis" in fallback_plan.medical_disclaimer.lower()


# ==============================================================================
# Endpoint Integration Tests
# ==============================================================================

@pytest.mark.asyncio
async def test_post_ai_plan_endpoint_with_preset_and_fallback():
    """Test POST /api/ai/plan with preset and supplied AQI payload using fallback when key is unconfigured."""
    app = create_app()
    aqi_data = sample_aqi(160)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        req_payload = {
            "preset_name": "daily_commuter",
            "aqi_data": aqi_data.model_dump(),
        }
        response = await client.post("/api/ai/plan", json=req_payload)
        assert response.status_code == 200
        plan = response.json()

        assert plan["profile_name"] == "Daily Commuter Household"
        assert plan["exposure_risk_score"] > 0.0
        assert "today_routine" in plan
        assert "indoor_air_action" in plan
        assert "sustainable_swaps" in plan
        assert "personalized_alerts" in plan
        assert plan["is_fallback"] is True  # Because dummy test env has no real Gemini key


@pytest.mark.asyncio
async def test_post_ai_plan_missing_profile_and_preset():
    """Test POST /api/ai/plan returns 400 when neither profile nor preset is provided."""
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/ai/plan", json={})
        assert response.status_code == 400
        assert "Must provide either 'profile' or a valid 'preset_name'" in response.json()["detail"]


@pytest.mark.asyncio
async def test_post_ai_plan_with_missing_aqi():
    """Test POST /api/ai/plan when AQI data is missing, checking conservative guidance."""
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/ai/plan",
            json={"preset_name": "senior_sensitive"},
        )
        assert response.status_code == 200
        plan = response.json()
        assert "missing" in plan["aqi_data_status"].lower()
        assert plan["today_routine"]["morning"]["actions"]


@pytest.mark.asyncio
async def test_post_parse_profile_endpoint():
    """Test POST /api/ai/parse-profile endpoint validation and response schema."""
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Valid description
        response = await client.post(
            "/api/ai/parse-profile",
            json={"description": "Two working adults commuting by scooter, 5-year-old child, air purifier in bedroom."},
        )
        assert response.status_code == 200
        data = response.json()
        assert "suggested_fields" in data
        assert data["requires_confirmation"] is True
        assert "message" in data

        # 2. Too short description (min_length=10)
        invalid_res = await client.post(
            "/api/ai/parse-profile",
            json={"description": "Short"},
        )
        assert invalid_res.status_code == 422
