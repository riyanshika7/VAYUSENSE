"""Deep architectural test suite for VayuSense Deterministic Risk Engine.

Verifies:
1. Strict score bounds [0.0, 100.0] under all extreme edge cases.
2. Monotonicity across every step: risk never decreases as ambient AQI increases.
3. Vulnerability multipliers for complex multi-demographic households.
4. Purifier mitigation scaling and indoor environmental factors.
5. Stale measurement penalties and confidence decay.
6. Preset risk hierarchy integrity across identical ambient conditions.
"""

import pytest
from app.models.aqi import AQIResponse, PollutantMeasurements
from app.models.profile import (
    PRESET_DAILY_COMMUTER,
    PRESET_FAMILY,
    PRESET_SENIOR_SENSITIVE,
    CommuteHabits,
    CommuteMode,
    CookingHabits,
    ExerciseHabits,
    ExerciseIntensity,
    ExerciseTimeOfDay,
    HouseholdProfile,
    PurifierSetup,
    VentilationCondition,
)
from app.services.risk_engine import RiskEngine


def _make_aqi(aqi_val: int | None, freshness: str = "Live (< 1h ago)") -> AQIResponse:
    return AQIResponse(
        station_name="Test Station",
        aqi=aqi_val,
        pollutants=PollutantMeasurements(),
        source="WAQI",
        retrieval_time="2026-11-23T12:00:00Z",
        data_freshness=freshness,
    )


def test_risk_score_strict_boundary_clamping():
    """Verify exposure risk score is strictly bounded in [0.0, 100.0] under extreme conditions."""
    # Extreme high exposure profile
    extreme_high_profile = HouseholdProfile(
        num_adults=5,
        children_ages=[1, 2, 4],
        num_older_adults=3,
        num_outdoor_workers=4,
        has_asthma_or_respiratory_vulnerability=True,
        has_respiratory_sensitivity=True,
        has_limited_mobility=True,
        commute_habits=CommuteHabits(
            is_daily_commuter=True,
            primary_mode=CommuteMode.TWO_WHEELER,
            estimated_daily_commute_minutes=180,
        ),
        exercise_habits=ExerciseHabits(
            participates_in_outdoor_exercise=True,
            time_of_day=ExerciseTimeOfDay.EARLY_MORNING,
            intensity=ExerciseIntensity.VIGOROUS,
            duration_minutes=120,
        ),
        cooking_habits=CookingHabits(
            has_kitchen_exhaust_or_chimney=False,
            uses_indoor_incense_or_coils=True,
        ),
        ventilation=VentilationCondition.POORLY_VENTILATED,
        purifier_setup=PurifierSetup(has_air_purifier=False),
    )

    # Test with extreme hazardous AQI (500 and 999)
    res_500 = RiskEngine.calculate_risk(extreme_high_profile, _make_aqi(500))
    assert 0.0 <= res_500.exposure_risk_score <= 100.0
    assert res_500.risk_level == "Severe"

    res_999 = RiskEngine.calculate_risk(extreme_high_profile, _make_aqi(999))
    assert 0.0 <= res_999.exposure_risk_score <= 100.0
    assert res_999.risk_level == "Severe"

    # Extreme low exposure profile
    extreme_low_profile = HouseholdProfile(
        num_adults=1,
        children_ages=[],
        num_older_adults=0,
        has_asthma_or_respiratory_vulnerability=False,
        has_respiratory_sensitivity=False,
        commute_habits=CommuteHabits(is_daily_commuter=False),
        exercise_habits=ExerciseHabits(participates_in_outdoor_exercise=False),
        cooking_habits=CookingHabits(has_kitchen_exhaust_or_chimney=True, uses_indoor_incense_or_coils=False),
        ventilation=VentilationCondition.SEALED_AC,
        purifier_setup=PurifierSetup(
            has_air_purifier=True,
            purifier_count=4,
            located_in_bedrooms=True,
            operates_continuously=True,
        ),
    )

    res_zero_aqi = RiskEngine.calculate_risk(extreme_low_profile, _make_aqi(0))
    assert 0.0 <= res_zero_aqi.exposure_risk_score <= 100.0
    assert res_zero_aqi.risk_level == "Low"


def test_risk_score_monotonicity_fine_grained_step_scan():
    """Verify that as ambient AQI strictly increases, exposure risk score NEVER decreases."""
    test_profile = PRESET_FAMILY
    scores = []
    aqi_steps = list(range(0, 501, 20))

    for aqi in aqi_steps:
        result = RiskEngine.calculate_risk(test_profile, _make_aqi(aqi))
        scores.append(result.exposure_risk_score)

    # Monotonicity assertion: every step is >= previous step
    for i in range(1, len(scores)):
        assert scores[i] >= scores[i - 1], (
            f"Monotonicity violation at AQI {aqi_steps[i]}: "
            f"Score {scores[i]} is lower than score {scores[i - 1]} at AQI {aqi_steps[i - 1]}"
        )


def test_vulnerability_multiplier_demographic_composition():
    """Verify compounding vulnerability multipliers for infants, seniors, and asthma."""
    base_profile = HouseholdProfile(num_adults=1)
    infant_profile = HouseholdProfile(num_adults=1, children_ages=[2])
    asthma_profile = HouseholdProfile(num_adults=1, has_asthma_or_respiratory_vulnerability=True)
    combined_profile = HouseholdProfile(
        num_adults=1,
        children_ages=[2],
        num_older_adults=1,
        has_asthma_or_respiratory_vulnerability=True,
    )

    aqi_sample = _make_aqi(160)

    score_base = RiskEngine.calculate_risk(base_profile, aqi_sample).breakdown.vulnerability_factor
    score_infant = RiskEngine.calculate_risk(infant_profile, aqi_sample).breakdown.vulnerability_factor
    score_asthma = RiskEngine.calculate_risk(asthma_profile, aqi_sample).breakdown.vulnerability_factor
    score_combined = RiskEngine.calculate_risk(combined_profile, aqi_sample).breakdown.vulnerability_factor

    assert score_infant > score_base
    assert score_asthma > score_base
    assert score_combined >= score_asthma


def test_purifier_mitigation_scaling():
    """Verify that adding HEPA purifiers and bedroom placement monotonically reduces indoor exposure score."""
    base_indoor = HouseholdProfile(
        num_adults=2,
        purifier_setup=PurifierSetup(has_air_purifier=False),
    )
    one_purifier = HouseholdProfile(
        num_adults=2,
        purifier_setup=PurifierSetup(has_air_purifier=True, purifier_count=1, located_in_bedrooms=False),
    )
    bedroom_purifier = HouseholdProfile(
        num_adults=2,
        purifier_setup=PurifierSetup(has_air_purifier=True, purifier_count=1, located_in_bedrooms=True),
    )
    continuous_bedroom_purifier = HouseholdProfile(
        num_adults=2,
        purifier_setup=PurifierSetup(
            has_air_purifier=True, purifier_count=2, located_in_bedrooms=True, operates_continuously=True
        ),
    )

    aqi_sample = _make_aqi(200)

    score_base = RiskEngine.calculate_risk(base_indoor, aqi_sample).exposure_risk_score
    score_one = RiskEngine.calculate_risk(one_purifier, aqi_sample).exposure_risk_score
    score_bedroom = RiskEngine.calculate_risk(bedroom_purifier, aqi_sample).exposure_risk_score
    score_continuous = RiskEngine.calculate_risk(continuous_bedroom_purifier, aqi_sample).exposure_risk_score

    assert score_base > score_one
    assert score_one >= score_bedroom
    assert score_bedroom >= score_continuous


def test_preset_risk_hierarchy_holds_across_all_aqi_tiers():
    """Verify preset risk hierarchy: Senior-Sensitive is highest risk across all AQI tiers."""
    aqi_test_points = [45, 95, 145, 185, 260, 380]

    for aqi in aqi_test_points:
        aqi_sample = _make_aqi(aqi)
        risk_commuter = RiskEngine.calculate_risk(PRESET_DAILY_COMMUTER, aqi_sample).exposure_risk_score
        risk_family = RiskEngine.calculate_risk(PRESET_FAMILY, aqi_sample).exposure_risk_score
        risk_senior = RiskEngine.calculate_risk(PRESET_SENIOR_SENSITIVE, aqi_sample).exposure_risk_score

        # Senior-sensitive (senior + asthma) is always highest risk tier
        assert risk_senior >= risk_commuter, f"Senior failed to exceed commuter at AQI {aqi}"
        assert risk_senior >= risk_family, f"Senior failed to exceed family at AQI {aqi}"

        # At elevated AQI (>= 150), children lung vulnerability in Family exceeds Commuter
        if aqi >= 150:
            assert risk_family >= risk_commuter, f"Family failed to exceed commuter at elevated AQI {aqi}"


def test_missing_aqi_conservative_baseline_behavior():
    """Verify that when ambient AQI is None, the risk engine produces conservative score with confidence penalty."""
    profile = PRESET_DAILY_COMMUTER
    result = RiskEngine.calculate_risk(profile, None)

    assert result.is_stale_or_missing is True
    assert result.confidence_score <= 0.60
    assert result.breakdown.freshness_penalty > 0.0
    assert 20.0 <= result.exposure_risk_score <= 60.0
    assert "missing" in result.summary.lower() or "unreported" in result.summary.lower()


def test_stale_measurement_confidence_decay():
    """Verify confidence score decays and freshness penalty increases with measurement age."""
    profile = PRESET_FAMILY

    fresh_aqi = _make_aqi(150, freshness="Live (< 1h ago)")
    moderate_aqi = _make_aqi(150, freshness="Moderate (~4h ago)")
    stale_aqi = _make_aqi(150, freshness="Stale (> 8h ago)")

    res_fresh = RiskEngine.calculate_risk(profile, fresh_aqi)
    res_mod = RiskEngine.calculate_risk(profile, moderate_aqi)
    res_stale = RiskEngine.calculate_risk(profile, stale_aqi)

    # Confidence must strictly decay
    assert res_fresh.confidence_score > res_mod.confidence_score > res_stale.confidence_score

    # Freshness penalty must increase
    assert res_stale.breakdown.freshness_penalty > res_fresh.breakdown.freshness_penalty
