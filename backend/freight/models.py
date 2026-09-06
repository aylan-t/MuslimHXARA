from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, model_validator


class RouteInput(BaseModel):
    id: str
    originPort: str
    destinationPort: str
    mode: str


class CompareRequest(BaseModel):
    routes: List[RouteInput] = Field(min_length=1)
    vehicleCount: int = Field(ge=1)


class QuoteImportRequest(BaseModel):
    """A documented third-party quote; amounts must be supplied by its source."""
    route: RouteInput
    provider: str = Field(min_length=1)
    status: Literal["carrier_quote", "partner_rate"] = "carrier_quote"
    amountCad: float = Field(gt=0)
    lowCad: float = Field(gt=0)
    highCad: float = Field(gt=0)
    currency: str = Field(min_length=3, max_length=3)
    originalLow: float = Field(gt=0)
    originalHigh: float = Field(gt=0)
    retrievedAt: str
    validUntil: str
    sourceUrl: str = Field(min_length=1)
    attribution: str = Field(min_length=1)
    inclusions: List[str] = Field(default_factory=list)
    exclusions: List[str] = Field(default_factory=list)
    components: Dict[str, Any] = Field(default_factory=dict)
    confidence: float = Field(ge=0, le=1)
    carrierName: Optional[str] = None
    estimatedDaysMin: Optional[int] = Field(default=None, ge=0)
    estimatedDaysMax: Optional[int] = Field(default=None, ge=0)

    @model_validator(mode="after")
    def validate_document(self):
        if self.lowCad > self.highCad or self.originalLow > self.originalHigh:
            raise ValueError("quote low amount cannot exceed high amount")
        try:
            expiry = datetime.fromisoformat(self.validUntil.replace("Z", "+00:00"))
            retrieved = datetime.fromisoformat(self.retrievedAt.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValueError("retrievedAt and validUntil must be ISO-8601 timestamps") from exc
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)
        if retrieved.tzinfo is None:
            retrieved = retrieved.replace(tzinfo=timezone.utc)
        if expiry <= datetime.now(timezone.utc):
            raise ValueError("expired quote documents cannot be imported")
        if retrieved > expiry:
            raise ValueError("retrievedAt cannot be after validUntil")
        return self


class RfqRequest(BaseModel):
    route: RouteInput
    vehicleCount: int = Field(default=1, ge=1)
    country: Optional[str] = None
    vehicle: Dict[str, Any] = Field(default_factory=dict)
    notes: str = ""
    shipmentDetails: Dict[str, Any] = Field(default_factory=dict)
    vehicleDetails: Dict[str, Any] = Field(default_factory=dict)
    contactDetails: Dict[str, Any] = Field(default_factory=dict)
