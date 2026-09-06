import time
import math
import os
import json
import base64
import logging
import urllib.request
import urllib.error
from typing import Dict, Any
from fastapi import FastAPI, HTTPException, File, Form, UploadFile
from fastapi.responses import JSONResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from backend.schemas import CalculationRequest, CalculationResponse, CostBreakdownResponse, VoiceParseResponse, VoiceSpeakRequest

load_dotenv()  # populate os.environ from repo-root .env (uvicorn/concurrently do not do this)

voice_log = logging.getLogger("voice")
voice_log.info(
    "voice: GEMINI_API_KEY %s (set it in .env, then restart the server)",
    "configured" if os.environ.get("GEMINI_API_KEY", "").strip() else "MISSING",
)


def _resolve_gemini_auth():
    """Return (extra_headers, mode) for Gemini calls.

    Prefers a legacy AIza API key; falls back to gcloud ADC OAuth, which
    covers accounts that can only mint new AQ. keys (rejected as ?key=).
    Raises RuntimeError with a human-readable cause when neither works.
    """
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if key.startswith("AIza"):
        return ({"x-goog-api-key": key}, "api-key")
    try:
        import google.auth
        from google.auth.transport import requests as google_requests
    except ImportError:
        raise RuntimeError("no AIza key and google-auth is missing (run: pip install -r backend/requirements.txt)")
    try:
        creds, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
        creds.refresh(google_requests.Request())
    except Exception as e:
        raise RuntimeError(
            "no usable auth: set a legacy AIza GEMINI_API_KEY in .env or run "
            "'gcloud auth application-default login' (%s)" % type(e).__name__
        )
    return ({"Authorization": "Bearer " + creds.token}, "oauth-adc")

CURRENT_YEAR = 2026

app = FastAPI(
    title="AutoTransat QC API",
    description="API de calcul de rentabilité pour l'exportation de véhicules Québec -> Maroc & Sénégal",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
VOICE_GEMINI_TIMEOUT_S = 25


def _call_gemini_audio_parse(auth_headers, audio_bytes: bytes, mime_type: str, current_step: int, known_json: str) -> Dict[str, Any]:
    catalog_str = ", ".join(VOICE_CATALOG_BRANDS)
    system_prompt = (
        "You are a form filler for Quebec car export. English only. "
        f"Step-1 fields: brand, model, year int 2000-{CURRENT_YEAR}, purchasePriceCad int, mileageKm int, category enum. "
        "Also detect future: destination senegal|maroc + transport hints. "
        "Numbers-words to ints. Last value wins per field. "
        f"Brand normalization: map the heard brand to the closest entry of the catalog [{catalog_str}]; "
        "if no close match return raw string with confidence<=0.5 and do NOT invent a model. "
        "Never return a model without a matched brand. "
        "known_json contains confirmed[]. Fields at defaults and absent from confirmed MUST be listed "
        "in missing_for_current_step as confirm prompts. "
        "Return ONLY JSON {updates, confidence 0-1, transcript, missing_for_current_step, next_prompt, future_hits}."
    )
    audio_b64 = base64.b64encode(audio_bytes).decode("ascii")
    payload = {
        "system_instruction": {"parts": [{"text": system_prompt}]},
        "contents": [
            {
                "parts": [
                    {"text": f"current_step={current_step} known_json={known_json}"},
                    {"inlineData": {"mimeType": mime_type, "data": audio_b64}},
                ]
            }
        ],
        "generationConfig": {"temperature": 0.2, "responseMimeType": "application/json"},
    }
    # Auth: x-goog-api-key header (legacy AIza keys) or Bearer token (gcloud
    # ADC OAuth, covers accounts stuck with AQ. keys). Key/token never logged.
    url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url, data=body,
        headers={"Content-Type": "application/json", **auth_headers},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=VOICE_GEMINI_TIMEOUT_S) as resp:
            raw_body = resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Gemini HTTP {e.code}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"Gemini network error: {type(e).__name__}")
    except Exception as e:
        if type(e).__name__ == "TimeoutError" or "timed out" in str(e).lower():
            raise RuntimeError("Gemini timeout")
        raise RuntimeError(f"Gemini request failed: {type(e).__name__}")
    try:
        outer = json.loads(raw_body)
        text = outer["candidates"][0]["content"]["parts"][0]["text"]
    except Exception:
        raise RuntimeError("Gemini bad response shape")
    text = text.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    try:
        return json.loads(text)
    except Exception:
        raise RuntimeError("Gemini non-JSON reply")


@app.post("/api/voice/parse-audio", response_model=VoiceParseResponse)
async def voice_parse_audio(
    audio: UploadFile = File(...),
    current_step: int = Form(default=1),
    known_json: str = Form(default="{}"),
):
    try:
        auth_headers, auth_mode = _resolve_gemini_auth()
    except RuntimeError as e:
        voice_log.warning("parse-audio 503: %s", str(e)[:160])
        return JSONResponse(status_code=503, content={"error": str(e)[:200], "retryable": False})
    data = await audio.read()
    if len(data) == 0:
        voice_log.warning("parse-audio 400: received empty audio chunk")
        return JSONResponse(status_code=400, content={"error": "empty audio", "retryable": False})
    if len(data) > VOICE_MAX_AUDIO_BYTES:
        voice_log.warning("parse-audio 413: audio chunk too large (%d bytes, max %d)", len(data), VOICE_MAX_AUDIO_BYTES)
        return JSONResponse(status_code=413, content={"error": "audio too large (max ~2MB)", "retryable": False})
    mime_type = audio.content_type or "audio/webm"
    try:
        parsed = _call_gemini_audio_parse(auth_headers, data, mime_type, current_step, known_json)
    except RuntimeError as e:
        voice_log.warning("parse-audio 502: Gemini call failed (%s) - chunk %d bytes, step %d", str(e)[:120], len(data), current_step)
        return JSONResponse(status_code=502, content={"error": str(e)[:160], "retryable": True})
    except Exception:
        voice_log.warning("parse-audio 502: unexpected failure before validation - chunk %d bytes", len(data))
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
        missing = [str(x) for x in missing]
        next_prompt = parsed.get("next_prompt", "")
        if not isinstance(next_prompt, str):
            next_prompt = str(next_prompt)
        future_hits = parsed.get("future_hits", [])
        if not isinstance(future_hits, list):
            raise ValueError("invalid future_hits shape")
        future_hits = [str(x) for x in future_hits]
    except ValueError as e:
        voice_log.warning("parse-audio 502: Gemini reply failed validation (%s)", str(e)[:120])
        return JSONResponse(status_code=502, content={"error": str(e)[:160], "retryable": True})
    voice_log.info(
        "parse-audio 200: conf=%.2f updated=[%s] missing=%d transcript=%.120s",
        confidence, ",".join(sorted(updates.keys())), len(missing), transcript,
    )
    return VoiceParseResponse(
        updates=updates,
        confidence=confidence,
        transcript=transcript,
        missing_for_current_step=missing,
        next_prompt=next_prompt,
        future_hits=future_hits,
    )


def _call_gemini_tts(auth_headers, text: str, voice: str) -> bytes:
    payload = {
        "contents": [{"parts": [{"text": text}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice or "Kore"}}},
        },
    }
    url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-tts:generateContent"
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url, data=body,
        headers={"Content-Type": "application/json", **auth_headers},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=VOICE_GEMINI_TIMEOUT_S) as resp:
            raw_body = resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Gemini HTTP {e.code}")
    except urllib.error.URLError:
        raise RuntimeError("Gemini network error")
    except Exception as e:
        if type(e).__name__ == "TimeoutError" or "timed out" in str(e).lower():
            raise RuntimeError("Gemini timeout")
        raise RuntimeError(f"Gemini request failed: {type(e).__name__}")
    try:
        outer = json.loads(raw_body)
        parts = outer["candidates"][0]["content"]["parts"]
        audio_b64 = next(
            p["inlineData"]["data"]
            for p in parts
            if isinstance(p, dict) and isinstance(p.get("inlineData"), dict) and p["inlineData"].get("data")
        )
    except Exception:
        raise RuntimeError("Gemini bad response shape")
    try:
        return base64.b64decode(audio_b64)
    except Exception:
        raise RuntimeError("Gemini bad audio payload")


@app.post("/api/voice/speak")
async def voice_speak(req: VoiceSpeakRequest):
    text = (req.text or "").strip()
    if not text or len(text) > 280:
        voice_log.warning("speak 400: text length %d (must be 1..280 chars)", len(text))
        return JSONResponse(status_code=400, content={"error": "text must be 1..280 chars", "retryable": False})
    try:
        auth_headers, auth_mode = _resolve_gemini_auth()
    except RuntimeError as e:
        voice_log.warning("speak 503: %s", str(e)[:160])
        return JSONResponse(status_code=503, content={"error": str(e)[:200], "retryable": False})
    try:
        audio_bytes = _call_gemini_tts(auth_headers, text, req.voice)
    except RuntimeError as e:
        voice_log.warning("speak 502: Gemini TTS failed (%s) - text %d chars", str(e)[:120], len(text))
        return JSONResponse(status_code=502, content={"error": str(e)[:160], "retryable": True})
    except Exception:
        voice_log.warning("speak 502: unexpected TTS failure - text %d chars", len(text))
        return JSONResponse(status_code=502, content={"error": "voice speak failed", "retryable": True})
    voice_log.info("speak 200: %d chars -> %d audio bytes (voice=%s)", len(text), len(audio_bytes), req.voice)
    return Response(content=audio_bytes, media_type="audio/mpeg")
