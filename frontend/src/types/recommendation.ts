export type RecommendationPriority = 'Critical' | 'High' | 'Medium' | 'Low';
export type RecommendationConfidence = 'High' | 'Moderate' | 'Cautious';

export interface CausalChain {
  live_data: string;
  household_context: string;
  detected_risk: string;
  recommended_action: string;
  expected_benefit: string;
}

export interface ImpactCategories {
  personal_exposure: string;
  household_protection: string;
  community_emissions: string;
  practicality: string;
  cost: string;
}

export interface RuleRecommendation {
  action: string;
  timing: string;
  reason: string;
  expected_benefit: string;
  affected_household_member: string;
  priority: RecommendationPriority;
  confidence: RecommendationConfidence;
  supporting_data_rule: string;
  causal_chain?: CausalChain;
  impact_categories?: ImpactCategories;
  tradeoff_or_limitation?: string;
}

export interface RiskComponentBreakdown {
  base_aqi_component: number;
  vulnerability_factor: number;
  exposure_duration_score: number;
  activity_timing_score: number;
  indoor_environment_score: number;
  freshness_penalty: number;
  explanations: string[];
}

export interface RiskAssessmentResult {
  exposure_risk_score: number;
  risk_level: string;
  confidence_score: number;
  freshness_indicator: string;
  is_stale_or_missing: boolean;
  breakdown: RiskComponentBreakdown;
  summary: string;
}

export interface ExplainableAction {
  action: string;
  why_now: string;
  trigger_condition: string;
  beneficiary: string;
  expected_mechanism: string;
  tradeoff_or_limitation: string;
  timing: string;
  priority: string;
}

export interface DailyRoutineSegment {
  time_of_day: string;
  summary: string;
  actions: ExplainableAction[];
}

export interface TodayRoutine {
  morning: DailyRoutineSegment;
  afternoon: DailyRoutineSegment;
  evening: DailyRoutineSegment;
  night: DailyRoutineSegment;
}

export interface IndoorAirActions {
  cooking: ExplainableAction[];
  ventilation: ExplainableAction[];
  dust_and_cleaning: ExplainableAction[];
  incense_and_combustion: ExplainableAction[];
  purifier_and_bedrooms: ExplainableAction[];
  indoor_activities: ExplainableAction[];
}

export interface SustainableSwapItem {
  swap_category: string;
  current_habit: string;
  recommended_swap: string;
  rationale: string;
  feasibility_note: string;
}

export interface SustainableSwaps {
  swaps: SustainableSwapItem[];
}

export interface PersonalizedAlert {
  activity: string;
  alert_level: string;
  message: string;
  affected_member: string;
}

export interface AIPersonalizedPlan {
  plan_id: string;
  profile_name: string;
  generated_at: string;
  model_used: string;
  is_fallback: boolean;
  fallback_reason?: string | null;
  exposure_risk_score: number;
  risk_level: string;
  aqi_data_status: string;
  today_routine: TodayRoutine;
  indoor_air_action: IndoorAirActions;
  sustainable_swaps: SustainableSwaps;
  personalized_alerts: PersonalizedAlert[];
  medical_disclaimer: string;
}

export interface RecommendationResponse {
  profile_name: string;
  risk_assessment: RiskAssessmentResult;
  recommendations: RuleRecommendation[];
  generated_at: string;
  engine_version: string;
}
