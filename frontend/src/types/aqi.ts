export interface GeoCoordinates {
  latitude: number;
  longitude: number;
}

export interface Attribution {
  name: string;
  url?: string;
  logo?: string;
}

export interface PollutantDetail {
  value: number;
  unit: string;
  label: string;
}

export interface PollutantMeasurements {
  pm25?: PollutantDetail | null;
  pm10?: PollutantDetail | null;
  no2?: PollutantDetail | null;
  so2?: PollutantDetail | null;
  co?: PollutantDetail | null;
  o3?: PollutantDetail | null;
  meteorological?: Record<string, number> | null;
}

export interface AQIScaleClassification {
  category: string;
  color_hex: string;
  health_implications: string;
  scale_name: string;
  methodology_note: string;
}

export interface ForecastDayPoint {
  day: string; // YYYY-MM-DD
  avg?: number | null;
  min?: number | null;
  max?: number | null;
}

export interface ForecastData {
  pm25?: ForecastDayPoint[];
  pm10?: ForecastDayPoint[];
  o3?: ForecastDayPoint[];
  uvi?: ForecastDayPoint[];
}

export interface AQIResponse {
  location_name?: string | null;
  station_name: string;
  station_id?: number | null;
  coordinates?: GeoCoordinates | null;
  aqi?: number | null;
  classification?: AQIScaleClassification | null;
  dominant_pollutant?: string | null;
  pollutants: PollutantMeasurements;
  source: string;
  attributions: Attribution[];
  station_url?: string | null;
  measurement_time?: string | null;
  measurement_timestamp?: number | null;
  measurement_timezone?: string | null;
  retrieval_time: string;
  data_freshness: string;
  forecast?: ForecastData | null;
}

export interface StationSearchResult {
  station_id: number;
  station_name: string;
  aqi?: number | null;
  coordinates?: GeoCoordinates | null;
  station_url?: string | null;
  last_updated?: string | null;
}

export interface AQISearchResponse {
  query: string;
  count: number;
  results: StationSearchResult[];
}

/** Location selection passed between Header and App.
 *  `query` is the string sent to the backend (/api/aqi?location=…).
 *  `label` is the human-readable display name shown in the UI. */
export interface LocationSelection {
  query: string;
  label: string;
}
