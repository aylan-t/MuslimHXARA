/**
 * normalize.ts — AGENT-03
 * Convertit un RawListing (sortie parser.ts, AGENT-02) en NormalizedInputs
 * (entrée overlay + prefill.ts), selon MARKETPLACE_EXTENSION.md §4.
 *
 * ZÉRO dépendance, ZÉRO réseau, ZÉRO calcul de coût (le moteur tranche).
 * Types = copies à l'identique de src/types/index.ts (checklist §0).
 * Après `npm run sync:extension-engine` (AGENT-01), les types pourront être
 * réimportés depuis '../engine/types' — formes strictement identiques.
 */

// ---------------------------------------------------------------------------
// Types partagés (copies à l'identique — ne pas redéfinir ailleurs, cf. §0)
// ---------------------------------------------------------------------------

export interface RawListing {
  listingId: string;
  listingUrl: string;
  titleH1: string;
  priceRaw: string | null;
  priceValue: number | null;
  currencyFlag: 'CAD' | 'US' | 'UNKNOWN';
  locationRaw: string | null;
  city: string | null;
  mileageKm: number | null;
  fuelRaw: string | null;
  engineLitres: number | null;
  yearInTitle: number | null;
  yearInBlock: number | null;
  blockFormat: 'apropos' | 'renseignements' | 'none';
  descriptionText: string;
  vin: string | null;
  steeringSide: 'LHD' | 'RHD';
  steeringEvidence: string | null;
  isLeaseSuspect: boolean;
  rejection: null | {
    code: 'USD_PRICE' | 'LEASE_PRICE' | 'NO_PRICE' | 'NO_YEAR' | 'NOT_VEHICLE';
    message: string;
  };
}

export type DestinationCountry = 'senegal' | 'maroc';
export type VehicleCategory = 'citadine' | 'berline' | 'suv' | 'camionnette';
export type VehicleCondition = 'excellent' | 'tres_bon' | 'bon' | 'moyen';
export type VehicleSource = 'particulier' | 'concessionnaire' | 'encan';
export type FuelType = 'Gasoline' | 'Diesel' | 'Hybrid' | 'Electric';
export type SteeringLayout = 'LHD' | 'RHD';
export type FinancingMethod = 'virement_bancaire' | 'plateforme_transfert' | 'interac_autre';
export type CustomsValuationBasis = 'invoice' | 'argus_official';

export interface Vehicle {
  brand: string;
  model: string;
  year: number;
  mileageKm: number;
  purchasePriceCad: number;
  engineCc: number;
  fuelType: FuelType;
  steering: SteeringLayout;
  isJdm?: boolean;
  vehicleClassification: 'passenger' | 'commercial_utility';
  grossVehicleWeightKg: number;
  classificationVerified: boolean;
  category: VehicleCategory;
  condition: VehicleCondition;
  source: VehicleSource;
  auctionFeesCad: number;
  brokerCommissionCad: number;
  originRegionId?: string;
  isNonRunning?: boolean;
}

export interface FinancingConfig {
  method: FinancingMethod;
  fixedFeeCad: number;
  variableFeePercent: number;
  fxSpreadPercent: number;
}

export interface AdditionalExportCosts {
  includeTransitAgentFee: boolean;
  transitAgentFeeCad: number;
  includeRoroCleaningFee: boolean;
  roroCleaningFeeCad: number;
  includePortStorageBuffer: boolean;
  portStorageBufferCad: number;
  includeBatteryKeyFee: boolean;
  batteryKeyFeeCad: number;
  customRepairsCad: number;
  isNonRunningTowing: boolean;
}

export interface TransportSelection {
  routeId: string;
  batchVehiclesCount: number;
  customInlandOriginCad?: number;
  customOceanFreightCad?: number;
  customInlandDestinationCad?: number;
  additionalCosts?: AdditionalExportCosts;
}

export interface MoroccoCustomsOptions {
  isMRE: boolean;
  mreAgeOver60: boolean;
  residenceOver10Years: boolean;
  isFirstCarInLife: boolean;
}

export interface CustomsSelection {
  country: DestinationCountry;
  moroccoOptions?: MoroccoCustomsOptions;
  customTaxRatePercent?: number;
  valuationBasis?: CustomsValuationBasis;
  estimatedArgusValueCad?: number;
}

export interface NormalizedInputs {
  vehicle: Vehicle;
  destination: DestinationCountry;
  financing: FinancingConfig;
  transport: TransportSelection;
  customs: CustomsSelection;
  targetMarginPercent: number;
}

export type NormalizeRejectionCode =
  | 'USD_PRICE'
  | 'LEASE_PRICE'
  | 'NO_PRICE'
  | 'NO_YEAR'
  | 'NOT_VEHICLE';

export interface NormalizeRejection {
  code: NormalizeRejectionCode;
  message: string;
}

export type NormalizeResult =
  | {
      ok: true;
      inputs: NormalizedInputs;
      /** Avertissements purement informatifs — ne bloquent jamais le calcul. */
      warnings: string[];
      /** true quand `category` vaut 'suv' par défaut (« catégorie supposée, à vérifier »). */
      categoryAssumed: boolean;
    }
  | { ok: false; rejection: NormalizeRejection; warnings: string[] };

export interface NormalizeOptions {
  /**
   * Destination cible. Défaut 'senegal'.
   * (La persistance du dernier choix via chrome.storage.local sera gérée par AGENT-05.)
   */
  destination?: DestinationCountry;
  /** Valeurs confirmées dans l'étape de vérification rapide. */
  verifiedVehicle?: {
    year: number;
    brand: string;
    model: string;
    purchasePriceCad: number;
    engineCc?: number;
    fuelType?: FuelType;
    steering?: SteeringLayout;
    vehicleClassification?: 'passenger' | 'commercial_utility';
    grossVehicleWeightKg?: number;
    classificationVerified?: boolean;
  };
}

// ---------------------------------------------------------------------------
// Constantes §4.2 (défauts app — miroirs de DEFAULT_CONFIG, jamais calculés)
// ---------------------------------------------------------------------------

export const DEFAULT_MILEAGE_KM = 120000;
export const DEFAULT_TARGET_MARGIN_PERCENT = 18;
export const DEFAULT_ORIGIN_REGION_ID = 'grand-montreal';
export const ROUTE_ID_SENEGAL = 'mtl-dkr-roro';
export const ROUTE_ID_MAROC = 'mtl-casa-roro';
const MIN_YEAR = 1980;
const MAX_YEAR = 2027;

const CATEGORY_ASSUMED_WARNING = 'Catégorie supposée (suv par défaut) — à vérifier dans l’annonce.';
const ACCIDENT_HISTORY_WARNING =
  'Historique d’accident / VGA mentionné dans l’annonce — état à vérifier (informatif, calcul inchangé).';
const RHD_WARNING =
  'Mention JDM/RHD détectée — volant à droite à vérifier avant export.';

// ---------------------------------------------------------------------------
// Utilitaires texte
// ---------------------------------------------------------------------------

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Normalisation ville : minuscules, sans accents, sans séparateurs. */
function flatCity(s: string): string {
  return stripAccents(s.toLowerCase()).replace(/[^a-z0-9]/g, '');
}

function capitalize(token: string): string {
  if (!token) return token;
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

function normalizeFuelType(raw: string | null): FuelType {
  const text = stripAccents(raw ?? '').toLowerCase();
  if (/hybrid|hybride/.test(text)) return 'Hybrid';
  if (/electric|electrique/.test(text)) return 'Electric';
  if (/diesel/.test(text)) return 'Diesel';
  // This provisional value cannot reach calculation: the verification UI
  // requires an explicit fuel choice when Marketplace did not provide one.
  return 'Gasoline';
}

// ---------------------------------------------------------------------------
// §4.1 — brand / model depuis le H1
// ---------------------------------------------------------------------------

/** Mots génériques en tête de titre à ignorer avant la marque (« Voiture Mazda 2 »). */
const GENERIC_LEADERS = new Set([
  'voiture',
  'vehicule',
  'auto',
  'automobile',
  'car',
  'vehicle',
  'vendre',
]);

function parseBrandModel(titleH1: string): { brand: string; model: string } | null {
  // Retire l'année (toute occurrence 1980–2027) puis découpe en tokens.
  const noYear = titleH1.replace(/\b(19[89]\d|20[0-2]\d)\b/g, ' ');
  const tokens = noYear.split(/\s+/).filter(Boolean);
  while (tokens.length > 1 && GENERIC_LEADERS.has(flatCity(tokens[0]))) tokens.shift();
  if (tokens.length < 2) return null; // marque ou modèle absent → NOT_VEHICLE
  const brand = capitalize(tokens[0]);
  const modelTokens = tokens.slice(1);
  // Dédup : « MAZDA MAZDA3 » → modèle « MAZDA3 » (compare insensible à la casse).
  while (modelTokens.length > 0 && modelTokens[0].toLowerCase() === brand.toLowerCase()) {
    modelTokens.shift();
  }
  if (modelTokens.length === 0) return null;
  return { brand, model: modelTokens.join(' ') };
}

// ---------------------------------------------------------------------------
// §4.1 — category (heuristique titre, jamais bloquante)
// ---------------------------------------------------------------------------

export function guessCategory(
  titleH1: string,
  model: string,
): { category: VehicleCategory; assumed: boolean } {
  const t = stripAccents(titleH1.toLowerCase());
  const m = stripAccents(model.toLowerCase().trim());
  if (
    t.includes('cr-v') ||
    /\bcrv\b/.test(t) ||
    /\brx\b/.test(t) ||
    t.includes('santa fe') ||
    /\bc-?hr\b/.test(t) ||
    t.includes('ev6')
  ) {
    return { category: 'suv', assumed: false };
  }
  if (/\bf-?150\b/.test(t) || t.includes('pickup')) {
    return { category: 'camionnette', assumed: false };
  }
  if (
    /\bfit\b/.test(t) ||
    t.includes('yaris') ||
    t.includes('500e') ||
    t.includes('cooper') ||
    m.includes('mazda2') ||
    m === '2'
  ) {
    return { category: 'citadine', assumed: false };
  }
  if (t.includes('berline') || t.includes('sedan')) {
    return { category: 'berline', assumed: false };
  }
  return { category: 'suv', assumed: true };
}

// ---------------------------------------------------------------------------
// §4.1 — originRegionId via la ville (miroir de QUEBEC_REGIONS, noms seuls)
// ---------------------------------------------------------------------------

const GRAND_MONTREAL_CITIES = new Set([
  'montreal',
  'laval',
  'longueuil',
  'montroyal',
  'brossard',
  'terrebonne',
]);

/** Table ville → région dérivée de QUEBEC_REGIONS (src/data/defaultData.ts). */
const CITY_TO_REGION: Array<{ id: string; cities: string[] }> = [
  { id: 'grand-montreal', cities: ['montreal', 'laval', 'longueuil', 'mirabel', 'terrebonne', 'brossard', 'montroyal'] },
  { id: 'centre-quebec', cities: ['troisrivieres', 'drummondville', 'victoriaville', 'saintmaurice'] },
  { id: 'quebec-levis', cities: ['quebec', 'villedequebec', 'levis', 'saintefoy', 'beauport', 'saintnicolas'] },
  { id: 'estrie', cities: ['sherbrooke', 'magog', 'granby', 'cowansville'] },
  { id: 'outaouais', cities: ['gatineau', 'hull', 'saintjerome', 'saintsauveur'] },
  { id: 'saguenay', cities: ['saguenay', 'chicoutimi', 'jonquiere', 'alma'] },
  { id: 'bas-saint-laurent', cities: ['rimouski', 'riviereduloup', 'matane', 'montjoli'] },
];

function extractCity(locationRaw: string | null, city: string | null): string | null {
  if (city && city.trim()) return city.trim();
  if (!locationRaw) return null;
  const m =
    locationRaw.match(/sur\s+([A-Za-zÀ-ÿ\-\s']+),\s*QC/i) ||
    locationRaw.match(/in\s+([A-Za-zÀ-ÿ\-\s']+),\s*QC/i);
  return m ? (m[1] || m[2] || '').trim() || null : null;
}

export function resolveOriginRegionId(
  locationRaw: string | null,
  city: string | null,
): string {
  const found = extractCity(locationRaw, city);
  if (!found) return DEFAULT_ORIGIN_REGION_ID;
  const flat = flatCity(found);
  if (GRAND_MONTREAL_CITIES.has(flat)) return 'grand-montreal';
  for (const region of CITY_TO_REGION) {
    if (region.cities.some((c) => flat.includes(c) || c.includes(flat))) return region.id;
  }
  return DEFAULT_ORIGIN_REGION_ID;
}

// ---------------------------------------------------------------------------
// §4.1 — isNonRunning + warnings informatifs (jamais de rejet)
// ---------------------------------------------------------------------------

const NON_RUNNING_RE = /pour pièces|parts only|non roulant|accidenté|scrap/i;
const NON_RUNNING_RE_FLAT = /pour pieces|parts only|non roulant|accidente|scrap/i;
const ACCIDENT_HISTORY_RE = /\bvga\b|accident|rebuilt|reconstruit|salvage/i;

function detectNonRunning(titleH1: string, descriptionText: string): boolean {
  const hay = `${titleH1}\n${descriptionText}`;
  return NON_RUNNING_RE.test(hay) || NON_RUNNING_RE_FLAT.test(stripAccents(hay));
}

function detectAccidentHistory(titleH1: string, descriptionText: string): boolean {
  return ACCIDENT_HISTORY_RE.test(`${titleH1}\n${descriptionText}`);
}

// ---------------------------------------------------------------------------
// Défauts §4.2
// ---------------------------------------------------------------------------

function defaultFinancing(): FinancingConfig {
  return {
    method: 'plateforme_transfert',
    fixedFeeCad: 15,
    variableFeePercent: 0.7,
    fxSpreadPercent: 1.2,
  };
}

function defaultTransport(destination: DestinationCountry): TransportSelection {
  return {
    routeId: destination === 'maroc' ? ROUTE_ID_MAROC : ROUTE_ID_SENEGAL,
    batchVehiclesCount: 1,
    additionalCosts: {
      includeTransitAgentFee: true,
      transitAgentFeeCad: 400,
      includeRoroCleaningFee: true,
      roroCleaningFeeCad: 180,
      includePortStorageBuffer: true,
      portStorageBufferCad: 250,
      includeBatteryKeyFee: false,
      batteryKeyFeeCad: 200,
      customRepairsCad: 0,
      isNonRunningTowing: false,
    },
  };
}

function defaultCustoms(destination: DestinationCountry): CustomsSelection {
  return {
    country: destination,
    valuationBasis: 'invoice',
    // Le moteur estime seul l'Argus (marketData) : ne JAMAIS saisir estimatedArgusValueCad.
    moroccoOptions: {
      isMRE: false,
      mreAgeOver60: false,
      residenceOver10Years: false,
      isFirstCarInLife: false,
    },
  };
}

// ---------------------------------------------------------------------------
// normalizeListing — RawListing → NormalizedInputs | { rejection }
// ---------------------------------------------------------------------------

export function normalizeListing(raw: RawListing, opts?: NormalizeOptions): NormalizeResult {
  const destination: DestinationCountry = opts?.destination ?? 'senegal';

  // 1. Rejets du parser propagés tels quels (USD_PRICE / LEASE_PRICE / NO_PRICE / …).
  if (raw.rejection) {
    return { ok: false, rejection: { ...raw.rejection }, warnings: [] };
  }

  // 2. Garde-fous prix : CAD seul ($ / C$ / CAD). Marqueur US → rejet, jamais de conversion.
  if (raw.currencyFlag === 'US') {
    return {
      ok: false,
      rejection: {
        code: 'USD_PRICE',
        message: 'Prix en $US détecté — saisissez le prix CAD pour estimer l’export.',
      },
      warnings: [],
    };
  }
  if (raw.isLeaseSuspect) {
    return {
      ok: false,
      rejection: {
        code: 'LEASE_PRICE',
        message: 'Prix non interprétable (location / transfert de bail probable) — aucun calcul.',
      },
      warnings: [],
    };
  }
  const purchasePriceCad = opts?.verifiedVehicle?.purchasePriceCad ?? raw.priceValue;
  if (purchasePriceCad == null || !Number.isFinite(purchasePriceCad) || purchasePriceCad <= 0) {
    return {
      ok: false,
      rejection: { code: 'NO_PRICE', message: 'Prix d’achat introuvable dans l’annonce.' },
      warnings: [],
    };
  }

  // 3. Marque / modèle depuis le H1.
  const verified = opts?.verifiedVehicle;
  const brandModel = verified?.brand.trim() && verified.model.trim()
    ? { brand: verified.brand.trim(), model: verified.model.trim() }
    : parseBrandModel(raw.titleH1);
  if (!brandModel) {
    return {
      ok: false,
      rejection: {
        code: 'NOT_VEHICLE',
        message: 'Annonce non interprétable (marque ou modèle introuvable) — overlay inactif.',
      },
      warnings: [],
    };
  }

  // 4. Année : titre sinon bloc (1980–2027) sinon NO_YEAR.
  const year =
    verified?.year != null && verified.year >= MIN_YEAR && verified.year <= MAX_YEAR
      ? verified.year
      : raw.yearInTitle != null && raw.yearInTitle >= MIN_YEAR && raw.yearInTitle <= MAX_YEAR
      ? raw.yearInTitle
      : raw.yearInBlock != null && raw.yearInBlock >= MIN_YEAR && raw.yearInBlock <= MAX_YEAR
        ? raw.yearInBlock
        : null;
  if (year == null) {
    return {
      ok: false,
      rejection: { code: 'NO_YEAR', message: 'Année du véhicule introuvable dans l’annonce.' },
      warnings: [],
    };
  }

  // 5. Champs moteur : mileageKm sinon 120000 (informatif). fuelRaw / engineLitres
  //    (ex. « -1.0 L » déjà neutralisé par le parser, « 328i xdrive » en description)
  //    ne sont JAMAIS utilisés — le type Vehicle n'a ni fuelType ni cylindrée.
  const mileageKm =
    raw.mileageKm != null && Number.isFinite(raw.mileageKm) && raw.mileageKm > 0
      ? Math.round(raw.mileageKm)
      : DEFAULT_MILEAGE_KM;

  const { category, assumed: categoryAssumed } = guessCategory(raw.titleH1, brandModel.model);

  const warnings: string[] = [];
  if (categoryAssumed) warnings.push(CATEGORY_ASSUMED_WARNING);
  if (detectAccidentHistory(raw.titleH1, raw.descriptionText)) {
    warnings.push(ACCIDENT_HISTORY_WARNING);
  }
  if (raw.steeringSide === 'RHD') warnings.push(RHD_WARNING);

  const vehicle: Vehicle = {
    brand: brandModel.brand,
    model: brandModel.model,
    year,
    mileageKm,
    purchasePriceCad,
    engineCc: verified?.engineCc != null && verified.engineCc > 0
      ? Math.round(verified.engineCc)
      : Math.round((raw.engineLitres ?? 0) * 1000),
    fuelType: verified?.fuelType ?? normalizeFuelType(raw.fuelRaw),
    steering: verified?.steering ?? raw.steeringSide,
    isJdm: (verified?.steering ?? raw.steeringSide) === 'RHD',
    vehicleClassification: verified?.vehicleClassification ?? 'passenger',
    grossVehicleWeightKg: verified?.grossVehicleWeightKg != null && verified.grossVehicleWeightKg > 0
      ? Math.round(verified.grossVehicleWeightKg)
      : 2000,
    classificationVerified: verified?.classificationVerified ?? true,
    category,
    condition: 'bon',
    source: 'particulier',
    auctionFeesCad: 0,
    brokerCommissionCad: 0,
    originRegionId: resolveOriginRegionId(raw.locationRaw, raw.city),
    isNonRunning: detectNonRunning(raw.titleH1, raw.descriptionText),
  };

  const inputs: NormalizedInputs = {
    vehicle,
    destination,
    financing: defaultFinancing(),
    transport: defaultTransport(destination),
    customs: defaultCustoms(destination),
    targetMarginPercent: DEFAULT_TARGET_MARGIN_PERCENT,
  };

  return { ok: true, inputs, warnings, categoryAssumed };
}
