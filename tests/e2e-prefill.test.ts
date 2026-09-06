import { Buffer } from 'node:buffer';
import {
  PREFILL_MAX_URL_CHARS,
  buildPrefillUrl,
  parsePrefill,
  parsePrefillFromUrl,
  type PrefillInputs,
  type PrefillMeta,
} from '../src/services/prefill';

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string): void {
  if (condition) {
    console.log(`[PASS] ${name}`);
    passed++;
  } else {
    console.error(`[FAIL] ${name}`);
    failed++;
  }
}

function assertThrows(run: () => unknown, name: string): void {
  try {
    run();
    assert(false, name);
  } catch {
    assert(true, name);
  }
}

const inputs: PrefillInputs = {
  vehicle: {
    brand: 'BMW',
    model: '3 Series',
    year: 2014,
    mileageKm: 240000,
    purchasePriceCad: 5500,
    category: 'berline',
    condition: 'bon',
    source: 'particulier',
    auctionFeesCad: 0,
    brokerCommissionCad: 0,
    originRegionId: 'grand-montreal',
    isNonRunning: false,
  },
  destination: 'senegal',
  financing: {
    method: 'plateforme_transfert',
    fixedFeeCad: 15,
    variableFeePercent: 0.7,
    fxSpreadPercent: 1.2,
  },
  transport: { routeId: 'mtl-dkr-roro', batchVehiclesCount: 1 },
  customs: { country: 'senegal', valuationBasis: 'invoice' },
  targetMarginPercent: 18,
};

const meta: PrefillMeta = {
  listingId: '1278702150685897',
  listingUrl: 'https://www.facebook.com/marketplace/item/1278702150685897/',
  listingTitle: '2014 BMW 3 Series',
  engineVersion: '503335fc',
};

const url = buildPrefillUrl('http://localhost:3000', inputs, meta);
assert(url.startsWith('http://localhost:3000/?prefill='), 'Le lien cible localhost:3000');
assert(url.length < PREFILL_MAX_URL_CHARS, 'Le lien respecte la limite de 2 000 caractères');

const parsed = parsePrefillFromUrl(`${url}&lang=fr`);
assert(parsed?.vehicle.model === '3 Series', 'Le véhicule est décodé');
assert(parsed?.destination === 'senegal', 'La destination est décodée');
assert(parsed?.financing.method === 'plateforme_transfert', 'Le financement est décodé');
assert(parsed?.transport.routeId === 'mtl-dkr-roro', 'Le transport est décodé');
assert(parsed?.customs.country === 'senegal', 'La douane est décodée');
assert(parsed?.targetMarginPercent === 18, 'La marge est décodée');
assert(parsed?.meta.listingId === meta.listingId, 'La provenance Facebook est conservée');
assert(parsePrefillFromUrl('http://localhost:3000/?lang=fr') === null, 'Un lien sans prefill est ignoré');

assertThrows(() => parsePrefill('%%%'), 'Un base64url corrompu est rejeté');

const missingKeys = Buffer.from(JSON.stringify({ vehicle: inputs.vehicle, destination: 'senegal', meta }), 'utf8').toString('base64url');
assertThrows(() => parsePrefill(missingKeys), 'Un payload incomplet est rejeté');

const maliciousMeta = { ...meta, listingUrl: 'javascript:alert(1)' };
const maliciousPayload = Buffer.from(JSON.stringify({ ...inputs, meta: maliciousMeta }), 'utf8').toString('base64url');
assertThrows(() => parsePrefill(maliciousPayload), 'Un protocole dangereux est rejeté');

const foreignMeta = { ...meta, listingUrl: 'https://example.com/marketplace/item/1278702150685897/' };
const foreignPayload = Buffer.from(JSON.stringify({ ...inputs, meta: foreignMeta }), 'utf8').toString('base64url');
assertThrows(() => parsePrefill(foreignPayload), 'Un domaine non Facebook est rejeté');

const oversizedInputs: PrefillInputs = {
  ...inputs,
  transport: {
    ...inputs.transport,
    quote: {
      routeId: inputs.transport.routeId,
      carrierName: 'Transporteur',
      quotedAt: '2026-09-06',
      amountCad: 2500,
      fileName: `${'x'.repeat(1800)}.pdf`,
    },
  },
};
assertThrows(() => buildPrefillUrl('http://localhost:3000', oversizedInputs, meta), 'Une URL de 2 000 caractères ou plus est rejetée');
assertThrows(() => buildPrefillUrl('javascript:alert(1)', inputs, meta), 'Une base non HTTP est rejetée');

console.log(`\nBilan prefill : ${passed} réussis, ${failed} échoués.`);
if (failed > 0) process.exit(1);
