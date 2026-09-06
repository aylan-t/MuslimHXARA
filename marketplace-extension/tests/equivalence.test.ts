/**
 * equivalence.test.ts — AGENT-03 (+ AGENT-01, moteur versionné).
 * Créé par AGENT-03 car AGENT-01 ne l'avait pas encore créé (ne pas écraser
 * s'il existe déjà — ajouter seulement un test manquant).
 *
 * Scénario §01.6/§03.5 : RAV4 2018 14 200 $ → Dakar RoRo, marge 18 % →
 * `landedCostCad`, `customsAndTaxesCad`, `suggestedSalePriceCad`,
 * `estimatedNetProfitCad` STRICTEMENT identiques app vs extension.
 *
 * La copie versionnée `src/engine/*` (sync AGENT-01) n'existe pas encore :
 * la suite se skip proprement en attendant (jamais rouge par défaut).
 */
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const EXT_ENGINE_URL = new URL('../src/engine/calculationEngine.ts', import.meta.url);
const HAS_EXTENSION_ENGINE = existsSync(EXT_ENGINE_URL);

describe.skipIf(!HAS_EXTENSION_ENGINE)(
  'equivalence moteur app vs extension (RAV4 2018 → Dakar RoRo, marge 18 %)',
  () => {
    it('4 montants strictement identiques', async () => {
      const appEngine = await import('../../src/services/calculationEngine');
      const appData = await import('../../src/data/defaultData');
      const extEngine = await import('../src/engine/calculationEngine');
      const extData = await import('../src/engine/defaultData');

      const buildArgs = (config: typeof appData.DEFAULT_CONFIG) =>
        [
          {
            brand: 'Toyota',
            model: 'RAV4',
            year: 2018,
            purchasePriceCad: 14200,
            mileageKm: 115000,
            category: 'suv',
            condition: 'tres_bon',
            source: 'encan',
            auctionFeesCad: 650,
            brokerCommissionCad: 300,
            originRegionId: 'grand-montreal',
            isNonRunning: false,
          },
          'senegal',
          {
            method: 'plateforme_transfert',
            fixedFeeCad: 15,
            variableFeePercent: 0.7,
            fxSpreadPercent: 1.2,
          },
          {
            routeId: 'mtl-dkr-roro',
            batchVehiclesCount: 1,
            additionalCosts: {
              includeTransitAgentFee: true,
              transitAgentFeeCad: 400,
              includeRoroCleaningFee: true,
              roroCleaningFeeCad: 180,
              includePortStorageBuffer: true,
              portStorageBufferCad: 250,
              includeBatteryKeyFee: true,
              batteryKeyFeeCad: 200,
              customRepairsCad: 0,
              isNonRunningTowing: false,
            },
          },
          { country: 'senegal', valuationBasis: 'invoice' },
          18,
          config,
        ] as const;

      const fromApp = appEngine.calculateSimulation(...buildArgs(appData.DEFAULT_CONFIG));
      const fromExt = extEngine.calculateSimulation(...buildArgs(extData.DEFAULT_CONFIG));

      expect(fromExt.breakdown.landedCostCad).toBe(fromApp.breakdown.landedCostCad);
      expect(fromExt.breakdown.customsAndTaxesCad).toBe(fromApp.breakdown.customsAndTaxesCad);
      expect(fromExt.suggestedSalePriceCad).toBe(fromApp.suggestedSalePriceCad);
      expect(fromExt.estimatedNetProfitCad).toBe(fromApp.estimatedNetProfitCad);
      expect(fromExt.calculationStatus).toBe(fromApp.calculationStatus);
      expect(fromExt.assumptions).toEqual(fromApp.assumptions);
    });
  },
);

if (!HAS_EXTENSION_ENGINE) {
  describe('equivalence moteur (en attente du sync AGENT-01)', () => {
    it('signale que src/engine/* est absent — suite skipped, pas d’échec', () => {
      expect(HAS_EXTENSION_ENGINE).toBe(false);
    });
  });
}
