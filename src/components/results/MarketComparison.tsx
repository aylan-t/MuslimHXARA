import React from 'react';
import { MarketComparison as MarketComparisonType } from '../../types';
import { CheckCircle, AlertTriangle, XCircle, TrendingUp, HelpCircle, ExternalLink } from 'lucide-react';
import { Tooltip } from '../common/Tooltip';

interface MarketComparisonProps {
  comparison?: MarketComparisonType;
  suggestedSalePriceCad: number;
  suggestedSalePriceLocal: number;
  currencyCode: 'MAD' | 'XOF';
}

export const MarketComparison: React.FC<MarketComparisonProps> = ({
  comparison,
  suggestedSalePriceCad,
  suggestedSalePriceLocal,
  currencyCode
}) => {
  if (!comparison) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 text-center text-slate-500 text-sm">
        <p className="font-semibold text-slate-700 mb-1">
          Aucune donnée de marché directe préchargée pour ce modèle exact.
        </p>
        <p className="text-xs">
          Votre prix de revente suggéré est calculé sur votre marge cible ({suggestedSalePriceCad.toLocaleString('fr-CA')} $ CA / {suggestedSalePriceLocal.toLocaleString('fr-CA')} {currencyCode}).
        </p>
      </div>
    );
  }

  const isPositiveDiff = comparison.priceDifferencePercent > 0;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-5">

      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <h3 className="text-lg font-bold text-slate-900">
              Comparaison au Marché Local ({comparison.matchedModel})
            </h3>
            <Tooltip
              title="D'où viennent ces prix ?"
              content={`Relevés sur les plateformes de vente locales (${comparison.source}) auprès des importateurs et revendeurs.`}
            />
          </div>
          <p className="text-xs text-slate-500">
            Source : {comparison.source} · Données actualisées en {comparison.referenceDate}
          </p>
        </div>

        {/* Verdict Badge */}
        <span
          className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${comparison.verdict === 'tres_competitif'
              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
              : comparison.verdict === 'competitif'
                ? 'bg-sky-100 text-sky-800 border-sky-300'
                : comparison.verdict === 'marge_serree'
                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                  : 'bg-red-100 text-red-800 border-red-300'
            }`}
        >
          {comparison.verdict === 'tres_competitif' || comparison.verdict === 'competitif' ? (
            <CheckCircle className="w-4 h-4" />
          ) : (
            <AlertTriangle className="w-4 h-4" />
          )}
          <span>{comparison.verdictLabel}</span>
        </span>
      </div>

      {/* Cartes de confrontation des prix */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* Prix Suggéré par l'app */}
        <div className="bg-brand-50/50 p-4 rounded-xl border border-brand-200">
          <div className="text-xs font-semibold text-brand-800 mb-1">
            Votre prix de revente suggéré
          </div>
          <div className="text-2xl font-black text-brand-950">
            {suggestedSalePriceCad.toLocaleString('fr-CA')} $ CA
          </div>
          <div className="text-xs text-brand-700 font-bold mt-0.5">
            {suggestedSalePriceLocal.toLocaleString('fr-CA')} {currencyCode}
          </div>
        </div>

        {/* Prix Moyen du marché local */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
          <div className="text-xs font-semibold text-slate-600 mb-1">
            Prix moyen observé sur le marché local
          </div>
          <div className="text-2xl font-black text-slate-800">
            {comparison.averageMarketPriceCad.toLocaleString('fr-CA')} $ CA
          </div>
          <div className="text-xs text-slate-600 font-bold mt-0.5">
            {comparison.averageMarketPriceLocal.toLocaleString('fr-CA')} {currencyCode}
          </div>
        </div>

      </div>

      {/* Écart et Verdict explicatif pour Karim */}
      <div
        className={`p-4 rounded-xl border ${comparison.verdict === 'tres_competitif' || comparison.verdict === 'competitif'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
            : comparison.verdict === 'marge_serree'
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
      >
        <div className="flex items-center space-x-2 font-bold text-sm mb-1">
          <span>Écart avec le marché :</span>
          <span>
            {isPositiveDiff ? `+${comparison.priceDifferencePercent}% plus cher que la moyenne` : `${Math.abs(comparison.priceDifferencePercent)}% moins cher que la moyenne`}
          </span>
        </div>
        <p className="text-xs leading-relaxed">
          {comparison.verdictDescription}
        </p>
      </div>

    </div>
  );
};

