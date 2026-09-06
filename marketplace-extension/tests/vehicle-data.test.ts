import { describe, expect, it, vi } from 'vitest';
import {
  decodeVin,
  resolveYearMakeModel,
  YMM_UNSUPPORTED_MESSAGE,
} from '../src/vehicle-data';

function response(results: Array<Record<string, unknown>>): Response {
  return new Response(JSON.stringify({ Results: results }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
function carApiResponse(data: Array<Record<string, unknown>>): Response {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('NHTSA vPIC adapter', () => {
  it('normalizes VIN decode fields without inventing values', async () => {
    const fetcher = vi.fn(async () => response([{
      ErrorCode: '0',
      ModelYear: '2019',
      Make: 'HONDA',
      Model: 'Civic',
      DisplacementCC: '1996',
      FuelTypePrimary: 'Gasoline',
    }]));
    const result = await decodeVin('2HGFC2F59KH000001', fetcher);
    expect(result).toMatchObject({
      source: 'vin',
      year: 2019,
      make: 'HONDA',
      model: 'Civic',
      engineCc: 1996,
      fuel: 'Gasoline',
    });
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining('/DecodeVinValuesExtended/2HGFC2F59KH000001?format=json'),
      expect.objectContaining({ credentials: 'omit' }),
    );
  });

  it('uses the required explicit manual fallback outside 2015-2020', async () => {
    const fetcher = vi.fn();
    const result = await resolveYearMakeModel(2021, 'Toyota', 'RAV4', fetcher);
    expect(result.source).toBe('manual');
    expect(result.engineCc).toBeNull();
    expect(result.fuel).toBeNull();
    expect(result.message).toBe(YMM_UNSUPPORTED_MESSAGE);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('maps and deduplicates real CarAPI gasoline trim specs', async () => {
    const fetcher = vi.fn(async (url: RequestInfo | URL) =>
      String(url).includes('/trims/')
        ? carApiResponse([{ id: 'trim-1', name: 'LE', engine_id: 'engine-1' }])
        : carApiResponse([
          { id: 'engine-1', size: 2.5, engine_type: 'Gasoline' },
          { id: 'engine-1-copy', size: 2.5, fuel_type: 'gasoline' },
        ]));
    const result = await resolveYearMakeModel(2020, 'toyota', 'rav 4', fetcher);
    expect(result).toMatchObject({
      source: 'carapi',
      make: 'toyota',
      model: 'rav 4',
    });
    expect(result.trimOptions).toHaveLength(1);
    expect(result.trimOptions[0]).toMatchObject({ engineCc: 2500, fuel: 'Gasoline' });
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('carapi.app/api/trims/v2?'), expect.any(Object));
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('carapi.app/api/engines/v2?'), expect.any(Object));
  });

  it('classifies hybrid CarAPI options from engine text', async () => {
    const fetcher = vi.fn(async () => carApiResponse([
      { id: 'hybrid-1', size: '2.5L', description: 'Hybrid electric drivetrain' },
    ]));
    const result = await resolveYearMakeModel(2019, 'Toyota', 'RAV4', fetcher);
    expect(result.trimOptions).toEqual([
      expect.objectContaining({ engineCc: 2500, fuel: 'Hybrid' }),
    ]);
  });
});