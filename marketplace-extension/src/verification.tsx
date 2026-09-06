import React, { useState } from 'react';
import type { DestinationCountry } from './engine/types';
import type { RawListing } from './parser';
import {
  decodeVin,
  type FuelKind,
  type VehicleResolution,
} from './vehicle-data';

export interface VerificationValues {
  destination: DestinationCountry;
  year: number;
  make: string;
  model: string;
  priceCad: number;
  engineCc: number | null;
  fuel: FuelKind | null;
  vehicleClassification: 'passenger' | 'commercial_utility';
  weightKg: number | null;
}

export interface VerificationProps {
  raw: RawListing;
  initial: VerificationValues;
  resolution: VehicleResolution;
  onConfirm: (values: VerificationValues) => void;
  onClose: () => void;
}

export function VerificationPanel({
  raw, initial, resolution, onConfirm, onClose,
}: VerificationProps): React.ReactElement {
  const [values, setValues] = useState(initial);
  const [status, setStatus] = useState(resolution.message);
  const [decoding, setDecoding] = useState(false);
  const update = <K extends keyof VerificationValues>(key: K, value: VerificationValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const decode = async () => {
    if (!raw.vin) return;
    setDecoding(true);
    setStatus(null);
    try {
      const result = await decodeVin(raw.vin);
      setValues((current) => ({
        ...current,
        year: result.year ?? current.year,
        make: result.make ?? current.make,
        model: result.model ?? current.model,
        engineCc: result.engineCc,
        fuel: result.fuel,
      }));
      setStatus('VIN decoded by NHTSA vPIC. Verify the populated values.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'VIN decoding failed.');
    } finally {
      setDecoding(false);
    }
  };

  const valid = values.year >= 1980 && values.year <= 2027 &&
    values.make.trim().length > 0 && values.model.trim().length > 0 &&
    Number.isFinite(values.priceCad) && values.priceCad > 0 &&
    values.engineCc != null && Number.isFinite(values.engineCc) && values.engineCc > 0 &&
    values.fuel != null;

  return (
    <div className="axc-panel axc-verify" role="dialog" aria-label="Verify vehicle data">
      <div className="axc-topbar">
        <strong>Fast verification</strong>
        <span className="axc-topbar-spacer" />
        <button className="axc-iconbtn" type="button" onClick={onClose} aria-label="Close">×</button>
      </div>
      <form className="axc-body" onSubmit={(event) => { event.preventDefault(); if (valid) onConfirm(values); }}>
        <p className="axc-listing-chip" title={raw.titleH1}>{raw.titleH1}</p>
        <div className="axc-verify-grid">
          {resolution.trimOptions.length > 0 && (
            <label>Trim / verified specification
              <select
                defaultValue={resolution.trimOptions.find((option) =>
                  option.engineCc === values.engineCc && option.fuel === values.fuel,
                )?.id ?? ''}
                onChange={(e) => {
                  const option = resolution.trimOptions.find((item) => item.id === e.target.value);
                  if (option) setValues((current) => ({ ...current, engineCc: option.engineCc, fuel: option.fuel }));
                }}
              >
                <option value="">Choose a trim/specification</option>
                {resolution.trimOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </label>
          )}
          <label>Destination
            <select value={values.destination} onChange={(e) => update('destination', e.target.value as DestinationCountry)}>
              <option value="senegal">Senegal (Dakar)</option>
              <option value="maroc">Morocco (Casablanca)</option>
            </select>
          </label>
          <label>Year
            <input type="number" min="1980" max="2027" required value={values.year}
              onChange={(e) => update('year', Number(e.target.value))} />
          </label>
          <label>Make
            <input required value={values.make} onChange={(e) => update('make', e.target.value)} />
          </label>
          <label>Model
            <input required value={values.model} onChange={(e) => update('model', e.target.value)} />
          </label>
          <label>Price (CAD)
            <input type="number" min="1" step="1" required value={values.priceCad}
              onChange={(e) => update('priceCad', Number(e.target.value))} />
          </label>
          <label>Engine (cc)
            <input type="number" min="1" step="1" required placeholder="Manual if unknown"
              value={values.engineCc ?? ''}
              onChange={(e) => update('engineCc', e.target.value ? Number(e.target.value) : null)} />
          </label>
          <label>Fuel
            <select required value={values.fuel ?? ''} onChange={(e) => update('fuel', (e.target.value || null) as FuelKind | null)}>
              <option value="">Verify manually</option>
              <option value="Gasoline">Gasoline</option>
              <option value="Diesel">Diesel</option>
              <option value="Hybrid">Hybrid</option>
              <option value="Electric">Electric</option>
            </select>
          </label>
          <label>Vehicle class
            <select value={values.vehicleClassification} onChange={(e) =>
              update('vehicleClassification', e.target.value as VerificationValues['vehicleClassification'])}>
              <option value="passenger">Passenger/light — assumption, verify</option>
              <option value="commercial_utility">Commercial / utility</option>
            </select>
          </label>
          <label>Weight (kg)
            <input type="number" min="1" placeholder="Verify if known (not guessed)" value={values.weightKg ?? ''}
              onChange={(e) => update('weightKg', e.target.value ? Number(e.target.value) : null)} />
          </label>
        </div>
        <div className={`axc-steering ${raw.steeringSide === 'RHD' ? 'axc-steering-warn' : ''}`}>
          Steering: <strong>{raw.steeringSide}</strong>
          {raw.steeringEvidence ? ` — explicit “${raw.steeringEvidence}” text detected` : ' — Canadian default'}
        </div>
        {raw.vin && (
          <div className="axc-vin">
            VIN: <strong>{raw.vin}</strong>
            <button className="axc-btn" type="button" disabled={decoding} onClick={() => void decode()}>
              {decoding ? 'Decoding…' : 'Decode with NHTSA vPIC'}
            </button>
          </div>
        )}
        {status && <p className="axc-verify-status" role="status">{status}</p>}
        <button className="axc-cta" type="submit" disabled={!valid}>
          Calculate clearance &amp; eligibility
        </button>
      </form>
    </div>
  );
}