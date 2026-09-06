import {
  FreightComparisonResult,
  FreightMarketOffer,
  TransportRoute,
} from '../types';

const PORT_CODES: Record<string, string> = {
  'Port de Montréal (QC)': 'CAMTR',
  "Port d'Halifax (NS)": 'CAHAL',
  'Port Autonome de Dakar': 'SNDKR',
  'Port de Casablanca': 'MACAS',
  'Tanger Med': 'MAPTM',
};

type FreightosMoney = { amount?: string | number; currency?: string };
type FreightosMode = {
  price?: {
    min?: { moneyAmount?: FreightosMoney };
    max?: { moneyAmount?: FreightosMoney };
  };
  transitTimes?: { min?: string | number; max?: string | number };
};

async function getUsdToCad(): Promise<number> {
  try {
    const response = await fetch('https://open.er-api.com/v6/latest/USD');
    if (!response.ok) throw new Error('FX unavailable');
    const data = await response.json();
    const rate = Number(data?.rates?.CAD);
    return rate > 0 ? rate : 1.36;
  } catch {
    return 1.36;
  }
}

async function fetchFreightosOffer(
  route: TransportRoute,
  vehicleCount: number,
  usdToCad: number,
): Promise<FreightMarketOffer | null> {
  if (route.mode === 'roro') return null;
  const origin = PORT_CODES[route.originPort];
  const destination = PORT_CODES[route.destinationPort];
  if (!origin || !destination) return null;

  const params = new URLSearchParams({
    loadtype: 'container40',
    weight: String(Math.max(1800, vehicleCount * 1800)),
    origin,
    destination,
    quantity: '1',
  });
  const sourceUrl = `https://ship.freightos.com/api/shippingCalculator?${params}`;
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`Freightos HTTP ${response.status}`);
  const payload = await response.json();
  const rates = payload?.response?.estimatedFreightRates;
  if (!rates || Number(rates.numQuotes || 0) < 1) return null;

  const modes: FreightosMode[] = Array.isArray(rates.mode) ? rates.mode : [rates.mode];
  const mode = modes.find((item) => item?.price?.min?.moneyAmount) ?? modes[0];
  const minMoney = mode?.price?.min?.moneyAmount;
  const maxMoney = mode?.price?.max?.moneyAmount;
  const originalLow = Number(minMoney?.amount);
  const originalHigh = Number(maxMoney?.amount);
  if (!(originalLow > 0) || !(originalHigh > 0)) return null;

  const currency = minMoney?.currency || maxMoney?.currency || 'USD';
  const conversion = currency === 'CAD' ? 1 : usdToCad;
  const lowCad = Math.round(originalLow * conversion);
  const highCad = Math.round(originalHigh * conversion);

  return {
    id: `freightos-${route.id}-${Date.now()}`,
    routeId: route.id,
    provider: 'Freightos',
    status: 'marketplace_estimate',
    amountCad: Math.round((lowCad + highCad) / 2),
    lowCad,
    highCad,
    currency,
    originalLow,
    originalHigh,
    estimatedDaysMin: Number(mode?.transitTimes?.min) || undefined,
    estimatedDaysMax: Number(mode?.transitTimes?.max) || undefined,
    retrievedAt: new Date().toISOString(),
    sourceUrl: 'https://ship.freightos.com',
    attribution: 'Estimation marketplace fournie par Freightos (API publique beta).',
  };
}

export async function compareFreightRates(
  routes: TransportRoute[],
  vehicleCount = 1,
): Promise<FreightComparisonResult> {
  const usdToCad = await getUsdToCad();
  const settled = await Promise.allSettled(
    routes.map((route) => fetchFreightosOffer(route, vehicleCount, usdToCad)),
  );
  const offers = settled
    .filter((item): item is PromiseFulfilledResult<FreightMarketOffer | null> => item.status === 'fulfilled')
    .map((item) => item.value)
    .filter((item): item is FreightMarketOffer => Boolean(item));
  const hasErrors = settled.some((item) => item.status === 'rejected');

  return {
    offers,
    providerStatuses: [
      {
        provider: 'Freightos',
        status: hasErrors ? 'error' : offers.length ? 'available' : 'no_offer',
        message: hasErrors
          ? 'La source a répondu avec une erreur pour au moins une route.'
          : offers.length
            ? `${offers.length} offre${offers.length > 1 ? 's' : ''} marketplace reçue${offers.length > 1 ? 's' : ''}.`
            : 'Aucune offre instantanée sur ces routes aujourd’hui.',
      },
      {
        provider: 'SeaRates',
        status: 'configuration_required',
        message: 'Accès partenaire API requis pour activer cette deuxième source.',
      },
    ],
  };
}