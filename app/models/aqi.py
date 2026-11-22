"""Pydantic models and schemas for Air Quality Index (AQI) data."""

from typing import Dict, List, Optional
from pydantic import BaseModel, Field


class GeoCoordinates(BaseModel):
    """Geographic coordinates (latitude and longitude)."""

    latitude: float = Field(..., ge=-90.0, le=90.0, description="Latitude in decimal degrees")
    longitude: float = Field(..., ge=-180.0, le=180.0, description="Longitude in decimal degrees")


class Attribution(BaseModel):
    """Data attribution for monitoring agency or platform."""

    name: str = Field(..., description="Name of the reporting organization or network")
    url: Optional[str] = Field(None, description="URL of the attribution source")
    logo: Optional[str] = Field(None, description="Logo identifier if provided")


class PollutantDetail(BaseModel):
    """Detailed measurement for an individual pollutant."""

    value: float = Field(..., description="Pollutant value / index reading as reported")
    unit: str = Field(
        default="IAQI sub-index",
        description="Measurement unit or index scale (WAQI reports Individual AQI sub-indices)",
    )
    label: str = Field(..., description="Human-readable pollutant description")


class PollutantMeasurements(BaseModel):
    """Collection of pollutant measurements.

    Missing pollutants are represented as None (never 0.0 unless explicitly measured as 0.0).
    """

    pm25: Optional[PollutantDetail] = Field(
        default=None,
        description="Fine particulate matter (<2.5 µm), None if unavailable",
    )
    pm10: Optional[PollutantDetail] = Field(
        default=None,
        description="Respirable particulate matter (<10 µm), None if unavailable",
    )
    no2: Optional[PollutantDetail] = Field(
        default=None,
        description="Nitrogen dioxide, None if unavailable",
    )
    so2: Optional[PollutantDetail] = Field(
        default=None,
        description="Sulfur dioxide, None if unavailable",
    )
    co: Optional[PollutantDetail] = Field(
        default=None,
        description="Carbon monoxide, None if unavailable",
    )
    o3: Optional[PollutantDetail] = Field(
        default=None,
        description="Ozone, None if unavailable",
    )
    meteorological: Optional[Dict[str, float]] = Field(
        default=None,
        description="Meteorological readings if reported (e.g. t: temperature, h: humidity, p: pressure, w: wind)",
    )


class ForecastDayPoint(BaseModel):
    """Daily summary point reported by station provider."""

    day: str = Field(..., description="Date string YYYY-MM-DD")
    avg: Optional[int] = Field(None, description="Average AQI or concentration")
    min: Optional[int] = Field(None, description="Minimum recorded/forecasted reading")
    max: Optional[int] = Field(None, description="Maximum recorded/forecasted reading")


class ForecastData(BaseModel):
    """Multi-day pollutant telemetry and forecast as provided by WAQI."""

    pm25: List[ForecastDayPoint] = Field(default_factory=list, description="PM2.5 daily forecast")
    pm10: List[ForecastDayPoint] = Field(default_factory=list, description="PM10 daily forecast")
    o3: List[ForecastDayPoint] = Field(default_factory=list, description="Ozone daily forecast")
    uvi: List[ForecastDayPoint] = Field(default_factory=list, description="UV Index daily forecast")


class AQIScaleClassification(BaseModel):
    """AQI scale and classification details."""

    category: str = Field(
        ...,
        description="Air quality category (e.g. Good, Moderate, Unhealthy, Hazardous)",
    )
    color_hex: str = Field(
        ...,
        description="Standard color representation code in hexadecimal",
    )
    health_implications: str = Field(
        ...,
        description="Health statement associated with this AQI bracket",
    )
    scale_name: str = Field(
        default="WAQI / US EPA Standard",
        description="Scale reference standard",
    )
    methodology_note: str = Field(
        default=(
            "WAQI standardizes reported readings against the US EPA AQI standard. "
            "This is not calibrated to the Indian CPCB National AQI (NAQI) sub-index formula, "
            "even when underlying station data originates from CPCB or state pollution control boards."
        ),
        description="Clarification of methodology and distinction from CPCB Indian AQI",
    )


class AQIResponse(BaseModel):
    """Comprehensive AQI response model for VayuSense."""

    location_name: Optional[str] = Field(
        default=None,
        description="Requested location query or resolved city name",
    )
    station_name: str = Field(
        ...,
        description="Official name of the reporting air monitoring station",
    )
    station_id: Optional[int] = Field(
        default=None,
        description="Unique identifier of the monitoring station on the provider platform",
    )
    coordinates: Optional[GeoCoordinates] = Field(
        default=None,
        description="Latitude and longitude coordinates of the reporting station",
    )
    aqi: Optional[int] = Field(
        default=None,
        description="Air Quality Index value (None if station is active but has no valid AQI reading)",
    )
    classification: Optional[AQIScaleClassification] = Field(
        default=None,
        description="Air quality category and scale classification information",
    )
    dominant_pollutant: Optional[str] = Field(
        default=None,
        description="Dominant pollutant responsible for the current AQI value (e.g., pm25, pm10)",
    )
    pollutants: PollutantMeasurements = Field(
        default_factory=PollutantMeasurements,
        description="Individual pollutant measurements actually reported by the station",
    )
    source: str = Field(
        default="WAQI (World Air Quality Index Project / aqicn.org)",
        description="Primary data provider source",
    )
    attributions: List[Attribution] = Field(
        default_factory=list,
        description="Attributions to monitoring agencies (e.g. CPCB, DPCC, State PCBs)",
    )
    station_url: Optional[str] = Field(
        default=None,
        description="Direct URL to station page on WAQI/aqicn.org",
    )
    measurement_time: Optional[str] = Field(
        default=None,
        description="Measurement time reported by the station (ISO 8601 or local format)",
    )
    measurement_timestamp: Optional[int] = Field(
        default=None,
        description="Unix timestamp (seconds) of the measurement",
    )
    measurement_timezone: Optional[str] = Field(
        default=None,
        description="Timezone of the reporting station",
    )
    retrieval_time: str = Field(
        ...,
        description="ISO 8601 UTC timestamp when the data was retrieved by the VayuSense backend",
    )
    data_freshness: str = Field(
        ...,
        description="Evaluation of data timeliness (e.g., Live (< 1h), Fresh (1-3h), Moderate (3-6h), Stale (> 6h))",
    )
    forecast: Optional[ForecastData] = Field(
        default=None,
        description="Multi-day forecast and historical telemetry if published by the station",
    )


class StationSearchResult(BaseModel):
    """Individual station summary result from location search."""

    station_id: int = Field(..., description="Unique station ID (uid)")
    station_name: str = Field(..., description="Name and location of the station")
    aqi: Optional[int] = Field(
        default=None,
        description="Current AQI value (None if unmeasured or unavailable)",
    )
    coordinates: Optional[GeoCoordinates] = Field(
        default=None,
        description="Geographic coordinates of the station",
    )
    station_url: Optional[str] = Field(
        default=None,
        description="Station URL or path",
    )
    last_updated: Optional[str] = Field(
        default=None,
        description="Last reported timestamp",
    )


class AQISearchResponse(BaseModel):
    """Response model for location search queries."""

    query: str = Field(..., description="The original search query string")
    count: int = Field(..., description="Number of matching stations returned")
    results: List[StationSearchResult] = Field(
        default_factory=list,
        description="List of matching air quality monitoring stations",
    )


class HealthResponse(BaseModel):
    """Health check endpoint response model."""

    status: str = Field(..., description="System health status ('healthy' or 'degraded')")
    app_name: str = Field(..., description="Application name")
    version: str = Field(..., description="Application version")
    timestamp: str = Field(..., description="Current UTC timestamp")
    provider: str = Field(default="WAQI", description="Upstream AQI data provider")
    provider_token_configured: bool = Field(
        ...,
        description="Whether a valid WAQI API token is configured in environment",
    )
    gemini_configured: bool = Field(
        default=False,
        description="Whether a valid Google Gemini API key is configured in environment",
    )
