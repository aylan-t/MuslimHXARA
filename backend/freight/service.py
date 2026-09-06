from datetime import datetime, timedelta, timezone
from uuid import uuid4
from typing import Any, Dict, Iterable, List

from .providers import active_adapters
from .repository import FreightRepository, utc_now

TARGET_EXTERNAL_OFFERS = 2
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
        now = datetime.now(timezone.utc)
        return {"id": "offer_" + uuid4().hex, "routeId": route["id"], "provider": provider,
                "carrierName": raw.get("carrierName"), "status": raw.get("status", "available"),
                **{key: raw[key] for key in fields}, "estimatedDaysMin": raw.get("estimatedDaysMin"),
                "estimatedDaysMax": raw.get("estimatedDaysMax"), "retrievedAt": utc_now(),
                "validUntil": raw.get("validUntil", (now + timedelta(hours=24)).isoformat()),
                "sourceUrl": raw.get("sourceUrl", ""), "attribution": raw.get("attribution", provider),
                "inclusions": raw.get("inclusions", []), "exclusions": raw.get("exclusions", []),
                "components": raw.get("components", {}), "confidence": raw.get("confidence", 0.7)}

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
        per_route = [{"routeId": route_id, "externalOffers": len({x["provider"] for x in current if x["routeId"] == route_id}),
                      "achieved": len({x["provider"] for x in current if x["routeId"] == route_id}) >= TARGET_EXTERNAL_OFFERS}
                     for route_id in route_ids]
        freshness = [{"routeId": item["routeId"], "provider": item["provider"],
                      "retrievedAt": item["retrievedAt"], "validUntil": item["validUntil"]}
                     for item in current]
        now = datetime.now(timezone.utc)
        near_expiry = now + timedelta(hours=6)
        stale = 0
        for item in current:
            try:
                until = datetime.fromisoformat(item["validUntil"].replace("Z", "+00:00"))
                until = until.replace(tzinfo=timezone.utc) if until.tzinfo is None else until
                stale += int(until <= near_expiry)
            except (KeyError, TypeError, ValueError):
                stale += 1
        retrieved = [item.get("retrievedAt") for item in current if item.get("retrievedAt")]
        observations = self.repository.observations()
        return {"targetExternalOffers": TARGET_EXTERNAL_OFFERS, "routes": per_route,
                "achieved": len(current) >= TARGET_EXTERNAL_OFFERS,
                "externalOfferCount": len(current), "freshOfferCount": len(current) - stale,
                "staleOfferCount": stale, "lastRefreshedAt": max(retrieved) if retrieved else None,
                "freshness": freshness,
                "observations": observations, "providerObservations": observations}

    def import_quote(self, quote, route):
        offer = quote.copy()
        offer["id"], offer["routeId"] = "offer_" + uuid4().hex, route["id"]
        self.repository.save_offer(offer, route)
        return offer

    def create_rfq(self, payload):
        identifier = "rfq_" + uuid4().hex
        rfq = {"id": identifier, "reference": "ATQC-" + identifier[-8:].upper(),
               "createdAt": utc_now(), "status": "pending", "emailSent": False,
               "message": "Demande enregistrée; aucune transmission externe n’a encore été effectuée.", **payload}
        self.repository.save_rfq(rfq)
        return rfq

    def refresh_known_routes(self, routes: List[Dict[str, Any]], vehicle_count=1):
        """Callable scheduler hook; it performs no thread creation."""
        return self.compare(routes, vehicle_count)


def refresh_known_routes(service: FreightService, vehicle_count: int = 1):
    """Safe to invoke from an external scheduler; no worker/thread is started."""
    return service.refresh_known_routes(KNOWN_ROUTE_MATRIX, vehicle_count)