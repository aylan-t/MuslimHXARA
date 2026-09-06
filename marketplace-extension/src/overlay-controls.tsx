// AGENT-05 — Overlay interactivité : contrôles.
// Parent (AGENT-04, overlay.tsx) : rend <OverlayControls inputs={...} config={...} onChange={...} />
// puis recalcule LOCALEMENT via calculateSimulation() — aucun appel réseau ici.
// Presets transfert / routes / montants annexes : lus depuis `config` (props, jamais en dur).
// Les montants 400/180/250/200 ne sont que des replis à l'identique de
// src/services/calculationEngine.ts quand `transport.additionalCosts` est absent ;
// le calcul reste 100 % moteur.

import type {
  AdditionalExportCosts,
  CustomsSelection,
  DestinationCountry,
  FinancingConfig,
  FinancingMethod,
  GlobalReferenceConfig,
  SimulationResult,
  TransportSelection,
  Vehicle,
} from './engine/types';

/** Entrées normalisées (contrat §0 checklist : NormalizedInputs). */
export interface OverlayInputs {
  vehicle: Vehicle;
  destination: DestinationCountry;
  financing: FinancingConfig;
  transport: TransportSelection;
  customs: CustomsSelection;
  targetMarginPercent: number;
}

export interface OverlayControlsProps {
  inputs: OverlayInputs;
  config: GlobalReferenceConfig;
  /** Appelé à chaque changement ; le parent recalcule via calculateSimulation() local. */
  onChange: (next: OverlayInputs) => void;
  /** Dernier résultat local (optionnel, affichage uniquement, jamais recalculé ici). */
  sim?: SimulationResult | null;
}

export const MARGIN_MIN = 8;
export const MARGIN_MAX = 30;
export const MARGIN_DEFAULT = 18;
export const BATCH_MIN = 1;
export const BATCH_MAX = 4;

/** Repli à l'identique de calculationEngine.ts (StepTransport.tsx) si additionalCosts absent. */
function defaultAdditionalCosts(source: Vehicle['source']): AdditionalExportCosts {
  return {
    includeTransitAgentFee: true,
    transitAgentFeeCad: 400,
    includeRoroCleaningFee: true,
    roroCleaningFeeCad: 180,
    includePortStorageBuffer: true,
    portStorageBufferCad: 250,
    includeBatteryKeyFee: source === 'encan',
    batteryKeyFeeCad: 200,
    customRepairsCad: 0,
    isNonRunningTowing: false,
  };
}

function isContainerMode(mode: string): boolean {
  return mode === 'conteneur_complet' || mode === 'conteneur_partage';
}

function modeLabel(mode: string): string {
  if (mode === 'roro') return 'RoRo';
  return 'Conteneur';
}

export function OverlayControls({ inputs, config, onChange }: OverlayControlsProps) {
  const { vehicle, destination, financing, transport, customs } = inputs;

  const routes = (config.routes ?? []).filter((r) => r.destinationCountry === destination);
  const selectedRoute = routes.find((r) => r.id === transport.routeId) ?? routes[0] ?? null;
  const showBatch = selectedRoute ? isContainerMode(selectedRoute.mode) : false;
  const batchCount = Math.min(
    BATCH_MAX,
    Math.max(BATCH_MIN, transport.batchVehiclesCount || BATCH_MIN),
  );
  const additional: AdditionalExportCosts =
    transport.additionalCosts ?? defaultAdditionalCosts(vehicle.source);
  const isMRE = customs.moroccoOptions?.isMRE ?? false;
  const valuationBasis = customs.valuationBasis ?? 'invoice';
  const margin = Math.min(
    MARGIN_MAX,
    Math.max(MARGIN_MIN, inputs.targetMarginPercent || MARGIN_DEFAULT),
  );

  const patch = (p: Partial<OverlayInputs>): void => {
    onChange({ ...inputs, ...p });
  };
  const setFinancing = (f: Partial<FinancingConfig>): void => {
    patch({ financing: { ...financing, ...f } });
  };
  const setTransport = (t: Partial<TransportSelection>): void => {
    patch({ transport: { ...transport, ...t } });
  };
  const setCustoms = (c: Partial<CustomsSelection>): void => {
    // Ne jamais saisir estimatedArgusValueCad : le moteur l'estime seul (§4.2).
    const { estimatedArgusValueCad: _dropped, ...rest } = { ...customs, ...c };
    void _dropped;
    patch({ customs: { ...rest, estimatedArgusValueCad: undefined } });
  };
  const setAdditional = (a: Partial<AdditionalExportCosts>): void => {
    setTransport({ additionalCosts: { ...additional, ...a } });
  };

  // 3 presets issus de config.transferMethods (props) — jamais en dur.
  const selectTransferMethod = (methodId: FinancingMethod): void => {
    const preset = config.transferMethods.find((m) => m.id === methodId);
    if (!preset) return;
    setFinancing({
      method: preset.id,
      fixedFeeCad: preset.fixedFeeCad,
      variableFeePercent: preset.variableFeePercent,
      fxSpreadPercent: preset.typicalSpreadPercent,
    });
  };

  const toggleMRE = (checked: boolean): void => {
    setCustoms({
      moroccoOptions: {
        isMRE: checked,
        mreAgeOver60: checked ? (customs.moroccoOptions?.mreAgeOver60 ?? true) : false,
        residenceOver10Years: checked
          ? (customs.moroccoOptions?.residenceOver10Years ?? true)
          : false,
        isFirstCarInLife: checked
          ? (customs.moroccoOptions?.isFirstCarInLife ?? true)
          : false,
      },
    });
  };

  return (
    <div className="axc-controls">
      {/* Marge cible 8–30 %, défaut 18 */}
      <section className="axc-section">
        <div className="axc-margin-row">
          <label htmlFor="axc-margin" className="axc-section-title">
            Marge cible
          </label>
          <span className="axc-margin-value">{margin} %</span>
        </div>
        <input
          id="axc-margin"
          type="range"
          className="axc-slider"
          min={MARGIN_MIN}
          max={MARGIN_MAX}
          step={1}
          value={margin}
          onChange={(e) => patch({ targetMarginPercent: parseInt(e.target.value, 10) })}
        />
        <div className="axc-hint">
          {MARGIN_MIN} % — {MARGIN_MAX} % · recalcul local immédiat, sans réseau.
        </div>
      </section>

      {/* Route du pays (RoRo / conteneur) */}
      <section className="axc-section">
        <span className="axc-section-title">Route maritime</span>
        {routes.length === 0 ? (
          <p className="axc-muted">non inclus</p>
        ) : (
          <div className="axc-route-list" role="radiogroup" aria-label="Route maritime">
            {routes.map((route) => {
              const selected = selectedRoute?.id === route.id;
              return (
                <label
                  key={route.id}
                  className={`axc-route${selected ? ' axc-selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="axc-route"
                    checked={selected}
                    onChange={() => setTransport({ routeId: route.id })}
                  />
                  <span>
                    <span className="axc-route-name">{route.name}</span>
                    <span className="axc-route-meta">
                      {modeLabel(route.mode)} · ~{route.estimatedDays} j
                      {route.recommended ? ' · Recommandée' : ''}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        )}
        {showBatch && (
          <div className="axc-batch">
            <div className="axc-margin-row">
              <label htmlFor="axc-batch" className="axc-section-title">
                Groupage conteneur
              </label>
              <span className="axc-batch-value">
                {batchCount} véhicule{batchCount > 1 ? 's' : ''}
              </span>
            </div>
            <input
              id="axc-batch"
              type="range"
              className="axc-slider"
              min={BATCH_MIN}
              max={BATCH_MAX}
              step={1}
              value={batchCount}
              onChange={(e) =>
                setTransport({ batchVehiclesCount: parseInt(e.target.value, 10) })
              }
            />
            <div className="axc-hint">Fret conteneur divisé entre {BATCH_MIN} et {BATCH_MAX} véhicules.</div>
          </div>
        )}
      </section>

      {/* 3 presets transfert depuis config.transferMethods */}
      <section className="axc-section">
        <span className="axc-section-title">Transfert d&apos;argent</span>
        <div className="axc-preset-list">
          {config.transferMethods.map((m) => {
            const selected = financing.method === m.id;
            return (
              <button
                key={m.id}
                type="button"
                aria-pressed={selected}
                className={`axc-preset${selected ? ' axc-selected' : ''}`}
                onClick={() => selectTransferMethod(m.id)}
              >
                <span className="axc-preset-name">
                  {m.name}
                  {m.recommended ? (
                    <span className="axc-badge-reco">Recommandé</span>
                  ) : null}
                </span>
                <span className="axc-preset-cost">
                  {m.fixedFeeCad} $ + ~{m.typicalSpreadPercent} %
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Frais annexes : toggles + réparations */}
      <section className="axc-section">
        <span className="axc-section-title">Frais annexes</span>
        <div className="axc-check-grid">
          <label className="axc-check">
            <input
              type="checkbox"
              checked={additional.includeTransitAgentFee}
              onChange={(e) => setAdditional({ includeTransitAgentFee: e.target.checked })}
            />
            <span>
              <span className="axc-check-label">
                Transitaire <span className="axc-amount">+{additional.transitAgentFeeCad} $</span>
              </span>
            </span>
          </label>
          <label className="axc-check">
            <input
              type="checkbox"
              checked={additional.includeRoroCleaningFee}
              onChange={(e) => setAdditional({ includeRoroCleaningFee: e.target.checked })}
            />
            <span>
              <span className="axc-check-label">
                Lavage RoRo <span className="axc-amount">+{additional.roroCleaningFeeCad} $</span>
              </span>
            </span>
          </label>
          <label className="axc-check">
            <input
              type="checkbox"
              checked={additional.includePortStorageBuffer}
              onChange={(e) => setAdditional({ includePortStorageBuffer: e.target.checked })}
            />
            <span>
              <span className="axc-check-label">
                Magasinage portuaire{' '}
                <span className="axc-amount">+{additional.portStorageBufferCad} $</span>
              </span>
            </span>
          </label>
          <label className="axc-check">
            <input
              type="checkbox"
              checked={additional.includeBatteryKeyFee}
              onChange={(e) => setAdditional({ includeBatteryKeyFee: e.target.checked })}
            />
            <span>
              <span className="axc-check-label">
                Batterie / clés <span className="axc-amount">+{additional.batteryKeyFeeCad} $</span>
              </span>
            </span>
          </label>
        </div>
        <div className="axc-repairs-row">
          <label htmlFor="axc-repairs" className="axc-muted">
            Réparations prévues ($ CA)
          </label>
          <input
            id="axc-repairs"
            type="number"
            className="axc-input"
            min={0}
            step={50}
            value={additional.customRepairsCad || 0}
            onChange={(e) =>
              setAdditional({ customRepairsCad: parseFloat(e.target.value) || 0 })
            }
          />
        </div>
      </section>

      {/* Douane : toggle MRE si MA + base facture/Argus (sans valeur saisie) */}
      <section className="axc-section">
        <span className="axc-section-title">Douane</span>
        {destination === 'maroc' && (
          <label className="axc-check">
            <input type="checkbox" checked={isMRE} onChange={(e) => toggleMRE(e.target.checked)} />
            <span>
              <span className="axc-check-label">Régime MRE (abattement)</span>
              <span className="axc-check-desc">
                Réservé aux ayants droit (60 ans+, 10 ans à l&apos;étranger) — à valider en douane.
              </span>
            </span>
          </label>
        )}
        <div className="axc-radio-cards" role="radiogroup" aria-label="Base de valorisation douanière">
          <label className={`axc-radio-card${valuationBasis === 'invoice' ? ' axc-selected' : ''}`}>
            <input
              type="radio"
              name="axc-valuation"
              checked={valuationBasis === 'invoice'}
              onChange={() => setCustoms({ valuationBasis: 'invoice' })}
            />
            <span className="axc-check-label">Facture d&apos;achat</span>
          </label>
          <label
            className={`axc-radio-card${valuationBasis === 'argus_official' ? ' axc-selected' : ''}`}
          >
            <input
              type="radio"
              name="axc-valuation"
              checked={valuationBasis === 'argus_official'}
              onChange={() => setCustoms({ valuationBasis: 'argus_official' })}
            />
            <span className="axc-check-label">Cote Argus (prudent)</span>
          </label>
        </div>
        <p className="axc-hint">
          Base Argus estimée par le moteur seul — aucune valeur à saisir.
        </p>
      </section>
    </div>
  );
}
