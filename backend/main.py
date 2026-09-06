import os
import time
import json
import math
import logging
import urllib.request
import urllib.error
from datetime import datetime, timezone
from typing import Dict, Any
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from fastapi import FastAPI, HTTPException, File, Form, UploadFile
from fastapi.responses import JSONResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from backend.schemas import CalculationRequest, CalculationResponse, CostBreakdownResponse, VoiceParseResponse, VoiceClientEvent
from backend.freight.routes import router as freight_router

from pathlib import Path

_BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(_BASE_DIR / ".env")  # explicit path: works whatever the uvicorn cwd is
load_dotenv()  # fallback: also honour cwd .env / actual environment


def _clean_api_key(raw: str) -> str:
    """Strip whitespace AND surrounding quotes (.env pitfalls: KEY="...")."""
    key = (raw or "").strip()
    if len(key) >= 2 and key[0] == key[-1] and key[0] in ("'", '"'):
        key = key[1:-1].strip()
    return key


def _key_hint(key: str) -> str:
    """Startup presence hint. Never leaks key material (no length, no prefix)."""
    return "configured" if key else "MISSING"


voice_log = logging.getLogger("voice")
voice_log.info(
    "voice: GROQ_API_KEY (parse) %s (get one at https://console.groq.com/keys, set it in .env, then restart)",
    _key_hint(_clean_api_key(os.environ.get("GROQ_API_KEY", ""))),
)
voice_log.info(
    "voice: TTS is local (Web Speech API in the browser) — no TTS key needed",
)


VOICE_DEBUG_LOG = _BASE_DIR / "logs" / "voice-debug.txt"


def _voice_debug(msg: str) -> None:
    """Append one line to logs/voice-debug.txt for voice troubleshooting.

    Append-only by design: the app NEVER truncates, rotates or deletes this
    file — the user clears it manually (open it, select all, delete, save,
    or delete the file; it is recreated on the next voice event).
    Logging must never break a request: every failure is swallowed.
    Never pass key material here.
    """
    try:
        VOICE_DEBUG_LOG.parent.mkdir(parents=True, exist_ok=True)
        stamp = time.strftime("%Y-%m-%d %H:%M:%S")
        with open(VOICE_DEBUG_LOG, "a", encoding="utf-8") as f:
            f.write(f"{stamp} {msg}\n")
    except Exception:
        pass


CURRENT_YEAR = 2026
FX_API_URL = "https://open.er-api.com/v6/latest/CAD"
FX_CACHE_TTL_SECONDS = 15 * 60
_fx_cache: Dict[str, Any] = {"payload": None, "expiresAt": 0.0}

app = FastAPI(
    title="QCar export API",
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
        "app": "QCar export API",
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


def _fetch_market_fx_rates(force_refresh: bool = False) -> Dict[str, Any]:
    now = time.time()
    cached = _fx_cache.get("payload")
    if not force_refresh and cached and now < _fx_cache["expiresAt"]:
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
def get_fx_rates(refresh: bool = False):
    """Return the latest published CAD market rates for both destination currencies."""
    return _fetch_market_fx_rates(force_refresh=refresh)


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


VOICE_CATALOG_BRANDS = [
    "Acura", "Audi", "BMW", "Chevrolet", "Ford", "Honda", "Hyundai",
    "Jeep", "Kia", "Lexus", "Mazda", "Mercedes-Benz", "Mitsubishi",
    "Nissan", "Subaru", "Tesla", "Toyota", "Volkswagen", "Volvo",
]
VOICE_MAX_AUDIO_BYTES = 2 * 1024 * 1024

# ---- Groq voice parse (STT + LLM). TTS is local (browser Web Speech API). ----
# No SDK needed: Groq exposes an OpenAI-compatible REST API, called here
# with stdlib urllib so no extra dependency is required at runtime.
GROQ_STT_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions"
# Cloudflare in front of api.groq.com rejects stdlib's default
# "Python-urllib/..." UA (HTTP 403 error 1010) — identify properly.
GROQ_USER_AGENT = "AutoTransatQC-voice/1.0 (Python-urllib)"
GROQ_STT_MODEL = "whisper-large-v3-turbo"
GROQ_LLM_MODEL = "openai/gpt-oss-120b"
GROQ_LLM_FALLBACK_MODEL = "openai/gpt-oss-20b"
VOICE_GROQ_STT_TIMEOUT_S = 10
VOICE_GROQ_LLM_TIMEOUT_S = 12
# Whisper hallucinates these on near-silent chunks; treat as "heard nothing".
VOICE_STT_NOISE_PHRASES = frozenset({
    "thank you", "thanks for watching", "subtitles by", "thank you for watching",
    "music", "bye", "hello", "oh", "ah",
})


def _resolve_groq_auth():
    """Return (extra_headers, mode) for Groq STT+LLM calls.

    Reads GROQ_API_KEY (console.groq.com/keys, starts with gsk_).
    Raises RuntimeError with a human-readable cause when missing.
    """
    key = _clean_api_key(os.environ.get("GROQ_API_KEY", ""))
    if key:
        return ({"Authorization": "Bearer " + key}, "groq-api-key")
    raise RuntimeError(
        "no usable auth: set GROQ_API_KEY (from https://console.groq.com/keys "
        "in the repo-root .env, no quotes, then restart uvicorn)"
    )


def _encode_multipart(fields: Dict[str, str], filename: str, file_bytes: bytes, file_mime: str):
    """Build a multipart/form-data body with stdlib only. Returns (body, content_type)."""
    boundary = "----voice%d" % int(time.time() * 1000)
    buf = bytearray()
    for name, value in fields.items():
        buf += ("--%s\r\nContent-Disposition: form-data; name=\"%s\"\r\n\r\n%s\r\n" % (boundary, name, value)).encode("utf-8")
    buf += (
        "--%s\r\nContent-Disposition: form-data; name=\"file\"; filename=\"%s\"\r\nContent-Type: %s\r\n\r\n"
        % (boundary, filename, file_mime)
    ).encode("utf-8")
    buf += file_bytes
    buf += ("\r\n--%s--\r\n" % boundary).encode("utf-8")
    return (bytes(buf), "multipart/form-data; boundary=%s" % boundary)


def _groq_post_json(url: str, auth_headers, payload: Dict[str, Any], timeout_s: int, label: str) -> Dict[str, Any]:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url, data=body,
        headers={"Content-Type": "application/json", "User-Agent": GROQ_USER_AGENT, **auth_headers},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            return json.loads(resp.read().decode("utf-8", errors="replace"))
    except urllib.error.HTTPError as e:
        try:
            detail = e.read().decode("utf-8", errors="replace")[:300]
        except Exception:
            detail = ""
        raise RuntimeError(f"Groq {label} HTTP {e.code} {detail.strip()}"[:320])
    except urllib.error.URLError as e:
        raise RuntimeError(f"Groq {label} network error: {type(e).__name__}")
    except Exception as e:
        if type(e).__name__ == "TimeoutError" or "timed out" in str(e).lower():
            raise RuntimeError(f"Groq {label} timeout")
        raise RuntimeError(f"Groq {label} request failed: {type(e).__name__}")


def _call_groq_stt(auth_headers, audio_bytes: bytes, mime_type: str) -> str:
    """Transcribe a webm chunk with Whisper. Returns raw transcript text (may be '')."""
    catalog_str = ", ".join(VOICE_CATALOG_BRANDS)
    fields = {
        "model": GROQ_STT_MODEL,
        "language": "en",
        "temperature": "0",
        "response_format": "json",
        # Hint proper nouns so brands/prices transcribe correctly (max 224 tokens).
        "prompt": "Car export form dictation in English. Brands: %s. "
        "Fields: year, purchase price in Canadian dollars, mileage in kilometers." % catalog_str,
    }
    body, content_type = _encode_multipart(fields, "chunk.webm", audio_bytes, mime_type or "audio/webm")
    req = urllib.request.Request(
        GROQ_STT_URL, data=body,
        headers={"Content-Type": content_type, "User-Agent": GROQ_USER_AGENT, **auth_headers},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=VOICE_GROQ_STT_TIMEOUT_S) as resp:
            outer = json.loads(resp.read().decode("utf-8", errors="replace"))
    except urllib.error.HTTPError as e:
        try:
            detail = e.read().decode("utf-8", errors="replace")[:300]
        except Exception:
            detail = ""
        raise RuntimeError(f"Groq STT HTTP {e.code} {detail.strip()}"[:320])
    except urllib.error.URLError as e:
        raise RuntimeError(f"Groq STT network error: {type(e).__name__}")
    except Exception as e:
        if type(e).__name__ == "TimeoutError" or "timed out" in str(e).lower():
            raise RuntimeError("Groq STT timeout")
        raise RuntimeError(f"Groq STT request failed: {type(e).__name__}")
    try:
        text = outer.get("text", "")
        return text if isinstance(text, str) else str(text)
    except Exception:
        raise RuntimeError("Groq STT bad response shape")


# Dotted field names the frontend apply-paths understand (App.tsx
# handleVoiceChunk). missing_for_current_step MUST only contain these.
VOICE_FIELD_PATHS = (
    "vehicle.brand",
    "vehicle.model",
    "vehicle.year",
    "vehicle.purchasePriceCad",
    "vehicle.mileageKm",
    "vehicle.category",
    "destination",
    "transport.routeId",
    "transport.batchVehiclesCount",
    "customs.country",
    "customs.valuationBasis",
)

# Flat vehicle keys the LLM sometimes returns at updates top level.
# The normalizer wraps them into updates.vehicle (see _normalize_voice_updates).
VOICE_FLAT_VEHICLE_KEYS = (
    "brand",
    "model",
    "year",
    "purchasePriceCad",
    "mileageKm",
    "category",
)


def _call_groq_llm(auth_headers, transcript: str, current_step: int, known_json: str, model: str) -> Dict[str, Any]:
    """Extract the form-filler JSON from a transcript. json_object mode + Pydantic validation downstream."""
    catalog_str = ", ".join(VOICE_CATALOG_BRANDS)
    system_prompt = (
        "You are a form filler for Quebec car export. English only. Respond with a JSON object. "
        "updates MUST be NESTED exactly like this example (no flat top-level brand/model/year keys): "
        '{"vehicle": {"brand": "Honda", "model": "Civic", "year": 2005, '
        '"purchasePriceCad": 4500, "mileageKm": 150000, "category": "berline"}, '
        '"destination": "senegal", '
        '"transport": {"routeId": "mtl-dkr-roro", "batchVehiclesCount": 1}, '
        '"customs": {"country": "senegal", "valuationBasis": "invoice"}}. '
        "Omit any sub-object with no heard value (or return it empty). "
        f"Step-1 fields: brand, model, year int 2000-{CURRENT_YEAR}, purchasePriceCad int, mileageKm int, "
        "category enum (citadine|berline|suv|camionnette). "
        "Also detect future: destination senegal|maroc + transport hints. "
        "Numbers-words to ints. Last value wins per field. "
        f"Brand normalization: map the heard brand to the closest entry of the catalog [{catalog_str}]; "
        "if no close match return raw string with confidence<=0.5 and do NOT invent a model. "
        "Never return a model without a matched brand. "
        "known_json contains confirmed[]. Fields at defaults and absent from confirmed MUST be listed "
        "in missing_for_current_step as confirm prompts. "
        "NEVER list a field already in confirmed[] as missing. "
        "missing_for_current_step MUST contain ONLY dotted field names from this exact list: "
        "vehicle.brand, vehicle.model, vehicle.year, vehicle.purchasePriceCad, vehicle.mileageKm, "
        "vehicle.category, destination, transport.routeId, transport.batchVehiclesCount, "
        "customs.country, customs.valuationBasis. NEVER full sentences. "
        "missing_for_current_step MUST only contain fields for the CURRENT step "
        "(step 1 = vehicle.* only; step 2 = destination + customs.* only; step 3+ = transport.* only). "
        "Fields for other steps go in future_hits, NEVER in missing_for_current_step. "
        "destination and customs.country are ONE question: ask 'Senegal or Morocco?' once, fill both. "
        "HUMAN QUESTIONS ONLY — never ask the user for an ID, code or enum value: "
        "map the human answer to the code yourself. "
        "Routes (map 'Dakar or Casablanca?' + 'RoRo or container?' to routeId): "
        "mtl-dkr-roro = Montreal to Dakar by RoRo; mtl-casa-roro = Montreal to Casablanca by RoRo. "
        "If the user says container, put 'transport-container' in future_hits (no container route exists yet). "
        "Category mapping (English heard -> enum): sedan->berline, SUV->suv, city car/hatchback->citadine, "
        "pickup/truck->camionnette. "
        "Customs value mapping: 'invoice price'->invoice, 'documented value / Argus'->argus_official. "
        "Always state units and bounds aloud in next_prompt: prices 'in Canadian dollars', "
        "mileage 'in kilometers' (convert miles to km yourself), batch 'from 1 to 4', "
        "year 'between 2000 and 2026'. "
        "next_prompt MUST use plain human words, NEVER dotted field names, IDs or codes, "
        "max 280 characters, 1-2 short sentences. "
        "If the transcript is empty or noise, return updates {} with confidence 0. "
        "Return ONLY a JSON object with keys {updates, confidence, transcript, missing_for_current_step, next_prompt, future_hits}."
    )
    payload = {
        "model": model,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"current_step={current_step} known_json={known_json} transcript={transcript}"},
        ],
    }
    outer = _groq_post_json(GROQ_CHAT_URL, auth_headers, payload, VOICE_GROQ_LLM_TIMEOUT_S, "LLM")
    try:
        text = outer["choices"][0]["message"]["content"]
    except Exception:
        raise RuntimeError("Groq LLM bad response shape")
    if not isinstance(text, str):
        raise RuntimeError("Groq LLM bad response shape")
    _voice_debug(f"[parse] LLM model={model} raw={text.strip()[:800]}")
    text = text.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    try:
        parsed = json.loads(text)
    except Exception:
        raise RuntimeError("Groq LLM non-JSON reply")
    if not isinstance(parsed, dict):
        raise RuntimeError("Groq LLM non-JSON reply")
    # The transcript comes from our STT step, not the LLM: authoritative copy.
    parsed["transcript"] = transcript
    return parsed


def _call_groq_audio_parse(auth_headers, audio_bytes: bytes, mime_type: str, current_step: int, known_json: str) -> Dict[str, Any]:
    """Two-step voice parse: Whisper STT (audio->text) then LLM (text->form JSON)."""
    transcript = _call_groq_stt(auth_headers, audio_bytes, mime_type).strip()
    _voice_debug(f"[parse] STT transcript={transcript[:300]}")
    # Guard: near-silent chunks and known Whisper hallucinations -> "heard nothing",
    # skip the LLM call entirely (saves latency + cost).
    if len(transcript.split()) < 2 or transcript.strip().lower().rstrip(".!") in VOICE_STT_NOISE_PHRASES:
        _voice_debug("[parse] STT noise guard -> empty result, LLM skipped")
        return {
            "updates": {},
            "confidence": 0.0,
            "transcript": transcript,
            "missing_for_current_step": [],
            "next_prompt": "I didn't catch that. Please say it again.",
            "future_hits": [],
        }
    try:
        return _call_groq_llm(auth_headers, transcript, current_step, known_json, GROQ_LLM_MODEL)
    except RuntimeError as e:
        # Partial retry: LLM failed but the transcript is good — replay the LLM
        # step once on the fallback model WITHOUT re-transcribing the audio.
        voice_log.info("parse-audio: primary LLM failed (%s), retrying on %s", str(e)[:100], GROQ_LLM_FALLBACK_MODEL)
        _voice_debug(f"[parse] LLM primary failed ({str(e)[:120]}), retry on {GROQ_LLM_FALLBACK_MODEL}")
        return _call_groq_llm(auth_headers, transcript, current_step, known_json, GROQ_LLM_FALLBACK_MODEL)


# Dotted field path (or bare code word) -> human words for next_prompt.
# next_prompt is displayed in the bubble AND spoken aloud: it must never
# contain IDs, codes or enum values. Longest keys first to avoid partial hits.
VOICE_FIELD_LABELS = {
    "vehicle.purchasePriceCad": "the purchase price in Canadian dollars",
    "transport.batchVehiclesCount": "the number of vehicles shipped together (1 to 4)",
    "transport.routeId": "the transport route (Dakar or Casablanca, RoRo or container)",
    "customs.valuationBasis": "whether customs should use the invoice price or the documented value",
    "vehicle.mileageKm": "the mileage in kilometers",
    "customs.country": "the customs country (Senegal or Morocco)",
    "vehicle.category": "the vehicle type (SUV, sedan, city car or pickup)",
    "vehicle.brand": "the brand",
    "vehicle.model": "the model",
    "vehicle.year": "the vehicle year (2000 to 2026)",
    "destination": "the destination (Senegal or Morocco)",
    "batchVehiclesCount": "the number of vehicles",
    "valuationBasis": "the customs value",
    "argus_official": "the documented value",
    "routeId": "the transport route",
}


def _humanize_prompt(prompt: str) -> str:
    """Replace any leaked internal code with human words. Deterministic
    safety net: the prompt already forbids codes in next_prompt."""
    if not isinstance(prompt, str) or not prompt:
        return prompt
    out = prompt
    for code in sorted(VOICE_FIELD_LABELS, key=len, reverse=True):
        if code in out:
            out = out.replace(code, VOICE_FIELD_LABELS[code])
    return out


# Route IDs the backend /calculate actually knows (derived from DEFAULT_CONFIG
# so this never drifts). A voice-filled routeId outside this set is dropped
# with a debug line instead of breaking the calculation silently.
VOICE_KNOWN_ROUTE_IDS = frozenset(r.get("id", "") for r in DEFAULT_CONFIG.get("routes", []))


# Legacy simple names the LLM sometimes uses in missing_for_current_step.
# Mapped to the dotted paths the frontend understands; anything else is dropped.
VOICE_MISSING_ALIASES = {
    "brand": "vehicle.brand",
    "model": "vehicle.model",
    "year": "vehicle.year",
    "purchasePriceCad": "vehicle.purchasePriceCad",
    "price": "vehicle.purchasePriceCad",
    "mileageKm": "vehicle.mileageKm",
    "mileage": "vehicle.mileageKm",
    "category": "vehicle.category",
    "destination": "destination",
    "routeId": "transport.routeId",
    "batchVehiclesCount": "transport.batchVehiclesCount",
    "country": "destination",
    "valuationBasis": "customs.valuationBasis",
}


def _normalize_voice_updates(parsed: Dict[str, Any]) -> Dict[str, Any]:
    """ coerce an LLM reply into the exact contract handleVoiceChunk reads.

    Safety net for model variance: the prompt already demands NESTED updates
    and dotted missing names, but if the model returns flat top-level vehicle
    keys ({brand, model, ...}) or sentence-style missing entries, they are
    wrapped/mapped here instead of being silently dropped by the frontend
    (which caused the "heard but never filled" loop).
    """
    if not isinstance(parsed, dict):
        return parsed
    updates = parsed.get("updates")
    if isinstance(updates, dict):
        flat = {k: updates.pop(k) for k in VOICE_FLAT_VEHICLE_KEYS if k in updates}
        if flat:
            vehicle = updates.get("vehicle")
            if not isinstance(vehicle, dict):
                vehicle = {}
                updates["vehicle"] = vehicle
            for k, v in flat.items():
                vehicle.setdefault(k, v)
            parsed["updates"] = updates
            _voice_debug(f"[parse] normalized flat updates -> vehicle keys=[{','.join(sorted(flat.keys()))}]")
        # A routeId the calculator doesn't know would break /calculate:
        # drop it loudly instead of letting it through.
        transport = updates.get("transport")
        if isinstance(transport, dict):
            route_id = transport.get("routeId")
            if isinstance(route_id, str) and route_id and route_id not in VOICE_KNOWN_ROUTE_IDS:
                _voice_debug(f"[parse] dropped unknown routeId={route_id}")
                transport.pop("routeId", None)
                if not transport:
                    updates.pop("transport", None)
    missing = parsed.get("missing_for_current_step")
    if isinstance(missing, list):
        valid = set(VOICE_FIELD_PATHS)
        normalized = []
        for item in missing:
            if not isinstance(item, str):
                continue
            key = item.strip()
            if key in valid:
                normalized.append(key)
            elif key in VOICE_MISSING_ALIASES:
                normalized.append(VOICE_MISSING_ALIASES[key])
        if normalized != missing:
            _voice_debug(f"[parse] normalized missing {missing} -> {normalized}")
        parsed["missing_for_current_step"] = normalized
    prompt = parsed.get("next_prompt", "")
    human = _humanize_prompt(prompt)
    if len(human) > 280:
        # Too many missing fields to list: summarize instead of reading a
        # paragraph aloud (the bubble shows details via "Still need" anyway).
        labels = [
            VOICE_FIELD_LABELS.get(m, m).split(" (")[0]
            for m in parsed.get("missing_for_current_step", [])
            if isinstance(m, str)
        ]
        if len(labels) >= 2:
            rest = len(labels) - 2
            human = f"Please provide {labels[0]}, {labels[1]} and {rest} more detail{'s' if rest != 1 else ''}."
        elif len(labels) == 1:
            human = f"Please provide {labels[0]}."
        else:
            human = human[:277] + "..."
        _voice_debug(f"[parse] prompt summarized to {len(human)} chars")
    if human != prompt:
        _voice_debug(f"[parse] humanized prompt {prompt[:200]} -> {human[:200]}")
        parsed["next_prompt"] = human
    return parsed


@app.post("/api/voice/parse-audio", response_model=VoiceParseResponse)
async def voice_parse_audio(
    audio: UploadFile = File(...),
    current_step: int = Form(default=1),
    known_json: str = Form(default="{}"),
):
    try:
        auth_headers, _ = _resolve_groq_auth()
    except RuntimeError as e:
        voice_log.warning("parse-audio 503: %s", str(e)[:160])
        _voice_debug(f"[parse] 503 {str(e)[:160]}")
        return JSONResponse(status_code=503, content={"error": str(e)[:200], "retryable": False})
    data = await audio.read()
    _voice_debug(f"[parse] REQ bytes={len(data)} step={current_step} known={known_json[:300]}")
    if len(data) == 0:
        voice_log.warning("parse-audio 400: received empty audio chunk")
        _voice_debug("[parse] 400 empty audio")
        return JSONResponse(status_code=400, content={"error": "empty audio", "retryable": True})
    if len(data) > VOICE_MAX_AUDIO_BYTES:
        voice_log.warning("parse-audio 413: audio chunk too large (%d bytes, max %d)", len(data), VOICE_MAX_AUDIO_BYTES)
        _voice_debug(f"[parse] 413 too large bytes={len(data)}")
        return JSONResponse(status_code=413, content={"error": "audio too large (max ~2MB)", "retryable": True})
    mime_type = audio.content_type or "audio/webm"
    try:
        parsed = _call_groq_audio_parse(auth_headers, data, mime_type, current_step, known_json)
        parsed = _normalize_voice_updates(parsed)
    except RuntimeError as e:
        # Full provider detail stays in the server log; the client gets a
        # generic message (provider errors can mention model/quota internals).
        voice_log.warning("parse-audio 502: Groq call failed (%s) - chunk %d bytes, step %d", str(e)[:160], len(data), current_step)
        _voice_debug(f"[parse] 502 {str(e)[:200]}")
        return JSONResponse(status_code=502, content={"error": "voice parse failed", "retryable": True})
    except Exception:
        voice_log.warning("parse-audio 502: unexpected failure before validation - chunk %d bytes", len(data))
        _voice_debug("[parse] 502 unexpected failure before validation")
        return JSONResponse(status_code=502, content={"error": "voice parse failed", "retryable": True})
    try:
        if not isinstance(parsed, dict):
            raise ValueError("invalid shape")
        updates = parsed.get("updates", {})
        if not isinstance(updates, dict):
            raise ValueError("invalid updates shape")
        try:
            confidence = float(parsed.get("confidence", 0.0))
        except (TypeError, ValueError):
            raise ValueError("invalid confidence shape")
        if not math.isfinite(confidence):
            confidence = 0.0
        confidence = max(0.0, min(1.0, confidence))
        transcript = parsed.get("transcript", "")
        if not isinstance(transcript, str):
            transcript = str(transcript)
        missing = parsed.get("missing_for_current_step", [])
        if not isinstance(missing, list):
            raise ValueError("invalid missing shape")
        missing = [x for x in missing if isinstance(x, str)]
        next_prompt = parsed.get("next_prompt", "")
        if not isinstance(next_prompt, str):
            next_prompt = str(next_prompt)
        future_hits = parsed.get("future_hits", [])
        if not isinstance(future_hits, list):
            raise ValueError("invalid future_hits shape")
        future_hits = [x for x in future_hits if isinstance(x, str)]
    except ValueError as e:
        voice_log.warning("parse-audio 502: Groq reply failed validation (%s)", str(e)[:120])
        _voice_debug(f"[parse] 502 validation failed ({str(e)[:120]})")
        return JSONResponse(status_code=502, content={"error": str(e)[:160], "retryable": True})
    voice_log.info(
        "parse-audio 200: conf=%.2f updated=[%s] missing=%d transcript=%.120s",
        confidence, ",".join(sorted(updates.keys())), len(missing), transcript,
    )
    _voice_debug(
        f"[parse] 200 conf={confidence:.2f} updated=[{','.join(sorted(updates.keys()))}] "
        f"missing={missing} transcript={transcript[:200]} next={next_prompt[:150]}"
    )
    return VoiceParseResponse(
        updates=updates,
        confidence=confidence,
        transcript=transcript,
        missing_for_current_step=missing,
        next_prompt=next_prompt,
        future_hits=future_hits,
    )


@app.post("/api/voice/client-event")
async def voice_client_event(ev: VoiceClientEvent):
    """Append a frontend voice decision to logs/voice-debug.txt.

    Fire-and-forget from the browser: shows why a heard chunk did or did
    not fill fields (gate, freeze, applied paths...). Detail is capped so a
    runaway client cannot fill the disk. Never cleared server-side.
    """
    kind = (ev.kind or "event")[:40]
    detail = (ev.detail or "")[:2000]
    _voice_debug(f"[frontend:{kind}] {detail}")
    return {"ok": True}
