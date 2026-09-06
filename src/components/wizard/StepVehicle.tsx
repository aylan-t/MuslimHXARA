import React, { useState } from 'react';
import { Vehicle, VehicleCategory, VehicleCondition, VehicleSource, PreloadedVehicle } from '../../types';
import { Tooltip } from '../common/Tooltip';
import { Car, DollarSign, Calendar, Gauge, ArrowRight, Sparkles, ChevronDown, ChevronUp, Check, MapPin, Wrench } from 'lucide-react';
import { CURRENT_YEAR } from '../../services/calculationEngine';
import { PRELOADED_VEHICLES, QUEBEC_REGIONS } from '../../data/defaultData';

interface StepVehicleProps {
  vehicle: Vehicle;
  onChange: (updated: Partial<Vehicle>) => void;
  onNext: () => void;
}

export const StepVehicle: React.FC<StepVehicleProps> = ({
  vehicle,
  onChange,
  onNext
}) => {
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const vehicleAge = CURRENT_YEAR - vehicle.year;

  const handleSelectPreloaded = (p: PreloadedVehicle) => {
    onChange({
      brand: p.brand,
      model: p.model,
      year: p.year,
      purchasePriceCad: p.purchasePriceCad,
      mileageKm: p.mileageKm,
      category: p.category,
      condition: p.condition,
      source: p.source,
      auctionFeesCad: p.source === 'encan' ? 650 : 0,
      brokerCommissionCad: p.source === 'encan' ? 300 : 0
    });
  };

  const handleYearChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const yr = parseInt(e.target.value) || CURRENT_YEAR;
    onChange({ year: yr });
  };

  const handleNumberChange = (field: keyof Vehicle, val: string) => {
    const num = parseFloat(val) || 0;
    onChange({ [field]: num });
  };

  const isFormValid =
    vehicle.brand.trim().length > 0 &&
    vehicle.model.trim().length > 0 &&
    vehicle.year >= 2000 &&
    vehicle.year <= CURRENT_YEAR &&
    vehicle.purchasePriceCad > 0;

  return (
    <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">

      {/* En-tête de l'étape */}
      <div className="bg-slate-50 border-b border-slate-200 px-6 py-5">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-sky-100 text-sky-800 rounded-xl">
            <Car className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              Étape 1 — Renseigner le véhicule
            </h2>
            <p className="text-sm text-slate-600">
              Choisissez un modèle fréquent ou saisissez vos caractéristiques personnalisées
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 sm:p-8 space-y-6">

        {/* NOUVEAU : Liste préchargée (Autofill en 1 clic) */}
        <div className="bg-gradient-to-r from-sky-50 to-indigo-50/70 p-4 rounded-2xl border border-sky-200 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-brand-600" />
              <label className="text-xs font-bold text-brand-900 uppercase tracking-wider">
                Remplissage rapide : Modèles fréquents exportés
              </label>
            </div>
            <span className="text-[11px] font-semibold text-brand-700">10 modèles pré-chargés</span>
          </div>

          <div className="relative">
            <select
              onChange={(e) => {
                const found = PRELOADED_VEHICLES.find(p => p.id === e.target.value);
                if (found) handleSelectPreloaded(found);
              }}
              defaultValue=""
              className="w-full text-sm font-semibold px-4 py-3 rounded-xl border border-sky-300 bg-white text-slate-900 shadow-sm focus:ring-2 focus:ring-brand-500 cursor-pointer"
            >
              <option value="" disabled>-- Cliquez pour choisir un véhicule et pré-remplir la simulation --</option>
              {PRELOADED_VEHICLES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} — Prix estimé : {p.purchasePriceCad.toLocaleString('fr-CA')} $ CA
                </option>
              ))}
            </select>
          </div>

          <p className="text-[11px] text-slate-500 italic">
            💡 Astuce : Choisir une option pré-remplit les champs automatiquement. Vous pouvez toujours modifier les montants ensuite.
          </p>
        </div>

        {/* Ligne 1 : Marque & Modèle */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-base font-semibold text-slate-800 mb-1.5">
              Marque du véhicule
              <span className="text-red-500 ml-1">*</span>
            </label>
            <input
              type="text"
              required
              value={vehicle.brand}
              onChange={(e) => onChange({ brand: e.target.value })}
              placeholder="Ex : Toyota, Honda, Hyundai..."
              className="w-full text-base px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 bg-slate-50/50 hover:bg-white transition-colors"
            />
          </div>

          <div>
            <label className="block text-base font-semibold text-slate-800 mb-1.5">
              Modèle
              <span className="text-red-500 ml-1">*</span>
            </label>
            <input
              type="text"
              required
              value={vehicle.model}
              onChange={(e) => onChange({ model: e.target.value })}
              placeholder="Ex : RAV4, Corolla, CR-V, Tucson..."
              className="w-full text-base px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 bg-slate-50/50 hover:bg-white transition-colors"
            />
          </div>
        </div>

        {/* Ligne 2 : Année & Prix d'achat CAD (Champs prioritaires) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-base font-semibold text-slate-800">
                Année du véhicule
                <span className="text-red-500 ml-1">*</span>
              </label>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                Âge calculé : {vehicleAge} an(s)
              </span>
            </div>
            <div className="relative">
              <input
                type="number"
                min="2000"
                max={CURRENT_YEAR}
                value={vehicle.year}
                onChange={handleYearChange}
                className="w-full text-base px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 bg-slate-50/50"
              />
              <Calendar className="w-5 h-5 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="block text-base font-bold text-slate-900 mb-1.5">
              Prix d'achat au Québec ($ CA)
              <span className="text-red-500 ml-1">*</span>
            </label>
            <div className="relative">
              <input
                type="number"
                min="500"
                step="100"
                required
                value={vehicle.purchasePriceCad || ''}
                onChange={(e) => handleNumberChange('purchasePriceCad', e.target.value)}
                placeholder="Ex : 14200"
                className="w-full text-lg font-black px-4 py-3 rounded-xl border-2 border-brand-500 focus:ring-2 focus:ring-brand-500 bg-white text-slate-900 shadow-inner"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-sm">
                $ CAD
              </span>
            </div>
          </div>
        </div>

        {/* Ligne 3 : Catégorie & Kilométrage */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-base font-semibold text-slate-800 mb-1.5">
              Catégorie / Gabarit
            </label>
            <select
              value={vehicle.category}
              onChange={(e) => onChange({ category: e.target.value as VehicleCategory })}
              className="w-full text-base px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 bg-white"
            >
              <option value="suv">VUS / SUV (RAV4, CR-V, Tucson, etc.)</option>
              <option value="berline">Berline standard (Corolla, Civic, etc.)</option>
              <option value="citadine">Petite citadine / Compacte (Yaris, Fit)</option>
              <option value="camionnette">Camionnette / Pickup (Tacoma, F-150)</option>
            </select>
          </div>

          <div>
            <label className="block text-base font-semibold text-slate-800 mb-1.5">
              Kilométrage (km)
            </label>
            <div className="relative">
              <input
                type="number"
                min="0"
                step="5000"
                value={vehicle.mileageKm}
                onChange={(e) => handleNumberChange('mileageKm', e.target.value)}
                className="w-full text-base px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 bg-slate-50/50"
              />
              <Gauge className="w-5 h-5 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Ligne 4 : Localisation de prise en charge au Québec (Précision terrain demandée) */}
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <label className="flex items-center space-x-2 text-base font-bold text-slate-900">
              <MapPin className="w-5 h-5 text-brand-600" />
              <span>Lieu de prise en charge du véhicule au Québec</span>
              <Tooltip
                title="Pourquoi la région est cruciale ?"
                content="Le remorquage ou convoyage terrestre varie énormément selon que la voiture est achetée à Montréal (200 $), à Québec (480 $) ou à Rimouski (850 $). Vers Halifax, les distances changent aussi la donne !"
              />
            </label>
            <span className="text-xs text-brand-700 font-semibold hidden sm:inline">Tarifs transporteurs réels</span>
          </div>

          <select
            value={vehicle.originRegionId || 'grand-montreal'}
            onChange={(e) => onChange({ originRegionId: e.target.value })}
            className="w-full text-sm font-semibold px-4 py-3 rounded-xl border border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-brand-500 cursor-pointer"
          >
            {QUEBEC_REGIONS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.citiesDescription}) — Vers MTL : {r.costToMtlCad} $ | Vers Halifax : {r.costToHalifaxCad} $
              </option>
            ))}
          </select>

          {/* Option véhicule non-roulant */}
          <label className="flex items-center space-x-2.5 text-xs text-slate-700 font-medium cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={vehicle.isNonRunning || false}
              onChange={(e) => onChange({ isNonRunning: e.target.checked })}
              className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <span>
              Véhicule inopérant / non-roulant (nécessite treuillage porte-voitures et chariot : <strong>+150 $ CA</strong>)
            </span>
          </label>
        </div>

        {/* Bouton pour afficher/masquer les options avancées (Section demandée) */}
        <div className="pt-2 border-t border-slate-200">
          <button
            type="button"
            onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
            className="flex items-center space-x-2 text-xs font-bold text-slate-600 hover:text-brand-700 py-1 cursor-pointer transition-colors"
          >
            <span>⚙ {showAdvancedOptions ? 'Masquer' : 'Afficher'} les détails de provenance & frais d'encan</span>
            {showAdvancedOptions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {/* Options secondaires masquées par défaut */}
          {showAdvancedOptions && (
            <div className="mt-3 p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  Provenance du véhicule :
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  {[
                    { id: 'particulier', label: 'Particulier', desc: 'Vente directe' },
                    { id: 'concessionnaire', label: 'Concessionnaire', desc: 'Garage pro' },
                    { id: 'encan', label: 'Encan (Copart, IAAI)', desc: 'Frais de vente' },
                  ].map((src) => (
                    <label
                      key={src.id}
                      className={`p-2.5 rounded-lg border cursor-pointer ${vehicle.source === src.id ? 'border-brand-600 bg-brand-50 font-bold text-brand-900' : 'border-slate-200 bg-white'
                        }`}
                    >
                      <input
                        type="radio"
                        name="srcChoice"
                        checked={vehicle.source === src.id}
                        onChange={() => onChange({ source: src.id as VehicleSource })}
                        className="sr-only"
                      />
                      <div>{src.label}</div>
                      <div className="text-[10px] text-slate-500 font-normal">{src.desc}</div>
                    </label>
                  ))}
                </div>
              </div>

              {vehicle.source === 'encan' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Frais d'enchères Copart/IAAI ($ CA)
                    </label>
                    <input
                      type="number"
                      value={vehicle.auctionFeesCad}
                      onChange={(e) => handleNumberChange('auctionFeesCad', e.target.value)}
                      className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 bg-white font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Commission courtier / intermédiaire ($ CA)
                    </label>
                    <input
                      type="number"
                      value={vehicle.brokerCommissionCad}
                      onChange={(e) => handleNumberChange('brokerCommissionCad', e.target.value)}
                      className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 bg-white font-medium"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

      </div>

      {/* Pied de formulaire */}
      <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-between">
        <span className="text-xs text-slate-500">
          Champs obligatoires (<span className="text-red-500">*</span>)
        </span>
        <button
          type="button"
          disabled={!isFormValid}
          onClick={onNext}
          className={`inline-flex items-center space-x-2 px-6 py-3.5 rounded-xl font-bold text-base shadow transition-all ${isFormValid
            ? 'bg-brand-600 hover:bg-brand-700 text-white hover:shadow-md transform hover:-translate-y-0.5 cursor-pointer'
            : 'bg-slate-300 text-slate-500 cursor-not-allowed'
            }`}
        >
          <span>Étape 2 : Choisir la destination</span>
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>

    </div>
  );
};
