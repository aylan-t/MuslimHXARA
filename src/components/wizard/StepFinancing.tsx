import React, { useState } from 'react';
import { FinancingConfig, DestinationCountry, GlobalReferenceConfig, FinancingMethod } from '../../types';
import { Tooltip } from '../common/Tooltip';
import { DollarSign, ArrowLeft, ArrowRight, TrendingDown, Check, Star, AlertTriangle, ChevronDown, ChevronUp, Award } from 'lucide-react';

interface StepFinancingProps {
  financing: FinancingConfig;
  purchasePriceCad: number;
  country: DestinationCountry;
  config: GlobalReferenceConfig;
  onChange: (updated: Partial<FinancingConfig>) => void;
  onNext: () => void;
  onPrev: () => void;
}

export const StepFinancing: React.FC<StepFinancingProps> = ({
  financing,
  purchasePriceCad,
  country,
  config,
  onChange,
  onNext,
  onPrev
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const baseRate = country === 'senegal'
    ? (config.fxRates.marketCAD_to_XOF ?? config.fxRates.CAD_to_XOF)
    : (config.fxRates.marketCAD_to_MAD ?? config.fxRates.CAD_to_MAD);
  const currencyCode = country === 'senegal' ? 'XOF' : 'MAD';
  const corridorSpreadPercent = country === 'senegal' ? 2.5 : 2.2;
  const effectiveRate = baseRate * (1 - corridorSpreadPercent / 100);
  const spreadCostCad = Math.round(purchasePriceCad * (corridorSpreadPercent / 100));

  // Comparaison chiffrée entre banque classique et plateforme
  const traditionalBankSpread = 3.4;
  const traditionalBankCost = Math.round(purchasePriceCad * (traditionalBankSpread / 100)) + 45;
  const onlinePlatformCost = Math.round(purchasePriceCad * (1.2 / 100)) + 15;
  const estimatedSavings = Math.max(0, traditionalBankCost - onlinePlatformCost);

  const handleMethodSelect = (methodId: FinancingMethod) => {
    const selected = config.transferMethods.find(m => m.id === methodId);
    if (selected) {
      onChange({
        method: methodId,
        fixedFeeCad: selected.fixedFeeCad,
        variableFeePercent: selected.variableFeePercent,
        fxSpreadPercent: selected.typicalSpreadPercent
      });
    }
  };

  return (
    <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">

      {/* En-tête */}
      <div className="bg-slate-50 border-b border-slate-200 px-6 py-5">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-amber-100 text-amber-800 rounded-xl">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              Étape 3 — Mode de transfert d'argent & change de devises
            </h2>
            <p className="text-sm text-slate-600">
              Découvrez la solution la plus recommandée pour ne pas perdre d'argent sur le change
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 sm:p-8 space-y-6">

        {/* NOUVEAU : Encadré Recommandation & Analyse Gagnant/Perdant (Section demandée) */}
        <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-sky-50 rounded-2xl p-5 border-2 border-emerald-300 shadow-sm space-y-3">
          <div className="flex items-center space-x-2">
            <Award className="w-5 h-5 text-emerald-700" />
            <span className="font-black text-sm uppercase tracking-wider text-emerald-900">
              Recommandation stratégique pour Karim
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {/* Côté Gagnant */}
            <div className="bg-white/80 p-3.5 rounded-xl border border-emerald-200 space-y-1.5">
              <div className="flex items-center space-x-1.5 text-emerald-800 font-bold text-sm">
                <Check className="w-4 h-4 text-emerald-600" />
                <span>Où vous êtes GAGNANT :</span>
              </div>
              <p className="text-slate-700 leading-relaxed">
                En choisissant une <strong>plateforme spécialisée (Wise, Remitly)</strong>, le spread n'est que de 1.2%. Vous économisez environ <strong className="text-emerald-700">{estimatedSavings.toLocaleString('fr-CA')} $ CA</strong> nets sur ce véhicule.
              </p>
            </div>

            {/* Côté Perdant */}
            <div className="bg-white/80 p-3.5 rounded-xl border border-red-200 space-y-1.5">
              <div className="flex items-center space-x-1.5 text-red-800 font-bold text-sm">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <span>Où vous êtes PERDANT :</span>
              </div>
              <p className="text-slate-700 leading-relaxed">
                Avec un <strong>virement bancaire classique (SWIFT)</strong>, la banque québécoise prélève discrètement entre 3% et 4% de spread ({traditionalBankCost} $ de frais totaux), ce qui réduit directement votre bénéfice.
              </p>
            </div>
          </div>
        </div>

        {/* Sélection des 3 Méthodes */}
        <div>
          <label className="block text-base font-bold text-slate-900 mb-2.5">
            Sélectionnez votre canal de transfert :
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            {config.transferMethods.map((m) => {
              const isSelected = financing.method === m.id;
              return (
                <div
                  key={m.id}
                  onClick={() => handleMethodSelect(m.id)}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col justify-between ${isSelected
                      ? 'border-brand-600 bg-brand-50/50 shadow-md ring-1 ring-brand-500'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                >
                  <div>
                    {m.recommended && (
                      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-300 mb-2">
                        <Star className="w-3 h-3 fill-emerald-600 text-emerald-600" />
                        <span>Recommandé</span>
                      </span>
                    )}

                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-sm text-slate-900">{m.name}</span>
                      {isSelected && (
                        <span className="w-4 h-4 rounded-full bg-brand-600 text-white flex items-center justify-center flex-shrink-0">
                          <Check className="w-3 h-3" />
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-slate-600 mt-1 leading-relaxed">
                      {m.description}
                    </div>
                  </div>

                  <div className="text-[11px] font-semibold text-slate-700 pt-3 mt-3 border-t border-slate-200/60 flex items-center justify-between">
                    <span>Frais fixes : {m.fixedFeeCad} $</span>
                    <span className="font-bold text-brand-700">Spread : ~{m.typicalSpreadPercent}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Visualisation synthétique du taux appliqué */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="space-y-0.5">
            <span className="font-semibold text-slate-700">Conversion appliquée :</span>
            <div className="text-sm font-bold text-slate-900">
              1 $ CA indicatif = {baseRate.toFixed(2)} {currencyCode} → Taux net obtenu : <span className="text-emerald-700">{effectiveRate.toFixed(2)} {currencyCode}</span>
            </div>
            <div className={`mt-1 text-[11px] ${config.fxRates.isLive ? 'text-emerald-700' : 'text-amber-700'}`}>
              {config.fxRates.isLive ? 'Taux récupéré par API' : 'API indisponible : taux précédent, à reconfirmer'}
              {config.fxRates.providerUpdatedAt && ` · cotation du ${new Date(config.fxRates.providerUpdatedAt).toLocaleString('fr-CA')}`}
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <span className="text-slate-500">Coût retenu sur le change :</span>
            <div className="text-sm font-black text-amber-800">
              -{spreadCostCad} $ CAD ({corridorSpreadPercent}%)
            </div>
          </div>
        </div>

        {/* Bouton pour afficher/masquer les options avancées (Section demandée) */}
        <div className="pt-2 border-t border-slate-200">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center space-x-2 text-xs font-bold text-slate-600 hover:text-brand-700 py-1 cursor-pointer transition-colors"
          >
            <span>{showAdvanced ? 'Masquer' : 'Afficher'} les paramètres de frais bancaires</span>
            {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showAdvanced && (
            <div className="mt-3 p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Spread du corridor (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    max="6.0"
                    value={corridorSpreadPercent}
                    readOnly
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-100 font-bold"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Frais fixes de virement ($ CA)
                  </label>
                  <input
                    type="number"
                    value={financing.fixedFeeCad}
                    onChange={(e) => onChange({ fixedFeeCad: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white font-bold"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Commission variable (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={financing.variableFeePercent}
                    onChange={(e) => onChange({ variableFeePercent: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white font-bold"
                  />
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
          <span>Retour à la destination</span>
        </button>

        <button
          type="button"
          onClick={onNext}
          className="inline-flex items-center space-x-2 px-6 py-3.5 rounded-xl font-bold text-base bg-brand-600 hover:bg-brand-700 text-white shadow hover:shadow-md transform hover:-translate-y-0.5 transition-all cursor-pointer"
        >
          <span>Étape 4 : Mode de transport</span>
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>

    </div>
  );
};
