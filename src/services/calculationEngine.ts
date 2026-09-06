import {
  Vehicle,
  DestinationCountry,
  FinancingConfig,
  TransportSelection,
  CustomsSelection,
  GlobalReferenceConfig,
  CostBreakdown,
  SimulationResult,
  MarketComparison,
  FxScenario
} from '../types';
import { QUEBEC_REGIONS } from '../data/defaultData';

export const CURRENT_YEAR = 2026;

/**
 * Valide l'éligibilité légale du véhicule selon le pays de destination
 */
export function checkEligibility(
  vehicle: Vehicle,
  country: DestinationCountry,
  customs: CustomsSelection,
  config: GlobalReferenceConfig
): { isEligible: boolean; severity: 'success' | 'warning' | 'error'; message: string } {
  const age = CURRENT_YEAR - vehicle.year;
  const isTruck = vehicle.category === 'camionnette';

  if (country === 'senegal') {
    const maxAge = isTruck
      ? config.customsRules.senegal.maxAgeYearsTrucks
      : config.customsRules.senegal.maxAgeYearsTourism;

    if (age > maxAge) {
      return {
        isEligible: false,
        severity: 'error',
        message: `VÉHICULE NON IMPORTABLE AU SÉNÉGAL : Ce véhicule a ${age} an(s). Selon le décret officiel du 24 octobre 2025 (n° 2025-1845), la limite légale stricte est de ${maxAge} ans (année minimum autorisée : ${CURRENT_YEAR - maxAge}). Tout véhicule plus ancien est refoulé sans dédouanement au port de Dakar.`
      };
    }

    if (age >= maxAge - 1) {
      return {
        isEligible: true,
        severity: 'warning',
        message: `ATTENTION ÉCHÉANCE : Ce véhicule a ${age} an(s) (limite légale : ${maxAge} ans). Assurez-vous impérativement qu'il arrive et soit enregistré au port de Dakar avant le 31 décembre pour éviter le passage à ${age + 1} ans et un refus douanier.`
      };
    }

    return {
      isEligible: true,
      severity: 'success',
      message: `VÉHICULE PLEINEMENT ÉLIGIBLE AU SÉNÉGAL : Ce véhicule a ${age} an(s), en parfaite conformité avec le décret officiel du 24 octobre 2025 (limite max : ${maxAge} ans pour tourisme).`
    };
  }

  // Maroc
  const isMRE = customs.moroccoOptions?.isMRE ?? false;
  if (isMRE) {
    const maxMreAge = config.customsRules.morocco.mreMaxAgeYears;
    if (age > maxMreAge) {
      return {
        isEligible: false,
        severity: 'error',
        message: `NON ÉLIGIBLE AU RÉGIME MRE : L'abattement préférentiel MRE de 90% exige impérativement un véhicule de ${maxMreAge} ans maximum (année ${CURRENT_YEAR - maxMreAge} ou plus récente). Ce véhicule a ${age} an(s).`
      };
    }
    return {
      isEligible: true,
      severity: 'success',
      message: `ÉLIGIBLE RÉGIME MRE : Véhicule de ${age} an(s) (limite légale max : ${maxMreAge} ans). Bénéficie de l'abattement officiel de 90% sur l'assiette douanière sous réserve des conditions d'âge (60 ans+) et de séjour (10 ans+ à l'étranger).`
    };
  }

  // Maroc régime commercial / standard
  return {
    isEligible: true,
    severity: 'warning',
    message: config.customsRules.morocco.legalWarning
  };
}

/**
 * Moteur central de calcul du Landed Cost et de la rentabilité
 */
export function calculateSimulation(
  vehicle: Vehicle,
  country: DestinationCountry,
  financing: FinancingConfig,
  transport: TransportSelection,
  customs: CustomsSelection,
  targetMarginPercent: number = 18,
  config: GlobalReferenceConfig
): SimulationResult {
  // 1. Taux de change et spread
  const baseRate = country === 'senegal' ? config.fxRates.CAD_to_XOF : config.fxRates.CAD_to_MAD;
  const spreadPercent = financing.fxSpreadPercent;
  const effectiveRate = baseRate * (1 - spreadPercent / 100);
  const fxSpreadCostCad = vehicle.purchasePriceCad * (spreadPercent / 100);

  // 2. Frais de transfert bancaire
  const bankTransferCostCad = financing.fixedFeeCad + (vehicle.purchasePriceCad * (financing.variableFeePercent / 100));

  // 3. Transport terrestre d'origine précis selon la région québécoise choisie
  const selectedRoute = config.routes.find(r => r.id === transport.routeId) || config.routes[0];
  const isHalifax = selectedRoute?.originPort ? selectedRoute.originPort.toLowerCase().includes('halifax') : false;

  const regions = (config.quebecRegions && config.quebecRegions.length > 0) ? config.quebecRegions : QUEBEC_REGIONS;
  const originRegion = regions.find(q => q.id === vehicle.originRegionId) || regions[0] || QUEBEC_REGIONS[0];
  const baseRegionalCost = isHalifax ? originRegion.costToHalifaxCad : originRegion.costToMtlCad;
  const nonRunningTowing = (vehicle.isNonRunning || transport.additionalCosts?.isNonRunningTowing) ? 150 : 0;

  const inlandOriginCad = transport.customInlandOriginCad ?? (baseRegionalCost + nonRunningTowing);
  const portOriginFeesCad = selectedRoute.portOriginFeesCad;

  // Si conteneur, le fret est divisé par le nombre de véhicules
  const isContainer = selectedRoute.mode === 'conteneur_complet' || selectedRoute.mode === 'conteneur_partage';
  const batchCount = Math.max(1, transport.batchVehiclesCount || 1);
  const oceanFreightCad = isContainer
    ? (transport.customOceanFreightCad ?? selectedRoute.oceanFreightCad) / batchCount
    : (transport.customOceanFreightCad ?? selectedRoute.oceanFreightCad);

  const marineInsuranceCad = vehicle.purchasePriceCad * (selectedRoute.marineInsuranceRatePercent / 100);
  const destinationPortFeesCad = isContainer
    ? selectedRoute.portDestinationFeesCad / batchCount
    : selectedRoute.portDestinationFeesCad;
  const inlandDestinationCad = transport.customInlandDestinationCad ?? selectedRoute.inlandDestinationCad;

  const totalTransportCad = inlandOriginCad + portOriginFeesCad + oceanFreightCad + marineInsuranceCad + destinationPortFeesCad + inlandDestinationCad;

  // 4. Frais d'encan / intermédiaires
  const auctionAndBrokerFeesCad = (vehicle.auctionFeesCad || 0) + (vehicle.brokerCommissionCad || 0);

  // 5. Checklist des frais annexes réels du terrain
  const addCosts = transport.additionalCosts || {
    includeTransitAgentFee: true,
    transitAgentFeeCad: 400,
    includeRoroCleaningFee: true,
    roroCleaningFeeCad: 180,
    includePortStorageBuffer: true,
    portStorageBufferCad: 250,
    includeBatteryKeyFee: vehicle.source === 'encan',
    batteryKeyFeeCad: 200,
    customRepairsCad: 0,
    isNonRunningTowing: false
  };

  const transitAgentFeeCad = addCosts.includeTransitAgentFee ? (addCosts.transitAgentFeeCad || 400) : 0;
  const roroCleaningFeeCad = addCosts.includeRoroCleaningFee ? (addCosts.roroCleaningFeeCad || 180) : 0;
  const portStorageBufferCad = addCosts.includePortStorageBuffer ? (addCosts.portStorageBufferCad || 250) : 0;
  const batteryAndRepairsCad = (addCosts.includeBatteryKeyFee ? (addCosts.batteryKeyFeeCad || 200) : 0) + (addCosts.customRepairsCad || 0);
  const totalAdditionalFeesCad = transitAgentFeeCad + roroCleaningFeeCad + portStorageBufferCad + batteryAndRepairsCad;

  // 6. Douane & Taxes : Base Facture vs Base Argus officielle (GAINDE / BADR)
  const valuationBasis = customs.valuationBasis || 'invoice';
  let estimatedArgusValue = customs.estimatedArgusValueCad;
  if (!estimatedArgusValue) {
    const preloadedMatch = config.marketData.find(
      d => d.country === country && d.brand.toLowerCase() === vehicle.brand.toLowerCase() && d.model.toLowerCase() === vehicle.model.toLowerCase()
    );
    estimatedArgusValue = preloadedMatch ? Math.round(preloadedMatch.averagePriceLocal / effectiveRate * 0.75) : Math.round(vehicle.purchasePriceCad * 1.15);
  }

  // Base taxable
  const taxableBaseVehicle = valuationBasis === 'argus_official' ? estimatedArgusValue : vehicle.purchasePriceCad;
  const customsTaxableValueCad = taxableBaseVehicle + oceanFreightCad + marineInsuranceCad;

  let customsAndTaxesCad = 0;
  let taxRateEffective = 0;

  if (country === 'senegal') {
    taxRateEffective = customs.customTaxRatePercent ?? config.customsRules.senegal.taxRatePercent;
    customsAndTaxesCad = customsTaxableValueCad * (taxRateEffective / 100);
  } else {
    // Maroc
    const isMRE = customs.moroccoOptions?.isMRE ?? false;
    if (isMRE) {
      const fullTaxRate = (config.customsRules.morocco.standardImportRatePercent + config.customsRules.morocco.vatRatePercent) / 100;
      const discount = config.customsRules.morocco.mreMaxDiscountPercent / 100;
      customsAndTaxesCad = customsTaxableValueCad * fullTaxRate * (1 - discount);
    } else {
      const importDuty = customsTaxableValueCad * (config.customsRules.morocco.standardImportRatePercent / 100);
      const parafiscal = customsTaxableValueCad * (config.customsRules.morocco.parafiscalRatePercent / 100);
      const vat = (customsTaxableValueCad + importDuty) * (config.customsRules.morocco.vatRatePercent / 100);
      customsAndTaxesCad = importDuty + parafiscal + vat;
    }
  }

  // Calcul du différentiel si la douane réévalue selon la cote Argus
  const invoiceTaxableValue = vehicle.purchasePriceCad + oceanFreightCad + marineInsuranceCad;
  const invoiceCustomsTaxes = country === 'senegal'
    ? invoiceTaxableValue * (config.customsRules.senegal.taxRatePercent / 100)
    : invoiceTaxableValue * 0.41;
  const argusTaxableValue = estimatedArgusValue + oceanFreightCad + marineInsuranceCad;
  const argusCustomsTaxes = country === 'senegal'
    ? argusTaxableValue * (config.customsRules.senegal.taxRatePercent / 100)
    : argusTaxableValue * 0.41;
  const customsDifferenceArgusCad = Math.max(0, Math.round(argusCustomsTaxes - invoiceCustomsTaxes));

  // 7. Coût total rendu complet (Landed Cost)
  const landedCostCad = vehicle.purchasePriceCad
    + fxSpreadCostCad
    + bankTransferCostCad
    + totalTransportCad
    + auctionAndBrokerFeesCad
    + totalAdditionalFeesCad
    + customsAndTaxesCad;

  const landedCostLocal = landedCostCad * effectiveRate;
  const localCurrencyCode = country === 'senegal' ? 'XOF' : 'MAD';

  // 8. Prix de revente suggéré & profit net
  const suggestedSalePriceCad = landedCostCad * (1 + targetMarginPercent / 100);
  const suggestedSalePriceLocal = suggestedSalePriceCad * effectiveRate;
  const estimatedNetProfitCad = suggestedSalePriceCad - landedCostCad;
  const estimatedNetProfitLocal = suggestedSalePriceLocal - landedCostLocal;
  const estimatedRoiPercent = (estimatedNetProfitCad / landedCostCad) * 100;

  // 9. Éligibilité
  const eligibility = checkEligibility(vehicle, country, customs, config);

  // 10. Scénarios FX
  const createScenario = (percentVar: number): FxScenario => {
    const scenRate = baseRate * (1 + percentVar / 100) * (1 - spreadPercent / 100);
    const saleCadUnderNewRate = suggestedSalePriceLocal / scenRate;
    const profitCad = saleCadUnderNewRate - landedCostCad;
    const profitLocal = suggestedSalePriceLocal - landedCostLocal;
    return {
      percentVariation: percentVar,
      rate: scenRate,
      profitCad: Math.round(profitCad),
      profitLocal: Math.round(profitLocal),
      roiPercent: Math.round((profitCad / landedCostCad) * 1000) / 10,
      marginPercent: Math.round((profitCad / saleCadUnderNewRate) * 1000) / 10
    };
  };

  const fxScenarios = {
    pessimistic: createScenario(-7.5),
    realistic: createScenario(0),
    optimistic: createScenario(7.5)
  };

  // 11. Comparaison marché
  const marketMatch = findMarketComparison(
    vehicle,
    country,
    suggestedSalePriceLocal,
    effectiveRate,
    config
  );

  const breakdown: CostBreakdown = {
    vehiclePurchaseCad: Math.round(vehicle.purchasePriceCad),
    fxSpreadCostCad: Math.round(fxSpreadCostCad),
    bankTransferCostCad: Math.round(bankTransferCostCad),
    inlandOriginCad: Math.round(inlandOriginCad),
    originPortFeesCad: Math.round(portOriginFeesCad),
    oceanFreightCad: Math.round(oceanFreightCad),
    marineInsuranceCad: Math.round(marineInsuranceCad),
    destinationPortFeesCad: Math.round(destinationPortFeesCad),
    inlandDestinationCad: Math.round(inlandDestinationCad),
    totalTransportCad: Math.round(totalTransportCad),
    auctionAndBrokerFeesCad: Math.round(auctionAndBrokerFeesCad),
    transitAgentFeeCad: Math.round(transitAgentFeeCad),
    roroCleaningFeeCad: Math.round(roroCleaningFeeCad),
    portStorageBufferCad: Math.round(portStorageBufferCad),
    batteryAndRepairsCad: Math.round(batteryAndRepairsCad),
    totalAdditionalFeesCad: Math.round(totalAdditionalFeesCad),
    customsTaxableValueCad: Math.round(customsTaxableValueCad),
    customsAndTaxesCad: Math.round(customsAndTaxesCad),
    customsValuationBasis: valuationBasis,
    customsDifferenceArgusCad,
    landedCostCad: Math.round(landedCostCad),
    landedCostLocal: Math.round(landedCostLocal),
    localCurrencyCode,
    effectiveFxRate: effectiveRate,
    baseFxRate: baseRate
  };

  return {
    id: `sim_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    createdAt: new Date().toISOString(),
    vehicle,
    destination: country,
    financing,
    transport,
    customs,
    isEligible: eligibility.isEligible,
    eligibilityMessage: eligibility.message,
    eligibilitySeverity: eligibility.severity,
    breakdown,
    targetMarginPercent,
    suggestedSalePriceCad: Math.round(suggestedSalePriceCad),
    suggestedSalePriceLocal: Math.round(suggestedSalePriceLocal),
    estimatedNetProfitCad: Math.round(estimatedNetProfitCad),
    estimatedNetProfitLocal: Math.round(estimatedNetProfitLocal),
    estimatedRoiPercent: Math.round(estimatedRoiPercent * 10) / 10,
    fxScenarios,
    marketComparison: marketMatch
  };
}

/**
 * Recherche et comparaison avec le marché local
 */
export function findMarketComparison(
  vehicle: Vehicle,
  country: DestinationCountry,
  suggestedSalePriceLocal: number,
  effectiveRate: number,
  config: GlobalReferenceConfig
): MarketComparison | undefined {
  const match = config.marketData.find(
    d =>
      d.country === country &&
      d.brand.toLowerCase() === vehicle.brand.toLowerCase() &&
      d.model.toLowerCase() === vehicle.model.toLowerCase()
  );

  if (!match) return undefined;

  const averageMarketPriceCad = match.averagePriceLocal / effectiveRate;
  const priceDifferenceCad = (suggestedSalePriceLocal - match.averagePriceLocal) / effectiveRate;
  const priceDifferencePercent = Math.round(((suggestedSalePriceLocal - match.averagePriceLocal) / match.averagePriceLocal) * 1000) / 10;

  let verdict: 'tres_competitif' | 'competitif' | 'marge_serree' | 'prix_eleve' = 'competitif';
  let verdictLabel = 'Prix compétitif';
  let verdictDescription = 'Votre prix de revente suggéré est bien positionné par rapport au marché local.';

  if (priceDifferencePercent <= -8) {
    verdict = 'tres_competitif';
    verdictLabel = 'Très compétitif (Vente rapide)';
    verdictDescription = `Votre prix est inférieur de ${Math.abs(priceDifferencePercent)}% au prix moyen du marché local. La vente s'annonce très rapide avec une marge confortable.`;
  } else if (priceDifferencePercent <= 3) {
    verdict = 'competitif';
    verdictLabel = 'Prix aligné au marché';
    verdictDescription = 'Votre prix est parfaitement dans la moyenne des transactions observées sur place.';
  } else if (priceDifferencePercent <= 12) {
    verdict = 'marge_serree';
    verdictLabel = 'Prix légèrement au-dessus';
    verdictDescription = `Votre prix dépasse de ${priceDifferencePercent}% la moyenne du marché local. Prévoir une marge de négociation de 5 à 10%.`;
  } else {
    verdict = 'prix_eleve';
    verdictLabel = 'Risque de mévente';
    verdictDescription = `Votre prix dépasse le marché de ${priceDifferencePercent}%. À ce tarif, le véhicule risque de rester invendu sans baisse de votre prix d'achat ou révision des frais.`;
  }

  return {
    matchedModel: `${match.brand} ${match.model} (${match.yearMin}-${match.yearMax})`,
    averageMarketPriceLocal: match.averagePriceLocal,
    averageMarketPriceCad: Math.round(averageMarketPriceCad),
    priceDifferenceCad: Math.round(priceDifferenceCad),
    priceDifferencePercent,
    verdict,
    verdictLabel,
    verdictDescription,
    source: match.source,
    referenceDate: match.lastUpdated
  };
}

/**
 * Calcul du point d'équilibre pour le groupage
 */
export function calculateBatchOptimization(
  country: DestinationCountry,
  config: GlobalReferenceConfig
) {
  const roroRoute = config.routes.find(r => r.destinationCountry === country && r.mode === 'roro') || config.routes[0];
  const containerRoute = config.routes.find(r => r.destinationCountry === country && r.mode === 'conteneur_complet') || config.routes[2];

  const roroPerCar = roroRoute.inlandOriginCad + roroRoute.portOriginFeesCad + roroRoute.oceanFreightCad + roroRoute.portDestinationFeesCad + roroRoute.inlandDestinationCad;
  const containerFixedTotal = containerRoute.inlandOriginCad + containerRoute.portOriginFeesCad + containerRoute.oceanFreightCad + containerRoute.portDestinationFeesCad + containerRoute.inlandDestinationCad;

  const scenarios = [1, 2, 3, 4].map(count => {
    const containerCostPerCar = Math.round(containerFixedTotal / count);
    const differenceVsRoro = roroPerCar - containerCostPerCar;
    const totalSavingsBatch = differenceVsRoro * count;

    return {
      vehicleCount: count,
      containerCostPerCar,
      roroCostPerCar: roroPerCar,
      savingsPerCar: differenceVsRoro,
      totalSavingsBatch,
      isContainerBetter: containerCostPerCar < roroPerCar
    };
  });

  const breakevenCarCount = scenarios.find(s => s.isContainerBetter)?.vehicleCount || 3;

  return {
    roroRoute,
    containerRoute,
    roroPerCar,
    containerFixedTotal,
    scenarios,
    breakevenCarCount,
    recommendation: `Le groupage en conteneur 40' devient plus économique dès ${breakevenCarCount} véhicules. Pour 1 ou 2 véhicules, le RoRo individuel reste plus avantageux.`
  };
}
