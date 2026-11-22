"""Router endpoints for Air Quality Index (AQI) queries and search."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.config import Settings, get_settings
from app.models.aqi import AQIResponse, AQISearchResponse
from app.services.waqi_service import WAQIService

router = APIRouter(prefix="/api/aqi", tags=["Air Quality Index"])


def get_waqi_service(settings: Settings = Depends(get_settings)) -> WAQIService:
    """Dependency provider for WAQIService."""
    return WAQIService(settings=settings)


@router.get(
    "/search",
    response_model=AQISearchResponse,
    summary="Search air quality stations by location",
    description="Search for live air quality monitoring stations in India or worldwide matching a keyword.",
)
async def search_stations(
    q: str = Query(
        ...,
        min_length=1,
        description="Location name or keyword to search (e.g. 'Delhi', 'Bengaluru', 'Mumbai', 'Connaught Place')",
        examples=["delhi", "bengaluru", "mumbai"],
    ),
    service: WAQIService = Depends(get_waqi_service),
) -> AQISearchResponse:
    """Search for monitoring stations matching the query string."""
    clean_query = q.strip()
    if not clean_query:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Search query parameter 'q' cannot be empty or whitespace.",
        )
    return await service.search_stations(clean_query)


@router.get(
    "",
    response_model=AQIResponse,
    summary="Get live AQI by location or coordinates",
    description=(
        "Retrieve live air quality data either by location name/station identifier "
        "(e.g., `?location=delhi` or `?location=@7024`) or by geographic coordinates "
        "(e.g., `?lat=28.6139&lon=77.2090`)."
    ),
)
async def get_aqi(
    location: Optional[str] = Query(
        None,
        description="City or station name (e.g., 'delhi', 'mumbai', 'kolkata') or station ID prefixed with '@' (e.g. '@7024')",
    ),
    lat: Optional[float] = Query(
        None,
        ge=-90.0,
        le=90.0,
        description="Latitude in decimal degrees (-90 to 90)",
    ),
    lon: Optional[float] = Query(
        None,
        ge=-180.0,
        le=180.0,
        description="Longitude in decimal degrees (-180 to 180)",
    ),
    service: WAQIService = Depends(get_waqi_service),
) -> AQIResponse:
    """Retrieve live AQI for a given location string or geographic coordinate pair."""
    has_location = bool(location and location.strip())
    has_lat = lat is not None
    has_lon = lon is not None

    # Check for conflicting arguments
    if has_location and (has_lat or has_lon):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ambiguous query: Provide either 'location' or coordinates ('lat' and 'lon'), not both.",
        )

    # Check for incomplete coordinates
    if (has_lat and not has_lon) or (has_lon and not has_lat):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incomplete coordinates: Both 'lat' and 'lon' must be provided together.",
        )

    # Check for missing parameters
    if not has_location and not (has_lat and has_lon):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing required parameters: Provide either 'location' or both 'lat' and 'lon'.",
        )

    # Query by location
    if has_location and location:
        return await service.get_aqi_by_feed(location.strip())

    # Query by coordinates
    assert lat is not None and lon is not None  # Guaranteed by checks above
    return await service.get_aqi_by_coords(lat=lat, lon=lon)
