import {
  FreightComparisonResult,
  FreightMarketOffer,
  TransportRoute,
} from '../types';

export async function compareFreightRates(
  routes: TransportRoute[],
  vehicleCount = 1,
): Promise<FreightComparisonResult> {
  const response = await fetch('/api/freight/compare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      routes: routes.map(({ id, originPort, destinationPort, mode }) => ({
        id, originPort, destinationPort, mode,
      })),
      vehicleCount,
    }),
  });
  if (!response.ok) throw new Error(`Freight comparison HTTP ${response.status}`);
  return await response.json() as FreightComparisonResult;
}
