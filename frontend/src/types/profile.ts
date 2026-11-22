export type ExerciseIntensity = 'light' | 'moderate' | 'vigorous';

export type ExerciseTimeOfDay =
  | 'early_morning'
  | 'morning'
  | 'afternoon'
  | 'evening'
  | 'night'
  | 'indoor_only'
  | 'none';

export type CommuteMode =
  | 'two_wheeler'
  | 'open_auto'
  | 'walking'
  | 'bus_non_ac'
  | 'metro_ac'
  | 'car_ac';

export type VentilationCondition =
  | 'sealed_ac'
  | 'partially_open'
  | 'naturally_ventilated'
  | 'poorly_ventilated';

export interface TimeWindow {
  label: string;
  start_time: string;
  end_time: string;
}

export interface ExerciseHabits {
  participates_in_outdoor_exercise: boolean;
  time_of_day: ExerciseTimeOfDay;
  intensity: ExerciseIntensity;
  duration_minutes: number;
}

export interface CommuteHabits {
  is_daily_commuter: boolean;
  commute_windows: TimeWindow[];
  primary_mode: CommuteMode;
  estimated_daily_commute_minutes: number;
}

export interface CookingHabits {
  has_kitchen_exhaust_or_chimney: boolean;
  cooking_windows: TimeWindow[];
  uses_indoor_incense_or_coils: boolean;
}

export interface PurifierSetup {
  has_air_purifier: boolean;
  purifier_count: number;
  located_in_bedrooms: boolean;
  operates_continuously: boolean;
}

export interface HouseholdProfile {
  profile_id?: string | null;
  profile_name?: string | null;
  num_adults: number;
  children_ages: number[];
  num_older_adults: number;
  has_respiratory_sensitivity: boolean;
  has_asthma_or_respiratory_vulnerability: boolean;
  has_limited_mobility: boolean;
  num_outdoor_workers: number;
  commute_habits: CommuteHabits;
  exercise_habits: ExerciseHabits;
  has_outdoor_child_play: boolean;
  child_play_window?: TimeWindow | null;
  cooking_habits: CookingHabits;
  ventilation: VentilationCondition;
  purifier_setup: PurifierSetup;
}
