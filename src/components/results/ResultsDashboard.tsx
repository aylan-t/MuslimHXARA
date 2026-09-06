import React, { useState } from 'react';
import { SimulationResult } from '../../types';
import { CostBreakdown } from './CostBreakdown';
import { FxSensitivity } from './FxSensitivity';
import { MarketComparison } from './MarketComparison';
import { LocalMarketLinks } from './LocalMarketLinks';
import { saveSimulationToHistory } from '../../services/storageService';
import {
  Download,
  Bookmark,
  Edit3,
  CheckCircle2,
  TrendingUp,
  AlertTriangle,
  FileCheck,
  Percent,
  Sparkles,
  Container,
  Share2,
  ShieldCheck,
  ChevronDown
} from 'lucide-react';
import { Tooltip } from '../common/Tooltip';

interface ResultsDashboardProps {
  simulation: SimulationResult;
  onEdit: () => void;
  onGoToOptimizer: () => void;
  onTargetMarginChange: (margin: number) => void;
  onOpenSourcesModal?: () => void;
}

export const ResultsDashboard: React.FC<ResultsDashboardProps> = ({
  simulation,
  onEdit,
  onGoToOptimizer,
  onTargetMarginChange,
  onOpenSourcesModal
}) => {
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const isProfit = simulation.estimatedNetProfitCad > 0;
  const currencyCode = simulation.breakdown.localCurrencyCode;
  const destName = simulation.destination === 'senegal' ? 'Sénégal (Dakar)' : 'Maroc (Casablanca)';
  const hasCarrierQuote = simulation.calculationStatus === 'carrier_quote';
  const hasMarketplaceRate = simulation.calculationStatus === 'marketplace_rate';

  const handleSave = () => {
    saveSimulationToHistory(simulation);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handlePdfExport = async () => {
    setIsExporting(true);
    try {
      const { generateSimulationPdf } = await import('../../services/pdfExportService');
      await generateSimulationPdf(simulation);
    } catch (e) {
      console.error('Erreur génération PDF:', e);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">

      {/* 1. Résumé en UNE phrase en haut */}
      <div
        className={`p-5 sm:p-6 rounded-2xl border shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 ${isProfit
          ? 'bg-gradient-to-r from-emerald-700 to-teal-800 text-white border-emerald-600'
          : 'bg-gradient-to-r from-rose-700 to-red-800 text-white border-rose-600'
          }`}
      >
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded text-[11px] font-bold bg-white/20 text-white uppercase tracking-wider">
              Verdict de rentabilité nette
            </span>
            <span className="text-xs text-emerald-100">
              {simulation.vehicle.brand} {simulation.vehicle.model} ({simulation.vehicle.year}) vers {destName}
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight leading-tight">
            {isProfit
              ? `Cette voiture peut te rapporter environ ${simulation.estimatedNetProfitCad.toLocaleString('fr-CA')} $ CA de profit net.`
              : `Attention : cette opération risque d'être déficitaire de ${Math.abs(simulation.estimatedNetProfitCad).toLocaleString('fr-CA')} $ CA.`}
          </h1>
          <p className="text-xs sm:text-sm text-emerald-100/90">
            Équivalent à environ <strong>{simulation.estimatedNetProfitLocal.toLocaleString('fr-CA')} {currencyCode}</strong> sur le marché local après déduction intégrale de tous les frais.
          </p>
        </div>

        {/* Bouton d'export PDF en tête */}
        <div className="flex items-center space-x-2 self-start sm:self-center flex-shrink-0">
          <button
            type="button"
            onClick={handlePdfExport}
            disabled={isExporting}
            className="inline-flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-white text-emerald-900 hover:bg-emerald-50 text-xs sm:text-sm font-bold shadow transition-all cursor-pointer"
          >
            <Download className="w-4 h-4 text-emerald-700" />
            <span>{isExporting ? 'Génération...' : 'Télécharger le PDF'}</span>
          </button>
        </div>
      </div>

      <div className={`rounded-xl border px-4 py-3 ${hasCarrierQuote ? 'border-emerald-200 bg-emerald-50' : hasMarketplaceRate ? 'border-blue-200 bg-blue-50' : 'border-amber-300 bg-amber-50'}`}>
        <div className="flex items-start gap-3">
          {hasCarrierQuote ? <FileCheck className="mt-0.5 h-5 w-5 text-emerald-700" /> : <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" />}
          <div>
            <p className="text-sm font-black text-slate-900">
              {hasCarrierQuote ? 'Fret calculé avec votre devis transporteur' : hasMarketplaceRate ? 'Fret basé sur une estimation marketplace en direct' : 'Résultat indicatif — devis transporteur requis'}
            </p>
            <p className="mt-0.5 text-xs text-slate-600">
              {hasCarrierQuote
                ? 'Le montant de fret saisi est intégré. Confirmez sa période de validité et les frais inclus.'
                : hasMarketplaceRate
                  ? 'L’offre récupérée aide à comparer les routes, mais elle doit être confirmée avant réservation.'
                : 'Le fret actuel est une hypothèse de travail. Ne prenez pas de décision d’achat avant d’obtenir un devis officiel.'}
            </p>
          </div>
        </div>
      </div>

      {/* 2. Tableau de bord financier & Cartes KPI */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

        {/* Profit Net */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border-2 border-emerald-500/50 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500 font-bold uppercase tracking-wider">
              <span>Profit Net Estimé</span>
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-emerald-700 mt-2">
              +{simulation.estimatedNetProfitCad.toLocaleString('fr-CA')} $
            </div>
            <div className="text-xs font-bold text-emerald-600 mt-0.5">
              +{simulation.estimatedNetProfitLocal.toLocaleString('fr-CA')} {currencyCode}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <span>Rendement (ROI) :</span>
            <span className="font-black text-emerald-800 text-sm">+{simulation.estimatedRoiPercent}%</span>
          </div>
        </div>

        {/* Coût Rendu (Landed Cost) */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500 font-bold uppercase tracking-wider">
              <span>Coût Total Rendu</span>
              <Tooltip
                title="Landed Cost complet"
                content="Achat initial + spread de change + virement + transport complet A-Z + douane à destination."
              />
            </div>
            <div className="text-2xl font-black text-slate-900 mt-2">
              {simulation.breakdown.landedCostCad.toLocaleString('fr-CA')} $
            </div>
            <div className="text-xs text-slate-500 font-medium mt-0.5">
              {simulation.breakdown.landedCostLocal.toLocaleString('fr-CA')} {currencyCode}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500">
            Frais annexes : {(simulation.breakdown.landedCostCad - simulation.vehicle.purchasePriceCad).toLocaleString('fr-CA')} $ CA
          </div>
        </div>

        {/* Prix de Revente Suggéré */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500 font-bold uppercase tracking-wider">
              <span>Prix de Vente Suggéré</span>
            </div>
            <div className="text-2xl font-black text-brand-900 mt-2">
              {simulation.suggestedSalePriceCad.toLocaleString('fr-CA')} $
            </div>
            <div className="text-xs font-bold text-brand-700 mt-0.5">
              {simulation.suggestedSalePriceLocal.toLocaleString('fr-CA')} {currencyCode}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500">
            Marge brute ciblée : {simulation.targetMarginPercent}%
          </div>
        </div>

        {/* Ajustement interactif de la marge cible */}
        <div className="bg-slate-50 p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs font-bold text-slate-700 uppercase tracking-wider">
              <span>Ajuster la marge</span>
              <span className="text-sm font-black text-brand-800">{simulation.targetMarginPercent}%</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Ajustez le curseur pour simuler différents niveaux de marge
            </p>
            <input
              type="range"
              min="8"
              max="30"
              step="1"
              value={simulation.targetMarginPercent}
              onChange={(e) => onTargetMarginChange(parseInt(e.target.value))}
              className="w-full mt-3 h-2 bg-slate-300 rounded-lg cursor-pointer accent-brand-600"
            />
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-slate-500 font-semibold">
            <span>8%</span>
            <span>18%</span>
            <span>30%</span>
          </div>
        </div>

      </div>

      {/* Barre d'action rapide secondaire */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-lg text-xs sm:text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            <Edit3 className="w-4 h-4 text-slate-500" />
            <span>Modifier la saisie</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            className={`inline-flex items-center space-x-1.5 px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer ${savedSuccess
              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
          >
            {savedSuccess ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Bookmark className="w-4 h-4 text-slate-500" />}
            <span>{savedSuccess ? 'Simulation sauvegardée !' : 'Sauvegarder'}</span>
          </button>
        </div>

        <div className="flex items-center space-x-2">
          {onOpenSourcesModal && (
            <button
              type="button"
              onClick={onOpenSourcesModal}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 transition-colors cursor-pointer"
              title="Consulter les sources et leur niveau de confiance"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Sources et fiabilité</span>
            </button>
          )}

          <button
            type="button"
            onClick={onGoToOptimizer}
            className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-lg text-xs sm:text-sm font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 transition-colors cursor-pointer"
          >
            <Container className="w-4 h-4 text-amber-700" />
            <span>Organiser une cargaison conteneur (1 à 4 véhicules)</span>
          </button>
        </div>
      </div>

      <details className="group rounded-2xl border border-slate-200 bg-white shadow-sm">
        <summary className="flex min-h-[64px] cursor-pointer list-none items-center justify-between px-5 font-bold text-slate-900">
          Voir les analyses détaillées
          <ChevronDown className="h-5 w-5 text-slate-500 transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-6 border-t border-slate-100 p-4 sm:p-6">
          <LocalMarketLinks vehicle={simulation.vehicle} destination={simulation.destination} />
          <MarketComparison
            comparison={simulation.marketComparison}
            suggestedSalePriceCad={simulation.suggestedSalePriceCad}
            suggestedSalePriceLocal={simulation.suggestedSalePriceLocal}
            currencyCode={currencyCode}
          />
          <CostBreakdown breakdown={simulation.breakdown} financing={simulation.financing} />
          <FxSensitivity simulation={simulation} />
        </div>
      </details>

      {/* Avertissement réglementaire */}
      <div className="bg-slate-100 p-4 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-2">
        <div className="flex items-center justify-between">
          <div className="font-bold text-slate-800 flex items-center space-x-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Traçabilité des barèmes & Mentions légales :</span>
          </div>
          {onOpenSourcesModal && (
            <button
              type="button"
              onClick={onOpenSourcesModal}
              className="text-emerald-700 hover:text-emerald-900 font-bold underline cursor-pointer text-xs flex items-center space-x-1"
            >
              <span>Vérifier les 6 sources gouvernementales et portuaires</span>
            </button>
          )}
        </div>
        <p>
           Cette application fournit une estimation prévisionnelle d'aide à la décision. Les règles douanières sont reliées à leurs références institutionnelles. Les taux de change sont indicatifs et les frais de transport doivent être confirmés par un devis officiel du transporteur avant tout engagement.
        </p>
      </div>

    </div>
  );
};
