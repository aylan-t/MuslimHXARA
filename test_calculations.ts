import { calculateSimulation, checkEligibility, calculateBatchOptimization, CURRENT_YEAR } from './src/services/calculationEngine';
import { DEFAULT_CONFIG, DEMO_VEHICLE, PRELOADED_VEHICLES } from './src/data/defaultData';
import { getPlatformsForCountry } from './src/services/platformLinksService';

console.log("=== Lancement des tests unitaires AutoTransat QC ===");

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string) {
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
const unconfirmedMreOptions = { country: 'maroc' as const, moroccoOptions: { isMRE: true, mreAgeOver60: false, residenceOver10Years: true, isFirstCarInLife: true } };
const eligUnconfirmedMre = checkEligibility(mreRecentCar, 'maroc', unconfirmedMreOptions, DEFAULT_CONFIG);
assert(eligUnconfirmedMre.severity === 'warning', "Une condition MRE non confirmée produit un avertissement");

// TEST 4: Calcul complet Landed Cost pour DEMO_VEHICLE
const simResult = calculateSimulation(
  DEMO_VEHICLE,
  'senegal',
  { method: 'plateforme_transfert', fixedFeeCad: 15, variableFeePercent: 0.7, fxSpreadPercent: 1.2 },
  { routeId: 'mtl-dkr-roro', batchVehiclesCount: 1 },
  { country: 'senegal' },
  18,
  DEFAULT_CONFIG
);

assert(simResult.breakdown.vehiclePurchaseCad === 14200, "Prix d'achat exact 14,200 $ CAD");
assert(simResult.breakdown.totalTransportCad > 3500, "Transport complet A-Z calculé");
assert(simResult.breakdown.customsAndTaxesCad > 7000, "Droits douane CAF ~44.5% calculés");
assert(simResult.estimatedNetProfitCad > 4000, "Profit net positif à 18% de marge");
assert(simResult.breakdown.localCurrencyCode === 'XOF', "Devise locale Sénégal = XOF");

// TEST 5: Différenciation des routes maritimes
const simRouteMtl = calculateSimulation(
  DEMO_VEHICLE,
  'senegal',
  { method: 'plateforme_transfert', fixedFeeCad: 15, variableFeePercent: 0.7, fxSpreadPercent: 1.2 },
  { routeId: 'mtl-dkr-roro', batchVehiclesCount: 1 },
  { country: 'senegal' },
  18,
  DEFAULT_CONFIG
);

const simRouteHal = calculateSimulation(
  DEMO_VEHICLE,
  'senegal',
  { method: 'plateforme_transfert', fixedFeeCad: 15, variableFeePercent: 0.7, fxSpreadPercent: 1.2 },
  { routeId: 'hal-dkr-roro', batchVehiclesCount: 1 },
  { country: 'senegal' },
  18,
  DEFAULT_CONFIG
);

assert(simRouteMtl.breakdown.totalTransportCad !== simRouteHal.breakdown.totalTransportCad, "Différenciation de prix entre route Montréal et route Halifax");

// TEST 6: Section 5.12 - Liens vers plateformes locales
const marocPlatforms = getPlatformsForCountry('maroc');
assert(marocPlatforms.length === 2, "2 plateformes référencées pour le Maroc (Avito & Moteur.ma)");
const avitoUrl = marocPlatforms[0].buildSearchUrl('Toyota', 'RAV4', 2018);
assert(avitoUrl.includes('avito.ma') && avitoUrl.includes('RAV4'), "URL de recherche Avito correctement construite");

const senegalPlatforms = getPlatformsForCountry('senegal');
assert(senegalPlatforms.length === 2, "2 plateformes référencées pour le Sénégal (Dakar-Auto & CoinAfrique)");
const dakarAutoUrl = senegalPlatforms[0].buildSearchUrl('Toyota', 'RAV4', 2018);
assert(dakarAutoUrl.includes('dakar-auto.com') && dakarAutoUrl.includes('RAV4'), "URL de recherche Dakar-Auto correctement construite");

// TEST 7: Véhicules préchargés
assert(PRELOADED_VEHICLES.length === 10, "10 véhicules populaires préchargés dans la liste d'autofill");

// TEST 8: Transport terrestre régional Québec (Grand Montréal vs Halifax, Non-roulant)
const mtlRunningVehicle = { ...DEMO_VEHICLE, originRegionId: 'grand-montreal', isNonRunning: false };
const mtlNonRunningVehicle = { ...DEMO_VEHICLE, originRegionId: 'grand-montreal', isNonRunning: true };
const bslVehicle = { ...DEMO_VEHICLE, originRegionId: 'bas-saint-laurent', isNonRunning: false };

const simMtlRunning = calculateSimulation(
  mtlRunningVehicle,
  'senegal',
  { method: 'plateforme_transfert', fixedFeeCad: 15, variableFeePercent: 0.7, fxSpreadPercent: 1.2 },
  { routeId: 'mtl-dkr-roro', batchVehiclesCount: 1 },
  { country: 'senegal' },
  18,
  DEFAULT_CONFIG
);

const simMtlNonRunning = calculateSimulation(
  mtlNonRunningVehicle,
  'senegal',
  { method: 'plateforme_transfert', fixedFeeCad: 15, variableFeePercent: 0.7, fxSpreadPercent: 1.2 },
  { routeId: 'mtl-dkr-roro', batchVehiclesCount: 1 },
  { country: 'senegal' },
  18,
  DEFAULT_CONFIG
);

const simBslHalifax = calculateSimulation(
  bslVehicle,
  'senegal',
  { method: 'plateforme_transfert', fixedFeeCad: 15, variableFeePercent: 0.7, fxSpreadPercent: 1.2 },
  { routeId: 'hal-dkr-roro', batchVehiclesCount: 1 },
  { country: 'senegal' },
  18,
  DEFAULT_CONFIG
);

assert(simMtlRunning.breakdown.inlandOriginCad === 200, "Remorquage Grand Montréal -> Port de Montréal = 200 $ CAD");
assert(simMtlNonRunning.breakdown.inlandOriginCad === 350, "Véhicule non-roulant : 200 $ + 150 $ (treuillage) = 350 $ CAD");
assert(simBslHalifax.breakdown.inlandOriginCad === 750, "Bas-Saint-Laurent / Gaspésie -> Port d'Halifax = 750 $ CAD");

// TEST 9: Frais réels cachés et annexes
const simWithHiddenFees = calculateSimulation(
  DEMO_VEHICLE,
  'senegal',
  { method: 'plateforme_transfert', fixedFeeCad: 15, variableFeePercent: 0.7, fxSpreadPercent: 1.2 },
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
      customRepairsCad: 300,
      isNonRunningTowing: false
    }
  },
  { country: 'senegal', valuationBasis: 'invoice' },
  18,
  DEFAULT_CONFIG
);

// 400 + 180 + 250 + 200 + 300 = 1,330 $ CAD
assert(simWithHiddenFees.breakdown.totalAdditionalFeesCad === 1330, "Total frais réels cachés et annexes = 1,330 $ CAD");
assert(simWithHiddenFees.breakdown.landedCostCad > simMtlRunning.breakdown.landedCostCad, "Landed Cost intègre fidèlement les frais annexes");

// TEST 10: Double assiette d'évaluation douanière (Facture vs Cote Argus GAINDE/BADR)
const simFacture = calculateSimulation(
  DEMO_VEHICLE,
  'senegal',
  { method: 'plateforme_transfert', fixedFeeCad: 15, variableFeePercent: 0.7, fxSpreadPercent: 1.2 },
  { routeId: 'mtl-dkr-roro', batchVehiclesCount: 1 },
  { country: 'senegal', valuationBasis: 'invoice', estimatedArgusValueCad: 18000 },
  18,
  DEFAULT_CONFIG
);

const simArgus = calculateSimulation(
  DEMO_VEHICLE,
  'senegal',
  { method: 'plateforme_transfert', fixedFeeCad: 15, variableFeePercent: 0.7, fxSpreadPercent: 1.2 },
  { routeId: 'mtl-dkr-roro', batchVehiclesCount: 1 },
  { country: 'senegal', valuationBasis: 'argus_official', estimatedArgusValueCad: 18000, valuationReference: 'Évaluation douanière TEST-001' },
  18,
  DEFAULT_CONFIG
);

assert(simFacture.breakdown.customsTaxableValueCad < simArgus.breakdown.customsTaxableValueCad, "Assiette taxable Argus supérieure à la facture d'achat sous-évaluée");
assert(simArgus.breakdown.customsAndTaxesCad > simFacture.breakdown.customsAndTaxesCad, "Droits de douane calculés sur la cote Argus sont plus élevés");

const simUndocumentedValuation = calculateSimulation(
  DEMO_VEHICLE,
  'senegal',
  { method: 'plateforme_transfert', fixedFeeCad: 15, variableFeePercent: 0.7, fxSpreadPercent: 1.2 },
  { routeId: 'mtl-dkr-roro', batchVehiclesCount: 1 },
  { country: 'senegal', valuationBasis: 'argus_official', estimatedArgusValueCad: 18000 },
  18,
  DEFAULT_CONFIG
);
assert(simUndocumentedValuation.breakdown.customsValuationBasis === 'invoice', "Une valeur sans référence documentée ne remplace pas la facture");

const standardMreSimulation = calculateSimulation(
  mreRecentCar,
  'maroc',
  { method: 'plateforme_transfert', fixedFeeCad: 15, variableFeePercent: 0.7, fxSpreadPercent: 1.2 },
  { routeId: 'mtl-cas-roro', batchVehiclesCount: 1 },
  unconfirmedMreOptions,
  18,
  DEFAULT_CONFIG
);
const confirmedMreSimulation = calculateSimulation(
  mreRecentCar,
  'maroc',
  { method: 'plateforme_transfert', fixedFeeCad: 15, variableFeePercent: 0.7, fxSpreadPercent: 1.2 },
  { routeId: 'mtl-cas-roro', batchVehiclesCount: 1 },
  { country: 'maroc', moroccoOptions: { isMRE: true, mreAgeOver60: true, residenceOver10Years: true, isFirstCarInLife: true } },
  18,
  DEFAULT_CONFIG
);
assert(standardMreSimulation.breakdown.customsAndTaxesCad > confirmedMreSimulation.breakdown.customsAndTaxesCad, "L’abattement MRE exige toutes les conditions confirmées");

// TEST 11: Répertoire des sources institutionnelles
assert(DEFAULT_CONFIG.officialSources.length >= 6, "Au moins 6 sources institutionnelles disponibles");
const bankOfCanada = DEFAULT_CONFIG.officialSources.find(s => s.id === 'bdc-fx');
assert(!!bankOfCanada && bankOfCanada.url.startsWith('https://'), "Banque du Canada référencée avec URL HTTPS");
const senegalDecree = DEFAULT_CONFIG.officialSources.find(s => s.id === 'douanes-sn');
assert(!!senegalDecree && senegalDecree.legalReference?.includes('2025-1845'), "Décret sénégalais 2025-1845 référencé avec texte de loi");

// TEST 12: Transparence des prix de transport
assert(DEFAULT_CONFIG.routes.every(route => route.priceStatus === 'estimate'), "Les tarifs statiques de transport sont identifiés comme budgets indicatifs");
assert(simMtlRunning.calculationStatus === 'indicative', "Une simulation sans devis est signalée comme indicative");
const simWithCarrierQuote = calculateSimulation(
  DEMO_VEHICLE,
  'senegal',
  { method: 'plateforme_transfert', fixedFeeCad: 15, variableFeePercent: 0.7, fxSpreadPercent: 1.2 },
  {
    routeId: 'mtl-dkr-roro',
    batchVehiclesCount: 1,
    quote: {
      routeId: 'mtl-dkr-roro',
      carrierName: 'Transporteur test',
      reference: 'DEVIS-001',
      quotedAt: '2026-09-01',
      amountCad: 2750,
      fileName: 'DEVIS-001.pdf',
      fileHash: 'sha256-test',
      fileMimeType: 'application/pdf'
    }
  },
  { country: 'senegal' },
  18,
  DEFAULT_CONFIG
);
assert(simWithCarrierQuote.calculationStatus === 'carrier_quote', "Un devis transporteur valide change le statut du calcul");
assert(simWithCarrierQuote.breakdown.oceanFreightCad === 2750, "Le devis transporteur remplace le budget de fret indicatif");

const simWithIncompleteQuote = calculateSimulation(
  DEMO_VEHICLE,
  'senegal',
  { method: 'plateforme_transfert', fixedFeeCad: 15, variableFeePercent: 0.7, fxSpreadPercent: 1.2 },
  {
    routeId: 'mtl-dkr-roro',
    batchVehiclesCount: 1,
    quote: { routeId: 'mtl-dkr-roro', carrierName: 'Transporteur test', quotedAt: '2026-09-01', amountCad: 0 }
  },
  { country: 'senegal' },
  18,
  DEFAULT_CONFIG
);
assert(simWithIncompleteQuote.calculationStatus === 'indicative', "Un devis incomplet ne valide jamais le calcul");
assert(simWithIncompleteQuote.breakdown.oceanFreightCad === 2400, "Un montant de devis nul ne remplace pas le budget prudent");

const simWithWrongRouteQuote = calculateSimulation(
  DEMO_VEHICLE,
  'senegal',
  { method: 'plateforme_transfert', fixedFeeCad: 15, variableFeePercent: 0.7, fxSpreadPercent: 1.2 },
  {
    routeId: 'hal-dkr-roro',
    batchVehiclesCount: 1,
    quote: { routeId: 'mtl-dkr-roro', carrierName: 'Transporteur test', quotedAt: '2026-09-01', amountCad: 2750 }
  },
  { country: 'senegal' },
  18,
  DEFAULT_CONFIG
);
assert(simWithWrongRouteQuote.calculationStatus === 'indicative', "Un devis d’une autre route est ignoré");
assert(simWithWrongRouteQuote.breakdown.oceanFreightCad === 1900, "Le devis d’une autre route ne remplace pas le fret sélectionné");

const simWithMarketplaceOffer = calculateSimulation(
  DEMO_VEHICLE,
  'senegal',
  { method: 'plateforme_transfert', fixedFeeCad: 15, variableFeePercent: 0.7, fxSpreadPercent: 1.2 },
  {
    routeId: 'mtl-dkr-cont40',
    batchVehiclesCount: 2,
    marketOffer: {
      id: 'freightos-test',
      routeId: 'mtl-dkr-cont40',
      provider: 'Freightos',
      status: 'marketplace_estimate',
      amountCad: 6000,
      lowCad: 5500,
      highCad: 6500,
      currency: 'USD',
      originalLow: 4000,
      originalHigh: 4700,
      retrievedAt: '2026-09-05T12:00:00.000Z',
      sourceUrl: 'https://ship.freightos.com',
      attribution: 'Estimation marketplace Freightos'
    }
  },
  { country: 'senegal' },
  18,
  DEFAULT_CONFIG
);
assert(simWithMarketplaceOffer.calculationStatus === 'marketplace_rate', "Une offre marketplace valide a son propre statut");
assert(simWithMarketplaceOffer.breakdown.oceanFreightCad === 3000, "L’offre conteneur marketplace est divisée par véhicule");

console.log(`\nBilan des tests : ${passed} réussis, ${failed} échoués.`);
if (failed > 0) process.exit(1);

