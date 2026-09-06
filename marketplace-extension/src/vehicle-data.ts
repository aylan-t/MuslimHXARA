/**
 * Client/adapter vPIC. Source publique gouvernementale, sans clé.
 * Ce module ne calcule rien et ne substitue jamais une donnée absente.
 */
export const VPIC_BASE_URL = 'https://vpic.nhtsa.dot.gov/api/vehicles';
export const CAR_API_BASE_URL = 'https://carapi.app/api';
export const YMM_UNSUPPORTED_MESSAGE =
  'Unable to get vehicle data for now; please input a year between 2015-2020.';

export type FuelKind = 'Gasoline' | 'Diesel' | 'Hybrid' | 'Electric';

export interface VehicleResolution {
  source: 'vin' | 'carapi' | 'manual';
  year: number | null;
  make: string | null;
  model: string | null;
  engineCc: number | null;
  fuel: FuelKind | null;
  trimOptions: TrimSpecOption[];
  message: string | null;
}
export interface TrimSpecOption {
  id: string;
  label: string;
  engineCc: number;
  fuel: FuelKind;
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function clean(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function fuelKind(value: unknown, secondary?: unknown): FuelKind | null {
  const text = `${clean(value) ?? ''} ${clean(secondary) ?? ''}`.toLowerCase();
  if (!text.trim()) return null;
  if (/electric/.test(text) && !/hybrid/.test(text)) return 'Electric';
  if (/hybrid/.test(text)) return 'Hybrid';
  if (/diesel/.test(text)) return 'Diesel';
  if (/gasoline|gas|petrol|flexible fuel/.test(text)) return 'Gasoline';
  return null;
}

function finitePositive(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : null;
}

/** CarAPI `size` is commonly litres (e.g. 2.5); accept an explicit cc value
 * too without converting it twice. */
function engineSizeToCc(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(String(value).replace(/[^\d.]/g, ''));
  if (!Number.isFinite(number) || number <= 0) return null;
  return Math.round(number <= 10 ? number * 1000 : number);
}

async function fetchJson(
  url: string,
  fetcher: FetchLike,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  let response: Response;
  try {
    response = await fetcher(url, {
      method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer',
      signal: controller.signal, headers: { Accept: 'application/json' },
    });
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) throw new Error(`Vehicle data service unavailable (HTTP ${response.status}).`);
  return response.json();
}

async function getResults(url: string, fetcher: FetchLike): Promise<Array<Record<string, unknown>>> {
  const payload = await fetchJson(url, fetcher) as { Results?: unknown };
  if (!Array.isArray(payload.Results)) throw new Error('NHTSA vPIC returned an invalid response.');
  return payload.Results.filter(
    (item): item is Record<string, unknown> => typeof item === 'object' && item !== null,
  );
}

/** DecodeVinValuesExtended expose une ligne aplatie, plus stable que la liste
 * variable/value de DecodeVin. */
export async function decodeVin(
  vin: string,
  fetcher: FetchLike = fetch,
): Promise<VehicleResolution> {
  const normalized = vin.trim().toUpperCase();
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(normalized)) {
    throw new Error('VIN must contain exactly 17 valid characters.');
  }
  const rows = await getResults(
    `${VPIC_BASE_URL}/DecodeVinValuesExtended/${encodeURIComponent(normalized)}?format=json`,
    fetcher,
  );
  const row = rows[0] ?? {};
  const errorCode = clean(row.ErrorCode);
  if (errorCode && errorCode.split(',').some((code) => code.trim() !== '0')) {
    throw new Error(clean(row.ErrorText) ?? 'NHTSA could not decode this VIN.');
  }
  const year = finitePositive(row.ModelYear);
  return {
    source: 'vin',
    year,
    make: clean(row.Make),
    model: clean(row.Model),
    engineCc: finitePositive(row.DisplacementCC),
    fuel: fuelKind(row.FuelTypePrimary, row.ElectrificationLevel),
    trimOptions: [],
    message: null,
  };
}

function comparable(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * CarAPI's free public demo returns real trim and engine records. Specs are
 * only offered where both a positive engine size and a recognizable fuel are
 * present; nothing is guessed.
 */
export async function resolveYearMakeModel(
  year: number,
  make: string,
  model: string,
  fetcher: FetchLike = fetch,
): Promise<VehicleResolution> {
  if (year < 2015 || year > 2020) {
    return {
      source: 'manual', year, make: clean(make), model: clean(model),
      engineCc: null, fuel: null, trimOptions: [], message: YMM_UNSUPPORTED_MESSAGE,
    };
  }
  const query = new URLSearchParams({ year: String(year), make: make.trim(), model: model.trim() });
  const [trimsPayload, enginesPayload] = await Promise.all([
    fetchJson(`${CAR_API_BASE_URL}/trims/v2?${query}`, fetcher),
    fetchJson(`${CAR_API_BASE_URL}/engines/v2?${query}`, fetcher),
  ]);
  const records = (payload: unknown): Array<Record<string, unknown>> => {
    const data = (payload as { data?: unknown })?.data;
    return Array.isArray(data) ? data.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : [];
  };
  const trims = records(trimsPayload);
  const engines = records(enginesPayload);
  const options = new Map<string, TrimSpecOption>();
  for (const engine of engines) {
    const engineCc = engineSizeToCc(engine.size) ?? engineSizeToCc(engine.displacement);
    const fuel = fuelKind(engine.engine_type, engine.fuel_type) ??
      fuelKind(engine.description);
    if (!engineCc || !fuel) continue;
    const engineId = clean(engine.id) ?? `${engineCc}-${fuel}`;
    const linkedTrim = trims.find((trim) =>
      clean(trim.engine_id) === engineId || clean(trim.engine) === engineId,
    );
    const trimName = linkedTrim ? (clean(linkedTrim.name) ?? clean(linkedTrim.description)) : null;
    const label = trimName ? `${trimName} — ${engineCc} cc · ${fuel}` : `${engineCc} cc · ${fuel}`;
    // A repeated engine record must not create duplicate choices; retaining
    // one labelled trim is sufficient because the underlying specs are equal.
    const dedupeKey = `${engineCc}|${fuel}`.toLowerCase();
    options.set(dedupeKey, { id: engineId, label, engineCc, fuel });
  }
  const trimOptions = [...options.values()];
  return {
    source: trimOptions.length ? 'carapi' : 'manual',
    year,
    make: clean(make),
    model: clean(model),
    engineCc: null,
    fuel: null,
    trimOptions,
    message: trimOptions.length
      ? 'Choose the verified trim/specification below.'
      : 'No matching CarAPI engine specification; verify engine and fuel manually.',
  };
}
