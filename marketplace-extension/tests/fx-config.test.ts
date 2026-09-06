import { describe, expect, it } from 'vitest';
import { calculateSimulation } from '../src/engine/calculationEngine';
import { DEFAULT_CONFIG } from '../src/engine/defaultData';
import { applyLiveMarketRates } from '../src/fx';

describe('configuration FX de l’extension', () => {
  it('applique le taux live au règlement sans modifier le taux douanier', () => {
    const config = applyLiveMarketRates(DEFAULT_CONFIG, {
      CAD_to_MAD: 8.1,
      CAD_to_XOF: 500,
      lastUpdated: '2026-09-06',
      isLive: true,
      sourceName: 'test',
    });
    const vehicle = {
      id: 'fx-test',
      brand: 'Toyota',
      model: 'RAV4',
      year: 2020,
      purchasePriceCad: 14200,
      mileageKm: 100000,
      category: 'suv' as const,
      condition: 'bon' as const,
      isNonRunning: false,
      source: 'particulier' as const,
      auctionFeesCad: 0,
      brokerCommissionCad: 0,
      engineCc: 2487,
      fuelType: 'Gasoline' as const,
      steering: 'LHD' as const,
      isJdm: false,
      vehicleClassification: 'passenger' as const,
      grossVehicleWeightKg: 2000,
      classificationVerified: true,
    };
    const result = calculateSimulation(
      vehicle,
      'senegal',
      { method: 'plateforme_transfert', fixedFeeCad: 15, variableFeePercent: 0.7, fxSpreadPercent: 1.2 },
      { routeId: 'mtl-dkr-roro', batchVehiclesCount: 1 },
      { country: 'senegal' },
      18,
      config,
    );

    expect(result.breakdown.baseFxRate).toBe(500);
    expect(result.breakdown.effectiveFxRate).toBe(487.5);
    expect(result.breakdown.customsAssessedFxRate).toBe(DEFAULT_CONFIG.fxRates.customsAssessedCAD_to_XOF);
  });
});