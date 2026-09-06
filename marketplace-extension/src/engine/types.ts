// AUTO-GÉNÉRÉ par scripts/sync-engine.mjs — NE PAS ÉDITER.
// Source : src/types/index.ts · EXTENSION_ENGINE_VERSION=89cf23b1def5a0e1ef9bff58e679eff3d3db2ff9 · sync=2026-09-06T06:13:47.247Z
export type DestinationCountry = 'senegal' | 'maroc';

export type VehicleCategory = 'citadine' | 'berline' | 'suv' | 'camionnette';
export type VehicleCondition = 'excellent' | 'tres_bon' | 'bon' | 'moyen';
export type VehicleSource = 'particulier' | 'concessionnaire' | 'encan';

export interface QuebecOriginRegion {
  id: string;
  name: string;
  citiesDescription: string;
  distanceToMtlKm: number;
  costToMtlCad: number;
  distanceToHalifaxKm: number;
  costToHalifaxCad: number;
}

export interface AdditionalExportCosts {
  includeTransitAgentFee: boolean; // Transitaire local / déclarant agréé
  transitAgentFeeCad: number; // 400 CAD
  includeRoroCleaningFee: boolean; // Lavage & décontamination obligatoire navire
  roroCleaningFeeCad: number; // 180 CAD
  includePortStorageBuffer: boolean; // Provision magasinage portuaire 5 jours
  portStorageBufferCad: number; // 250 CAD
  includeBatteryKeyFee: boolean; // Batterie neuve / clé de secours (encan)
  batteryKeyFeeCad: number; // 200 CAD
  customRepairsCad: number; // Réparations mécaniques/esthétiques avant départ
  isNonRunningTowing: boolean; // Véhicule non-roulant (treuillage +150 CAD)
}

export interface Vehicle {
  brand: string;
  model: string;
  year: number;
  mileageKm: number;
  purchasePriceCad: number;
  category: VehicleCategory;
  condition: VehicleCondition;
  source: VehicleSource;
  auctionFeesCad: number;
  brokerCommissionCad: number;
  originRegionId?: string; // Région de départ au Québec (défaut 'grand-montreal')
  isNonRunning?: boolean; // Inopérant / non-roulant
}

export interface PreloadedVehicle {
  id: string;
  label: string;
  brand: string;
  model: string;
  year: number;
  purchasePriceCad: number;
  estimatedArgusCustomsCad: number; // Cote douanière officielle estimée
  mileageKm: number;
  category: VehicleCategory;
  condition: VehicleCondition;
  source: VehicleSource;
  auctionFeesCad?: number;
  brokerCommissionCad?: number;
}

export type FinancingMethod = 'virement_bancaire' | 'plateforme_transfert' | 'interac_autre';

export interface FinancingConfig {
  method: FinancingMethod;
  fixedFeeCad: number;
  variableFeePercent: number;
  fxSpreadPercent: number; // e.g. 2.5%
}

export type TransportMode = 'roro' | 'conteneur_partage' | 'conteneur_complet';
export type PriceStatus = 'official_tariff' | 'carrier_quote' | 'estimate' | 'quote_required';
export type FreightOfferStatus = 'marketplace_estimate' | 'partner_rate';

export interface FreightMarketOffer {
  id: string;
  routeId: string;
  provider: 'Freightos' | 'SeaRates';
  status: FreightOfferStatus;
  amountCad: number;
  lowCad: number;
  highCad: number;
  currency: string;
  originalLow: number;
  originalHigh: number;
  estimatedDaysMin?: number;
  estimatedDaysMax?: number;
  retrievedAt: string;
  sourceUrl: string;
  attribution: string;
}

export interface FreightComparisonResult {
  offers: FreightMarketOffer[];
  providerStatuses: Array<{
    provider: 'Freightos' | 'SeaRates';
    status: 'available' | 'no_offer' | 'configuration_required' | 'error';
    message: string;
  }>;
}

export interface TransportRoute {
  id: string;
  originPort: string;
  destinationPort: string;
  destinationCountry: DestinationCountry;
  mode: TransportMode;
  inlandOriginCad: number;
  portOriginFeesCad: number;
  oceanFreightCad: number;
  marineInsuranceRatePercent: number;
  portDestinationFeesCad: number;
  inlandDestinationCad: number;
  estimatedDays: number;
  name: string;
  recommended?: boolean;
  priceNote?: string;
  officialSourceUrl?: string;
  carrierName?: string;
  priceStatus: PriceStatus;
  pricingSourceName: string;
  pricingSourceUrl?: string;
  pricingLastVerified: string;
  pricingNote?: string;
}

export interface TransportSelection {
  routeId: string;
  batchVehiclesCount: number; // 1 to 4
  customInlandOriginCad?: number;
  customOceanFreightCad?: number;
  customInlandDestinationCad?: number;
  marketOffer?: FreightMarketOffer;
  additionalCosts?: AdditionalExportCosts;
  quote?: {
    routeId: string;
    carrierName: string;
    reference?: string;
    quotedAt: string;
    validUntil?: string;
    amountCad: number;
    fileName?: string;
    fileHash?: string;
    fileMimeType?: string;
  };
}

export interface MoroccoCustomsOptions {
  isMRE: boolean; // Marocain Résidant à l'Étranger
  mreAgeOver60: boolean;
  residenceOver10Years: boolean;
  isFirstCarInLife: boolean;
}

export type CustomsValuationBasis = 'invoice' | 'argus_official';

export interface CustomsSelection {
  country: DestinationCountry;
  moroccoOptions?: MoroccoCustomsOptions;
  customTaxRatePercent?: number;
  valuationBasis?: CustomsValuationBasis;
  estimatedArgusValueCad?: number;
  valuationReference?: string;
}

export interface CostBreakdown {
  vehiclePurchaseCad: number;
  fxSpreadCostCad: number;
  bankTransferCostCad: number;
  inlandOriginCad: number;
  originPortFeesCad: number;
  oceanFreightCad: number;
  marineInsuranceCad: number;
  destinationPortFeesCad: number;
  inlandDestinationCad: number;
  totalTransportCad: number;
  auctionAndBrokerFeesCad: number;
  transitAgentFeeCad: number;
  roroCleaningFeeCad: number;
  portStorageBufferCad: number;
  batteryAndRepairsCad: number;
  totalAdditionalFeesCad: number;
  customsTaxableValueCad: number;
  customsAndTaxesCad: number;
  customsValuationBasis: CustomsValuationBasis;
  customsDifferenceArgusCad: number;
  landedCostCad: number;
  landedCostLocal: number;
  localCurrencyCode: 'MAD' | 'XOF';
  effectiveFxRate: number;
  baseFxRate: number;
}

export interface FxScenario {
  percentVariation: number;
  rate: number;
  profitCad: number;
  profitLocal: number;
  roiPercent: number;
  marginPercent: number;
}

export interface MarketComparison {
  matchedModel: string;
  averageMarketPriceLocal: number;
  averageMarketPriceCad: number;
  priceDifferenceCad: number;
  priceDifferencePercent: number;
  verdict: 'tres_competitif' | 'competitif' | 'marge_serree' | 'prix_eleve';
  verdictLabel: string;
  verdictDescription: string;
  source: string;
  referenceDate: string;
}

export interface PlatformReference {
  id: string;
  name: string;
  country: DestinationCountry;
  logoText: string;
  badgeColor: string;
  description: string;
  baseUrl: string;
  buildSearchUrl: (brand: string, model: string, year: number) => string;
}

export interface OfficialSource {
  id: string;
  title: string;
  institution: string;
  countryCode: 'QC' | 'SN' | 'MA' | 'INT';
  url: string;
  description: string;
  legalReference?: string;
  lastVerified: string;
}

export interface SimulationResult {
  id: string;
  createdAt: string;
  vehicle: Vehicle;
  destination: DestinationCountry;
  financing: FinancingConfig;
  transport: TransportSelection;
  customs: CustomsSelection;
  isEligible: boolean;
  eligibilityMessage: string;
  eligibilitySeverity: 'success' | 'warning' | 'error';
  breakdown: CostBreakdown;
  targetMarginPercent: number;
  suggestedSalePriceCad: number;
  suggestedSalePriceLocal: number;
  estimatedNetProfitCad: number;
  estimatedNetProfitLocal: number;
  estimatedRoiPercent: number;
  fxScenarios: {
    pessimistic: FxScenario;
    realistic: FxScenario;
    optimistic: FxScenario;
  };
  marketComparison?: MarketComparison;
  calculationStatus: 'indicative' | 'marketplace_rate' | 'carrier_quote';
  assumptions: string[];
}

export interface MarketDataPoint {
  id: string;
  country: DestinationCountry;
  brand: string;
  model: string;
  yearMin: number;
  yearMax: number;
  averagePriceLocal: number;
  currency: 'MAD' | 'XOF';
  source: string;
  lastUpdated: string;
}

export interface CargoVehicleItem {
  id: string;
  vehicle: Vehicle;
  destination: DestinationCountry;
  customs: CustomsSelection;
  targetMarginPercent: number;
}

export interface ContainerCargoBatch {
  id: string;
  routeId: string;
  vehicles: CargoVehicleItem[];
  maxCapacity: number;
}

export interface GlobalReferenceConfig {
  fxRates: {
    CAD_to_MAD: number;
    CAD_to_XOF: number;
    defaultSpreadPercent: number;
    lastUpdated: string;
    isLive?: boolean;
    officialSourceUrl?: string;
  };
  quebecRegions: QuebecOriginRegion[];
  officialSources: OfficialSource[];
  transferMethods: {
    id: FinancingMethod;
    name: string;
    fixedFeeCad: number;
    variableFeePercent: number;
    typicalSpreadPercent: number;
    recommended: boolean;
    description: string;
    advantages: string;
    disadvantages: string;
  }[];
  customsRules: {
    senegal: {
      maxAgeYearsTourism: number;
      maxAgeYearsTrucks: number;
      taxRatePercent: number;
      legalBasis: string;
      lastUpdated: string;
      officialSourceUrl: string;
    };
    morocco: {
      standardImportRatePercent: number;
      vatRatePercent: number;
      parafiscalRatePercent: number;
      mreMaxAgeYears: number;
      mreMaxDiscountPercent: number;
      legalWarning: string;
      lastUpdated: string;
      officialSourceUrl: string;
    };
  };
  routes: TransportRoute[];
  marketData: MarketDataPoint[];
}
