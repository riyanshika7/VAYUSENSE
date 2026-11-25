"""Deep deterministic testing for VayuSense Recommendation Rules Engine.

Verifies:
1. Missing AQI (aqi_data=None) safe fallback and conservative guidance.
2. Low / Good AQI (AQI <= 50) boundary filtering (no alarmist restrictions).
3. Commute mode exposure stratification (open two-wheeler vs closed metro/car).
4. Indoor combustion mitigation (exhaust fans vs incense/coils elimination).
5. Air purifier operational logic: clean room sanctuary vs optimal bedroom operation.
6. Absolute absence of unverified percentage claims across all rules.
7. Strict priority ordering (Critical -> High -> Medium -> Low).
"""

from app.models.aqi import AQIResponse, AQIScaleClassification, PollutantMeasurements
from app.models.profile import (
    PRESET_DAILY_COMMUTER,
    PRESET_FAMILY,
    PRESET_SENIOR_SENSITIVE,
    CommuteHabits,
    CommuteMode,
    CookingHabits,
    HouseholdProfile,
    PurifierSetup,
)
from app.models.recommendations import RecommendationPriority
from app.services.recommendation_rules import RecommendationRulesEngine


def _make_aqi_response(aqi_val: int | None, category: str = "Moderate") -> AQIResponse:
    return AQIResponse(
        station_name="Mandir Marg, Delhi",
        aqi=aqi_val,
        classification=AQIScaleClassification(
            category=category,
            color_hex="#FFFF00",
            health_implications="Health implications",
        ),
        dominant_pollutant="pm25",
        pollutants=PollutantMeasurements(),
        source="WAQI",
        retrieval_time="2026-11-23T12:00:00Z",
        data_freshness="Live (< 1h ago)",
    )


def test_missing_aqi_data_safe_fallback():
    """Verify that when aqi_data is None, rules engine treats AQI as uncertain/elevated and does not crash."""
    profile = PRESET_SENIOR_SENSITIVE
    recs = RecommendationRulesEngine.generate_recommendations(profile, None)

    assert len(recs) > 0
    # Exercise and shielding should still activate defensively
    rule_ids = [r.supporting_data_rule for r in recs]
    assert any("RULE_EXERCISE" in rid for rid in rule_ids)
    assert any("RULE_SHIELD_VULNERABLE" in rid for rid in rule_ids)
    # Check that causal chain reflects missing/uncertain telemetry
    exercise_rec = next(r for r in recs if "RULE_EXERCISE" in r.supporting_data_rule)
    assert "Uncertain" in exercise_rec.causal_chain.live_data or "Elevated" in exercise_rec.causal_chain.live_data


def test_good_aqi_boundary_filters_unnecessary_restrictions():
    """Verify that when ambient air is Good (AQI <= 50), rules do not impose alarmist activity cancellations."""
    aqi_good = _make_aqi_response(35, category="Good")

    # Family profile has children but air is clean
    recs_family = RecommendationRulesEngine.generate_recommendations(PRESET_FAMILY, aqi_good)
    rule_ids_family = [r.supporting_data_rule for r in recs_family]
    assert "RULE_SHIELD_VULNERABLE_V1" not in rule_ids_family
    assert "RULE_CONSOLIDATE_ERRANDS_V1" not in rule_ids_family

    # Senior profile exercises outdoors; under Good air, exercise rule does not suppress outdoor workout
    recs_senior = RecommendationRulesEngine.generate_recommendations(PRESET_SENIOR_SENSITIVE, aqi_good)
    rule_ids_senior = [r.supporting_data_rule for r in recs_senior]
    assert "RULE_EXERCISE_INVERSION_AVOIDANCE_V1" not in rule_ids_senior


def test_commute_mode_stratification():
    """Verify open commute modes (two-wheeler/walking) get respirator advice, while enclosed get AC recirculation."""
    aqi_elevated = _make_aqi_response(180, category="Unhealthy")

    # Two-wheeler commuter
    open_commuter = HouseholdProfile(
        num_adults=1,
        commute_habits=CommuteHabits(
            is_daily_commuter=True,
            primary_mode=CommuteMode.TWO_WHEELER,
            estimated_daily_commute_minutes=45,
        ),
    )
    recs_open = RecommendationRulesEngine.generate_recommendations(open_commuter, aqi_elevated)
    commute_rec_open = next(r for r in recs_open if "RULE_COMMUTE" in r.supporting_data_rule)
    assert commute_rec_open.priority == RecommendationPriority.HIGH
    assert "N95" in commute_rec_open.action or "respirator" in commute_rec_open.action

    # Metro commuter
    metro_commuter = HouseholdProfile(
        num_adults=1,
        commute_habits=CommuteHabits(
            is_daily_commuter=True,
            primary_mode=CommuteMode.METRO_AC,
            estimated_daily_commute_minutes=45,
        ),
    )
    recs_metro = RecommendationRulesEngine.generate_recommendations(metro_commuter, aqi_elevated)
    commute_rec_metro = next(r for r in recs_metro if "RULE_COMMUTE" in r.supporting_data_rule)
    assert commute_rec_metro.priority == RecommendationPriority.MEDIUM
    assert "recirculate" in commute_rec_metro.action.lower()


def test_indoor_combustion_and_exhaust_rules():
    """Verify exhaust installation guidance and incense elimination activate according to household cooking habits."""
    aqi_elevated = _make_aqi_response(140)

    # Kitchen lacks exhaust and uses incense -> High/Critical priority
    unfavorable_kitchen = HouseholdProfile(
        num_adults=2,
        cooking_habits=CookingHabits(
            has_kitchen_exhaust_or_chimney=False,
            uses_indoor_incense_or_coils=True,
        ),
    )
    recs = RecommendationRulesEngine.generate_recommendations(unfavorable_kitchen, aqi_elevated)
    incense_rec = next(r for r in recs if r.supporting_data_rule == "RULE_ELIMINATE_INDOOR_COMBUSTION_V1")
    exhaust_rec = next(r for r in recs if r.supporting_data_rule == "RULE_COOKING_EXHAUST_POST_RUN_V1")
    assert incense_rec.priority in (RecommendationPriority.HIGH, RecommendationPriority.CRITICAL)
    assert exhaust_rec.priority == RecommendationPriority.HIGH

    # Kitchen has exhaust and does NOT use incense -> Lowered (Medium) priority
    favorable_kitchen = HouseholdProfile(
        num_adults=2,
        cooking_habits=CookingHabits(
            has_kitchen_exhaust_or_chimney=True,
            uses_indoor_incense_or_coils=False,
        ),
    )
    recs_fav = RecommendationRulesEngine.generate_recommendations(favorable_kitchen, aqi_elevated)
    incense_rec_fav = next(r for r in recs_fav if r.supporting_data_rule == "RULE_ELIMINATE_INDOOR_COMBUSTION_V1")
    exhaust_rec_fav = next(r for r in recs_fav if r.supporting_data_rule == "RULE_COOKING_EXHAUST_POST_RUN_V1")
    assert incense_rec_fav.priority == RecommendationPriority.MEDIUM
    assert exhaust_rec_fav.priority == RecommendationPriority.MEDIUM


def test_air_purifier_presence_vs_absence_guidance():
    """Verify that households without purifiers get sanctuary guidance, while owners get continuous runtime guidance."""
    aqi_elevated = _make_aqi_response(190)

    # Without purifier
    no_purifier_profile = HouseholdProfile(
        num_adults=2,
        purifier_setup=PurifierSetup(has_air_purifier=False),
    )
    recs_no = RecommendationRulesEngine.generate_recommendations(no_purifier_profile, aqi_elevated)
    sanctuary_rule = next((r for r in recs_no if "RULE_CREATE_CLEAN_ROOM_SANCTUARY_V1" == r.supporting_data_rule), None)
    assert sanctuary_rule is not None
    assert "clean air room" in sanctuary_rule.action.lower() or "sanctuary" in sanctuary_rule.action.lower()

    # With purifier
    has_purifier_profile = HouseholdProfile(
        num_adults=2,
        purifier_setup=PurifierSetup(
            has_air_purifier=True,
            purifier_count=2,
            located_in_bedrooms=True,
            operates_continuously=True,
        ),
    )
    recs_has = RecommendationRulesEngine.generate_recommendations(has_purifier_profile, aqi_elevated)
    purifier_rule = next((r for r in recs_has if "RULE_PURIFIER_OPTIMAL_OPERATION_V1" == r.supporting_data_rule), None)
    assert purifier_rule is not None
    assert "continuous" in purifier_rule.action.lower() or "bedroom" in purifier_rule.action.lower()


def test_no_unverified_percentage_claims_across_all_presets():
    """Verify that expected_benefit strictly omits unverified % reduction claims across all presets and conditions."""
    for preset in (PRESET_DAILY_COMMUTER, PRESET_FAMILY, PRESET_SENIOR_SENSITIVE):
        for aqi_val in (35, 120, 220, 450, None):
            aqi_resp = _make_aqi_response(aqi_val) if aqi_val is not None else None
            recs = RecommendationRulesEngine.generate_recommendations(preset, aqi_resp)
            for r in recs:
                assert "%" not in r.expected_benefit, (
                    f"Found unverified % claim in {r.supporting_data_rule}: {r.expected_benefit}"
                )


def test_priority_sorting_integrity():
    """Verify that recommendations are strictly sorted by priority (Critical -> High -> Medium -> Low)."""
    priority_order = {
        RecommendationPriority.CRITICAL: 0,
        RecommendationPriority.HIGH: 1,
        RecommendationPriority.MEDIUM: 2,
        RecommendationPriority.LOW: 3,
    }

    recs = RecommendationRulesEngine.generate_recommendations(PRESET_SENIOR_SENSITIVE, _make_aqi_response(280))
    assert len(recs) >= 3

    for i in range(1, len(recs)):
        rank_prev = priority_order[recs[i - 1].priority]
        rank_curr = priority_order[recs[i].priority]
        assert rank_prev <= rank_curr, (
            f"Sorting violation: {recs[i-1].priority} (rank {rank_prev}) appeared after "
            f"{recs[i].priority} (rank {rank_curr})"
        )
