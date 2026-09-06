from datetime import datetime, timedelta, timezone
from uuid import uuid4
from typing import Any, Dict, Iterable, List

from .providers import active_adapters
from .repository import FreightRepository, utc_now

TARGET_EXTERNAL_OFFERS = 2
TARGET_COVERAGE_PERCENT = 95
COUNTABLE_STATUSES = frozenset({"carrier_quote", "partner_rate"})
PUBLIC_RFQ_CHANNELS = [
    {
        "provider": "Wallenius Wilhelmsen",
        "modes": ["roro"],
        "url": "https://www.walleniuswilhelmsen.com/rate-request",
        "channelType": "official_carrier_form",
        "label": "Demander un tarif au transporteur",
    },
    {
        "provider": "IMS Shipping",
        "modes": ["roro", "conteneur_complet", "conteneur_partage"],
        "url": "https://www.ims-shipping.com/contact",
        "channelType": "freight_forwarder_form",
        "label": "Demander un devis Afrique",
    },
    {
        "provider": "Globy",
        "modes": ["conteneur_complet", "conteneur_partage"],
        "url": "https://globy.com/freight-calculator",
        "channelType": "public_marketplace",
        "label": "Rechercher un tarif conteneur",
    },
]
KNOWN_ROUTE_MATRIX = [
    {"id": "mtl-dkr-roro", "originPort": "Port de Montréal (QC)", "destinationPort": "Port Autonome de Dakar", "mode": "roro"},
    {"id": "hal-dkr-roro", "originPort": "Port d'Halifax (NS)", "destinationPort": "Port Autonome de Dakar", "mode": "roro"},
    {"id": "mtl-dkr-cont40", "originPort": "Port de Montréal (QC)", "destinationPort": "Port Autonome de Dakar", "mode": "conteneur_complet"},
    {"id": "mtl-casa-roro", "originPort": "Port de Montréal (QC)", "destinationPort": "Port de Casablanca", "mode": "roro"},
    {"id": "hal-tanger-roro", "originPort": "Port d'Halifax (NS)", "destinationPort": "Tanger Med", "mode": "roro"},
    {"id": "mtl-casa-cont40", "originPort": "Port de Montréal (QC)", "destinationPort": "Port de Casablanca", "mode": "conteneur_complet"},
]


class FreightService:
    def __init__(self, repository: FreightRepository, adapters=None):
        self.repository = repository
        self.adapters = adapters if adapters is not None else active_adapters()

    def _normalise(self, raw, route, provider):
        fields = ("amountCad", "lowCad", "highCad", "currency", "originalLow", "originalHigh")
        if not isinstance(raw, dict) or not all(key in raw for key in fields):
            return None
        if not all(isinstance(raw[key], (int, float)) for key in fields if key != "currency"):
            return None
        retrieved_at = raw.get("retrievedAt")
        valid_until = raw.get("validUntil")
        return {"id": "offer_" + uuid4().hex, "routeId": route["id"], "provider": provider,
                "carrierName": raw.get("carrierName"), "status": raw.get("status", "available"),
                **{key: raw[key] for key in fields}, "estimatedDaysMin": raw.get("estimatedDaysMin"),
                "estimatedDaysMax": raw.get("estimatedDaysMax"), "retrievedAt": retrieved_at or utc_now(),
                "validUntil": valid_until,
                "sourceUrl": raw.get("sourceUrl", ""), "attribution": raw.get("attribution", provider),
                "inclusions": raw.get("inclusions", []), "exclusions": raw.get("exclusions", []),
                "components": raw.get("components", {}), "confidence": raw.get("confidence", 0.7),
                "providerQuoteId": raw.get("providerQuoteId")}

    @staticmethod
    def _is_bankable(offer):
        if offer.get("status") not in COUNTABLE_STATUSES:
            return False
        if not offer.get("providerQuoteId") and not offer.get("sourceUrl"):
            return False
        try:
            retrieved = datetime.fromisoformat(offer["retrievedAt"].replace("Z", "+00:00"))
            expires = datetime.fromisoformat(offer["validUntil"].replace("Z", "+00:00"))
            if retrieved.tzinfo is None:
                retrieved = retrieved.replace(tzinfo=timezone.utc)
            if expires.tzinfo is None:
                expires = expires.replace(tzinfo=timezone.utc)
            return retrieved <= datetime.now(timezone.utc) < expires
        except (AttributeError, KeyError, TypeError, ValueError):
            return False

    @staticmethod
    def _dedupe(offers):
        selected = {}
        for offer in offers:
            selected.setdefault((offer["provider"], offer["routeId"], offer["status"]), offer)
        return list(selected.values())

    def compare(self, routes: List[Dict[str, Any]], vehicle_count: int) -> Dict[str, Any]:
        live, statuses = [], []
        for adapter in self.adapters:
            adapter_status = "unavailable"
            message = "No current quote returned"
            for route in routes:
                try:
                    results = adapter.quote(route, vehicle_count)
                    valid = [self._normalise(item, route, adapter.name) for item in results]
                    valid = [item for item in valid if item]
                    for offer in valid:
                        if not self._is_bankable(offer):
                            continue
                        self.repository.save_offer(offer, route)
                    live.extend(valid)
                    if valid:
                        adapter_status = "available"
                        message = "Current quote retrieved"
                except Exception as exc:
                    self.repository.observe(adapter.name, "error", route["id"], str(exc)[:200])
                    adapter_status = "error"
                    message = "Provider request failed"
            statuses.append({"provider": adapter.name, "status": adapter_status, "message": message})
            self.repository.observe(adapter.name, adapter_status, detail=message)
        offers = self._dedupe(live)
        live_keys = {(item["provider"], item["routeId"], item["status"]) for item in offers}
        for route in routes:
            for stored in self.repository.current_offers(route["id"]):
                key = (stored["provider"], stored["routeId"], stored["status"])
                if key not in live_keys:
                    offers.append(stored)
                    live_keys.add(key)
        coverage = self.coverage(routes, offers)
        return {"offers": offers, "providerStatuses": statuses, "coverage": coverage,
                "rfqSuggested": not coverage["achieved"]}

    def coverage(self, routes=None, offers=None):
        current = offers if offers is not None else self.repository.all_current_offers()
        route_ids = [route["id"] for route in routes] if routes else sorted({x["routeId"] for x in current})
        countable = [item for item in current if self._is_bankable(item)]
        per_route = [{"routeId": route_id, "externalOffers": len({x["provider"] for x in countable if x["routeId"] == route_id}),
                      "achieved": len({x["provider"] for x in countable if x["routeId"] == route_id}) >= TARGET_EXTERNAL_OFFERS}
                     for route_id in route_ids]
        freshness = [{"routeId": item["routeId"], "provider": item["provider"],
                      "retrievedAt": item["retrievedAt"], "validUntil": item["validUntil"]}
                     for item in countable]
        now = datetime.now(timezone.utc)
        near_expiry = now + timedelta(hours=6)
        stale = 0
        for item in countable:
            try:
                until = datetime.fromisoformat(item["validUntil"].replace("Z", "+00:00"))
                until = until.replace(tzinfo=timezone.utc) if until.tzinfo is None else until
                stale += int(until <= near_expiry)
            except (KeyError, TypeError, ValueError):
                stale += 1
        retrieved = [item.get("retrievedAt") for item in countable if item.get("retrievedAt")]
        observations = self.repository.observations()
        achieved_routes = sum(1 for item in per_route if item["achieved"])
        coverage_percent = round(100 * achieved_routes / len(per_route), 1) if per_route else 0.0
        return {"targetExternalOffers": TARGET_EXTERNAL_OFFERS,
                "targetCoveragePercent": TARGET_COVERAGE_PERCENT,
                "coveragePercent": coverage_percent, "routes": per_route,
                "achieved": bool(per_route) and coverage_percent >= TARGET_COVERAGE_PERCENT,
                "externalOfferCount": len(countable), "freshOfferCount": len(countable) - stale,
                "staleOfferCount": stale, "lastRefreshedAt": max(retrieved) if retrieved else None,
                "freshness": freshness,
                "observations": observations, "providerObservations": observations}

    def import_quote(self, quote, route):
        offer = quote.copy()
        offer["id"], offer["routeId"] = "offer_" + uuid4().hex, route["id"]
        if not self._is_bankable(offer):
            raise ValueError("Only authentic, current carrier or partner quotes can be imported")
        self.repository.save_offer(offer, route)
        return offer

    def validate_matrix(self):
        return self.coverage(KNOWN_ROUTE_MATRIX)

    def create_rfq(self, payload):
        identifier = "rfq_" + uuid4().hex
        mode = payload.get("route", {}).get("mode")
        channels = [
            {key: value for key, value in channel.items() if key != "modes"}
            for channel in PUBLIC_RFQ_CHANNELS
            if mode in channel["modes"]
        ]
        rfq = {"id": identifier, "reference": "ATQC-" + identifier[-8:].upper(),
               "createdAt": utc_now(), "status": "pending", "emailSent": False,
               "message": "Demande enregistrée; ouvrez un canal officiel ci-dessous pour la transmettre.",
               "channels": channels, **payload}
        self.repository.save_rfq(rfq)
        return rfq

    def refresh_known_routes(self, routes: List[Dict[str, Any]], vehicle_count=1):
        """Callable scheduler hook; it performs no thread creation."""
        return self.compare(routes, vehicle_count)


def refresh_known_routes(service: FreightService, vehicle_count: int = 1):
    """Safe to invoke from an external scheduler; no worker/thread is started."""
    return service.refresh_known_routes(KNOWN_ROUTE_MATRIX, vehicle_count)