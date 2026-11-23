"""Deterministic exposure risk calculation engine for VayuSense."""

from typing import List, Optional, Tuple

from app.models.aqi import AQIResponse
from app.models.profile import (
    CommuteMode,
    ExerciseIntensity,
    ExerciseTimeOfDay,
    HouseholdProfile,
    VentilationCondition,
)
from app.models.recommendations import (
    RiskAssessmentResult,
    RiskComponentBreakdown,
)


class RiskEngine:
    """Calculates an explainable 0-100 VayuSense Exposure Risk score using deterministic logic.

    The score models personalized environmental risk by evaluating:
    1. Ambient air quality (Provider AQI)
    2. Physiological and demographic vulnerability multipliers
    3. Daily outdoor exposure duration
    4. Activity exertion and diurnal timing (e.g. morning inversion, rush hours)
    5. Indoor environmental modulation (cooking exhaust, air purifiers, ventilation)
    6. AQI data freshness and confidence penalties
    """

    @classmethod
    def calculate_risk(
        cls,
        profile: HouseholdProfile,
        aqi_data: Optional[AQIResponse],
    ) -> RiskAssessmentResult:
        """Execute deterministic exposure risk calculation."""
        explanations: List[str] = []

        # ----------------------------------------------------------------------
        # 1. Base AQI Component (0 to 60 points)
        # ----------------------------------------------------------------------
        aqi_val = aqi_data.aqi if (aqi_data and aqi_data.aqi is not None) else None
        base_aqi_score, aqi_exp = cls._calculate_base_aqi(aqi_val)
        explanations.append(aqi_exp)

        # ----------------------------------------------------------------------
        # 2. Household Vulnerability Multiplier (1.0 to 1.8)
        # ----------------------------------------------------------------------
        vuln_multiplier, vuln_exp = cls._calculate_vulnerability_multiplier(profile)
        explanations.extend(vuln_exp)

        # ----------------------------------------------------------------------
        # 3. Exposure Duration Score (0 to 20 points)
        # ----------------------------------------------------------------------
        duration_score, duration_exp = cls._calculate_duration_score(profile)
        explanations.extend(duration_exp)

        # ----------------------------------------------------------------------
        # 4. Activity Exertion and Timing Score (0 to 15 points)
        # ----------------------------------------------------------------------
        timing_score, timing_exp = cls._calculate_activity_timing_score(profile, aqi_val)
        explanations.extend(timing_exp)

        # ----------------------------------------------------------------------
        # 5. Indoor Environment Score (-15 to +15 points)
        # ----------------------------------------------------------------------
        indoor_score, indoor_exp = cls._calculate_indoor_environment_score(profile, aqi_val)
        explanations.extend(indoor_exp)

        # ----------------------------------------------------------------------
        # 6. Data Freshness and Confidence
        # ----------------------------------------------------------------------
        freshness_indicator, confidence_score, freshness_penalty, is_stale_or_missing, fresh_exp = (
            cls._evaluate_data_freshness(aqi_data)
        )
        explanations.append(fresh_exp)

        # ----------------------------------------------------------------------
        # Final Score Aggregation: Clamp to [0, 100]
        # ----------------------------------------------------------------------
        # Base AQI component scaled by demographic vulnerability, then modulated by duration, timing, and indoor factors
        raw_score = (base_aqi_score * vuln_multiplier) + duration_score + timing_score + indoor_score + freshness_penalty
        final_score = max(0.0, min(100.0, round(raw_score, 1)))

        risk_level = cls._determine_risk_level(final_score, is_stale_or_missing)

        breakdown = RiskComponentBreakdown(
            base_aqi_component=round(base_aqi_score, 1),
            vulnerability_factor=round(vuln_multiplier, 2),
            exposure_duration_score=round(duration_score, 1),
            activity_timing_score=round(timing_score, 1),
            indoor_environment_score=round(indoor_score, 1),
            freshness_penalty=round(freshness_penalty, 1),
            explanations=explanations,
        )

        summary = cls._generate_summary(final_score, risk_level, profile, freshness_indicator, is_stale_or_missing)

        return RiskAssessmentResult(
            exposure_risk_score=final_score,
            risk_level=risk_level,
            confidence_score=round(confidence_score, 2),
            freshness_indicator=freshness_indicator,
            is_stale_or_missing=is_stale_or_missing,
            breakdown=breakdown,
            summary=summary,
        )

    @staticmethod
    def _calculate_base_aqi(aqi: Optional[int]) -> Tuple[float, str]:
        """Convert ambient AQI reading into a bounded base score (0 to 60)."""
        if aqi is None:
            return 15.0, "Ambient AQI data is missing; baseline defaulted to 15.0 with low data confidence."

        if aqi <= 50:
            score = (aqi / 50.0) * 10.0
            return score, f"Ambient AQI ({aqi}) is Good; base contribution: {score:.1f}/60."
        elif aqi <= 100:
            score = 10.0 + ((aqi - 50.0) / 50.0) * 10.0
            return score, f"Ambient AQI ({aqi}) is Moderate; base contribution: {score:.1f}/60."
        elif aqi <= 150:
            score = 20.0 + ((aqi - 100.0) / 50.0) * 12.0
            return score, f"Ambient AQI ({aqi}) is Unhealthy for Sensitive Groups; base contribution: {score:.1f}/60."
        elif aqi <= 200:
            score = 32.0 + ((aqi - 150.0) / 50.0) * 12.0
            return score, f"Ambient AQI ({aqi}) is Unhealthy; base contribution: {score:.1f}/60."
        elif aqi <= 300:
            score = 44.0 + ((aqi - 200.0) / 100.0) * 10.0
            return score, f"Ambient AQI ({aqi}) is Very Unhealthy; base contribution: {score:.1f}/60."
        else:
            # Hazardous bracket
            extra = min(6.0, ((aqi - 300.0) / 200.0) * 6.0)
            score = 54.0 + extra
            return score, f"Ambient AQI ({aqi}) is Hazardous; base contribution: {score:.1f}/60."

    @staticmethod
    def _calculate_vulnerability_multiplier(profile: HouseholdProfile) -> Tuple[float, List[str]]:
        """Compute demographic and physiological vulnerability multiplier (1.0 to 1.8)."""
        multiplier = 1.0
        explanations: List[str] = []

        # Children vulnerability
        young_children = sum(1 for age in profile.children_ages if age < 6)
        older_children = sum(1 for age in profile.children_ages if 6 <= age < 18)

        if young_children > 0:
            multiplier += 0.20
            explanations.append(
                f"Household has {young_children} young child(ren) (<6 yrs): +0.20 vulnerability multiplier "
                "(developing lung capacity, higher ventilation rate per unit body weight)."
            )
        elif older_children > 0:
            multiplier += 0.10
            explanations.append(
                f"Household has {older_children} child(ren) (6-17 yrs): +0.10 vulnerability multiplier."
            )

        # Senior vulnerability
        if profile.num_older_adults > 0:
            multiplier += 0.20
            explanations.append(
                f"Household includes {profile.num_older_adults} senior adult(s) (60+ yrs): +0.20 vulnerability multiplier "
                "(reduced physiological reserve and higher cardiopulmonary sensitivity)."
            )

        # User-reported respiratory conditions (NOT a medical diagnosis)
        if profile.has_asthma_or_respiratory_vulnerability:
            multiplier += 0.25
            explanations.append(
                "User-reported asthma or chronic respiratory vulnerability present: +0.25 multiplier "
                "(hyper-reactive airways to fine particulates; informational, not a diagnosis)."
            )
        elif profile.has_respiratory_sensitivity:
            multiplier += 0.15
            explanations.append(
                "User-reported general respiratory allergy/dust sensitivity: +0.15 multiplier."
            )

        if profile.has_limited_mobility:
            multiplier += 0.05
            explanations.append("Limited mobility in household increases vulnerability to prolonged indoor trapping: +0.05.")

        capped_multiplier = min(1.80, multiplier)
        if capped_multiplier != multiplier:
            explanations.append(f"Vulnerability multiplier capped at maximum 1.80 (calculated {multiplier:.2f}).")

        return capped_multiplier, explanations

    @staticmethod
    def _calculate_duration_score(profile: HouseholdProfile) -> Tuple[float, List[str]]:
        """Calculate score contribution from daily outdoor exposure duration (0 to 20)."""
        score = 0.0
        explanations: List[str] = []

        # Outdoor workers
        if profile.num_outdoor_workers > 0:
            worker_points = min(12.0, profile.num_outdoor_workers * 4.0)
            score += worker_points
            explanations.append(
                f"{profile.num_outdoor_workers} outdoor worker(s) in household: +{worker_points:.1f} pts "
                "(prolonged continuous ambient particulate exposure during working hours)."
            )

        # Daily commuters
        commute = profile.commute_habits
        if commute.is_daily_commuter and commute.estimated_daily_commute_minutes > 0:
            mode_weight = {
                CommuteMode.TWO_WHEELER: 1.0,
                CommuteMode.WALKING_CYCLING: 1.0,
                CommuteMode.OPEN_AUTO: 0.85,
                CommuteMode.BUS_NON_AC: 0.70,
                CommuteMode.CAR_AC: 0.30,
                CommuteMode.METRO_AC: 0.25,
            }.get(commute.primary_mode, 0.70)

            hours = commute.estimated_daily_commute_minutes / 60.0
            commute_pts = min(8.0, hours * 3.5 * mode_weight)
            score += commute_pts
            explanations.append(
                f"Daily commute ({commute.estimated_daily_commute_minutes} min, mode: {commute.primary_mode.value}): "
                f"+{commute_pts:.1f} pts (in-traffic proximity to vehicular exhaust plumes)."
            )

        # Outdoor exercise duration
        exercise = profile.exercise_habits
        if exercise.participates_in_outdoor_exercise and exercise.duration_minutes > 0:
            ex_pts = min(5.0, (exercise.duration_minutes / 60.0) * 3.0)
            score += ex_pts
            explanations.append(
                f"Outdoor exercise ({exercise.duration_minutes} min): +{ex_pts:.1f} pts."
            )

        # Children outdoor play
        if profile.has_outdoor_child_play:
            score += 3.0
            explanations.append("Regular outdoor child play scheduled: +3.0 pts.")

        bounded_score = min(20.0, score)
        return bounded_score, explanations

    @staticmethod
    def _calculate_activity_timing_score(profile: HouseholdProfile, aqi: Optional[int]) -> Tuple[float, List[str]]:
        """Score based on activity timing alignment with diurnal smog cycles (0 to 15)."""
        score = 0.0
        explanations: List[str] = []

        is_elevated_aqi = (aqi is not None and aqi > 100) or aqi is None

        # Morning exercise during temperature inversion hours (05:00 - 08:30)
        exercise = profile.exercise_habits
        if exercise.participates_in_outdoor_exercise and is_elevated_aqi:
            if exercise.time_of_day in (ExerciseTimeOfDay.EARLY_MORNING, ExerciseTimeOfDay.MORNING):
                intensity_bonus = {
                    ExerciseIntensity.VIGOROUS: 6.0,
                    ExerciseIntensity.MODERATE: 4.5,
                    ExerciseIntensity.LIGHT: 3.0,
                }.get(exercise.intensity, 3.5)
                score += intensity_bonus
                explanations.append(
                    f"Morning outdoor exercise during boundary layer inversion ({exercise.time_of_day.value}): "
                    f"+{intensity_bonus:.1f} pts (elevated minute ventilation inhaling ground-trapped pollutants)."
                )

        # Child play during late afternoon / early evening smog build-up
        if profile.has_outdoor_child_play and is_elevated_aqi:
            score += 3.5
            explanations.append(
                "Outdoor child play scheduled during afternoon/evening traffic build-up: +3.5 pts."
            )

        # Commute timing during peak rush hours
        commute = profile.commute_habits
        if commute.is_daily_commuter and commute.commute_windows:
            score += 3.0
            explanations.append(
                "Commuting scheduled during peak rush hours (traffic congestion multiplies localized PM2.5/NO2): +3.0 pts."
            )

        bounded_score = min(15.0, score)
        return bounded_score, explanations

    @staticmethod
    def _calculate_indoor_environment_score(profile: HouseholdProfile, aqi: Optional[int]) -> Tuple[float, List[str]]:
        """Evaluate indoor modifiers (-15 to +15). Purifiers reduce risk; open windows/incense increase it."""
        score = 0.0
        explanations: List[str] = []

        # Ventilation condition
        if profile.ventilation == VentilationCondition.NATURALLY_VENTILATED:
            if aqi is not None and aqi > 150:
                score += 5.0
                explanations.append("Natural ventilation with open windows during poor ambient AQI: +5.0 pts (outdoor infiltration).")
        elif profile.ventilation == VentilationCondition.POORLY_VENTILATED:
            score += 4.0
            explanations.append("Poor indoor air exchange traps indoor-generated particulate matter: +4.0 pts.")
        elif profile.ventilation == VentilationCondition.SEALED_AC:
            score -= 3.0
            explanations.append("Sealed AC environment provides physical barrier against outdoor particulate infiltration: -3.0 pts.")

        # Cooking exhaust
        cooking = profile.cooking_habits
        if not cooking.has_kitchen_exhaust_or_chimney:
            score += 4.5
            explanations.append(
                "Lack of kitchen exhaust or chimney: +4.5 pts (cooking oils and high-temperature tadka release concentrated PM2.5)."
            )

        # Indoor combustion (Agarbatti, dhoop, mosquito coils)
        if cooking.uses_indoor_incense_or_coils:
            score += 5.5
            explanations.append(
                "Indoor use of incense (agarbatti), dhoop, or mosquito coils: +5.5 pts "
                "(smoldering combustion creates intense indoor PM2.5, benzene, and carbon monoxide)."
            )

        # Air Purifier mitigation
        purifier = profile.purifier_setup
        if purifier.has_air_purifier and purifier.purifier_count > 0:
            purifier_mitigation = -4.0
            if purifier.located_in_bedrooms:
                purifier_mitigation -= 3.0
            if purifier.operates_continuously:
                purifier_mitigation -= 3.0
            score += purifier_mitigation
            explanations.append(
                f"Air purifier active ({purifier.purifier_count} unit(s), bedroom={purifier.located_in_bedrooms}, "
                f"continuous={purifier.operates_continuously}): {purifier_mitigation:.1f} pts protective mitigation."
            )

        bounded_score = max(-15.0, min(15.0, score))
        return bounded_score, explanations

    @staticmethod
    def _evaluate_data_freshness(aqi_data: Optional[AQIResponse]) -> Tuple[str, float, float, bool, str]:
        """Assess data freshness, confidence grade, and uncertainty penalty."""
        if aqi_data is None or aqi_data.aqi is None:
            return "Missing", 0.15, 10.0, True, "AQI measurement is missing; +10.0 uncertainty penalty applied."

        raw_freshness = (aqi_data.data_freshness or "").lower()
        if "live" in raw_freshness:
            return "Live", 0.95, 0.0, False, "AQI measurement is Live (<1h old); maximum confidence (0.95)."
        elif "fresh" in raw_freshness:
            return "Fresh", 0.85, 0.0, False, "AQI measurement is Fresh (1-3h old); high confidence (0.85)."
        elif "moderate" in raw_freshness:
            return "Moderate", 0.65, 3.0, False, "AQI measurement is Moderate (3-6h old); +3.0 uncertainty penalty."
        else:
            return "Stale", 0.40, 6.0, True, "AQI measurement is Stale (>6h old); +6.0 uncertainty penalty applied."

    @staticmethod
    def _determine_risk_level(score: float, is_stale_or_missing: bool) -> str:
        """Map 0-100 score to categorical risk level."""
        if score <= 20.0:
            return "Low"
        elif score <= 40.0:
            return "Moderate"
        elif score <= 60.0:
            return "Elevated"
        elif score <= 80.0:
            return "High"
        else:
            return "Severe"

    @staticmethod
    def _generate_summary(
        score: float,
        level: str,
        profile: HouseholdProfile,
        freshness: str,
        is_stale: bool,
    ) -> str:
        """Construct plain-language deterministic summary statement."""
        parts = [
            f"VayuSense Exposure Risk is {level} ({score:.1f}/100) based on household demographic sensitivity, "
            "scheduled outdoor exposure, and environmental factors."
        ]
        if profile.has_asthma_or_respiratory_vulnerability or profile.has_respiratory_sensitivity:
            parts.append("Elevated sensitivity noted for respiratory conditions.")
        if profile.has_young_children:
            parts.append("Young children in household require protective mitigation.")
        if is_stale:
            parts.append(f"Caution: Ambient AQI data is {freshness.lower()}; monitor for live updates.")
        return " ".join(parts)
