import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from backend.freight.providers import FreightosAdapter, SeaRatesAdapter
from backend.freight.repository import FreightRepository, is_unexpired
from backend.freight.service import FreightService


ROUTE = {"id": "mtl-dkr-roro", "originPort": "Montreal",
         "destinationPort": "Dakar", "mode": "roro"}


def raw_offer(amount=2000):
    return {"amountCad": amount, "lowCad": amount, "highCad": amount, "currency": "CAD",
            "originalLow": amount, "originalHigh": amount, "sourceUrl": "https://source.example/quote",
            "attribution": "External source", "inclusions": [], "exclusions": [],
            "components": {}, "confidence": .8}


class GoodProvider:
    name = "Good"
    def quote(self, route, vehicle_count):
        return [raw_offer()]


class BrokenProvider:
    name = "Broken"
    def quote(self, route, vehicle_count):
        raise TimeoutError("simulated timeout")


class FreightTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.repo = FreightRepository(self.directory.name + "/quotes.db")

    def tearDown(self):
        self.directory.cleanup()

    def test_expired_offers_never_current(self):
        expired = {**raw_offer(), "id": "expired", "routeId": ROUTE["id"], "provider": "Bank",
                   "status": "available", "retrievedAt": datetime.now(timezone.utc).isoformat(),
                   "validUntil": (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()}
        self.repo.save_offer(expired, ROUTE)
        self.assertFalse(self.repo.current_offers(ROUTE["id"]))

    def test_provider_failure_is_isolated(self):
        result = FreightService(self.repo, [BrokenProvider(), GoodProvider()]).compare([ROUTE], 1)
        self.assertEqual(len(result["offers"]), 1)
        self.assertTrue(any(item["provider"] == "Broken" and item["status"] == "error"
                            for item in result["providerStatuses"]))

    def test_live_quote_precedes_bank_quote(self):
        bank = {**raw_offer(1000), "id": "bank", "routeId": ROUTE["id"], "provider": "Good",
                "status": "available", "retrievedAt": datetime.now(timezone.utc).isoformat(),
                "validUntil": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()}
        self.repo.save_offer(bank, ROUTE)
        result = FreightService(self.repo, [GoodProvider()]).compare([ROUTE], 1)
        self.assertEqual(result["offers"][0]["amountCad"], 2000)
        self.assertEqual(len(result["offers"]), 1)

    def test_coverage_and_rfq_persistence(self):
        service = FreightService(self.repo, [])
        first = service.import_quote({**raw_offer(), "provider": "One", "status": "available",
                    "retrievedAt": datetime.now(timezone.utc).isoformat(),
                    "validUntil": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()}, ROUTE)
        self.assertFalse(service.coverage([ROUTE])["achieved"])
        service.import_quote({**raw_offer(), "provider": "Two", "status": "available",
                    "retrievedAt": datetime.now(timezone.utc).isoformat(),
                    "validUntil": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()}, ROUTE)
        self.assertTrue(service.coverage([ROUTE])["achieved"])
        rfq = service.create_rfq({"route": ROUTE, "vehicleCount": 1, "shipmentDetails": {}})
        self.assertEqual(service.repository.get_rfq(rfq["id"])["id"], rfq["id"])
        self.assertFalse(rfq["emailSent"])
        self.assertTrue(rfq["reference"])


class FakeResponse:
    def __init__(self, body):
        self.body = body

    def read(self):
        return self.body.encode()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class ProviderParsingTests(unittest.TestCase):
    @patch.dict("os.environ", {}, clear=True)
    @patch("backend.freight.providers.urlopen")
    def test_freightos_public_usd_is_converted_from_live_fx(self, mocked_open):
        mocked_open.side_effect = [
            FakeResponse('{"response":{"estimatedFreightRates":{"numQuotes":1,"mode":{'
                         '"price":{"min":{"moneyAmount":{"amount":"900","currency":"USD"}},'
                         '"max":{"moneyAmount":{"amount":"1100","currency":"USD"}}},'
                         '"transitTimes":{"min":"16","max":"20"}}}}}'),
            FakeResponse('{"rates":{"CAD":1.35}}'),
        ]
        result = FreightosAdapter().quote({**ROUTE, "mode": "conteneur_complet"}, 1)
        self.assertEqual(result[0]["amountCad"], 1350)
        self.assertEqual(result[0]["lowCad"], 1215)
        self.assertEqual(result[0]["highCad"], 1485)
        self.assertEqual(result[0]["status"], "marketplace_estimate")
        self.assertIn("loadtype=container40", mocked_open.call_args_list[0].args[0])

    @patch.dict("os.environ", {"SEARATES_API_KEY": "test-key"}, clear=True)
    @patch("backend.freight.providers.urlopen")
    def test_searates_parses_multiple_freight_records(self, mocked_open):
        mocked_open.return_value = FakeResponse(
            '{"data":{"shipment":{"freight":['
            '{"price":1200,"transitTime":20,"shippingLine":"Line A"},'
            '{"price":1300,"transitTime":21,"shippingLine":"Line B"}]}}}')
        route = {**ROUTE, "mode": "conteneur_complet"}
        result = SeaRatesAdapter().quote(route, 1)
        self.assertEqual([item["amountCad"] for item in result], [1200, 1300])
        request = mocked_open.call_args.args[0]
        self.assertIn(b"shipment: fcl(ST40: 1", request.data)