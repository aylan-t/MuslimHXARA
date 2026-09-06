import os
import time
import json
import math
from datetime import datetime, timezone
from typing import Dict, Any
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from backend.schemas import CalculationRequest, CalculationResponse, CostBreakdownResponse
from backend.freight.routes import router as freight_router

CURRENT_YEAR = 2026
FX_API_URL = "https://open.er-api.com/v6/latest/CAD"
FX_CACHE_TTL_SECONDS = 15 * 60
_fx_cache: Dict[str, Any] = {"payload": None, "expiresAt": 0.0}

app = FastAPI(
    title="AutoTransat QC API",
    description="API de calcul de rentabilité pour l'exportation de véhicules Québec -> Maroc & Sénégal",
    version="1.0.0"
)

configured_origins = [origin.strip() for origin in os.getenv("CORS_ALLOWED_ORIGINS", "").split(",")
                      if origin.strip() and origin.strip() != "*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=configured_origins,
    allow_origin_regex=r"^https://([a-zA-Z0-9-]+\.)*(replit\.dev|repl\.co|replit\.app)$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(freight_router)

# Configuration de référence en mémoire (modifiable)
DEFAULT_CONFIG = {
    "fxRates": {
        "CAD_to_MAD": 7.35,
        "CAD_to_XOF": 440.0,
        "defaultSpreadPercent": 2.5,
        "lastUpdated": "2026-03-01"
    },
    "customsRules": {
        "senegal": {
            "maxAgeYearsTourism": 10,  # Décret du 24 octobre 2025
            "maxAgeYearsTrucks": 15,
            "taxRatePercent": 44.5,
            "legalBasis": "Décret n° 2025-1845 du 24 octobre 2025 (limite 10 ans)"
        },
        "morocco": {
            "standardImportRatePercent": 17.5,
            "vatRatePercent": 20.0,
            "parafiscalRatePercent": 0.25,
            "mreMaxAgeYears": 5,
            "mreMaxDiscountPercent": 90.0,
            "legalWarning": "AVERTISSEMENT LÉGAL : L'importation commerciale au Maroc est strictement réservée et soumise à agrément. Régime MRE avantageux limité à 5 ans d'âge avec abattement 90%."
        }
    },
    "routes": [
        {
            "id": "mtl-dkr-roro",
            "name": "Montréal → Dakar (RoRo)",
            "destinationCountry": "senegal",
            "mode": "roro",
            "inlandOriginCad": 250,
            "portOriginFeesCad": 350,
            "oceanFreightCad": 2400,
            "marineInsuranceRatePercent": 1.5,
            "portDestinationFeesCad": 450,
            "inlandDestinationCad": 200,
            "estimatedDays": 21
        },
        {
            "id": "mtl-casa-roro",
            "name": "Montréal → Casablanca (RoRo)",
            "destinationCountry": "maroc",
            "mode": "roro",
            "inlandOriginCad": 250,
            "portOriginFeesCad": 350,
            "oceanFreightCad": 2550,
            "marineInsuranceRatePercent": 1.5,
            "portDestinationFeesCad": 500,
            "inlandDestinationCad": 250,
            "estimatedDays": 23
        }
    ]
}


@app.get("/")
def read_root():
    return {
        "app": "AutoTransat QC API",
        "status": "online",
        "version": "1.0.0",
        "docs": "/docs"
    }


@app.get("/api/config")
def get_config():
    return DEFAULT_CONFIG


def _iso_from_unix(value: Any) -> str | None:
    try:
        return datetime.fromtimestamp(float(value), tz=timezone.utc).isoformat()
    except (TypeError, ValueError, OverflowError):
        return None


def _fetch_market_fx_rates() -> Dict[str, Any]:
    now = time.time()
    cached = _fx_cache.get("payload")
    if cached and now < _fx_cache["expiresAt"]:
        return {**cached, "cacheStatus": "cached"}

    request = Request(FX_API_URL, headers={"Accept": "application/json", "User-Agent": "AutoTransatQC/1.0"})
    try:
        with urlopen(request, timeout=8) as response:
            data = json.load(response)
    except (HTTPError, URLError, TimeoutError, OSError, ValueError) as error:
        if cached:
            raise HTTPException(
                status_code=503,
                detail="La source de change n’est pas joignable et le dernier taux en cache est expiré.",
            ) from error
        raise HTTPException(
            status_code=503,
            detail="La source de change n’est pas joignable; aucun taux courant n’est disponible.",
        ) from error

    rates = data.get("rates") if isinstance(data, dict) else None
    if not isinstance(data, dict) or data.get("result") != "success" or not isinstance(rates, dict):
        raise HTTPException(status_code=502, detail="La source de change a renvoyé une réponse invalide.")

    try:
        cad_to_mad = float(rates["MAD"])
        cad_to_xof = float(rates["XOF"])
    except (KeyError, TypeError, ValueError) as error:
        raise HTTPException(status_code=502, detail="La source ne fournit pas MAD et XOF pour le CAD.") from error
    if cad_to_mad <= 0 or cad_to_xof <= 0:
        raise HTTPException(status_code=502, detail="La source de change a renvoyé un taux non valide.")

    provider_updated_at = _iso_from_unix(data.get("time_last_update_unix"))
    next_update_at = _iso_from_unix(data.get("time_next_update_unix"))
    payload = {
        "CAD_to_MAD": round(cad_to_mad, 6),
        "CAD_to_XOF": round(cad_to_xof, 6),
        "lastUpdated": provider_updated_at or datetime.now(timezone.utc).isoformat(),
        "providerUpdatedAt": provider_updated_at,
        "nextUpdateAt": next_update_at,
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "isLive": True,
        "cacheStatus": "live",
        "sourceName": "ExchangeRate-API Open — taux indicatif de marché",
        "officialSourceUrl": FX_API_URL,
    }
    _fx_cache["payload"] = payload
    _fx_cache["expiresAt"] = now + FX_CACHE_TTL_SECONDS
    return payload


@app.get("/api/fx-rates")
def get_fx_rates():
    """Return the latest published CAD market rates for both destination currencies."""
    return _fetch_market_fx_rates()


@app.post("/api/calculate", response_model=CalculationResponse)
def calculate_landed_cost(req: CalculationRequest):
    vehicle = req.vehicle
    country = req.destination
    age = CURRENT_YEAR - vehicle.year

    # 1. Validation d'éligibilité légale
    is_eligible = True
    severity = "success"
    message = "Véhicule éligible"

    if country == "senegal":
        max_age = DEFAULT_CONFIG["customsRules"]["senegal"]["maxAgeYearsTrucks"] if vehicle.category == "camionnette" else DEFAULT_CONFIG["customsRules"]["senegal"]["maxAgeYearsTourism"]
        if age > max_age:
            is_eligible = False
            severity = "error"
            message = f"VÉHICULE NON IMPORTABLE AU SÉNÉGAL : {age} ans constatés (limite légale stricte : {max_age} ans selon décret du 24 octobre 2025)."
        else:
            message = f"ÉLIGIBLE AU SÉNÉGAL : {age} an(s), conforme au décret du 24 octobre 2025."
    else:
        # Maroc
        mre = req.customs.moroccoOptions
        is_mre = bool(mre and mre.isMRE)
        mre_conditions_confirmed = bool(mre and mre.mreAgeOver60 and mre.residenceOver10Years and mre.isFirstCarInLife)
        if is_mre:
            max_mre_age = DEFAULT_CONFIG["customsRules"]["morocco"]["mreMaxAgeYears"]
            if age > max_mre_age:
                is_eligible = False
                severity = "error"
                message = f"NON ÉLIGIBLE RÉGIME MRE : Le régime préférentiel exige un véhicule de {max_mre_age} ans maximum (âge actuel : {age} ans)."
            elif not mre_conditions_confirmed:
                severity = "warning"
                message = "RÉGIME MRE NON CONFIRMÉ : le calcul conserve le régime standard tant que toutes les conditions ne sont pas confirmées."
            else:
                message = f"CONDITIONS MRE DÉCLARÉES : véhicule de {age} an(s); avantage soumis à validation documentaire."
        else:
            severity = "warning"
            message = DEFAULT_CONFIG["customsRules"]["morocco"]["legalWarning"]

    # 2. Taux FX
    base_rate = DEFAULT_CONFIG["fxRates"]["CAD_to_XOF"] if country == "senegal" else DEFAULT_CONFIG["fxRates"]["CAD_to_MAD"]
    spread = req.financing.fxSpreadPercent
    effective_rate = base_rate * (1 - spread / 100)
    fx_spread_cost = vehicle.purchasePriceCad * (spread / 100)

    # 3. Transfert bancaire
    bank_transfer_cost = req.financing.fixedFeeCad + \
        (vehicle.purchasePriceCad * (req.financing.variableFeePercent / 100))

    # 4. Transport
    route = next((r for r in DEFAULT_CONFIG["routes"] if r["id"]
                 == req.transport.routeId), DEFAULT_CONFIG["routes"][0])
    inland_origin = req.transport.customInlandOriginCad or route["inlandOriginCad"]
    port_origin = route["portOriginFeesCad"]
    batch_count = max(1, req.transport.batchVehiclesCount)
    ocean_freight = (
        req.transport.customOceanFreightCad or route["oceanFreightCad"]) / batch_count
    marine_insurance = vehicle.purchasePriceCad * \
        (route["marineInsuranceRatePercent"] / 100)
    port_dest = route["portDestinationFeesCad"] / batch_count
    inland_dest = req.transport.customInlandDestinationCad or route["inlandDestinationCad"]
    total_transport = inland_origin + port_origin + \
        ocean_freight + marine_insurance + port_dest + inland_dest

    # 5. Encan
    auction_fees = vehicle.auctionFeesCad + vehicle.brokerCommissionCad

    # 6. Douane
    customs_taxable_value = vehicle.purchasePriceCad + ocean_freight + marine_insurance
    if country == "senegal":
        tax_rate = req.customs.customTaxRatePercent or DEFAULT_CONFIG[
            "customsRules"]["senegal"]["taxRatePercent"]
        customs_taxes = customs_taxable_value * (tax_rate / 100)
    else:
        mre = req.customs.moroccoOptions
        can_apply_mre = bool(mre and mre.isMRE and mre.mreAgeOver60 and mre.residenceOver10Years and mre.isFirstCarInLife and age <= DEFAULT_CONFIG["customsRules"]["morocco"]["mreMaxAgeYears"])
        if can_apply_mre:
            discount = DEFAULT_CONFIG["customsRules"]["morocco"]["mreMaxDiscountPercent"] / 100
            base_tax = (DEFAULT_CONFIG["customsRules"]["morocco"]["standardImportRatePercent"] +
                        DEFAULT_CONFIG["customsRules"]["morocco"]["vatRatePercent"]) / 100
            customs_taxes = customs_taxable_value * base_tax * (1 - discount)
        else:
            imp_rate = DEFAULT_CONFIG["customsRules"]["morocco"]["standardImportRatePercent"] / 100
            vat_rate = DEFAULT_CONFIG["customsRules"]["morocco"]["vatRatePercent"] / 100
            imp = customs_taxable_value * imp_rate
            vat = (customs_taxable_value + imp) * vat_rate
            customs_taxes = imp + vat

    # 7. Landed Cost & Rentabilité
    landed_cost = vehicle.purchasePriceCad + fx_spread_cost + \
        bank_transfer_cost + total_transport + auction_fees + customs_taxes
    landed_cost_local = landed_cost * effective_rate
    local_currency = "XOF" if country == "senegal" else "MAD"

    suggested_sale_cad = landed_cost * (1 + req.targetMarginPercent / 100)
    suggested_sale_local = suggested_sale_cad * effective_rate
    net_profit_cad = suggested_sale_cad - landed_cost
    net_profit_local = suggested_sale_local - landed_cost_local
    roi_percent = (net_profit_cad / landed_cost) * 100

    breakdown = CostBreakdownResponse(
        vehiclePurchaseCad=round(vehicle.purchasePriceCad),
        fxSpreadCostCad=round(fx_spread_cost),
        bankTransferCostCad=round(bank_transfer_cost),
        inlandOriginCad=round(inland_origin),
        originPortFeesCad=round(port_origin),
        oceanFreightCad=round(ocean_freight),
        marineInsuranceCad=round(marine_insurance),
        destinationPortFeesCad=round(port_dest),
        inlandDestinationCad=round(inland_dest),
        totalTransportCad=round(total_transport),
        auctionAndBrokerFeesCad=round(auction_fees),
        customsTaxableValueCad=round(customs_taxable_value),
        customsAndTaxesCad=round(customs_taxes),
        landedCostCad=round(landed_cost),
        landedCostLocal=round(landed_cost_local),
        localCurrencyCode=local_currency,
        effectiveFxRate=effective_rate,
        baseFxRate=base_rate
    )

    return CalculationResponse(
        id=f"sim_{int(time.time())}",
        createdAt=str(time.time()),
        isEligible=is_eligible,
        eligibilityMessage=message,
        eligibilitySeverity=severity,
        breakdown=breakdown,
        targetMarginPercent=req.targetMarginPercent,
        suggestedSalePriceCad=round(suggested_sale_cad),
        suggestedSalePriceLocal=round(suggested_sale_local),
        estimatedNetProfitCad=round(net_profit_cad),
        estimatedNetProfitLocal=round(net_profit_local),
        estimatedRoiPercent=round(roi_percent, 1)
    )
