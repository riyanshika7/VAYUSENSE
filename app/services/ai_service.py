"""Gemini-powered AI recommendation service with deterministic fallback for VayuSense."""

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from pydantic import BaseModel, Field
from google import genai
from google.genai import types
from google.genai.errors import APIError

from app.config import Settings, get_settings
from app.models.ai_response import (
    AIPersonalizedPlan,
    DailyRoutineSegment,
    ExplainableAction,
    IndoorAirActions,
    PersonalizedAlert,
    SustainableSwapItem,
    SustainableSwaps,
    TodayRoutine,
)
from app.models.aqi import AQIResponse
from app.models.profile import CommuteMode, ExerciseTimeOfDay, HouseholdProfile
from app.models.recommendations import RiskAssessmentResult, RuleRecommendation
from app.services.prompt_builder import SYSTEM_PROMPT, PromptBuilder

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Pydantic schema for NL→profile parse result (returned to the endpoint)
# ---------------------------------------------------------------------------
class ParsedProfileFields(BaseModel):
    """Subset of HouseholdProfile fields extracted from a natural-language description.
    Only fields that the AI was confident about are populated; the rest stay None
    so the caller knows not to overwrite existing explicit values.
    """
    profile_name: Optional[str] = None
    num_adults: Optional[int] = None
    children_ages: Optional[List[int]] = None
    num_older_adults: Optional[int] = None
    has_respiratory_sensitivity: Optional[bool] = None
    has_asthma_or_respiratory_vulnerability: Optional[bool] = None
    has_limited_mobility: Optional[bool] = None
    num_outdoor_workers: Optional[int] = None
    # Commute
    is_daily_commuter: Optional[bool] = None
    primary_commute_mode: Optional[str] = None
    commute_minutes: Optional[int] = None
    # Exercise
    participates_in_outdoor_exercise: Optional[bool] = None
    exercise_time_of_day: Optional[str] = None
    exercise_intensity: Optional[str] = None
    exercise_duration_minutes: Optional[int] = None
    # Cooking
    has_kitchen_exhaust: Optional[bool] = None
    uses_indoor_incense_or_coils: Optional[bool] = None
    has_outdoor_child_play: Optional[bool] = None
    # Ventilation
    ventilation_condition: Optional[str] = None
    # Purifier
    has_air_purifier: Optional[bool] = None
    purifier_count: Optional[int] = None
    purifier_in_bedrooms: Optional[bool] = None
    # Confidence and explanation
    extraction_notes: Optional[str] = None
    confidence: float = 0.0


class AIService:
    """Service orchestrating Google Gemini generative reasoning with structured schemas and fallback."""

    def __init__(self, settings: Optional[Settings] = None):
        self.settings = settings or get_settings()
        self._client: Optional[genai.Client] = None

    def _get_genai_client(self) -> Optional[genai.Client]:
        """Lazy initializer for Google GenAI SDK client."""
        if self._client is not None:
            return self._client

        api_key = self.settings.effective_gemini_api_key
        if not api_key:
            return None

        try:
            self._client = genai.Client(api_key=api_key)
            return self._client
        except Exception as exc:
            logger.error("Failed to initialize Google GenAI client: %s", str(exc))
            return None

    async def generate_personalized_plan(
        self,
        profile: HouseholdProfile,
        aqi_data: Optional[AQIResponse],
        risk_result: RiskAssessmentResult,
        rule_recommendations: List[RuleRecommendation],
    ) -> AIPersonalizedPlan:
        """Generate personalized reasoning plan using Gemini, with guaranteed deterministic fallback."""
        client = self._get_genai_client()

        # If Gemini is not configured, immediately use deterministic fallback
        if client is None:
            logger.info("Gemini API key not configured; using deterministic fallback plan.")
            return self.build_deterministic_fallback_plan(
                profile,
                aqi_data,
                risk_result,
                rule_recommendations,
                fallback_reason="Gemini API key is not configured in environment.",
            )

        # Build optimized user context
        user_prompt = PromptBuilder.build_user_prompt(
            profile=profile,
            aqi_data=aqi_data,
            risk_result=risk_result,
            rule_recommendations=rule_recommendations,
        )

        model_name = self.settings.GEMINI_MODEL
        timeout_seconds = self.settings.GEMINI_REQUEST_TIMEOUT

        config = types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            response_mime_type="application/json",
            response_schema=AIPersonalizedPlan,
            temperature=0.2,
        )

        try:
            logger.info("Requesting Gemini reasoning from model: %s (timeout: %.1fs)", model_name, timeout_seconds)
            
            response = await asyncio.wait_for(
                client.aio.models.generate_content(
                    model=model_name,
                    contents=user_prompt,
                    config=config,
                ),
                timeout=timeout_seconds,
            )

            response_text = response.text
            if not response_text or not response_text.strip():
                raise ValueError("Gemini returned empty response text.")

            # Validate structured JSON using Pydantic
            parsed_dict = json.loads(response_text)

            # Enforce deterministic anchors: AI is never permitted to override the deterministic risk score
            parsed_dict["exposure_risk_score"] = risk_result.exposure_risk_score
            parsed_dict["risk_level"] = risk_result.risk_level
            parsed_dict["aqi_data_status"] = (
                f"{risk_result.freshness_indicator} data "
                f"({aqi_data.station_name if aqi_data else 'No station reading'})"
            )
            parsed_dict["model_used"] = model_name
            parsed_dict["is_fallback"] = False
            parsed_dict["fallback_reason"] = None
            if not parsed_dict.get("plan_id"):
                parsed_dict["plan_id"] = f"plan_{uuid.uuid4().hex[:10]}"

            plan = AIPersonalizedPlan.model_validate(parsed_dict)
            logger.info("Successfully generated and validated Gemini plan: %s", plan.plan_id)
            return plan

        except asyncio.TimeoutError:
            logger.warning("Gemini API call timed out after %.1f seconds. Using fallback.", timeout_seconds)
            return self.build_deterministic_fallback_plan(
                profile,
                aqi_data,
                risk_result,
                rule_recommendations,
                fallback_reason=f"Gemini API timed out after {timeout_seconds}s.",
            )
        except APIError as api_err:
            logger.warning("Gemini API error (%s). Using fallback.", str(api_err))
            return self.build_deterministic_fallback_plan(
                profile,
                aqi_data,
                risk_result,
                rule_recommendations,
                fallback_reason=f"Gemini API error: {str(api_err)}",
            )
        except Exception as exc:
            logger.warning("Unexpected error during Gemini execution: %s. Using fallback.", str(exc))
            return self.build_deterministic_fallback_plan(
                profile,
                aqi_data,
                risk_result,
                rule_recommendations,
                fallback_reason=f"Execution error: {str(exc)}",
            )

    async def parse_profile_description(self, description: str) -> "ParsedProfileFields":
        """Parse a natural-language household description into structured profile fields.

        Uses Gemini to extract demographic, health, commute, exercise, cooking, and
        ventilation information from free text. Returns only the fields the AI was
        confident about — the caller must confirm before merging into the active profile.

        Falls back to an empty ParsedProfileFields (confidence=0) if Gemini is
        unavailable or the response is unparseble, so the caller can still present
        the UI without crashing.
        """
        client = self._get_genai_client()

        if client is None:
            logger.info("Gemini not configured; NL profile parse returning empty result.")
            return ParsedProfileFields(
                extraction_notes="Gemini API key not configured. Configure GEMINI_API_KEY to enable this feature.",
                confidence=0.0,
            )

        parse_system_prompt = """You are a household profiling assistant for an air quality application.
Extract ONLY the information explicitly stated in the user's description.
Do NOT infer or guess fields that are not mentioned.
Return a JSON object matching exactly the ParsedProfileFields schema.
Never fabricate demographics. If a field is not mentioned, omit it (return null/None).
Confidence should reflect how much of the schema you were able to populate (0.0 to 1.0).
extraction_notes should briefly list what you extracted and what was ambiguous.

For primary_commute_mode, map to one of: two_wheeler, open_auto, walking, bus_non_ac, metro_ac, car_ac
For exercise_time_of_day: early_morning, morning, afternoon, evening, night, indoor_only, none
For exercise_intensity: light, moderate, vigorous
For ventilation_condition: sealed_ac, partially_open, naturally_ventilated, poorly_ventilated
"""

        try:
            response = await asyncio.wait_for(
                client.aio.models.generate_content(
                    model=self.settings.GEMINI_MODEL,
                    contents=f"Household description:\n\n{description.strip()}",
                    config=types.GenerateContentConfig(
                        system_instruction=parse_system_prompt,
                        response_mime_type="application/json",
                        response_schema=ParsedProfileFields,
                        temperature=0.1,
                    ),
                ),
                timeout=min(self.settings.GEMINI_REQUEST_TIMEOUT, 20.0),
            )

            text = response.text
            if not text or not text.strip():
                raise ValueError("Empty response from Gemini parse.")

            data = json.loads(text)
            result = ParsedProfileFields.model_validate(data)
            logger.info("NL profile parse succeeded: confidence=%.2f", result.confidence)
            return result

        except Exception as exc:
            logger.warning("NL profile parse failed: %s", str(exc))
            return ParsedProfileFields(
                extraction_notes=f"Parse unavailable: {str(exc)[:120]}",
                confidence=0.0,
            )

    @classmethod
    def build_deterministic_fallback_plan(
        cls,
        profile: HouseholdProfile,
        aqi_data: Optional[AQIResponse],
        risk_result: RiskAssessmentResult,
        rules: List[RuleRecommendation],
        fallback_reason: str,
    ) -> AIPersonalizedPlan:
        """Construct a high-quality, fully explainable personalized plan deterministically."""
        plan_id = f"plan_fallback_{uuid.uuid4().hex[:8]}"
        aqi_val = aqi_data.aqi if (aqi_data and aqi_data.aqi is not None) else None
        is_elevated = (aqi_val is None) or (aqi_val > 100)

        # ----------------------------------------------------------------------
        # A. TODAY'S ROUTINE
        # ----------------------------------------------------------------------
        # Morning actions
        morning_actions: List[ExplainableAction] = [
            ExplainableAction(
                action="Keep all exterior windows and balcony doors sealed against ground inversion smog.",
                why_now="Morning ground temperatures trap particulate matter near breathing height between 05:00 and 10:00.",
                trigger_condition="Diurnal smog cycle and ambient AQI status.",
                beneficiary="All household members",
                expected_mechanism="Physical building envelope barrier prevents outdoor aerosol penetration.",
                tradeoff_or_limitation="Indoor air may feel stale; run ceiling fans at low speed for gentle internal circulation.",
                timing="05:00 - 10:00 AM",
                priority="High",
            )
        ]
        if profile.exercise_habits.participates_in_outdoor_exercise:
            morning_actions.append(
                ExplainableAction(
                    action="Shift morning exercise indoors (e.g. yoga, bodyweight, resistance bands) instead of outdoor road walking or jogging.",
                    why_now="High-inhalation exercise during peak morning particulate concentrations deposits pollutants deep into alveolar tissue.",
                    trigger_condition="Outdoor exercise habit active in profile.",
                    beneficiary="Exercising adults / seniors",
                    expected_mechanism="Avoids direct inhalation of concentrated morning inversion particulate plume.",
                    tradeoff_or_limitation="Requires indoor floor space and adjusting workout routine.",
                    timing="06:00 - 08:30 AM",
                    priority="Critical" if profile.has_asthma_or_respiratory_vulnerability else "High",
                )
            )
        if profile.commute_habits.is_daily_commuter:
            morning_actions.append(
                ExplainableAction(
                    action=(
                        "Engage vehicle AC cabin recirculate mode. If commuting by two-wheeler or open auto, "
                        "wear a snug N95/FFP2 respirator."
                    ),
                    why_now="Morning rush hour congestion concentrates diesel soot, volatile organic compounds, and black carbon.",
                    trigger_condition="Daily morning commute scheduled.",
                    beneficiary="Commuting adults",
                    expected_mechanism="Respirator electrostatically filters sub-micron particulates; cabin recirculation blocks vehicle wake exhaust.",
                    tradeoff_or_limitation="Respirator breathing resistance; potential cabin CO2 rise on very long drives.",
                    timing="08:00 - 10:00 AM",
                    priority="High",
                )
            )

        # Afternoon actions
        afternoon_actions: List[ExplainableAction] = [
            ExplainableAction(
                action="Perform brief (15-20 min) cross-ventilation only if outdoor air looks clear and midday solar heating has dispersed smog.",
                why_now="Midday boundary layer mixing creates the most favorable atmospheric conditions of the daylight hours.",
                trigger_condition="Midday ventilation window.",
                beneficiary="All occupants",
                expected_mechanism="Flushes accumulated indoor carbon dioxide and moisture while ambient particulate levels are relatively lower.",
                tradeoff_or_limitation="Must monitor closely and seal shut immediately if outdoor dust or odor increases.",
                timing="12:30 - 02:30 PM",
                priority="Medium",
            ),
            ExplainableAction(
                action="Consolidate all outdoor neighborhood errands, pharmacy trips, and grocery purchases into this single window.",
                why_now="Minimizes cumulative entries and exits, reducing repeated door-opening outdoor air infiltration.",
                trigger_condition="Trip consolidation rule.",
                beneficiary="Adults handling errands",
                expected_mechanism="Reduces total minutes exposed to outdoor ambient air by combining fragmented trips.",
                tradeoff_or_limitation="Requires coordinating multiple tasks into a single planned block.",
                timing="01:00 - 03:00 PM",
                priority="Medium",
            ),
        ]

        # Evening actions
        evening_actions: List[ExplainableAction] = []
        if profile.has_outdoor_child_play:
            evening_actions.append(
                ExplainableAction(
                    action="Organize creative indoor activities (board games, drawing, reading) instead of outdoor park play.",
                    why_now="Evening traffic and dropping temperatures cause particulate concentrations to surge rapidly after 16:30.",
                    trigger_condition="Children outdoor play scheduled in household profile.",
                    beneficiary="Young children",
                    expected_mechanism="Shields developing airways and immature immune systems during diurnal pollution spike.",
                    tradeoff_or_limitation="Children may feel confined indoors; requires active parent engagement.",
                    timing="04:30 - 06:30 PM",
                    priority="High",
                )
            )
        if profile.cooking_habits.cooking_windows:
            evening_actions.append(
                ExplainableAction(
                    action="Power on kitchen exhaust chimney before igniting stove; keep running for 15-20 minutes after cooking completes.",
                    why_now="Dinner preparation (spices, tadka, shallow frying) generates localized PM2.5 bursts that linger indoors.",
                    trigger_condition="Evening cooking window in household profile.",
                    beneficiary="Primary cook and family members in adjacent rooms",
                    expected_mechanism="Forced mechanical exhaust actively evacuates aerosolized oil droplets and combustion products.",
                    tradeoff_or_limitation="Chimney fan motor noise; slight electrical consumption.",
                    timing="07:30 - 09:00 PM",
                    priority="High",
                )
            )

        # Night actions
        night_actions: List[ExplainableAction] = [
            ExplainableAction(
                action="Ensure bedroom windows and internal doors are sealed shut before going to bed.",
                why_now="Nighttime temperature drops compress the boundary layer, sustaining high ambient smog levels until sunrise.",
                trigger_condition="Overnight micro-environment protection.",
                beneficiary="All sleeping occupants",
                expected_mechanism="Maintains an isolated, protected micro-environment during 7 to 8 continuous hours of sleep.",
                tradeoff_or_limitation="Requires managing room temperature with ceiling fan or air conditioner.",
                timing="09:30 PM - 07:00 AM",
                priority="High",
            )
        ]
        if profile.purifier_setup.has_air_purifier:
            night_actions.append(
                ExplainableAction(
                    action="Run the bedroom air purifier on continuous medium speed throughout the night rather than auto mode.",
                    why_now="Auto mode sensors often throttle down prematurely; continuous operation maintains steady clean air delivery.",
                    trigger_condition="Air purifier available in household.",
                    beneficiary="Occupants in primary sleeping quarters",
                    expected_mechanism="Continuous HEPA recirculating filtration maintains low particulate baseline during sleep.",
                    tradeoff_or_limitation="Mild white noise from fan; regular filter replacement needed.",
                    timing="10:00 PM - 07:00 AM",
                    priority="High",
                )
            )

        today_routine = TodayRoutine(
            morning=DailyRoutineSegment(
                time_of_day="Morning",
                summary="Seal against ground-level inversion smog; avoid high-cardio outdoor workouts and protect commuters.",
                actions=morning_actions,
            ),
            afternoon=DailyRoutineSegment(
                time_of_day="Afternoon",
                summary="Take advantage of daytime atmospheric dispersion for brief ventilation and consolidated errands.",
                actions=afternoon_actions,
            ),
            evening=DailyRoutineSegment(
                time_of_day="Evening",
                summary="Manage cooking fumes with dedicated exhaust and shift children's recreation indoors as smog builds.",
                actions=evening_actions,
            ),
            night=DailyRoutineSegment(
                time_of_day="Night",
                summary="Establish an enclosed clean air sanctuary in sleeping bedrooms with continuous filtration.",
                actions=night_actions,
            ),
        )

        # ----------------------------------------------------------------------
        # B. INDOOR AIR ACTION
        # ----------------------------------------------------------------------
        indoor_actions = IndoorAirActions(
            cooking=[
                ExplainableAction(
                    action="Turn on kitchen exhaust at start of cooking; keep kitchen door closed to prevent aerosol migration.",
                    why_now="Culinary heating and oil vaporization produce concentrated aerosol spikes.",
                    trigger_condition="Household cooking routine.",
                    beneficiary="Cook and living area occupants",
                    expected_mechanism="Direct-source capture and exterior exhaust of aerosolized oil and combustion fumes.",
                    tradeoff_or_limitation="Kitchen may feel warmer with door closed.",
                    timing="During all cooking sessions",
                    priority="High",
                )
            ],
            ventilation=[
                ExplainableAction(
                    action="Keep windows sealed during 05:00-10:00 AM and 18:00-22:00 PM; ventilate only midday if conditions allow.",
                    why_now="Diurnal boundary layer dynamics cause smog peaks during cooler morning and evening hours.",
                    trigger_condition="Home ventilation management.",
                    beneficiary="Whole household",
                    expected_mechanism="Prevents ambient particulate influx during diurnal inversion peaks.",
                    tradeoff_or_limitation="Limits natural fresh air exchange.",
                    timing="Strict diurnal schedule",
                    priority="High",
                )
            ],
            dust_and_cleaning=[
                ExplainableAction(
                    action="Damp-mop floors and wipe counters with damp microfiber cloths; avoid dry brooms and feather dusters.",
                    why_now="Daily dust accumulation must be managed without airborne resuspension.",
                    trigger_condition="Daily household cleaning.",
                    beneficiary="All occupants, especially children near floor height",
                    expected_mechanism="Moisture traps settled coarse dust and prevents it from becoming airborne again.",
                    tradeoff_or_limitation="Damp mopping takes slightly more physical effort and drying time.",
                    timing="Morning or early afternoon cleaning",
                    priority="Medium",
                )
            ],
            incense_and_combustion=[
                ExplainableAction(
                    action="Eliminate indoor burning of incense (agarbatti), dhoop, and mosquito coils. Use electrical or mesh alternatives.",
                    why_now="Smoldering materials in enclosed rooms generate intense concentrations of fine particulate and volatile organics.",
                    trigger_condition="Indoor combustion habits.",
                    beneficiary="Whole family, especially vulnerable airways",
                    expected_mechanism="Eliminates a primary internal source of respirable particulate matter.",
                    tradeoff_or_limitation="Requires transitioning spiritual rituals to flameless/electric options.",
                    timing="Immediate and ongoing",
                    priority="Critical" if profile.has_asthma_or_respiratory_vulnerability else "High",
                )
            ],
            purifier_and_bedrooms=[
                ExplainableAction(
                    action=(
                        "Position purifier at least 1.5-2 ft away from walls with intake unobstructed, located in primary bedroom."
                        if profile.purifier_setup.has_air_purifier
                        else "Designate a single bedroom as a clean-air refuge; evaluate a true-HEPA purifier appropriately sized for the space."
                    ),
                    why_now="Restorative sleep requires clean air to allow pulmonary recovery from daily ambient exposure.",
                    trigger_condition="Bedroom clean micro-environment.",
                    beneficiary="Sleeping household members",
                    expected_mechanism="Continuous recirculation through HEPA media reduces sleeping zone particulate concentration.",
                    tradeoff_or_limitation="Purifier placement requires floor space and power outlet proximity.",
                    timing="Evening through morning",
                    priority="High",
                )
            ],
            indoor_activities=[
                ExplainableAction(
                    action="Organize low-dust, low-inhalation indoor leisure (puzzles, reading, indoor games) on elevated pollution days.",
                    why_now="Keeps ventilation rates near baseline resting levels.",
                    trigger_condition="Elevated ambient pollution.",
                    beneficiary="Children and adults",
                    expected_mechanism="Maintains low minute ventilation rate, reducing cumulative particulate intake.",
                    tradeoff_or_limitation="Less vigorous physical movement for energetic children.",
                    timing="Late afternoon / evening",
                    priority="Medium",
                )
            ],
        )

        # ----------------------------------------------------------------------
        # C. SUSTAINABLE SWAPS
        # ----------------------------------------------------------------------
        swaps_list: List[SustainableSwapItem] = []
        if profile.commute_habits.is_daily_commuter:
            if profile.commute_habits.primary_mode in (CommuteMode.TWO_WHEELER, CommuteMode.OPEN_AUTO):
                swaps_list.append(
                    SustainableSwapItem(
                        swap_category="transit",
                        current_habit=f"Daily commute via {profile.commute_habits.primary_mode.value}",
                        recommended_swap="Switch to AC Metro rail or air-conditioned bus on high-smog days; adjust travel times 20-30 min earlier",
                        rationale="Enclosed public transit eliminates direct breathing of roadside diesel exhaust and stop-and-go plumes",
                        feasibility_note="Requires checking nearby metro lines and transit schedules; slight walk to stations",
                    )
                )
            else:
                swaps_list.append(
                    SustainableSwapItem(
                        swap_category="transit",
                        current_habit=f"Car commute ({profile.commute_habits.primary_mode.value})",
                        recommended_swap="Carpool with colleagues or take Metro rail with cabin air recirculate engaged",
                        rationale="Reduces personal contribution to traffic congestion while maintaining enclosed cabin filtration",
                        feasibility_note="Requires aligning departure schedules with carpool partners",
                    )
                )

        swaps_list.append(
            SustainableSwapItem(
                swap_category="trip_chaining",
                current_habit="Multiple brief neighborhood runs throughout the morning and evening",
                recommended_swap="Bundle pharmacy, milk, and grocery stops into a single coordinated midday circuit",
                rationale="Cuts total outdoor transit exposure time and reduces vehicle trip starts which run dirty when engine is cold",
                feasibility_note="Requires a consolidated shopping list and 30-minute planning",
            )
        )

        if profile.exercise_habits.participates_in_outdoor_exercise:
            swaps_list.append(
                SustainableSwapItem(
                    swap_category="exercise",
                    current_habit=f"Outdoor {profile.exercise_habits.time_of_day.value} workout ({profile.exercise_habits.intensity.value})",
                    recommended_swap="Indoor mat workout, resistance bands, or stair climbing inside closed living room",
                    rationale="Preserves cardiovascular fitness while avoiding heavy inhalation of temperature-inversion smog",
                    feasibility_note="Readily accessible at home with zero equipment investment",
                )
            )

        if profile.cooking_habits.uses_indoor_incense_or_coils:
            swaps_list.append(
                SustainableSwapItem(
                    swap_category="low_emission_choice",
                    current_habit="Burning incense sticks (agarbatti) and mosquito coils indoors",
                    recommended_swap="Switch to flameless electric LED lamps / essential oil warmers, and install magnetic window mosquito meshes",
                    rationale="Stops high-particulate indoor combustion completely while maintaining spiritual tradition and mosquito defense",
                    feasibility_note="Window mesh installation is a low-cost, one-time home improvement",
                )
            )

        sustainable_swaps = SustainableSwaps(swaps=swaps_list)

        # ----------------------------------------------------------------------
        # E. PERSONALIZED ALERTS
        # ----------------------------------------------------------------------
        alerts: List[PersonalizedAlert] = []
        if profile.has_asthma_or_respiratory_vulnerability or profile.has_respiratory_sensitivity:
            alerts.append(
                PersonalizedAlert(
                    activity="Respiratory Sensitivity Advisory",
                    alert_level="Warning" if is_elevated else "Advisory",
                    message="Elevated ambient air quality may trigger bronchial hyper-reactivity. Keep prescribed inhalers within immediate reach.",
                    affected_member="Members with user-reported respiratory sensitivity",
                )
            )

        if profile.exercise_habits.participates_in_outdoor_exercise and profile.exercise_habits.time_of_day in (
            ExerciseTimeOfDay.EARLY_MORNING,
            ExerciseTimeOfDay.MORNING,
        ):
            alerts.append(
                PersonalizedAlert(
                    activity="Morning Walk / Jog Alert",
                    alert_level="Warning" if is_elevated else "Caution",
                    message="Early morning boundary inversion concentrates ground pollutants. Shift your workout indoors or postpone to 12:30 PM.",
                    affected_member="Exercising adults / seniors",
                )
            )

        if profile.commute_habits.is_daily_commuter and profile.commute_habits.primary_mode in (
            CommuteMode.TWO_WHEELER,
            CommuteMode.OPEN_AUTO,
        ):
            alerts.append(
                PersonalizedAlert(
                    activity="Open-Air Commute Warning",
                    alert_level="Caution",
                    message="Rush hour roadside exhaust exposure is high. Wear a certified N95 respirator snugly over nose and chin.",
                    affected_member="Daily commuters",
                )
            )

        if profile.has_outdoor_child_play and is_elevated:
            alerts.append(
                PersonalizedAlert(
                    activity="After-School Outdoor Play Advisory",
                    alert_level="Warning",
                    message="Late afternoon smog buildup poses risk for developing lungs. Relocate children's recreation indoors today.",
                    affected_member="Children under 18",
                )
            )

        aqi_status_str = (
            f"{risk_result.freshness_indicator} data "
            f"({aqi_data.station_name if aqi_data else 'No station reading'})"
        )

        return AIPersonalizedPlan(
            plan_id=plan_id,
            profile_name=profile.profile_name or "Household",
            generated_at=datetime.now(timezone.utc).isoformat(),
            model_used="Deterministic-Rules-Fallback",
            is_fallback=True,
            fallback_reason=fallback_reason,
            exposure_risk_score=risk_result.exposure_risk_score,
            risk_level=risk_result.risk_level,
            aqi_data_status=aqi_status_str,
            today_routine=today_routine,
            indoor_air_action=indoor_actions,
            sustainable_swaps=sustainable_swaps,
            personalized_alerts=alerts,
        )
