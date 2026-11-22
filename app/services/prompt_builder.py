"""Prompt engineering and compact context builder for Gemini personalized reasoning."""

import json
from typing import Any, Dict, List, Optional

from app.models.aqi import AQIResponse
from app.models.profile import HouseholdProfile
from app.models.recommendations import RiskAssessmentResult, RuleRecommendation

SYSTEM_PROMPT = """You are VayuSense, a personalized urban air quality assistant for Indian cities.
Your mission is to provide deeply contextualized, personalized daily routines, indoor air actions, sustainable swaps, and activity alerts grounded in real environmental measurements and deterministic risk assessments.

### STRICT OPERATIONAL CONSTRAINTS:
1. TRUTHFULNESS & GROUNDING:
   - Never fabricate or invent AQI values, PM2.5, PM10, pollutant concentrations, weather parameters, station names, timestamps, or sources.
   - Base all reasoning exclusively on the supplied verified measurements, deterministic risk assessment, household profile, and rule recommendations.
   - If AQI data is flagged as missing or stale, explicitly acknowledge this limitation and provide conservative, baseline protective guidance.

2. RISK SCORE INTEGRITY:
   - NEVER alter, recalculate, or override the official deterministic Exposure Risk score or risk tier. The score provided in the prompt is the final authoritative index.

3. MEDICAL ETHICS BOUNDARY:
   - DO NOT provide clinical medical diagnoses, prescription recommendations, or alter prescribed medications.
   - Use non-diagnostic phrasing such as "members with user-reported respiratory sensitivity" rather than asserting clinical pathology.

4. NO UNVERIFIED PERCENTAGE CLAIMS:
   - Never promise quantified exposure reduction numbers without verified evidence (e.g., do NOT say "reduces PM2.5 inhalation by 88%").
   - Instead, explain the physical and physiological mechanisms qualitatively (e.g., "bypasses peak roadside exhaust plumes", "prevents resuspension of settled coarse dust", "maintains a lower particulate baseline in the sleeping zone").

5. PREVENT REPETITIVE OR GENERIC ADVICE:
   - Connect every action directly to the specific schedule, commute mode, kitchen setup, children's ages, and room layout specified in the household context.
   - Every action in the routine and indoor actions must provide the full explainability structure:
     - action: specific concrete action
     - why_now: temporal rationale for this exact time window
     - trigger_condition: exact data point or household attribute triggering this
     - beneficiary: specific family member(s) who benefit
     - expected_mechanism: qualitative protective mechanism
     - tradeoff_or_limitation: honest trade-off or inconvenience (e.g., heat/stuffy room, travel delay, habit change)
     - timing: exact window
     - priority: Critical, High, Medium, or Low

6. OUTPUT FORMAT:
   - Return STRICT JSON conforming to the requested schema. No markdown formatting outside the JSON, no preamble, and no conversational postscript.
"""


class PromptBuilder:
    """Builds token-optimized structured context for the Gemini model."""

    @classmethod
    def build_user_prompt(
        cls,
        profile: HouseholdProfile,
        aqi_data: Optional[AQIResponse],
        risk_result: RiskAssessmentResult,
        rule_recommendations: List[RuleRecommendation],
    ) -> str:
        """Serialize compact structured context into prompt text."""
        # 1. Compact Environmental Context
        env_context: Dict[str, Any] = {
            "status": "available" if (aqi_data and aqi_data.aqi is not None) else "missing",
            "aqi": aqi_data.aqi if aqi_data else None,
            "category": aqi_data.classification.category if (aqi_data and aqi_data.classification) else "Unknown",
            "scale": "WAQI / US EPA Standard (not CPCB NAQI)",
            "dominant_pollutant": aqi_data.dominant_pollutant if aqi_data else None,
            "station": aqi_data.station_name if aqi_data else "Unknown",
            "measurement_time": aqi_data.measurement_time if aqi_data else None,
            "freshness": risk_result.freshness_indicator,
            "confidence": risk_result.confidence_score,
            "is_stale_or_missing": risk_result.is_stale_or_missing,
        }

        # Include pollutant readings only if actually reported
        if aqi_data and aqi_data.pollutants:
            pollutants_present: Dict[str, float] = {}
            for pol in ("pm25", "pm10", "no2", "so2", "co", "o3"):
                detail = getattr(aqi_data.pollutants, pol, None)
                if detail and detail.value is not None:
                    pollutants_present[pol] = detail.value
            if pollutants_present:
                env_context["reported_pollutants"] = pollutants_present

        # 2. Compact Deterministic Risk Context
        risk_context: Dict[str, Any] = {
            "official_exposure_risk_score": risk_result.exposure_risk_score,
            "official_risk_level": risk_result.risk_level,
            "components": {
                "base_aqi_component": risk_result.breakdown.base_aqi_component,
                "vulnerability_factor": risk_result.breakdown.vulnerability_factor,
                "exposure_duration_score": risk_result.breakdown.exposure_duration_score,
                "activity_timing_score": risk_result.breakdown.activity_timing_score,
                "indoor_environment_score": risk_result.breakdown.indoor_environment_score,
                "freshness_penalty": risk_result.breakdown.freshness_penalty,
            },
        }

        # 3. Compact Household Profile Context
        profile_context: Dict[str, Any] = {
            "name": profile.profile_name,
            "demographics": {
                "adults": profile.num_adults,
                "children_ages": profile.children_ages,
                "seniors": profile.num_older_adults,
                "outdoor_workers": profile.num_outdoor_workers,
            },
            "sensitivities": {
                "user_reported_asthma_vulnerability": profile.has_asthma_or_respiratory_vulnerability,
                "user_reported_respiratory_sensitivity": profile.has_respiratory_sensitivity,
                "limited_mobility": profile.has_limited_mobility,
            },
            "schedule_and_habits": {
                "commute": {
                    "is_commuter": profile.commute_habits.is_daily_commuter,
                    "mode": profile.commute_habits.primary_mode.value,
                    "daily_minutes": profile.commute_habits.estimated_daily_commute_minutes,
                    "windows": [
                        f"{w.label}: {w.start_time}-{w.end_time}"
                        for w in profile.commute_habits.commute_windows
                    ],
                },
                "exercise": {
                    "outdoor": profile.exercise_habits.participates_in_outdoor_exercise,
                    "time_of_day": profile.exercise_habits.time_of_day.value,
                    "intensity": profile.exercise_habits.intensity.value,
                    "duration_mins": profile.exercise_habits.duration_minutes,
                },
                "child_play": {
                    "has_play": profile.has_outdoor_child_play,
                    "window": (
                        f"{profile.child_play_window.start_time}-{profile.child_play_window.end_time}"
                        if profile.child_play_window
                        else None
                    ),
                },
                "cooking": {
                    "exhaust_installed": profile.cooking_habits.has_kitchen_exhaust_or_chimney,
                    "incense_or_coils_used": profile.cooking_habits.uses_indoor_incense_or_coils,
                    "cooking_windows": [
                        f"{w.label}: {w.start_time}-{w.end_time}"
                        for w in profile.cooking_habits.cooking_windows
                    ],
                },
            },
            "indoor_conditions": {
                "ventilation": profile.ventilation.value,
                "purifier_available": profile.purifier_setup.has_air_purifier,
                "purifier_count": profile.purifier_setup.purifier_count,
                "purifier_in_bedrooms": profile.purifier_setup.located_in_bedrooms,
                "purifier_continuous": profile.purifier_setup.operates_continuously,
            },
        }

        # 4. Compact Deterministic Rules Context
        rules_context = [
            {
                "rule": r.supporting_data_rule,
                "priority": r.priority.value,
                "action": r.action,
                "target": r.affected_household_member,
            }
            for r in rule_recommendations
        ]

        payload = {
            "environmental_data": env_context,
            "deterministic_risk_assessment": risk_context,
            "household_profile": profile_context,
            "deterministic_rules_triggered": rules_context,
        }

        return (
            "Analyze the following verified environmental and household exposure context, "
            "and generate a fully personalized reasoning plan in strict JSON format:\n\n"
            f"{json.dumps(payload, indent=2)}"
        )
