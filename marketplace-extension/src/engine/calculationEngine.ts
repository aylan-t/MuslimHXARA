// AUTO-GÉNÉRÉ par scripts/sync-engine.mjs — NE PAS ÉDITER.
// Source : src/services/calculationEngine.ts · EXTENSION_ENGINE_VERSION=d72cb8c705d41701f96a343c27e78c3e0ae75a6a · sync=2026-09-06T17:07:37.459Z
import {
  Vehicle,
  DestinationCountry,
  FinancingConfig,
  TransportSelection,
  CustomsSelection,
  CustomsValuationBasis,
  GlobalReferenceConfig,
  CostBreakdown,
  SimulationResult,
  MarketComparison,
  FxScenario
} from './types';
import { QUEBEC_REGIONS } from './defaultData';

export const CURRENT_YEAR = new Date().getFullYear();

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
  const ageLabel = age <= 0 ? "moins d'un an" : `${age} an(s)`;

  if (vehicle.steering === 'RHD' || vehicle.isJdm) {
    return {
      isEligible: false,
      severity: 'error',
      message: `VÉHICULE NON IMPORTABLE : la conduite à droite (RHD), notamment les imports JDM, n’est pas admise sur les corridors Sénégal et Maroc. Seuls les véhicules à conduite à gauche (LHD) sont acceptés.`
    };
  }

  if (country === 'senegal') {
    if (!vehicle.classificationVerified || vehicle.grossVehicleWeightKg <= 0) {
      return { isEligible: false, severity: 'error', message: 'CLASSIFICATION DOUANIÈRE À CONFIRMER : indiquez et vérifiez la classe du véhicule et son poids total en charge avant de déterminer son admissibilité au Sénégal.' };
    }
    const isHeavy = vehicle.grossVehicleWeightKg > 3500;
    const maxAge = isHeavy
      ? config.customsRules.senegal.maxAgeYearsTrucks
      : config.customsRules.senegal.maxAgeYearsTourism;

    if (age > maxAge) {
      return {
        isEligible: false,
        severity: 'error',
        message: `VÉHICULE NON IMPORTABLE AU SÉNÉGAL : Ce véhicule a ${ageLabel}. Selon le décret officiel du 24 octobre 2025, la limite applicable aux véhicules ${isHeavy ? 'lourds (> 3,5 t)' : 'légers / passagers (≤ 3,5 t)'} est de ${maxAge} ans (année minimum : ${CURRENT_YEAR - maxAge}).`
      };
    }

    if (age >= maxAge - 1) {
      return {
        isEligible: true,
        severity: 'warning',
        message: `ATTENTION ÉCHÉANCE : Ce véhicule a ${ageLabel} (limite légale : ${maxAge} ans). Assurez-vous impérativement qu'il arrive et soit enregistré au port de Dakar avant le 31 décembre pour éviter le passage à ${age + 1} ans et un refus douanier.`
      };
    }

    return {
      isEligible: true,
      severity: 'success',
      message: `VÉHICULE PLEINEMENT ÉLIGIBLE AU SÉNÉGAL : Ce véhicule a ${ageLabel}, en parfaite conformité avec le décret officiel du 24 octobre 2025 (limite max : ${maxAge} ans pour tourisme).`
    };
  }

  // Maroc
  if (!vehicle.classificationVerified) {
    return { isEligible: false, severity: 'error', message: 'CLASSIFICATION DOUANIÈRE À CONFIRMER : la classe du véhicule doit être vérifiée avant l’importation au Maroc.' };
  }
  if (vehicle.vehicleClassification === 'commercial_utility') {
    return { isEligible: false, severity: 'error', message: 'CLASSIFICATION MANUELLE REQUISE AU MAROC : les utilitaires commerciaux ne relèvent pas des seuils passagers/MRE du guide. Obtenez le classement douanier et l’autorisation applicables avant achat.' };
  }
  const isMRE = customs.moroccoOptions?.isMRE ?? false;
  if (isMRE) {
    const maxMreAge = config.customsRules.morocco.mreMaxAgeYears;
    if (age > maxMreAge) {
      return {
        isEligible: false,
        severity: 'error',
        message: `NON ÉLIGIBLE AU RÉGIME MRE : le régime retraité MRE accepte un véhicule de ${maxMreAge} ans maximum. Ce véhicule a ${ageLabel}.`
      };
    }
    const hasConfirmedConditions = Boolean(
      customs.moroccoOptions?.mreAgeOver60
      && customs.moroccoOptions?.residenceOver10Years
      && customs.moroccoOptions?.isFirstCarInLife
    );
    if (!hasConfirmedConditions) {
      return {
        isEligible: true,
        severity: 'warning',
        message: `RÉGIME MRE NON CONFIRMÉ : toutes les conditions déclaratives doivent être cochées. Tant qu'elles ne le sont pas, le calcul conserve le régime douanier standard sans abattement.`
      };
    }
    return {
      isEligible: true,
      severity: 'success',
      message: `CONDITIONS MRE DÉCLARÉES : véhicule de ${ageLabel} et critères déclaratifs confirmés. L'abattement est appliqué à la simulation, sous réserve de validation documentaire par la douane.`
    };
  }

  // Maroc régime standard : un véhicule ayant exactement 5 ans est déjà refusé.
  if (age >= 5) {
    return {
      isEligible: false,
      severity: 'error',
      message: `VÉHICULE NON IMPORTABLE AU MAROC (RÉGIME STANDARD) : les véhicules de 5 ans ou plus sont refusés. Ce véhicule a ${ageLabel}.`
    };
  }
  return {
    isEligible: true,
    severity: 'success',
    message: `VÉHICULE ÉLIGIBLE AU MAROC : ce véhicule a ${ageLabel}, soit moins de 5 ans. Homologation NARSA requise après l’arrivée.`
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
  const baseRate = country === 'senegal'
    ? (config.fxRates.marketCAD_to_XOF ?? config.fxRates.CAD_to_XOF)
    : (config.fxRates.marketCAD_to_MAD ?? config.fxRates.CAD_to_MAD);
  const customsRate = country === 'senegal'
    ? (config.fxRates.customsAssessedCAD_to_XOF ?? config.fxRates.CAD_to_XOF)
    : (config.fxRates.customsAssessedCAD_to_MAD ?? config.fxRates.CAD_to_MAD);
  // Spread bancaire de corridor imposé par le guide; le taux douanier reste le
  // taux officiel (baseRate), sans diminution liée au spread de règlement.
  const spreadPercent = country === 'senegal' ? 2.5 : 2.2;
  const effectiveRate = baseRate * (1 - spreadPercent / 100);
  const fxSpreadCostCad = vehicle.purchasePriceCad * (spreadPercent / 100);

  // 2. Frais de transfert bancaire
  const bankTransferCostCad = financing.fixedFeeCad + (vehicle.purchasePriceCad * (financing.variableFeePercent / 100));

  // 3. Transport terrestre d'origine précis selon la région québécoise choisie
  const countryRoutes = config.routes.filter((route) => route.destinationCountry === country);
  const selectedRoute = countryRoutes.find((route) => route.id === transport.routeId) || countryRoutes[0];
  if (!selectedRoute) {
    throw new Error(`Aucune route de transport n'est configurée pour la destination ${country}.`);
  }
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
  const quoteIsCurrent = Boolean(
    transport.quote?.validUntil
    && transport.quote.validUntil > new Date().toISOString().slice(0, 10)
  );
  const validCarrierQuote = transport.quote?.routeId === selectedRoute.id
    && transport.quote.amountCad > 0
    && Boolean(transport.quote.carrierName.trim())
    && Boolean(transport.quote.reference?.trim())
    && Boolean(transport.quote.quotedAt)
    && Boolean(transport.quote.fileHash && transport.quote.fileName)
    && quoteIsCurrent
    ? transport.quote
    : undefined;
  const marketOfferIsCurrent = Boolean(
    transport.marketOffer?.validUntil
    && new Date(transport.marketOffer.validUntil).getTime() > Date.now()
  );
  const validMarketOffer = transport.marketOffer?.routeId === selectedRoute.id
    && transport.marketOffer.amountCad > 0
    && marketOfferIsCurrent
    ? transport.marketOffer
    : undefined;
  const quotedFreightCad = validCarrierQuote?.amountCad ?? validMarketOffer?.amountCad ?? transport.customOceanFreightCad;
  const oceanFreightCad = isContainer
    ? (quotedFreightCad ?? selectedRoute.oceanFreightCad) / batchCount
    : (quotedFreightCad ?? selectedRoute.oceanFreightCad);

  const marineInsuranceCad = vehicle.purchasePriceCad * 0.015;
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
  const cersFeeCad = vehicle.purchasePriceCad > 2000 ? 100 : 0;
  const bscFeeCad = country === 'senegal' ? 150 : 0;
  const narsaFeeCad = country === 'maroc' ? 250 : 0;
  const totalComplianceFeesCad = cersFeeCad + bscFeeCad + narsaFeeCad;

  // 6. Douane & Taxes : une valeur externe n'est utilisée que si elle est documentée.
  const requestedValuationBasis = customs.valuationBasis || 'invoice';
  const hasDocumentedValuation = Boolean(
    customs.estimatedArgusValueCad
    && customs.estimatedArgusValueCad > 0
    && customs.valuationReference?.trim()
  );
  const valuationBasis: CustomsValuationBasis = requestedValuationBasis === 'argus_official' && hasDocumentedValuation
    ? 'argus_official'
    : 'invoice';
  let estimatedArgusValue = customs.estimatedArgusValueCad;
  if (!estimatedArgusValue) {
    const preloadedMatch = config.marketData.find(
      d => d.country === country && d.brand.toLowerCase() === vehicle.brand.toLowerCase() && d.model.toLowerCase() === vehicle.model.toLowerCase()
    );
    estimatedArgusValue = preloadedMatch ? Math.round(preloadedMatch.averagePriceLocal / effectiveRate * 0.75) : Math.round(vehicle.purchasePriceCad * 1.15);
  }

  // Base taxable
  const taxableBaseVehicle = valuationBasis === 'argus_official' ? estimatedArgusValue : vehicle.purchasePriceCad;
  const customsFreightCad = 2200;
  const customsTaxableValueCad = taxableBaseVehicle + customsFreightCad + marineInsuranceCad;

  let customsAndTaxesCad = 0;
  let customsDutyCad = 0;
  let statisticalTaxCad = 0;
  let regionalLeviesCad = 0;
  let parafiscalTaxCad = 0;
  let ticCad = 0;
  let vatCad = 0;

  if (country === 'senegal') {
    // Formule officielle: DD 20%, RS 1%, prélèvements 1,7%, puis TVA 18%
    // sur la CAF augmentée de ces trois postes.
    const cifXof = customsTaxableValueCad * customsRate;
    customsDutyCad = (cifXof * 0.20) / customsRate;
    statisticalTaxCad = (cifXof * 0.01) / customsRate;
    regionalLeviesCad = (cifXof * 0.017) / customsRate;
    vatCad = (cifXof + cifXof * 0.20 + cifXof * 0.01 + cifXof * 0.017) * 0.18 / customsRate;
    customsAndTaxesCad = customsDutyCad + statisticalTaxCad + regionalLeviesCad + vatCad;
  } else {
    // Maroc
    const mre = customs.moroccoOptions;
    const canApplyMreDiscount = Boolean(
      mre?.isMRE
      && mre.mreAgeOver60
      && mre.residenceOver10Years
      && mre.isFirstCarInLife
      && CURRENT_YEAR - vehicle.year <= 10
    );
    const cifMad = customsTaxableValueCad * customsRate;
    customsDutyCad = (cifMad * 0.175 * (canApplyMreDiscount ? 0.15 : 1)) / customsRate;
    parafiscalTaxCad = (cifMad * 0.0025) / customsRate;
    const ticMad = vehicle.fuelType === 'Electric'
      ? 0
      : vehicle.engineCc < 1500
        ? (vehicle.fuelType === 'Diesel' ? 30000 : 25000)
        : vehicle.engineCc < 2000
          ? (vehicle.fuelType === 'Diesel' ? 48000 : 40000)
          : vehicle.engineCc < 2500
            ? (vehicle.fuelType === 'Diesel' ? 72000 : 60000)
            : (vehicle.fuelType === 'Diesel' ? 120000 : 100000);
    ticCad = ticMad / customsRate;
    vatCad = (cifMad + customsDutyCad * customsRate + parafiscalTaxCad * customsRate + ticMad) * 0.20 / customsRate;
    customsAndTaxesCad = customsDutyCad + parafiscalTaxCad + ticCad + vatCad;
  }

  // Calcul du différentiel si la douane réévalue selon la cote Argus
  const invoiceTaxableValue = vehicle.purchasePriceCad + customsFreightCad + marineInsuranceCad;
  const argusTaxableValue = estimatedArgusValue + customsFreightCad + marineInsuranceCad;
  const taxesForCif = (cifCad: number) => {
    if (country === 'senegal') {
      const cifLocal = cifCad * customsRate;
      const dd = cifLocal * 0.20;
      const rs = cifLocal * 0.01;
      const regional = cifLocal * 0.017;
      return (dd + rs + regional + (cifLocal + dd + rs + regional) * 0.18) / customsRate;
    }
    const cifLocal = cifCad * customsRate;
    const mre = customs.moroccoOptions;
    const isMre = Boolean(
      mre?.isMRE
      && mre.mreAgeOver60
      && mre.residenceOver10Years
      && mre.isFirstCarInLife
      && CURRENT_YEAR - vehicle.year <= 10
    );
    const dd = cifLocal * 0.175 * (isMre ? 0.15 : 1);
    const tpi = cifLocal * 0.0025;
    const tic = ticCad * customsRate;
    return (dd + tpi + tic + (cifLocal + dd + tpi + tic) * 0.20) / customsRate;
  };
  const invoiceCustomsTaxes = taxesForCif(invoiceTaxableValue);
  const argusCustomsTaxes = taxesForCif(argusTaxableValue);
  const customsDifferenceArgusCad = Math.max(0, Math.round(argusCustomsTaxes - invoiceCustomsTaxes));

  // 7. Coût total rendu complet (Landed Cost)
  const landedCostCad = vehicle.purchasePriceCad
    + fxSpreadCostCad
    + bankTransferCostCad
    + totalTransportCad
    + auctionAndBrokerFeesCad
    + totalAdditionalFeesCad
    + totalComplianceFeesCad
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
  const hasUserDocumentedQuote = Boolean(validCarrierQuote);
  const hasCarrierQuote = validMarketOffer?.status === 'carrier_quote';
  const hasMarketOffer = Boolean(validMarketOffer);
  const assumptions = [
    ...(hasCarrierQuote
      ? [`Fret basé sur un devis transporteur validé provenant de ${validMarketOffer?.provider}.`]
      : hasUserDocumentedQuote
        ? [`Fret basé sur le document ${validCarrierQuote?.reference || 'fourni'} déclaré par l’utilisateur; son authenticité n’est pas vérifiée par AutoTransat QC.`]
        : hasMarketOffer
        ? [`Fret basé sur une estimation marketplace ${validMarketOffer?.provider} récupérée le ${new Date(validMarketOffer!.retrievedAt).toLocaleDateString('fr-CA')}; confirmation requise.`]
        : ['Fret maritime indicatif : un devis officiel du transporteur est requis avant engagement.']),
    ...(config.fxRates.isLive
      ? ['Taux de change de marché indicatif, distinct du taux réellement offert par votre institution financière.']
      : ['Taux de change local de repli : actualisation recommandée.']),
    'Frais portuaires et terrestres à reconfirmer selon la date, le véhicule et les prestataires.',
    ...(cersFeeCad ? ['CERS obligatoire au moins 48 heures avant le chargement (véhicule de plus de 2 000 $ CA); frais estimés à 100 $ CA.'] : []),
    'Contrôle PPSA requis avant achat : confirmer l’absence de financement ou de privilège bancaire sur le véhicule.',
    ...(country === 'senegal'
      ? ['BSC obligatoire avant embarquement (150 $ CA).']
      : ['Inspection d’homologation NARSA obligatoire après arrivée (250 $ CA).']),
  ];

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
    cersFeeCad,
    bscFeeCad,
    narsaFeeCad,
    totalComplianceFeesCad,
    customsTaxableValueCad: Math.round(customsTaxableValueCad),
    customsFreightCad,
    customsDutyCad: Math.round(customsDutyCad),
    statisticalTaxCad: Math.round(statisticalTaxCad),
    regionalLeviesCad: Math.round(regionalLeviesCad),
    parafiscalTaxCad: Math.round(parafiscalTaxCad),
    ticCad: Math.round(ticCad),
    vatCad: Math.round(vatCad),
    customsAndTaxesCad: Math.round(customsAndTaxesCad),
    customsValuationBasis: valuationBasis,
    customsDifferenceArgusCad,
    landedCostCad: Math.round(landedCostCad),
    landedCostLocal: Math.round(landedCostLocal),
    localCurrencyCode,
    effectiveFxRate: effectiveRate,
    baseFxRate: baseRate,
    customsAssessedFxRate: customsRate
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
    marketComparison: marketMatch,
    calculationStatus: hasCarrierQuote
      ? 'carrier_quote'
      : hasUserDocumentedQuote
        ? 'user_documented_quote'
        : hasMarketOffer
          ? 'marketplace_rate'
          : 'indicative',
    assumptions
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
