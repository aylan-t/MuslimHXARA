import hmac
import os
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Header, HTTPException

from .models import CompareRequest, QuoteImportRequest, RfqRequest
from .repository import FreightRepository
from .service import FreightService

router = APIRouter(prefix="/api/freight", tags=["freight"])
service = FreightService(FreightRepository(os.getenv("FREIGHT_DB_PATH", "data/freight_rates.db")))


def require_admin_token(
    x_admin_token: Annotated[Optional[str], Header()] = None,
) -> None:
    expected = os.getenv("QUOTE_IMPORT_TOKEN") or os.getenv("SESSION_SECRET")
    if not expected:
        raise HTTPException(status_code=503, detail="Quote administration is not configured")
    if not x_admin_token or not hmac.compare_digest(x_admin_token, expected):
        raise HTTPException(status_code=403, detail="Invalid administration token")


@router.post("/compare")
def compare(request: CompareRequest):
    return service.compare([route.model_dump() for route in request.routes], request.vehicleCount)


@router.get("/coverage")
def coverage():
    return service.coverage()


@router.post("/rfq")
def create_rfq(request: RfqRequest):
    return service.create_rfq(request.model_dump())


@router.get("/rfq/{rfq_id}")
def get_rfq(rfq_id: str):
    rfq = service.repository.get_rfq(rfq_id)
    if not rfq:
        raise HTTPException(status_code=404, detail="RFQ not found")
    return rfq


@router.post("/quotes/import")
def import_quote(
    request: QuoteImportRequest,
    _: Annotated[None, Depends(require_admin_token)],
):
    value = request.model_dump()
    route = value.pop("route")
    return service.import_quote(value, route)