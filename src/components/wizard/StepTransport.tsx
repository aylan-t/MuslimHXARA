import React, { useState } from 'react';
import { TransportSelection, DestinationCountry, GlobalReferenceConfig, TransportRoute, Vehicle, AdditionalExportCosts } from '../../types';
import { Tooltip } from '../common/Tooltip';
import { Truck, Ship, Check, ArrowLeft, Calculator, Clock, Star, ChevronDown, ChevronUp, ShieldCheck, Wrench, FileCheck2 } from 'lucide-react';
import { QUEBEC_REGIONS, DEFAULT_CONFIG } from '../../data/defaultData';

interface StepTransportProps {
  transport: TransportSelection;
  vehicle: Vehicle;
  country: DestinationCountry;
  purchasePriceCad: number;
  config: GlobalReferenceConfig;
  onChange: (updated: Partial<TransportSelection>) => void;
  onCalculate: () => void;
  onPrev: () => void;
}

export const StepTransport: React.FC<StepTransportProps> = ({
  transport,
  vehicle,
  country,
  purchasePriceCad,
  config,
  onChange,
  onCalculate,
  onPrev
}) => {
  const [showTransportDetails, setShowTransportDetails] = useState(false);

  // Filtrer les routes correspondant au pays avec fallback sécurisé
  const routes = (config?.routes && config.routes.length > 0) ? config.routes : DEFAULT_CONFIG.routes;
  const availableRoutes = routes.filter(r => r.destinationCountry === country);
  const selectedRoute = availableRoutes.find(r => r.id === transport?.routeId) || availableRoutes[0] || routes[0] || DEFAULT_CONFIG.routes[0];
  const isContainer = selectedRoute ? (selectedRoute.mode === 'conteneur_complet' || selectedRoute.mode === 'conteneur_partage') : false;
  const activeQuote = transport.quote?.routeId === selectedRoute.id && transport.quote.amountCad > 0
    ? transport.quote
    : undefined;

  const batchCount = Math.max(1, transport?.batchVehiclesCount || 1);
  const resolvedOceanFreight = activeQuote?.amountCad ?? transport.customOceanFreightCad ?? selectedRoute.oceanFreightCad;
  const oceanFreightPerCar = isContainer
    ? Math.round(resolvedOceanFreight / batchCount)
    : resolvedOceanFreight;

  const marineInsurance = Math.round((purchasePriceCad || 0) * ((selectedRoute?.marineInsuranceRatePercent || 1.5) / 100));
  const destinationPortFees = isContainer
    ? Math.round((selectedRoute?.portDestinationFeesCad || 0) / batchCount)
    : (selectedRoute?.portDestinationFeesCad || 0);

  const totalTransportPerCar =
    (selectedRoute?.inlandOriginCad || 0) +
    (selectedRoute?.portOriginFeesCad || 0) +
    oceanFreightPerCar +
    marineInsurance +
    destinationPortFees +
    (selectedRoute?.inlandDestinationCad || 0);

  const regions = (config?.quebecRegions && config.quebecRegions.length > 0) ? config.quebecRegions : QUEBEC_REGIONS;
  const originRegion = regions.find(q => q.id === vehicle?.originRegionId) || regions[0] || QUEBEC_REGIONS[0];
  const isHalifax = selectedRoute?.originPort ? selectedRoute.originPort.toLowerCase().includes('halifax') : false;
  const regionalInland = isHalifax ? originRegion.costToHalifaxCad : originRegion.costToMtlCad;
  const nonRunningTowing = vehicle?.isNonRunning ? 150 : 0;

  const inlandOriginCad = transport?.customInlandOriginCad ?? (regionalInland + nonRunningTowing);

  // Gestion des frais réels additionnels
  const additional: AdditionalExportCosts = transport?.additionalCosts || {
    includeTransitAgentFee: true,
    transitAgentFeeCad: 400,
    includeRoroCleaningFee: true,
    roroCleaningFeeCad: 180,
    includePortStorageBuffer: true,
    portStorageBufferCad: 250,
    includeBatteryKeyFee: vehicle?.source === 'encan',
    batteryKeyFeeCad: 200,
    customRepairsCad: 0,
    isNonRunningTowing: vehicle?.isNonRunning || false
  };

  const updateAdditional = (fields: Partial<AdditionalExportCosts>) => {
    onChange({
      additionalCosts: {
        ...additional,
        ...fields
      }
    });
  };

  const totalAdditionalCosts =
    (additional.includeTransitAgentFee ? (additional.transitAgentFeeCad || 400) : 0) +
    (additional.includeRoroCleaningFee ? (additional.roroCleaningFeeCad || 180) : 0) +
    (additional.includePortStorageBuffer ? (additional.portStorageBufferCad || 250) : 0) +
    (additional.includeBatteryKeyFee ? (additional.batteryKeyFeeCad || 200) : 0) +
    (additional.customRepairsCad || 0);

  // Calcul du coût total pour chaque route disponible pour afficher la différence
  const computeRouteTotal = (r: TransportRoute) => {
    if (!r) return 0;
    const isCont = r.mode === 'conteneur_complet' || r.mode === 'conteneur_partage';
    const isHal = r.originPort ? r.originPort.toLowerCase().includes('halifax') : false;
    const regInland = isHal ? originRegion.costToHalifaxCad : originRegion.costToMtlCad;
    const routeFreight = r.id === selectedRoute.id
      ? (activeQuote?.amountCad ?? transport.customOceanFreightCad ?? r.oceanFreightCad)
      : r.oceanFreightCad;
    const freight = isCont ? Math.round(routeFreight / batchCount) : routeFreight;
    const destFees = isCont ? Math.round((r.portDestinationFeesCad || 0) / batchCount) : (r.portDestinationFeesCad || 0);
    const ins = Math.round((purchasePriceCad || 0) * ((r.marineInsuranceRatePercent || 1.5) / 100));
    return regInland + nonRunningTowing + (r.portOriginFeesCad || 0) + freight + ins + destFees + (r.inlandDestinationCad || 0);
  };

  return (
    <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">

      {/* En-tête */}
      <div className="bg-slate-50 border-b border-slate-200 px-6 py-5">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-blue-100 text-blue-800 rounded-xl">
            <Truck className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              Étape 4 — Choix de la route maritime & logistique
            </h2>
            <p className="text-sm text-slate-600">
              Sélectionnez votre port d'embarquement (Montréal ou Halifax) et le mode d'expédition
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 sm:p-8 space-y-6">

        {/* Sélection des routes avec calcul d'impact direct */}
        <div>
          <label className="block text-base font-bold text-slate-900 mb-2.5">
            Sélectionnez la route maritime souhaitée :
          </label>

          <div className="grid grid-cols-1 gap-3.5">
            {availableRoutes.map((route) => {
              const isSelected = selectedRoute.id === route.id;
              const routeTotal = computeRouteTotal(route);

              return (
                <div
                  key={route.id}
                  onClick={() => onChange({ routeId: route.id, quote: route.id === transport.quote?.routeId ? transport.quote : undefined })}
                  className={`p-4 sm:p-5 rounded-2xl border-2 cursor-pointer transition-all ${isSelected
                    ? 'border-brand-600 bg-brand-50/50 shadow-md ring-2 ring-brand-500/30'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <div className="flex items-center space-x-2">
                        <Ship className="w-5 h-5 text-brand-600 flex-shrink-0" />
                        <span className="font-bold text-base text-slate-900">{route.name}</span>
                        {route.recommended && (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold border border-emerald-300">
                            <Star className="w-3 h-3 fill-emerald-600 text-emerald-600" />
                            <span>Recommandée</span>
                          </span>
                        )}
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${transport.quote?.amountCad && route.id === selectedRoute.id ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>
                          {activeQuote && route.id === selectedRoute.id ? 'Devis transporteur saisi' : 'Budget indicatif'}
                        </span>
                      </div>

                      <div className="flex items-center space-x-4 text-xs text-slate-600 mt-1.5">
                        <span className="flex items-center space-x-1">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>Délai maritime : ~{route.estimatedDays} jours</span>
                        </span>
                        <span>Mode : {route.mode === 'roro' ? 'RoRo individuel' : 'Conteneur 40\''}</span>
                      </div>

                      {route.priceNote && (
                        <div className="text-xs text-brand-800 font-medium mt-1">
                          Note : {route.priceNote}
                        </div>
                      )}
                    </div>

                    <div className="text-left sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-200 flex sm:flex-col justify-between sm:justify-center items-start sm:items-end">
                      <div>
                        <div className="text-lg font-black text-brand-900">
                          {routeTotal.toLocaleString('fr-CA')} $ CA
                        </div>
                        <div className="text-[11px] text-slate-500 font-semibold">
                          {activeQuote && route.id === selectedRoute.id ? 'avec votre devis officiel' : 'budget à confirmer'}
                        </div>
                      </div>
                      {isSelected && (
                        <span className="text-xs font-bold text-emerald-700 sm:mt-1 flex items-center space-x-1">
                          <Check className="w-4 h-4" />
                          <span>Actuellement sélectionné</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/60 p-5">
          <div className="flex items-start gap-3">
            <FileCheck2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
            <div className="flex-1">
              <h3 className="font-bold text-slate-900">Avez-vous un devis officiel du transporteur?</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                Saisissez-le ici pour remplacer le budget indicatif de fret. Le reste des frais demeure détaillé séparément.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-bold text-slate-700">
                  Transporteur
                  <input
                    type="text"
                    value={transport.quote?.routeId === selectedRoute.id ? transport.quote.carrierName : ''}
                    onChange={(event) => onChange({ quote: { routeId: selectedRoute.id, ...transport.quote, carrierName: event.target.value, quotedAt: transport.quote?.quotedAt ?? new Date().toISOString().slice(0, 10), amountCad: transport.quote?.amountCad ?? 0 } })}
                    placeholder="Nom indiqué sur le devis"
                    className="mt-1 min-h-[46px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold"
                  />
                </label>
                <label className="text-xs font-bold text-slate-700">
                  Montant du fret ($ CA)
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={transport.quote?.routeId === selectedRoute.id ? (transport.quote.amountCad || '') : ''}
                    onChange={(event) => onChange({ quote: { routeId: selectedRoute.id, ...transport.quote, carrierName: transport.quote?.carrierName ?? '', quotedAt: transport.quote?.quotedAt ?? new Date().toISOString().slice(0, 10), amountCad: Number(event.target.value) || 0 } })}
                    placeholder="Ex. 2450"
                    className="mt-1 min-h-[46px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold"
                  />
                </label>
                <label className="text-xs font-bold text-slate-700">
                  Référence du devis
                  <input
                    type="text"
                    value={transport.quote?.routeId === selectedRoute.id ? (transport.quote.reference ?? '') : ''}
                    onChange={(event) => onChange({ quote: { routeId: selectedRoute.id, ...transport.quote, carrierName: transport.quote?.carrierName ?? '', quotedAt: transport.quote?.quotedAt ?? new Date().toISOString().slice(0, 10), amountCad: transport.quote?.amountCad ?? 0, reference: event.target.value } })}
                    placeholder="Numéro ou titre du devis"
                    className="mt-1 min-h-[46px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
                  />
                </label>
                <label className="text-xs font-bold text-slate-700">
                  Date du devis
                  <input
                    type="date"
                    value={transport.quote?.routeId === selectedRoute.id ? transport.quote.quotedAt : ''}
                    onChange={(event) => onChange({ quote: { routeId: selectedRoute.id, ...transport.quote, carrierName: transport.quote?.carrierName ?? '', amountCad: transport.quote?.amountCad ?? 0, quotedAt: event.target.value } })}
                    className="mt-1 min-h-[46px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
                  />
                </label>
              </div>
              {!activeQuote && (
                <p className="mt-3 rounded-lg bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-950">
                  Aucun devis saisi : le résultat sera clairement marqué comme indicatif.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Si conteneur sélectionné : Sélecteur du nombre de voitures */}
        {isContainer && (
          <div className="bg-amber-50/70 p-5 rounded-2xl border-2 border-amber-200 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold text-base text-amber-950">
                  Nombre de véhicules dans ce conteneur (Groupage)
                </span>
                <p className="text-xs text-amber-800">
                  Le coût global du conteneur ({selectedRoute.oceanFreightCad.toLocaleString('fr-CA')} $ CA) est divisé équitablement
                </p>
              </div>
              <span className="text-xl font-black text-brand-700 bg-white px-3.5 py-1 rounded-xl border border-amber-300 shadow-sm">
                {batchCount} véhicule{batchCount > 1 ? 's' : ''}
              </span>
            </div>

            <input
              type="range"
              min="1"
              max="4"
              step="1"
              value={batchCount}
              onChange={(e) => onChange({ batchVehiclesCount: parseInt(e.target.value) })}
              className="w-full accent-amber-600 cursor-pointer h-2.5 bg-amber-200 rounded-lg"
            />

            <div className="flex justify-between text-xs font-bold text-amber-900">
              <span>1 véhicule</span>
              <span>2 véhicules</span>
              <span>3 véhicules (Équilibré)</span>
              <span>4 véhicules (Optimal)</span>
            </div>

            <div className="text-xs font-bold text-emerald-800 bg-white p-2.5 rounded-lg border border-amber-200 text-center">
              Fret alloué par véhicule : {oceanFreightPerCar.toLocaleString('fr-CA')} $ CA (Économie massive par rapport à un conteneur seul)
            </div>
          </div>
        )}

        {/* Frais complémentaires à confirmer */}
        <div className="bg-slate-50 p-5 rounded-2xl border-2 border-slate-200 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-200 pb-3">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-5 h-5 text-emerald-700" />
              <div>
                <span className="text-base font-bold text-slate-900">
                   Frais complémentaires à confirmer
                </span>
                <p className="text-xs text-slate-500">
                  Anticipez les frais indispensables pour que votre marge nette ne s'évapore pas
                </p>
              </div>
            </div>
            <span className="text-xs font-bold text-brand-800 bg-white px-3 py-1 rounded-full border border-slate-300 shadow-sm self-start sm:self-center">
              Total frais annexes : +{totalAdditionalCosts.toLocaleString('fr-CA')} $ CAD
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {/* 1. Transitaire local */}
            <label className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start space-x-2.5 ${additional.includeTransitAgentFee ? 'bg-white border-brand-500 shadow-sm' : 'bg-slate-100/70 border-slate-200 text-slate-400'
              }`}>
              <input
                type="checkbox"
                checked={additional.includeTransitAgentFee}
                onChange={(e) => updateAdditional({ includeTransitAgentFee: e.target.checked })}
                className="mt-0.5 w-4 h-4 rounded text-brand-600 focus:ring-brand-500"
              />
              <div>
                <div className="font-bold text-slate-900 flex items-center space-x-1.5">
                  <span>Transitaire / Déclarant agréé (+400 $ CA)</span>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded">Indispensable</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Mandataire obligatoire pour sortir le véhicule du port à Dakar ou Casablanca.
                </div>
              </div>
            </label>

            {/* 2. Lavage décontamination RoRo */}
            <label className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start space-x-2.5 ${additional.includeRoroCleaningFee ? 'bg-white border-brand-500 shadow-sm' : 'bg-slate-100/70 border-slate-200 text-slate-400'
              }`}>
              <input
                type="checkbox"
                checked={additional.includeRoroCleaningFee}
                onChange={(e) => updateAdditional({ includeRoroCleaningFee: e.target.checked })}
                className="mt-0.5 w-4 h-4 rounded text-brand-600 focus:ring-brand-500"
              />
              <div>
                <div className="font-bold text-slate-900 flex items-center space-x-1.5">
                  <span>Décontamination & Lavage RoRo (+180 $ CA)</span>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded">Requis navire</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Lavage châssis et inspection fuites exigés par les transporteurs maritimes.
                </div>
              </div>
            </label>

            {/* 3. Magasinage portuaire 5j */}
            <label className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start space-x-2.5 ${additional.includePortStorageBuffer ? 'bg-white border-brand-500 shadow-sm' : 'bg-slate-100/70 border-slate-200 text-slate-400'
              }`}>
              <input
                type="checkbox"
                checked={additional.includePortStorageBuffer}
                onChange={(e) => updateAdditional({ includePortStorageBuffer: e.target.checked })}
                className="mt-0.5 w-4 h-4 rounded text-brand-600 focus:ring-brand-500"
              />
              <div>
                <div className="font-bold text-slate-900">Provision magasinage portuaire (+250 $ CA)</div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Couvre 5 jours de stationnement à quai en cas de délai sur le Bill of Lading.
                </div>
              </div>
            </label>

            {/* 4. Batterie & Clés encan */}
            <label className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start space-x-2.5 ${additional.includeBatteryKeyFee ? 'bg-white border-brand-500 shadow-sm' : 'bg-slate-100/70 border-slate-200 text-slate-400'
              }`}>
              <input
                type="checkbox"
                checked={additional.includeBatteryKeyFee}
                onChange={(e) => updateAdditional({ includeBatteryKeyFee: e.target.checked })}
                className="mt-0.5 w-4 h-4 rounded text-brand-600 focus:ring-brand-500"
              />
              <div>
                <div className="font-bold text-slate-900">Batterie neuve / Clés de secours (+200 $ CA)</div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Évite 200 $ de frais de chariot élévateur si la batterie est morte à l'embarquement.
                </div>
              </div>
            </label>
          </div>

          {/* 5. Réparations prévues au Québec */}
          <div className="pt-2 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div className="flex items-center space-x-2">
              <Wrench className="w-4 h-4 text-slate-500" />
              <label className="font-semibold text-slate-700">
                Budget prévisionnel réparations mécaniques / esthétiques au Québec :
              </label>
            </div>
            <div className="relative w-full sm:w-44">
              <input
                type="number"
                min="0"
                step="50"
                value={additional.customRepairsCad || 0}
                onChange={(e) => updateAdditional({ customRepairsCad: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white font-bold text-right pr-8"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$ CA</span>
            </div>
          </div>
        </div>

        {/* Bouton pour afficher/masquer la décomposition détaillée */}
        <div className="pt-2 border-t border-slate-200">
          <button
            type="button"
            onClick={() => setShowTransportDetails(!showTransportDetails)}
            className="flex items-center space-x-2 text-xs font-bold text-slate-600 hover:text-brand-700 py-1 cursor-pointer transition-colors"
          >
            <span>{showTransportDetails ? 'Masquer' : 'Afficher'} la décomposition transparente des 6 postes de transport</span>
            {showTransportDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showTransportDetails && (
            <div className="mt-3 bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="flex justify-between p-2 bg-white rounded border border-slate-200">
                  <span className="text-slate-600">1. Convoyage terrestre QC → Port</span>
                  <span className="font-bold text-slate-900">{selectedRoute.inlandOriginCad} $ CA</span>
                </div>
                <div className="flex justify-between p-2 bg-white rounded border border-slate-200">
                  <span className="text-slate-600">2. Frais portuaires départ</span>
                  <span className="font-bold text-slate-900">{selectedRoute.portOriginFeesCad} $ CA</span>
                </div>
                <div className="flex justify-between p-2 bg-white rounded border border-slate-200">
                  <span className="text-slate-600">3. Fret maritime</span>
                  <span className="font-bold text-brand-700">{oceanFreightPerCar.toLocaleString('fr-CA')} $ CA</span>
                </div>
                <div className="flex justify-between p-2 bg-white rounded border border-slate-200">
                  <span className="text-slate-600">4. Assurance maritime (1.5%)</span>
                  <span className="font-bold text-slate-900">{marineInsurance.toLocaleString('fr-CA')} $ CA</span>
                </div>
                <div className="flex justify-between p-2 bg-white rounded border border-slate-200">
                  <span className="text-slate-600">5. Frais portuaires arrivée</span>
                  <span className="font-bold text-slate-900">{destinationPortFees.toLocaleString('fr-CA')} $ CA</span>
                </div>
                <div className="flex justify-between p-2 bg-white rounded border border-slate-200">
                  <span className="text-slate-600">6. Acheminement ville de destination</span>
                  <span className="font-bold text-slate-900">{selectedRoute.inlandDestinationCad} $ CA</span>
                </div>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Pied de formulaire */}
      <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-between">
        <button
          type="button"
          onClick={onPrev}
          className="inline-flex items-center space-x-2 px-5 py-3 rounded-xl font-bold text-sm text-slate-700 hover:bg-slate-200 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Retour au financement</span>
        </button>

        <button
          type="button"
          onClick={onCalculate}
          className="inline-flex items-center space-x-2.5 px-7 py-4 rounded-xl font-black text-base sm:text-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all cursor-pointer"
        >
          <Calculator className="w-5 h-5" />
          <span>Calculer la rentabilité</span>
        </button>
      </div>

    </div>
  );
};
