import { calculateSimulation, checkEligibility, calculateBatchOptimization, CURRENT_YEAR } from './src/services/calculationEngine.ts';
import { DEFAULT_CONFIG, DEMO_VEHICLE } from './src/data/defaultData.ts';

console.log("=== Lancement des tests unitaires AutoTransat QC ===");

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passed++;
  } else {
    console.error(`[FAIL] ${testName}`);
    failed++;
  }
}

// TEST 1: Décret Sénégal du 24 octobre 2025 (Limite 10 ans)
const validSenegalVehicle = { ...DEMO_VEHICLE, year: 2018 }; // 8 ans
const elig1 = checkEligibility(validSenegalVehicle, 'senegal', { country: 'senegal' }, DEFAULT_CONFIG);
assert(elig1.isEligible === true, "Véhicule de 8 ans éligible au Sénégal");
assert(elig1.severity === 'success', "Gravité success pour véhicule conforme");

// TEST 2: Véhicule de plus de 10 ans au Sénégal -> Blocage
const oldSenegalVehicle = { ...DEMO_VEHICLE, year: 2014 }; // 12 ans
const elig2 = checkEligibility(oldSenegalVehicle, 'senegal', { country: 'senegal' }, DEFAULT_CONFIG);
assert(elig2.isEligible === false, "Véhicule de 12 ans NON importable au Sénégal");
assert(elig2.severity === 'error', "Gravité error pour véhicule de plus de 10 ans");
assert(elig2.message.includes('24 octobre 2025'), "Mention obligatoire du décret du 24 octobre 2025");

// TEST 3: Maroc Régime MRE - Moins de 5 ans vs Plus de 5 ans
const mreRecentCar = { ...DEMO_VEHICLE, year: 2022 }; // 4 ans
const elig3 = checkEligibility(mreRecentCar, 'maroc', { country: 'maroc', moroccoOptions: { isMRE: true, mreAgeOver60: true, residenceOver10Years: true, isFirstCarInLife: true } }, DEFAULT_CONFIG);
assert(elig3.isEligible === true, "Véhicule MRE de 4 ans éligible avec abattement 90%");

const mreOldCar = { ...DEMO_VEHICLE, year: 2018 }; // 8 ans
const elig4 = checkEligibility(mreOldCar, 'maroc', { country: 'maroc', moroccoOptions: { isMRE: true, mreAgeOver60: true, residenceOver10Years: true, isFirstCarInLife: true } }, DEFAULT_CONFIG);
assert(elig4.isEligible === false, "Véhicule MRE de 8 ans NON éligible (limite 5 ans)");

// TEST 4: Calcul complet Landed Cost pour DEMO_VEHICLE (RAV4 2018 vers Dakar)
const simResult = calculateSimulation(
  DEMO_VEHICLE,
  'senegal',
  { method: 'virement_bancaire', fixedFeeCad: 45, variableFeePercent: 0.5, fxSpreadPercent: 2.5 },
  { routeId: 'mtl-dkr-roro', batchVehiclesCount: 1 },
  { country: 'senegal' },
  18,
  DEFAULT_CONFIG
);

assert(simResult.breakdown.vehiclePurchaseCad === 14200, "Prix d'achat exact 14,200 $ CAD");
assert(simResult.breakdown.fxSpreadCostCad === 355, "Coût spread 2.5% = 355 $ CAD");
assert(simResult.breakdown.bankTransferCostCad === 116, "Frais transfert = 45 + (14200*0.005) = 116 $ CAD");
assert(simResult.breakdown.totalTransportCad > 3500, "Transport complet A-Z inclus");
assert(simResult.breakdown.customsAndTaxesCad > 7000, "Droits douane CAF ~44.5% calculés");
assert(simResult.breakdown.landedCostCad > 26000, "Landed cost cohérent (> 26 000 $ CAD)");
assert(simResult.estimatedNetProfitCad > 4000, "Profit net positif à 18% de marge (> 4 000 $ CAD)");
assert(simResult.breakdown.localCurrencyCode === 'XOF', "Devise locale Sénégal = XOF");
assert(simResult.marketComparison !== undefined, "Données marché trouvées pour Toyota RAV4");

// TEST 5: Optimiseur de Conteneur Groupage
const batchOpt = calculateBatchOptimization('senegal', DEFAULT_CONFIG);
assert(batchOpt.scenarios.length === 4, "Scénarios 1 à 4 véhicules calculés");
assert(batchOpt.scenarios[3].isContainerBetter === true, "4 voitures dans conteneur 40' plus économique que RoRo");
assert(batchOpt.breakevenCarCount === 3, "Point d'équilibre = 3 voitures");

console.log(`\nBilan des tests : ${passed} réussis, ${failed} échoués.`);
if (failed > 0) process.exit(1);

