import { describe, expect, it } from 'vitest';
import { buildPrefillUrl, parsePrefillFromUrl } from '../src/prefill';
import type { NormalizedInputs } from '../src/normalize';

const inputs: NormalizedInputs = {
  vehicle: {
    brand: 'BMW',
    model: '3 Series',
    year: 2014,
    mileageKm: 240000,
    purchasePriceCad: 5500,
    engineCc: 1995,
    fuelType: 'Gasoline',
    steering: 'LHD',
    vehicleClassification: 'passenger',
    grossVehicleWeightKg: 2000,
    classificationVerified: true,
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

const meta = {
  listingId: '1278702150685897',
  listingUrl: 'https://www.facebook.com/marketplace/item/1278702150685897/',
  listingTitle: '2014 BMW 3 Series',
  engineVersion: 'test',
};

describe('contrat prefill synchronisé', () => {
  it('construit un lien que l’application peut relire', () => {
    const url = buildPrefillUrl('http://localhost:3000', inputs, meta);
    expect(parsePrefillFromUrl(url)?.vehicle.model).toBe('3 Series');
  });

  it('rejette une URL de provenance non Facebook', () => {
    expect(() => buildPrefillUrl('http://localhost:3000', inputs, {
      ...meta,
      listingUrl: 'https://example.com/marketplace/item/1278702150685897/',
    })).toThrow(/listingUrl/);
  });
});
