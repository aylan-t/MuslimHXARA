import React, { useState } from 'react';
import { SimulationResult } from '../../types';
import { TrendingUp, TrendingDown, ArrowRight, ShieldCheck, AlertCircle } from 'lucide-react';
import { Tooltip } from '../common/Tooltip';

interface FxSensitivityProps {
  simulation: SimulationResult;
}

export const FxSensitivity: React.FC<FxSensitivityProps> = ({ simulation }) => {
  const [sliderVariation, setSliderVariation] = useState<number>(0);

  const baseRate = simulation.breakdown.baseFxRate;
  const spreadPercent = simulation.destination === 'senegal' ? 2.5 : 2.2;
  const landedCostCad = simulation.breakdown.landedCostCad;
  const suggestedSalePriceLocal = simulation.suggestedSalePriceLocal;
  const currencyCode = simulation.breakdown.localCurrencyCode;

  // Calcul dynamique selon la position du slider
  const customEffectiveRate = baseRate * (1 + sliderVariation / 100) * (1 - spreadPercent / 100);
  const customSaleCad = suggestedSalePriceLocal / customEffectiveRate;
  const customProfitCad = Math.round(customSaleCad - landedCostCad);
  const customRoi = Math.round((customProfitCad / landedCostCad) * 1000) / 10;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-5">

      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <h3 className="text-lg font-bold text-slate-900">
              Simulateur de risque de change (Sensibilité FX)
            </h3>
            <Tooltip
              title="Pourquoi le taux de change compte ?"
              content="Entre l'achat de la voiture au Québec et sa revente à destination, 4 à 8 semaines peuvent s'écouler. Si la monnaie locale baisse face au dollar canadien, votre profit réel diminue."
            />
          </div>
          <p className="text-xs text-slate-500">
            Observez l'impact direct d'une variation de la monnaie locale sur votre profit final en $ CAD
          </p>
        </div>

        <span className="inline-flex items-center text-xs font-bold text-slate-700 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
          Délai de transit : ~3 à 4 semaines
        </span>
      </div>

      {/* Les 3 Scénarios Clés (Section 5.8) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

        {/* Scénario Pessimiste */}
        <div className="bg-red-50/70 border border-red-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs font-bold text-red-800 mb-1">
            <span className="flex items-center space-x-1">
              <TrendingDown className="w-3.5 h-3.5" />
              <span>Pessimiste (-7.5%)</span>
            </span>
            <span>Taux défavorable</span>
          </div>
          <div className="text-xl font-black text-red-700">
            {simulation.fxScenarios.pessimistic.profitCad >= 0 ? '+' : ''}
            {simulation.fxScenarios.pessimistic.profitCad.toLocaleString('fr-CA')} $ CA
          </div>
          <div className="text-xs text-red-600 font-medium mt-1">
            Marge : {simulation.fxScenarios.pessimistic.marginPercent}% · ROI : {simulation.fxScenarios.pessimistic.roiPercent}%
          </div>
        </div>

        {/* Scénario Réaliste (Taux du jour) */}
        <div className="bg-emerald-50/70 border-2 border-emerald-400 rounded-xl p-4 shadow-sm relative">
          <div className="flex items-center justify-between text-xs font-bold text-emerald-800 mb-1">
            <span className="flex items-center space-x-1">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Réaliste (Taux du jour)</span>
            </span>
            <span className="bg-emerald-200 text-emerald-900 px-1.5 py-0.2 rounded text-[10px]">Actuel</span>
          </div>
          <div className="text-2xl font-black text-emerald-800">
            +{simulation.estimatedNetProfitCad.toLocaleString('fr-CA')} $ CA
          </div>
          <div className="text-xs text-emerald-700 font-bold mt-1">
            Marge : {simulation.targetMarginPercent}% · ROI : {simulation.estimatedRoiPercent}%
          </div>
        </div>

        {/* Scénario Optimiste */}
        <div className="bg-sky-50/70 border border-sky-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs font-bold text-sky-800 mb-1">
            <span className="flex items-center space-x-1">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Optimiste (+7.5%)</span>
            </span>
            <span>Taux favorable</span>
          </div>
          <div className="text-xl font-black text-sky-800">
            +{simulation.fxScenarios.optimistic.profitCad.toLocaleString('fr-CA')} $ CA
          </div>
          <div className="text-xs text-sky-600 font-medium mt-1">
            Marge : {simulation.fxScenarios.optimistic.marginPercent}% · ROI : {simulation.fxScenarios.optimistic.roiPercent}%
          </div>
        </div>

      </div>

      {/* Curseur interactif de sensibilité */}
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-700">
            Tester une variation personnalisée du cours :
          </span>
          <span className={`text-sm font-black px-2 py-0.5 rounded ${sliderVariation < 0 ? 'bg-red-100 text-red-800' : sliderVariation > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-800'
            }`}>
            {sliderVariation > 0 ? `+${sliderVariation}%` : `${sliderVariation}%`}
          </span>
        </div>

        <input
          type="range"
          min="-15"
          max="15"
          step="1"
          value={sliderVariation}
          onChange={(e) => setSliderVariation(parseInt(e.target.value))}
          className="w-full h-2 bg-slate-300 rounded-lg cursor-pointer accent-brand-600"
        />

        <div className="flex justify-between text-[11px] text-slate-500 font-medium">
          <span className="text-red-600">-15% Dépréciation forte</span>
          <span>0% Cours stable</span>
          <span className="text-emerald-600">+15% Hausse de devise</span>
        </div>

        {/* Résultat dynamique calculé */}
        <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-xs">
          <span className="text-slate-600">
            Avec ce scénario ({customEffectiveRate.toFixed(2)} {currencyCode} / $ CA) :
          </span>
          <span className="text-sm font-bold text-slate-900">
            Profit net estimé : <strong className={customProfitCad >= 0 ? "text-emerald-700" : "text-red-600"}>
              {customProfitCad >= 0 ? '+' : ''}{customProfitCad.toLocaleString('fr-CA')} $ CA
            </strong> (ROI: {customRoi}%)
          </span>
        </div>
      </div>

    </div>
  );
};

