import json
import os
from typing import Any, Dict, List
from urllib.parse import urlencode
from urllib.request import Request, urlopen


PORT_COORDINATES = {
    "Montreal": [45.5017, -73.5673], "Port de Montréal (QC)": [45.5017, -73.5673],
    "Halifax": [44.6488, -63.5752], "Port d'Halifax (NS)": [44.6488, -63.5752],
    "Dakar": [14.7167, -17.4677], "Port Autonome de Dakar": [14.7167, -17.4677],
    "Casablanca": [33.5731, -7.5898], "Port de Casablanca": [33.5731, -7.5898],
    "Tanger Med": [35.8909, -5.5026],
}
PORT_UNLOCODES = {
    "Montreal": "CAMTR", "Port de Montréal (QC)": "CAMTR",
    "Halifax": "CAHAL", "Port d'Halifax (NS)": "CAHAL",
    "Dakar": "SNDKR", "Port Autonome de Dakar": "SNDKR",
    "Casablanca": "MACAS", "Port de Casablanca": "MACAS", "Tanger Med": "MAPTM",
}


def _json_response(request, timeout=8):
    with urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode())


class ProviderAdapter:
    name = "Provider"
    configured = False

    def quote(self, route: Dict[str, Any], vehicle_count: int) -> List[Dict[str, Any]]:
        return []


class FreightosAdapter(ProviderAdapter):
    """Freightos shippingCalculator marketplace integration."""
    name = "Freightos"
    public_endpoint = "https://ship.freightos.com/api/shippingCalculator"
    fx_endpoint = "https://open.er-api.com/v6/latest/USD"

    def __init__(self):
        self.api_key = os.getenv("FREIGHTOS_API_KEY")
        self.base_url = os.getenv("FREIGHTOS_BASE_URL")
        self.configured = bool(self.api_key)

    @staticmethod
    def _records(payload):
        if not isinstance(payload, dict):
            return []
        for key in ("quotes", "offers", "results", "data"):
            value = payload.get(key)
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]
            if isinstance(value, dict):
                nested = FreightosAdapter._records(value)
                if nested:
                    return nested
        return [payload] if any(key in payload for key in ("price", "amount", "total")) else []

    @staticmethod
    def _public_records(payload):
        rates = payload.get("response", {}).get("estimatedFreightRates") if isinstance(payload, dict) else None
        if not isinstance(rates, dict) or int(rates.get("numQuotes") or 0) < 1:
            return []
        modes = rates.get("mode")
        return [item for item in (modes if isinstance(modes, list) else [modes]) if isinstance(item, dict)]

    @staticmethod
    def _amount(record):
        value = next((record.get(key) for key in ("total", "price", "amount")
                      if isinstance(record.get(key), (int, float))), None)
        return float(value) if value is not None and value >= 0 else None

    def _usd_to_cad(self):
        data = _json_response(self.fx_endpoint, timeout=4)
        rate = data.get("rates", {}).get("CAD") if isinstance(data, dict) else None
        return float(rate) if isinstance(rate, (int, float)) and rate > 0 else None

    def quote(self, route, vehicle_count):
        if route["mode"] not in ("fcl", "conteneur_complet"):
            return []
        origin, destination = PORT_UNLOCODES.get(route["originPort"]), PORT_UNLOCODES.get(route["destinationPort"])
        if not origin or not destination:
            return []
        params = {"loadtype": "container40", "weight": max(1, vehicle_count) * 1500,
                  "origin": origin, "destination": destination, "quantity": 1}
        endpoint = self.public_endpoint
        if self.base_url:
            configured = self.base_url.rstrip("/")
            endpoint = configured if configured.endswith("/shippingCalculator") else configured + "/api/shippingCalculator"
        if self.api_key:
            params["apiKey"] = self.api_key
        payload = _json_response(endpoint + "?" + urlencode(params), timeout=8)
        results, usd_rate = [], None
        records = self._public_records(payload) or self._records(payload)
        for record in records:
            price = record.get("price")
            if isinstance(price, dict):
                min_money = price.get("min", {}).get("moneyAmount", {})
                max_money = price.get("max", {}).get("moneyAmount", {})
                original_low = min_money.get("amount")
                original_high = max_money.get("amount")
                try:
                    original_low, original_high = float(original_low), float(original_high)
                except (TypeError, ValueError):
                    continue
                currency = str(min_money.get("currency") or max_money.get("currency") or "USD").upper()
            else:
                amount = self._amount(record)
                if amount is None:
                    continue
                original_low = original_high = amount
                currency = str(record.get("currency", payload.get("currency", "USD"))).upper()
            if original_low <= 0 or original_high <= 0 or currency not in ("CAD", "USD"):
                continue
            conversion = 1.0
            if currency == "USD":
                usd_rate = usd_rate or self._usd_to_cad()
                if not usd_rate:
                    return []  # A conversion failure must never become an estimated CAD price.
                conversion = usd_rate
            low_cad = round(original_low * conversion)
            high_cad = round(original_high * conversion)
            quote_id = record.get("quoteId") or record.get("quote_id")
            binding = bool(record.get("binding") or record.get("isBinding"))
            if self.api_key and quote_id and binding:
                status = "carrier_quote" if record.get("carrier") or record.get("carrierName") else "partner_rate"
            else:
                status = "marketplace_estimate"
            transit = record.get("transitTimes") if isinstance(record.get("transitTimes"), dict) else {}
            transit_min = transit.get("min") or record.get("transitTime") or record.get("transitDays")
            transit_max = transit.get("max") or transit_min
            results.append({"amountCad": round((low_cad + high_cad) / 2),
                            "lowCad": low_cad, "highCad": high_cad,
                            "currency": currency, "originalLow": original_low, "originalHigh": original_high,
                            "estimatedDaysMin": transit_min, "estimatedDaysMax": transit_max,
                            "carrierName": record.get("carrierName") or record.get("carrier"),
                            "status": status, "sourceUrl": endpoint,
                            "attribution": "Freightos shippingCalculator"})
        return results


class SeaRatesAdapter(ProviderAdapter):
    name = "SeaRates"
    endpoint = "https://www.searates.com/graphql_rates"

    def __init__(self):
        self.api_key = os.getenv("SEARATES_API_KEY")
        self.configured = bool(self.api_key)

    def quote(self, route, vehicle_count):
        if not self.configured or route["mode"] not in ("fcl", "conteneur_complet"):
            return []
        origin, destination = PORT_COORDINATES.get(route["originPort"]), PORT_COORDINATES.get(route["destinationPort"])
        if not origin or not destination:
            return []
        query = """query { shipment: fcl(ST40: 1, from: [%s, %s], to: [%s, %s], currency: CAD) {
          shipmentId freight: oceanFreight { price transitTime shippingLine } } }""" % (
            origin[0], origin[1], destination[0], destination[1])
        request = Request(self.endpoint, data=json.dumps({"query": query}).encode(), headers={
            "Authorization": "Bearer " + self.api_key, "Content-Type": "application/json"})
        data = _json_response(request, timeout=8)
        shipment = data.get("data", {}).get("shipment") if isinstance(data, dict) else None
        freight = shipment.get("freight") if isinstance(shipment, dict) else None
        records = freight if isinstance(freight, list) else [freight]
        results = []
        for item in records:
            if not isinstance(item, dict) or not isinstance(item.get("price"), (int, float)):
                continue
            price, transit = item["price"], item.get("transitTime")
            results.append({"amountCad": price, "lowCad": price, "highCad": price, "currency": "CAD",
                            "originalLow": price, "originalHigh": price, "estimatedDaysMin": transit,
                            "estimatedDaysMax": transit, "carrierName": item.get("shippingLine"),
                            "status": "marketplace_estimate", "sourceUrl": self.endpoint,
                            "attribution": "SeaRates FCL rate"})
        return results


def active_adapters() -> List[ProviderAdapter]:
    freightos, searates = FreightosAdapter(), SeaRatesAdapter()
    return [freightos] + ([searates] if searates.configured else [])