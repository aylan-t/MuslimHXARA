import React from 'react';
import { Ship, Calculator, Container, History, Settings, Sparkles, RefreshCw, Layers, ShieldCheck } from 'lucide-react';
import { GlobalReferenceConfig } from '../../types';

interface HeaderProps {
  currentTab: 'wizard' | 'results' | 'cargo' | 'optimizer' | 'history' | 'config';
  onSelectTab: (tab: 'wizard' | 'results' | 'cargo' | 'optimizer' | 'history' | 'config') => void;
  onLoadDemo: () => void;
  hasCurrentResult: boolean;
  config: GlobalReferenceConfig;
  onRefreshLiveRates: () => void;
  isRefreshingRates: boolean;
  onOpenSourcesModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onSelectTab,
  onLoadDemo,
  hasCurrentResult,
  config,
  onRefreshLiveRates,
  isRefreshingRates,
  onOpenSourcesModal
}) => {
  return (
    <header className="bg-brand-900 text-white shadow-lg sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between py-3 md:py-4 gap-3">

          {/* Logo & Titre */}
          <div className="flex items-center justify-between">
            <div
              onClick={() => onSelectTab('wizard')}
              className="flex items-center space-x-3 cursor-pointer group"
            >
              <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-sky-500 to-emerald-400 flex items-center justify-center shadow-md group-hover:scale-105 transition-transform">
                <Ship className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-xl font-black tracking-tight text-white">AutoTransat</span>
                  <span className="bg-sky-500/20 text-sky-300 text-xs font-bold px-2 py-0.5 rounded border border-sky-400/30">QC</span>
                </div>
                <p className="text-xs text-slate-300 font-medium hidden sm:block">
                  Calculateur de rentabilité export · Québec → Maroc & Sénégal
                </p>
              </div>
            </div>

            {/* Bouton Exemple Démo (Mobile) */}
            <button
              onClick={onLoadDemo}
              className="md:hidden inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Exemple</span>
            </button>
          </div>

          {/* Pill Taux en direct */}
          <div className="hidden xl:flex items-center space-x-2 bg-brand-950/60 border border-sky-400/20 px-3 py-1.5 rounded-full text-xs text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Taux direct : 1 CAD = <strong>{config.fxRates.CAD_to_MAD} MAD</strong> · <strong>{config.fxRates.CAD_to_XOF} XOF</strong></span>
            <button
              onClick={onRefreshLiveRates}
              disabled={isRefreshingRates}
              className="ml-1 p-1 hover:text-white text-slate-400 hover:bg-white/10 rounded-full transition-colors cursor-pointer"
              title="Actualiser les taux de change en direct"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingRates ? 'animate-spin text-sky-400' : ''}`} />
            </button>
          </div>

          {/* Navigation & Actions */}
          <div className="flex items-center justify-between md:justify-end space-x-1 sm:space-x-2 overflow-x-auto pb-1 md:pb-0">
            <nav className="flex space-x-1 text-xs sm:text-sm font-semibold">
              <button
                onClick={() => onSelectTab('wizard')}
                className={`px-3 py-2 rounded-lg flex items-center space-x-1.5 transition-colors ${currentTab === 'wizard'
                  ? 'bg-brand-800 text-white shadow-inner border border-sky-400/30'
                  : 'text-slate-300 hover:text-white hover:bg-brand-800/60'
                  }`}
              >
                <Calculator className="w-4 h-4 text-sky-400" />
                <span>Simulation</span>
              </button>

              {hasCurrentResult && (
                <button
                  onClick={() => onSelectTab('results')}
                  className={`px-3 py-2 rounded-lg flex items-center space-x-1.5 transition-colors ${currentTab === 'results'
                    ? 'bg-brand-800 text-white shadow-inner border border-emerald-400/30'
                    : 'text-slate-300 hover:text-white hover:bg-brand-800/60'
                    }`}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>Résultats</span>
                </button>
              )}

              {/* NOUVEAU : Cargaison Conteneur */}
              <button
                onClick={() => onSelectTab('cargo')}
                className={`px-3 py-2 rounded-lg flex items-center space-x-1.5 transition-colors ${currentTab === 'cargo'
                  ? 'bg-brand-800 text-white shadow-inner border border-sky-400/30'
                  : 'text-slate-300 hover:text-white hover:bg-brand-800/60'
                  }`}
              >
                <Layers className="w-4 h-4 text-emerald-400" />
                <span>Cargaison <span className="hidden sm:inline">Conteneur</span></span>
              </button>

              <button
                onClick={() => onSelectTab('optimizer')}
                className={`px-2.5 py-2 rounded-lg flex items-center space-x-1.5 transition-colors ${currentTab === 'optimizer'
                  ? 'bg-brand-800 text-white shadow-inner border border-sky-400/30'
                  : 'text-slate-300 hover:text-white hover:bg-brand-800/60'
                  }`}
              >
                <Container className="w-4 h-4 text-amber-400" />
                <span className="hidden lg:inline">Seuil RoRo</span>
              </button>

              <button
                onClick={() => onSelectTab('history')}
                className={`px-3 py-2 rounded-lg flex items-center space-x-1.5 transition-colors ${currentTab === 'history'
                  ? 'bg-brand-800 text-white shadow-inner border border-sky-400/30'
                  : 'text-slate-300 hover:text-white hover:bg-brand-800/60'
                  }`}
              >
                <History className="w-4 h-4 text-purple-400" />
                <span className="hidden sm:inline">Historique</span>
              </button>

              <button
                onClick={() => onSelectTab('config')}
                className={`px-2.5 py-2 rounded-lg flex items-center space-x-1 transition-colors ${currentTab === 'config'
                  ? 'bg-brand-800 text-white shadow-inner border border-sky-400/30'
                  : 'text-slate-300 hover:text-white hover:bg-brand-800/60'
                  }`}
                title="Tarifs et configuration de référence"
              >
                <Settings className="w-4 h-4 text-slate-300" />
                <span className="hidden lg:inline">Tarifs</span>
              </button>

              <button
                type="button"
                onClick={onOpenSourcesModal}
                className="px-2.5 py-2 rounded-lg flex items-center space-x-1.5 transition-colors text-emerald-300 hover:text-white hover:bg-brand-800/60 border border-emerald-500/30 cursor-pointer"
                title="Consulter les sources officielles et textes de loi vérifiés"
              >
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span className="hidden sm:inline">Sources</span>
              </button>
            </nav>

            {/* Bouton Exemple Démo (Desktop) */}
            <button
              onClick={onLoadDemo}
              className="hidden md:inline-flex items-center space-x-2 px-3.5 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-xs sm:text-sm font-bold text-white shadow transition-all transform hover:-translate-y-0.5"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>Tester exemple (RAV4)</span>
            </button>
          </div>

        </div>
      </div>
    </header>
  );
};
