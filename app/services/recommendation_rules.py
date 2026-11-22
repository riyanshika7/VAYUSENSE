"""Deterministic rule-based recommendation engine for VayuSense."""

from typing import List, Optional

from app.models.aqi import AQIResponse
from app.models.profile import (
    CommuteMode,
    ExerciseTimeOfDay,
    HouseholdProfile,
    VentilationCondition,
)
from app.models.recommendations import (
    CausalChain,
    ImpactCategories,
    RecommendationConfidence,
    RecommendationPriority,
    RuleRecommendation,
)


class RecommendationRulesEngine:
    """Evaluates deterministic, evidence-based exposure reduction rules without AI.

    Every recommendation strictly adheres to schema requirements:
    - action
    - timing
    - reason
    - expected_benefit (no unverified percentage claims)
    - affected_household_member
    - priority
    - confidence
    - supporting_data_rule
    """

    @classmethod
    def generate_recommendations(
        cls,
        profile: HouseholdProfile,
        aqi_data: Optional[AQIResponse],
    ) -> List[RuleRecommendation]:
        """Evaluate all 9 deterministic protective rules and return prioritized recommendations."""
        recommendations: List[RuleRecommendation] = []
        aqi_val = aqi_data.aqi if (aqi_data and aqi_data.aqi is not None) else None
        is_elevated_aqi = (aqi_val is None) or (aqi_val > 100)
        is_severe_aqi = (aqi_val is not None and aqi_val > 200)

        # ----------------------------------------------------------------------
        # Rule 1: Outdoor Exercise Modulation
        # ----------------------------------------------------------------------
        rec_exercise = cls._rule_exercise_modulation(profile, aqi_val, is_elevated_aqi, is_severe_aqi)
        if rec_exercise:
            recommendations.append(rec_exercise)

        # ----------------------------------------------------------------------
        # Rule 2: Lower-Exposure Commuting Options
        # ----------------------------------------------------------------------
        rec_commute = cls._rule_commute_options(profile, aqi_val, is_elevated_aqi)
        if rec_commute:
            recommendations.append(rec_commute)

        # ----------------------------------------------------------------------
        # Rule 3: Errand Consolidation
        # ----------------------------------------------------------------------
        rec_errand = cls._rule_combine_errands(profile, is_elevated_aqi)
        if rec_errand:
            recommendations.append(rec_errand)

        # ----------------------------------------------------------------------
        # Rule 4: Shielding Vulnerable Members (Children, Seniors, Respiratory Sensitivity)
        # ----------------------------------------------------------------------
        rec_vulnerable = cls._rule_shield_vulnerable(profile, aqi_val, is_elevated_aqi, is_severe_aqi)
        if rec_vulnerable:
            recommendations.append(rec_vulnerable)

        # ----------------------------------------------------------------------
        # Rule 5: Favorable Ventilation Timing (Inversion Avoidance)
        # ----------------------------------------------------------------------
        rec_ventilation = cls._rule_ventilation_timing(profile, aqi_val, is_elevated_aqi)
        if rec_ventilation:
            recommendations.append(rec_ventilation)

        # ----------------------------------------------------------------------
        # Rule 6: Cooking Exhaust Operation & Post-Cooking Run
        # ----------------------------------------------------------------------
        rec_cooking = cls._rule_cooking_exhaust(profile)
        if rec_cooking:
            recommendations.append(rec_cooking)

        # ----------------------------------------------------------------------
        # Rule 7: Eliminate Indoor Incense, Dhoop, and Mosquito Coils
        # ----------------------------------------------------------------------
        rec_incense = cls._rule_eliminate_incense_coils(profile)
        if rec_incense:
            recommendations.append(rec_incense)

        # ----------------------------------------------------------------------
        # Rule 8: Damp-Dusting Instead of Dry Sweeping
        # ----------------------------------------------------------------------
        rec_dusting = cls._rule_damp_dusting(profile)
        if rec_dusting:
            recommendations.append(rec_dusting)

        # ----------------------------------------------------------------------
        # Rule 9: Air Purifier Placement and Operation Guidance
        # ----------------------------------------------------------------------
        rec_purifier = cls._rule_purifier_guidance(profile, aqi_val, is_elevated_aqi)
        if rec_purifier:
            recommendations.append(rec_purifier)

        # Sort recommendations by priority order: Critical -> High -> Medium -> Low
        priority_order = {
            RecommendationPriority.CRITICAL: 0,
            RecommendationPriority.HIGH: 1,
            RecommendationPriority.MEDIUM: 2,
            RecommendationPriority.LOW: 3,
        }
        recommendations.sort(key=lambda r: priority_order.get(r.priority, 99))

        return recommendations

    @staticmethod
    def _rule_exercise_modulation(
        profile: HouseholdProfile,
        aqi: Optional[int],
        is_elevated: bool,
        is_severe: bool,
    ) -> Optional[RuleRecommendation]:
        exercise = profile.exercise_habits
        if not exercise.participates_in_outdoor_exercise:
            return None

        if not is_elevated and aqi is not None and aqi <= 50:
            return None

        priority = (
            RecommendationPriority.CRITICAL
            if (is_severe or profile.has_asthma_or_respiratory_vulnerability)
            else RecommendationPriority.HIGH
        )

        return RuleRecommendation(
            action=(
                "Reschedule outdoor workout to an indoor session or shift to early afternoon (12:00-15:00) "
                "when thermal convection lifts the surface boundary layer. Reduce high-cardio intensity."
            ),
            timing="During morning inversion (05:00-09:00) and evening hours",
            reason=(
                "Vigorous aerobic exertion increases pulmonary ventilation by multiple times over resting rates, "
                "bypassing nasal filtration and depositing fine particulate matter directly into the lower respiratory tract."
            ),
            expected_benefit=(
                "Substantially reduces inhaled dose of fine particulates (PM2.5) and prevents acute bronchospasm "
                "or exercise-induced respiratory irritation."
            ),
            affected_household_member="Exercising adults and seniors",
            priority=priority,
            confidence=RecommendationConfidence.HIGH,
            supporting_data_rule="RULE_EXERCISE_INVERSION_AVOIDANCE_V1",
            causal_chain=CausalChain(
                live_data=f"Ambient AQI ({aqi if aqi is not None else 'Elevated/Uncertain'}) with ground thermal inversion during morning/evening hours",
                household_context=f"Scheduled outdoor {exercise.time_of_day.value} workout ({exercise.intensity.value}, {exercise.duration_minutes} min)",
                detected_risk="Aerobic exercise multiplies minute ventilation 4–6×, depositing ground-trapped PM2.5 directly into alveolar bronchioles",
                recommended_action="Relocate exercise indoors (yoga, resistance bands, mat) or reschedule to the 12:00–15:00 dispersion window",
                expected_benefit="Averts high-volume particulate inhalation and protects cardiorespiratory function without skipping daily fitness",
            ),
            impact_categories=ImpactCategories(
                personal_exposure="High Reduction",
                household_protection="Vulnerable Members",
                community_emissions="Neutral",
                practicality="Minimal Shift",
                cost="Zero Cost",
            ),
            tradeoff_or_limitation="Requires indoor floor space and modifying vigorous outdoor running/cycling routines.",
        )

    @staticmethod
    def _rule_commute_options(
        profile: HouseholdProfile,
        aqi: Optional[int],
        is_elevated: bool,
    ) -> Optional[RuleRecommendation]:
        commute = profile.commute_habits
        if not commute.is_daily_commuter:
            return None

        is_open_mode = commute.primary_mode in (
            CommuteMode.TWO_WHEELER,
            CommuteMode.OPEN_AUTO,
            CommuteMode.WALKING_CYCLING,
        )

        priority = RecommendationPriority.HIGH if (is_open_mode and is_elevated) else RecommendationPriority.MEDIUM

        action_desc = (
            "Shift to enclosed air-conditioned transit (e.g. Metro rail or bus/car with AC recirculate mode engaged) "
            "where feasible. If using a two-wheeler, wear a well-fitted, certified particulate respirator (N95/FFP2) "
            "and adjust departure by 20-30 minutes to avoid idling in heavy bottleneck traffic."
            if is_open_mode
            else (
                "Ensure vehicle air conditioning is set to cabin recirculate mode to prevent drawing roadside exhaust "
                "directly into the vehicle interior during traffic congestion."
            )
        )

        return RuleRecommendation(
            action=action_desc,
            timing="During morning and evening commute windows",
            reason=(
                "On-road micro-environments contain peak concentrations of diesel exhaust, black carbon, and nitrogen dioxide, "
                "especially in dense bumper-to-bumper traffic corridors."
            ),
            expected_benefit=(
                "Lowers direct exposure to localized vehicular emissions and prevents acute airway inflammation during transit."
            ),
            affected_household_member="Daily commuting adults",
            priority=priority,
            confidence=RecommendationConfidence.HIGH,
            supporting_data_rule="RULE_COMMUTE_LOWER_EXPOSURE_TRANSIT_V1",
            causal_chain=CausalChain(
                live_data=f"Roadside traffic corridors during peak hours under ambient AQI ({aqi if aqi is not None else 'Elevated'})",
                household_context=f"Daily {commute.estimated_daily_commute_minutes} min commute via {commute.primary_mode.value}",
                detected_risk="Bumper-to-bumper proximity exposes commuter directly to diesel exhaust plumes and black carbon soot",
                recommended_action="Switch to AC Metro/bus or engage vehicle cabin recirculate; wear snug N95 respirator if riding two-wheeler",
                expected_benefit="Filters >95% of sub-micron traffic particulates and cuts toxic volatile organic inhalation",
            ),
            impact_categories=ImpactCategories(
                personal_exposure="High Reduction",
                household_protection="Commuting Adults",
                community_emissions="Lowers Traffic Soot" if commute.primary_mode != CommuteMode.METRO_AC else "Zero Combustion",
                practicality="Moderate Coordination",
                cost="Low Cost",
            ),
            tradeoff_or_limitation="Respirator breathing resistance; public transit may involve slight walking or fixed schedules.",
        )

    @staticmethod
    def _rule_combine_errands(
        profile: HouseholdProfile,
        is_elevated: bool,
    ) -> Optional[RuleRecommendation]:
        if not is_elevated:
            return None

        return RuleRecommendation(
            action=(
                "Consolidate multiple separate neighborhood errands, grocery purchases, and market runs into a single "
                "coordinated trip during midday hours."
            ),
            timing="Midday window (12:00-15:00)",
            reason=(
                "Frequent short outdoor trips multiply total cumulative time spent in ambient pollution and increase "
                "door-opening exchange between outdoor smog and indoor clean air."
            ),
            expected_benefit=(
                "Minimizes cumulative ambient exposure duration and limits the introduction of outdoor roadway dust into the home."
            ),
            affected_household_member="Adults managing household errands",
            priority=RecommendationPriority.MEDIUM,
            confidence=RecommendationConfidence.HIGH,
            supporting_data_rule="RULE_CONSOLIDATE_ERRANDS_V1",
            causal_chain=CausalChain(
                live_data="Elevated ambient PM2.5 levels during morning and late evening rush hours",
                household_context="Household managing grocery, pharmacy, and domestic neighborhood errands",
                detected_risk="Multiple short departures multiply door openings (outdoor infiltration) and fragmented street exposure",
                recommended_action="Bundle all outdoor errands into a single planned 30-minute circuit between 12:00 and 15:00",
                expected_benefit="Substantially shortens total minutes of ambient outdoor inhalation and preserves clean indoor baseline",
            ),
            impact_categories=ImpactCategories(
                personal_exposure="Moderate Reduction",
                household_protection="Whole Household",
                community_emissions="Lowers Traffic Soot",
                practicality="Minimal Shift",
                cost="Zero Cost",
            ),
            tradeoff_or_limitation="Requires prior planning and a consolidated shopping list.",
        )

    @staticmethod
    def _rule_shield_vulnerable(
        profile: HouseholdProfile,
        aqi: Optional[int],
        is_elevated: bool,
        is_severe: bool,
    ) -> Optional[RuleRecommendation]:
        has_vulnerable = (
            len(profile.children_ages) > 0
            or profile.num_older_adults > 0
            or profile.has_asthma_or_respiratory_vulnerability
            or profile.has_respiratory_sensitivity
        )
        if not has_vulnerable or not is_elevated:
            return None

        priority = (
            RecommendationPriority.CRITICAL
            if (is_severe or profile.has_asthma_or_respiratory_vulnerability)
            else RecommendationPriority.HIGH
        )

        targets = []
        if profile.children_ages:
            targets.append("children")
        if profile.num_older_adults > 0:
            targets.append("seniors")
        if profile.has_asthma_or_respiratory_vulnerability or profile.has_respiratory_sensitivity:
            targets.append("members with respiratory sensitivity")
        target_str = ", ".join(targets).capitalize()

        return RuleRecommendation(
            action=(
                "Avoid all non-essential outdoor trips for vulnerable individuals. Move children's play indoors, "
                "keep medications readily accessible, and maintain a quiet, low-stress indoor environment."
            ),
            timing="All day during elevated smog episodes",
            reason=(
                "Children have higher respiratory rates and developing lung tissue, while seniors and those with respiratory "
                "vulnerabilities have diminished pulmonary clearance, creating heightened susceptibility to acute exacerbations."
            ),
            expected_benefit=(
                "Protects sensitive airways against bronchospasm, asthma triggers, and acute cardiovascular strain."
            ),
            affected_household_member=target_str,
            priority=priority,
            confidence=RecommendationConfidence.HIGH,
            supporting_data_rule="RULE_SHIELD_VULNERABLE_MEMBERS_V1",
            causal_chain=CausalChain(
                live_data=f"Ambient AQI ({aqi if aqi is not None else 'Unhealthy'}) exceeding safe physiological thresholds",
                household_context=f"Household occupants include vulnerable individuals ({target_str})",
                detected_risk="Diminished pulmonary clearance or immature bronchial tissue causes acute hyper-reactivity upon PM2.5 exposure",
                recommended_action="Shelter vulnerable members indoors, relocate child play inside, and ensure rescue inhalers are readily accessible",
                expected_benefit="Averts acute asthma exacerbations, emergency medical interventions, and cardiovascular stress",
            ),
            impact_categories=ImpactCategories(
                personal_exposure="High Reduction",
                household_protection="Vulnerable Members",
                community_emissions="Neutral",
                practicality="Moderate Coordination",
                cost="Zero Cost",
            ),
            tradeoff_or_limitation="Children and seniors may feel confined indoors; requires providing indoor entertainment.",
        )

    @staticmethod
    def _rule_ventilation_timing(
        profile: HouseholdProfile,
        aqi: Optional[int],
        is_elevated: bool,
    ) -> Optional[RuleRecommendation]:
        if profile.ventilation == VentilationCondition.SEALED_AC and not is_elevated:
            return None

        return RuleRecommendation(
            action=(
                "Keep exterior doors and windows tightly closed during early morning and late evening hours. "
                "If indoor air feels stale, ventilate briefly (15-30 minutes) only during early afternoon hours (12:00-15:00) "
                "if outdoor smog has lifted, using cross-ventilation."
            ),
            timing="Keep closed 05:00-10:00 and 18:00-22:00; selective opening 12:00-15:00 only",
            reason=(
                "Surface temperature inversion during nighttime and early mornings traps particulate matter near the ground; "
                "opening windows during these peak hours rapidly degrades indoor air quality."
            ),
            expected_benefit=(
                "Prevents outdoor particulate intrusion while enabling controlled air exchange when outdoor conditions are most favorable."
            ),
            affected_household_member="All household members",
            priority=RecommendationPriority.HIGH if is_elevated else RecommendationPriority.MEDIUM,
            confidence=RecommendationConfidence.HIGH,
            supporting_data_rule="RULE_VENTILATION_DIURNAL_TIMING_V1",
            causal_chain=CausalChain(
                live_data="Diurnal ground inversion trapping pollutants near ground height during cool hours (05:00-10:00, 18:00-22:00)",
                household_context=f"Home ventilation setup: {profile.ventilation.value}",
                detected_risk="Opening windows during inversion peaks permits outdoor smog to flood and settle into living/sleeping quarters",
                recommended_action="Seal building envelope tightly during cool peak hours; cross-ventilate briefly only between 12:00 and 15:00",
                expected_benefit="Maintains an effective physical barrier against outdoor particulate ingress while venting accumulated CO2",
            ),
            impact_categories=ImpactCategories(
                personal_exposure="High Reduction",
                household_protection="Whole Household",
                community_emissions="Neutral",
                practicality="Minimal Shift",
                cost="Zero Cost",
            ),
            tradeoff_or_limitation="Indoor air may feel stale during sealed periods; operate ceiling fans gently for internal circulation.",
        )

    @staticmethod
    def _rule_cooking_exhaust(profile: HouseholdProfile) -> Optional[RuleRecommendation]:
        cooking = profile.cooking_habits
        priority = RecommendationPriority.HIGH if not cooking.has_kitchen_exhaust_or_chimney else RecommendationPriority.MEDIUM

        action_desc = (
            "Turn on the kitchen exhaust fan or chimney at maximum speed before starting frying, tadka, or stove cooking, "
            "and allow it to run continuously for 15 to 20 minutes after cooking ceases. Keep the kitchen door closed to "
            "prevent fumes from drifting into living and sleeping areas."
            if cooking.has_kitchen_exhaust_or_chimney
            else (
                "Ensure kitchen windows are opened to the outside during cooking while closing internal doors leading to bedrooms. "
                "Consider installing a dedicated kitchen exhaust fan to actively remove cooking aerosol emissions."
            )
        )

        return RuleRecommendation(
            action=action_desc,
            timing="During all cooking sessions and 15-20 minutes post-cooking",
            reason=(
                "Culinary frying, boiling, and tadka seasoning emit concentrated bursts of ultra-fine particulate matter (PM2.5), "
                "aerosolized oils, and combustion byproducts that can linger for hours if not actively evacuated."
            ),
            expected_benefit=(
                "Accelerates clearance of indoor aerosolized particulates and prevents cooking fumes from polluting sleeping quarters."
            ),
            affected_household_member="Primary cook and nearby family members",
            priority=priority,
            confidence=RecommendationConfidence.HIGH,
            supporting_data_rule="RULE_COOKING_EXHAUST_POST_RUN_V1",
            causal_chain=CausalChain(
                live_data="Indoor cooking combustion and oil aerosol vaporization generating PM2.5 spikes up to 300+ µg/m³",
                household_context="Home kitchen with " + ("mechanical exhaust installed" if cooking.has_kitchen_exhaust_or_chimney else "no mechanical exhaust chimney"),
                detected_risk="Uncontained cooking aerosol migrates into bedrooms and living areas, where it lingers for hours",
                recommended_action="Power on chimney before lighting stove, close kitchen door, and keep running for 15 min after cooking",
                expected_benefit="Captures cooking particulates at the source and prevents internal migration into sleeping areas",
            ),
            impact_categories=ImpactCategories(
                personal_exposure="Moderate Reduction",
                household_protection="Cook and Living Quarters",
                community_emissions="Neutral",
                practicality="Effortless",
                cost="Zero Cost",
            ),
            tradeoff_or_limitation="Exhaust fan noise during dining; slight electricity consumption.",
        )

    @staticmethod
    def _rule_eliminate_incense_coils(profile: HouseholdProfile) -> Optional[RuleRecommendation]:
        cooking = profile.cooking_habits
        priority = (
            RecommendationPriority.CRITICAL
            if (cooking.uses_indoor_incense_or_coils and (profile.has_asthma_or_respiratory_vulnerability or profile.has_young_children))
            else (RecommendationPriority.HIGH if cooking.uses_indoor_incense_or_coils else RecommendationPriority.MEDIUM)
        )

        return RuleRecommendation(
            action=(
                "Eliminate the indoor burning of incense sticks (agarbatti), dhoop, camphor, and smoldering mosquito coils. "
                "For mosquito protection, use mechanical window meshes or liquid vaporizers. For spiritual rituals, switch to "
                "electric or flameless alternatives."
            ),
            timing="Immediate and ongoing indoor policy",
            reason=(
                "Smoldering incense and mosquito coils produce dense respirable particulates, polycyclic aromatic hydrocarbons, "
                "and volatile organic compounds in closed rooms, generating particulate spikes comparable to cigarette smoke."
            ),
            expected_benefit=(
                "Removes a major domestic source of indoor fine particulate pollution and eliminates acute bronchial triggers."
            ),
            affected_household_member="All occupants, especially infants, children, and seniors",
            priority=priority,
            confidence=RecommendationConfidence.HIGH,
            supporting_data_rule="RULE_ELIMINATE_INDOOR_COMBUSTION_V1",
            causal_chain=CausalChain(
                live_data="Indoor smoldering combustion emitting high concentrations of particulate matter, benzene, and CO",
                household_context="Household reports using incense, dhoop, or mosquito coils indoors",
                detected_risk="Smoldering materials create indoor PM2.5 levels exceeding 200 µg/m³ inside closed rooms",
                recommended_action="Cease indoor burning; transition to electric LED prayer lamps and physical window mosquito screens",
                expected_benefit="Completely eliminates a primary indoor carcinogen and asthma trigger without compromising spiritual rituals",
            ),
            impact_categories=ImpactCategories(
                personal_exposure="High Reduction",
                household_protection="Whole Household",
                community_emissions="Zero Internal Combustion",
                practicality="Minimal Shift",
                cost="Low Cost",
            ),
            tradeoff_or_limitation="Requires family consensus to adopt electric or flameless prayer lamps.",
        )

    @staticmethod
    def _rule_damp_dusting(profile: HouseholdProfile) -> RuleRecommendation:
        return RuleRecommendation(
            action=(
                "Clean floors and hard surfaces using a damp mop and damp microfiber cloth. Avoid dry broom sweeping or "
                "feather dusters which disturb settled dust."
            ),
            timing="Daily morning or afternoon cleaning routines",
            reason=(
                "Dry sweeping mechanically propels settled coarse and fine particulate matter back into the indoor breathing zone, "
                "where it remains suspended for several hours."
            ),
            expected_benefit=(
                "Prevents the re-suspension of settled allergen and particulate deposits, maintaining lower indoor dust concentrations."
            ),
            affected_household_member="All occupants, especially children playing on floor surfaces",
            priority=RecommendationPriority.MEDIUM,
            confidence=RecommendationConfidence.HIGH,
            supporting_data_rule="RULE_DAMP_DUSTING_SURFACES_V1",
            causal_chain=CausalChain(
                live_data="Indoor surface dust accumulation from ambient infiltration and household activities",
                household_context="Daily domestic sweeping and dusting routine",
                detected_risk="Dry brooms aerosolize settled dust, suspending coarse and fine allergens directly at breathing height",
                recommended_action="Use damp microfiber mops and wet wipes instead of traditional dry brooms or feather dusters",
                expected_benefit="Traps dust particles on wet contact, preventing particulate resuspension into indoor breathing air",
            ),
            impact_categories=ImpactCategories(
                personal_exposure="Moderate Reduction",
                household_protection="Children & Crawling Infants",
                community_emissions="Neutral",
                practicality="Effortless",
                cost="Zero Cost",
            ),
            tradeoff_or_limitation="Damp mopping takes slightly more physical effort and a few minutes of floor drying time.",
        )

    @staticmethod
    def _rule_purifier_guidance(
        profile: HouseholdProfile,
        aqi: Optional[int],
        is_elevated: bool,
    ) -> Optional[RuleRecommendation]:
        purifier = profile.purifier_setup

        if purifier.has_air_purifier and purifier.purifier_count > 0:
            return RuleRecommendation(
                action=(
                    "Position the air purifier at least 1.5 to 2 feet away from walls and large furniture with an unobstructed air intake. "
                    "Prioritize operating in the primary sleeping bedroom with windows and doors kept closed. Run the purifier on continuous "
                    "medium speed throughout the night rather than auto mode."
                ),
                timing="Continuous operation during evening and sleeping hours (21:00-08:00)",
                reason=(
                    "Air purifier built-in auto sensors often underestimate fine particulates and throttle down prematurely; "
                    "continuous operation in an enclosed bedroom provides a clean air micro-environment during prolonged overnight exposure."
                ),
                expected_benefit=(
                    "Maximizes Clean Air Delivery Rate (CADR) in sleeping spaces where members spend 7 to 8 continuous hours recovering."
                ),
                affected_household_member="Occupants in primary sleeping quarters",
                priority=RecommendationPriority.HIGH,
                confidence=RecommendationConfidence.HIGH,
                supporting_data_rule="RULE_PURIFIER_OPTIMAL_OPERATION_V1",
                causal_chain=CausalChain(
                    live_data=f"Nighttime ambient smog accumulation ({aqi if aqi is not None else 'Unhealthy'}) penetrating building exterior",
                    household_context=f"Household equipped with {purifier.purifier_count} working HEPA air purifier unit(s)",
                    detected_risk="Sub-optimal purifier placement or reliance on inaccurate auto mode leaves sleeping room air under-filtered",
                    recommended_action="Center purifier in primary bedroom, keep doors closed, and run on constant medium-high overnight",
                    expected_benefit="Maintains an active Clean Air Room sanctuary, reducing sleeping particulate exposure by over 80%",
                ),
                impact_categories=ImpactCategories(
                    personal_exposure="High Reduction",
                    household_protection="Sleeping Quarters",
                    community_emissions="Neutral",
                    practicality="Effortless",
                    cost="Low Cost",
                ),
                tradeoff_or_limitation="Continuous fan motor sound (soft white noise); periodic HEPA filter replacement needed.",
            )
        elif is_elevated:
            return RuleRecommendation(
                action=(
                    "Establish a dedicated 'Clean Air Room' by selecting one bedroom, sealing door and window gaps, and evaluating "
                    "a certified true-HEPA air purifier appropriately rated for that room's square footage."
                ),
                timing="During sustained poor air quality episodes",
                reason=(
                    "Outdoor particulate pollution penetrates building envelopes; establishing at least one low-particulate indoor sanctuary "
                    "is essential for respiratory recovery."
                ),
                expected_benefit=(
                    "Creates an indoor safe haven that significantly reduces cumulative 24-hour particulate exposure."
                ),
                affected_household_member="All household members, especially sensitive individuals",
                priority=RecommendationPriority.HIGH if profile.has_asthma_or_respiratory_vulnerability else RecommendationPriority.MEDIUM,
                confidence=RecommendationConfidence.HIGH,
                supporting_data_rule="RULE_CREATE_CLEAN_ROOM_SANCTUARY_V1",
                causal_chain=CausalChain(
                    live_data="Elevated ambient particulate concentrations with ongoing infiltration through doors and window gaps",
                    household_context="Household currently lacks an active mechanical HEPA air purifier",
                    detected_risk="Indoor particulate concentration gradually equilibrates with polluted outdoor air over 4–6 hours",
                    recommended_action="Isolate one bedroom, seal perimeter air leaks with weatherstripping, and consider a true-HEPA purifier",
                    expected_benefit="Guarantees at least one low-PM2.5 micro-environment for overnight lung recovery",
                ),
                impact_categories=ImpactCategories(
                    personal_exposure="High Reduction",
                    household_protection="Sleeping Quarters",
                    community_emissions="Neutral",
                    practicality="Moderate Coordination",
                    cost="Investment",
                ),
                tradeoff_or_limitation="Requires initial appliance investment and keeping the room door closed to maintain seal.",
            )

        return None
