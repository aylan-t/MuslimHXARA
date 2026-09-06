import type {
  CustomsSelection,
  DestinationCountry,
  FinancingConfig,
  TransportSelection,
  Vehicle,
} from '../types';

export interface PrefillInputs {
  vehicle: Vehicle;
  destination: DestinationCountry;
  financing: FinancingConfig;
  transport: TransportSelection;
  customs: CustomsSelection;
  targetMarginPercent: number;
}

export interface PrefillMeta {
  listingId: string;
  listingUrl: string;
  listingTitle: string;
  engineVersion: string;
}

export interface PrefillPayload extends PrefillInputs {
  meta: PrefillMeta;
}

export const PREFILL_MAX_URL_CHARS = 2000;

function invalid(reason: string): Error {
  return new Error(`Payload prefill invalide (${reason}) — lien ignoré.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function assertNonEmptyString(value: unknown, field: string, maxLength = 200): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maxLength) {
    throw invalid(field);
  }
}

function assertFacebookListingUrl(value: unknown, listingId: string): asserts value is string {
  assertNonEmptyString(value, 'meta.listingUrl', 1000);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw invalid('meta.listingUrl');
  }
  const host = url.hostname.toLowerCase();
  const isFacebook = host === 'facebook.com' || host.endsWith('.facebook.com');
  const itemMatch = /^\/marketplace\/item\/(\d+)(?:\/|$)/.exec(url.pathname);
  if (url.protocol !== 'https:' || !isFacebook || itemMatch?.[1] !== listingId) {
    throw invalid('meta.listingUrl');
  }
}

function assertValidPayload(value: unknown): asserts value is PrefillPayload {
  if (!isRecord(value)) throw invalid('JSON non-objet');

  const vehicle = value.vehicle;
  if (!isRecord(vehicle)) throw invalid('vehicle manquant');
  assertNonEmptyString(vehicle.brand, 'vehicle.brand', 80);
  assertNonEmptyString(vehicle.model, 'vehicle.model', 120);
  if (!isFiniteNumber(vehicle.year) || vehicle.year < 1980 || vehicle.year > new Date().getFullYear() + 1) {
    throw invalid('vehicle.year');
  }
  if (!isFiniteNumber(vehicle.purchasePriceCad) || vehicle.purchasePriceCad <= 0) {
    throw invalid('vehicle.purchasePriceCad');
  }
  if (!isFiniteNumber(vehicle.engineCc) || vehicle.engineCc <= 0) {
    throw invalid('vehicle.engineCc');
  }
  if (!['Gasoline', 'Diesel', 'Hybrid', 'Electric'].includes(String(vehicle.fuelType))) {
    throw invalid('vehicle.fuelType');
  }
  if (vehicle.steering !== 'LHD' && vehicle.steering !== 'RHD') {
    throw invalid('vehicle.steering');
  }
  if (!isFiniteNumber(vehicle.grossVehicleWeightKg) || vehicle.grossVehicleWeightKg <= 0) {
    throw invalid('vehicle.grossVehicleWeightKg');
  }
  if (vehicle.vehicleClassification !== 'passenger' && vehicle.vehicleClassification !== 'commercial_utility') {
    throw invalid('vehicle.vehicleClassification');
  }
  if (typeof vehicle.classificationVerified !== 'boolean') throw invalid('vehicle.classificationVerified');
  if (!isFiniteNumber(vehicle.mileageKm) || vehicle.mileageKm < 0) {
    throw invalid('vehicle.mileageKm');
  }

  if (value.destination !== 'senegal' && value.destination !== 'maroc') {
    throw invalid('destination');
  }

  const financing = value.financing;
  if (!isRecord(financing)) throw invalid('financing manquant');
  for (const field of ['fixedFeeCad', 'variableFeePercent', 'fxSpreadPercent'] as const) {
    if (!isFiniteNumber(financing[field])) throw invalid(`financing.${field}`);
  }

  const transport = value.transport;
  if (!isRecord(transport)) throw invalid('transport manquant');
  assertNonEmptyString(transport.routeId, 'transport.routeId', 100);
  if (!isFiniteNumber(transport.batchVehiclesCount) || transport.batchVehiclesCount < 1) {
    throw invalid('transport.batchVehiclesCount');
  }

  const customs = value.customs;
  if (!isRecord(customs)) throw invalid('customs manquant');
  if (customs.country !== value.destination) throw invalid('customs.country');

  if (!isFiniteNumber(value.targetMarginPercent)) throw invalid('targetMarginPercent');

  const meta = value.meta;
  if (!isRecord(meta)) throw invalid('meta manquant');
  assertNonEmptyString(meta.listingId, 'meta.listingId', 32);
  if (!/^\d+$/.test(meta.listingId)) throw invalid('meta.listingId');
  assertFacebookListingUrl(meta.listingUrl, meta.listingId);
  assertNonEmptyString(meta.listingTitle, 'meta.listingTitle', 200);
  assertNonEmptyString(meta.engineVersion, 'meta.engineVersion', 80);
}

function base64UrlEncode(input: string): string {
  const nodeBuffer = (globalThis as unknown as { Buffer?: unknown }).Buffer as
    | { from(value: string, encoding: string): { toString(encoding: string): string } }
    | undefined;
  const base64 = nodeBuffer
    ? nodeBuffer.from(input, 'utf8').toString('base64')
    : (() => {
        const bytes = new TextEncoder().encode(input);
        let binary = '';
        bytes.forEach((byte) => {
          binary += String.fromCharCode(byte);
        });
        return btoa(binary);
      })();
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(input: string): string {
  let base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padding = base64.length % 4;
  if (padding) base64 += '='.repeat(4 - padding);
  const nodeBuffer = (globalThis as unknown as { Buffer?: unknown }).Buffer as
    | { from(value: string, encoding: string): { toString(encoding: string): string } }
    | undefined;
  if (nodeBuffer) return nodeBuffer.from(base64, 'base64').toString('utf8');
  const binary = atob(base64);
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

function normalizeBaseUrl(base: string): string {
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    throw new Error('URL de base prefill invalide.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('URL de base prefill non autorisée.');
  }
  return base.replace(/\/+$/, '');
}

export function buildPrefillUrl(base: string, inputs: PrefillInputs, meta: PrefillMeta): string {
  const payload: PrefillPayload = { ...inputs, meta };
  assertValidPayload(payload);
  const url = `${normalizeBaseUrl(base)}/?prefill=${base64UrlEncode(JSON.stringify(payload))}`;
  if (url.length >= PREFILL_MAX_URL_CHARS) {
    throw new Error(`Prefill URL trop longue (${url.length} caractères ≥ ${PREFILL_MAX_URL_CHARS}).`);
  }
  return url;
}

export function parsePrefill(encoded: string): PrefillPayload {
  if (!encoded || encoded.length >= PREFILL_MAX_URL_CHARS) {
    throw invalid('taille');
  }
  let value: unknown;
  try {
    value = JSON.parse(base64UrlDecode(encoded));
  } catch {
    throw new Error('Payload prefill illisible — lien ignoré.');
  }
  assertValidPayload(value);
  return value;
}

export function parsePrefillFromUrl(url: string): PrefillPayload | null {
  if (url.length >= PREFILL_MAX_URL_CHARS) throw invalid('taille URL');
  const encoded = new URL(url).searchParams.get('prefill');
  return encoded ? parsePrefill(encoded) : null;
}
