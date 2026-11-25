"""Unit tests for Phase 2: Deterministic Exposure Intelligence, Risk Engine, and Rules."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import create_app
from app.models.aqi import AQIResponse, AQIScaleClassification, GeoCoordinates, PollutantMeasurements
from app.models.profile import (
    PRESET_DAILY_COMMUTER,
    PRESET_FAMILY,
    PRESET_SENIOR_SENSITIVE,
    HouseholdProfile,
    PurifierSetup,
)
from app.services.recommendation_rules import RecommendationRulesEngine
from app.services.risk_engine import RiskEngine


def create_sample_aqi_response(aqi: int, freshness: str = "Live (< 1h ago)") -> AQIResponse:
    """Helper to generate a structured sample AQI response."""
    return AQIResponse(
        location_name="Delhi",
        station_name="Mandir Marg, Delhi",
        station_id=7024,
        coordinates=GeoCoordinates(latitude=28.635, longitude=77.224),
        aqi=aqi,
        classification=AQIScaleClassification(
            category="Unhealthy" if aqi > 150 else "Moderate",
            color_hex="#FF0000" if aqi > 150 else "#FFFF00",
            health_implications="Health warnings",
        ),
        dominant_pollutant="pm25",
        pollutants=PollutantMeasurements(),
        source="WAQI",
        retrieval_time="2026-11-20T20:00:00Z",
        data_freshness=freshness,
    )


# ==============================================================================
# Risk Engine Deterministic Tests
# ==============================================================================

def test_risk_score_increases_monotonically_with_aqi():
    """Verify that as AQI increases, the risk score strictly increases or stays equal."""
    profile = PRESET_DAILY_COMMUTER
    aqi_levels = [30, 80, 130, 180, 250, 400]
    scores = []

    for val in aqi_levels:
        res = RiskEngine.calculate_risk(profile, create_sample_aqi_response(val))
        scores.append(res.exposure_risk_score)

    for i in range(len(scores) - 1):
        assert scores[i] <= scores[i + 1], (
            f"Expected score {scores[i]} <= {scores[i+1]} for AQI {aqi_levels[i]} vs {aqi_levels[i+1]}"
        )


def test_vulnerability_multiplier_for_children_and_asthma():
    """Verify young children and asthma increase exposure risk relative to standard adult profile."""
    aqi_resp = create_sample_aqi_response(160)

    # Standard healthy adult
    base_adult = HouseholdProfile(
        num_adults=1,
        children_ages=[],
        num_older_adults=0,
        has_asthma_or_respiratory_vulnerability=False,
    )
    res_adult = RiskEngine.calculate_risk(base_adult, aqi_resp)

    # Household with young child (< 6)
    child_profile = HouseholdProfile(
        num_adults=1,
        children_ages=[4],
        num_older_adults=0,
        has_asthma_or_respiratory_vulnerability=False,
    )
    res_child = RiskEngine.calculate_risk(child_profile, aqi_resp)
    assert res_child.breakdown.vulnerability_factor > res_adult.breakdown.vulnerability_factor
    assert res_child.exposure_risk_score > res_adult.exposure_risk_score

    # Household with user-reported asthma
    asthma_profile = HouseholdProfile(
        num_adults=1,
        children_ages=[],
        num_older_adults=0,
        has_asthma_or_respiratory_vulnerability=True,
    )
    res_asthma = RiskEngine.calculate_risk(asthma_profile, aqi_resp)
    assert res_asthma.breakdown.vulnerability_factor > res_adult.breakdown.vulnerability_factor
    assert res_asthma.exposure_risk_score > res_adult.exposure_risk_score


def test_missing_and_stale_aqi_confidence_penalty():
    """Verify missing or stale data applies appropriate uncertainty penalty and lowered confidence."""
    profile = PRESET_SENIOR_SENSITIVE

    # Live data
    res_live = RiskEngine.calculate_risk(profile, create_sample_aqi_response(160, freshness="Live (< 1h ago)"))
    assert res_live.confidence_score >= 0.85
    assert res_live.is_stale_or_missing is False
    assert res_live.breakdown.freshness_penalty == 0.0

    # Stale data (> 6h ago)
    res_stale = RiskEngine.calculate_risk(profile, create_sample_aqi_response(160, freshness="Stale (> 8h ago)"))
    assert res_stale.confidence_score < 0.60
    assert res_stale.is_stale_or_missing is True
    assert res_stale.breakdown.freshness_penalty > 0.0

    # Completely missing AQI data
    res_missing = RiskEngine.calculate_risk(profile, None)
    assert res_missing.confidence_score <= 0.20
    assert res_missing.is_stale_or_missing is True
    assert res_missing.freshness_indicator == "Missing"


def test_air_purifier_mitigation():
    """Verify functional air purifiers reduce indoor environmental risk score."""
    aqi_resp = create_sample_aqi_response(180)

    # Without purifier
    no_purifier = HouseholdProfile(
        num_adults=1,
        purifier_setup=PurifierSetup(has_air_purifier=False),
    )
    res_no = RiskEngine.calculate_risk(no_purifier, aqi_resp)

    # With bedroom continuous purifier
    with_purifier = HouseholdProfile(
        num_adults=1,
        purifier_setup=PurifierSetup(
            has_air_purifier=True,
            purifier_count=1,
            located_in_bedrooms=True,
            operates_continuously=True,
        ),
    )
    res_with = RiskEngine.calculate_risk(with_purifier, aqi_resp)

    assert res_with.breakdown.indoor_environment_score < res_no.breakdown.indoor_environment_score
    assert res_with.exposure_risk_score < res_no.exposure_risk_score


def test_sample_presets_produce_expected_risk_hierarchy():
    """Check the 3 sample presets under identical elevated ambient AQI (175)."""
    aqi_resp = create_sample_aqi_response(175)

    risk_commuter = RiskEngine.calculate_risk(PRESET_DAILY_COMMUTER, aqi_resp)
    risk_family = RiskEngine.calculate_risk(PRESET_FAMILY, aqi_resp)
    risk_senior = RiskEngine.calculate_risk(PRESET_SENIOR_SENSITIVE, aqi_resp)

    # Senior sensitive has asthma, older adult, morning walk, no purifier, and incense -> highest vulnerability
    assert risk_senior.exposure_risk_score >= risk_family.exposure_risk_score
    assert all(0.0 <= r.exposure_risk_score <= 100.0 for r in [risk_commuter, risk_family, risk_senior])


# ==============================================================================
# Recommendation Rules Engine Tests
# ==============================================================================

def test_all_recommendation_fields_present_and_no_percentage_claims():
    """Ensure every recommendation strictly adheres to schema and avoids unverified percentage claims."""
    aqi_resp = create_sample_aqi_response(195)
    recs = RecommendationRulesEngine.generate_recommendations(PRESET_SENIOR_SENSITIVE, aqi_resp)

    assert len(recs) >= 5, "Expected multiple deterministic recommendations for senior sensitive household"

    for r in recs:
        assert r.action and len(r.action.strip()) > 5
        assert r.timing and len(r.timing.strip()) > 2
        assert r.reason and len(r.reason.strip()) > 10
        assert r.expected_benefit and len(r.expected_benefit.strip()) > 10
        assert r.affected_household_member and len(r.affected_household_member.strip()) > 2
        assert r.priority in ["Critical", "High", "Medium", "Low"]
        assert r.confidence in ["High", "Moderate", "Cautious"]
        assert r.supporting_data_rule.startswith("RULE_")

        # Verify no unverified percentage claims like "reduces PM2.5 by 95%"
        assert "%" not in r.expected_benefit, f"Found unverified percentage claim in: {r.expected_benefit}"


def test_exercise_modulation_triggers_for_exercising_profiles():
    """Verify outdoor exercise rule triggers when exercise habits are present during elevated AQI."""
    aqi_resp = create_sample_aqi_response(155)

    # Non-exercising profile
    recs_commuter = RecommendationRulesEngine.generate_recommendations(PRESET_DAILY_COMMUTER, aqi_resp)
    assert not any("RULE_EXERCISE" in r.supporting_data_rule for r in recs_commuter)

    # Exercising senior profile
    recs_senior = RecommendationRulesEngine.generate_recommendations(PRESET_SENIOR_SENSITIVE, aqi_resp)
    assert any("RULE_EXERCISE" in r.supporting_data_rule for r in recs_senior)


def test_commute_options_triggers_for_daily_commuter():
    """Verify lower-exposure commute recommendation is generated for commuters."""
    aqi_resp = create_sample_aqi_response(170)
    recs = RecommendationRulesEngine.generate_recommendations(PRESET_DAILY_COMMUTER, aqi_resp)
    assert any("RULE_COMMUTE" in r.supporting_data_rule for r in recs)


def test_incense_coils_elimination_rule_triggers():
    """Verify eliminate incense rule triggers especially when uses_indoor_incense_or_coils is True."""
    aqi_resp = create_sample_aqi_response(120)
    recs = RecommendationRulesEngine.generate_recommendations(PRESET_SENIOR_SENSITIVE, aqi_resp)
    assert any("RULE_ELIMINATE_INDOOR_COMBUSTION" in r.supporting_data_rule for r in recs)


def test_purifier_guidance_rule():
    """Verify purifier guidance is given for households with and without purifiers."""
    aqi_resp = create_sample_aqi_response(160)

    # Family has purifier
    recs_family = RecommendationRulesEngine.generate_recommendations(PRESET_FAMILY, aqi_resp)
    assert any("RULE_PURIFIER_OPTIMAL_OPERATION" in r.supporting_data_rule for r in recs_family)

    # Senior profile lacks purifier during elevated AQI -> suggests clean room sanctuary
    recs_senior = RecommendationRulesEngine.generate_recommendations(PRESET_SENIOR_SENSITIVE, aqi_resp)
    assert any("RULE_CREATE_CLEAN_ROOM_SANCTUARY" in r.supporting_data_rule for r in recs_senior)


# ==============================================================================
# Endpoint Integration Tests
# ==============================================================================

@pytest.mark.asyncio
async def test_post_profile_with_preset():
    """Test POST /api/profile loading a sample preset."""
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/profile", json={"preset_name": "family"})
        assert response.status_code == 201
        data = response.json()
        assert data["total_members"] == 3
        assert data["profile"]["num_adults"] == 2
        assert data["profile"]["children_ages"] == [5]
        assert data["has_vulnerable_members"] is True


@pytest.mark.asyncio
async def test_post_profile_invalid_preset():
    """Test POST /api/profile with unknown preset returns 400."""
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/profile", json={"preset_name": "unknown_preset"})
        assert response.status_code == 400
        assert "Invalid preset" in response.json()["detail"]


@pytest.mark.asyncio
async def test_get_presets_list_and_detail():
    """Test GET /api/profile/presets and GET /api/profile/presets/{preset_name}."""
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        list_res = await client.get("/api/profile/presets")
        assert list_res.status_code == 200
        presets = list_res.json()
        assert "daily_commuter" in presets
        assert "family" in presets
        assert "senior_sensitive" in presets

        single_res = await client.get("/api/profile/presets/senior_sensitive")
        assert single_res.status_code == 200
        assert single_res.json()["num_older_adults"] == 1


@pytest.mark.asyncio
async def test_post_recommendations_rules_endpoint():
    """Test POST /api/recommendations/rules with a preset and pre-supplied AQI data."""
    app = create_app()
    sample_aqi = create_sample_aqi_response(180)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        req_payload = {
            "preset_name": "daily_commuter",
            "aqi_data": sample_aqi.model_dump(),
        }
        response = await client.post("/api/recommendations/rules", json=req_payload)
        assert response.status_code == 200
        body = response.json()
        assert body["profile_name"] == "Daily Commuter Household"
        assert "risk_assessment" in body
        assert 0.0 <= body["risk_assessment"]["exposure_risk_score"] <= 100.0
        assert len(body["recommendations"]) > 0
        assert body["engine_version"] == "VayuSense-Deterministic-v1.0"
