import React, { useState } from 'react';
import { Ship, Calculator, Container, History, Settings, Sparkles, RefreshCw, Layers, ShieldCheck, Menu, X, ChevronRight, CheckCircle2, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { GlobalReferenceConfig } from '../../types';

interface HeaderProps {
  currentTab: 'wizard' | 'results' | 'cargo' | 'optimizer' | 'history' | 'config';
  onSelectTab: (tab: HeaderProps['currentTab']) => void;
  onLoadDemo: () => void;
  hasCurrentResult: boolean;
  config: GlobalReferenceConfig;
  onRefreshLiveRates: () => void;
  isRefreshingRates: boolean;
  onOpenSourcesModal: () => void;
  onCollapsedChange?: (collapsed: boolean) => void;
}

export const Header: React.FC<HeaderProps> = ({ currentTab, onSelectTab, onLoadDemo, hasCurrentResult, config, onRefreshLiveRates, isRefreshingRates, onOpenSourcesModal, onCollapsedChange }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const items = [
    { id: 'wizard' as const, label: 'Nouvelle simulation', icon: Calculator },
    ...(hasCurrentResult ? [{ id: 'results' as const, label: 'Mes résultats', icon: CheckCircle2 }] : []),
    { id: 'cargo' as const, label: 'Cargaison', icon: Layers },
    { id: 'optimizer' as const, label: 'Optimiseur RoRo', icon: Container },
    { id: 'history' as const, label: 'Historique', icon: History },
    { id: 'config' as const, label: 'Tarifs', icon: Settings },
  ];
  return (
    <>
      <button className="fixed left-3 top-3 z-50 rounded-xl bg-[hsl(var(--navy-deep))] p-3 text-white shadow-lg md:hidden" onClick={() => setMobileOpen(true)} aria-label="Ouvrir le menu"><Menu className="h-5 w-5" /></button>
      {mobileOpen && <button className="fixed inset-0 z-30 bg-[hsl(var(--navy-deep))]/40 md:hidden" onClick={() => setMobileOpen(false)} aria-label="Fermer le menu" />}
      <header className={`fixed inset-y-0 left-0 z-40 bg-[hsl(var(--navy-deep))] text-white shadow-xl transition-all duration-300 ${collapsed ? 'w-[76px]' : 'w-[272px]'} ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <button
          type="button"
          onClick={() => { const next = !collapsed; setCollapsed(next); onCollapsedChange?.(next); }}
          className="absolute -right-3 top-5 z-10 hidden h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-[hsl(var(--navy))] text-white shadow-lg transition hover:bg-[hsl(var(--teal))] md:flex"
          aria-label={collapsed ? 'Développer le menu' : 'Réduire le menu'}
          title={collapsed ? 'Développer le menu' : 'Réduire le menu'}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
        <div className="flex h-full flex-col px-3 py-4">
          <div className="flex items-center justify-between px-2 pb-5 pr-10">
            <button onClick={() => onSelectTab('wizard')} className="flex items-center gap-3 text-left group" aria-label="Accueil AutoTransat QC">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--teal))] shadow-lg transition-transform group-hover:scale-105"><Ship className="h-6 w-6" /></span>
              <span className={collapsed ? 'hidden' : ''}><span className="block font-display text-lg font-bold tracking-tight">AutoTransat <em className="not-italic text-[hsl(var(--signal))]">QC</em></span><span className="block text-[11px] text-slate-400">Votre conseiller export</span></span>
            </button>
            <button onClick={() => setMobileOpen(false)} className="rounded-lg p-2 hover:bg-white/10 md:hidden" aria-label="Fermer le menu"><X className="h-5 w-5" /></button>
          </div>
          <nav className="flex-1 space-y-1" aria-label="Navigation principale">
            {items.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => { onSelectTab(id); setMobileOpen(false); }} className={`flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition-colors ${currentTab === id ? 'bg-white text-[hsl(var(--navy-deep))]' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`} title={collapsed ? label : undefined}><Icon className="h-5 w-5 shrink-0" /><span className={collapsed ? 'hidden' : ''}>{label}</span>{!collapsed && currentTab === id && <ChevronRight className="ml-auto h-4 w-4" />}</button>)}
            <button onClick={onOpenSourcesModal} className="flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-emerald-200 hover:bg-white/10" title="Sources et fiabilité"><ShieldCheck className="h-5 w-5 shrink-0" /><span className={collapsed ? 'hidden' : ''}>Sources et fiabilité</span></button>
          </nav>
          <div className={`rounded-xl bg-white/10 p-3 text-xs text-slate-300 ${collapsed ? 'hidden' : ''}`}><div className="flex items-center justify-between font-semibold text-white"><span>Taux indicatifs</span><button onClick={onRefreshLiveRates} disabled={isRefreshingRates} aria-label="Actualiser les taux"><RefreshCw className={`h-4 w-4 ${isRefreshingRates ? 'animate-spin' : ''}`} /></button></div><div className="mt-2">1 CAD = {config.fxRates.CAD_to_MAD} MAD</div><div>1 CAD = {config.fxRates.CAD_to_XOF} XOF</div></div>
          <button onClick={onLoadDemo} className={`mt-3 flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[hsl(var(--signal))] px-3 text-sm font-bold text-[hsl(var(--navy-deep))] hover:brightness-105 ${collapsed ? 'px-0' : ''}`} title="Charger un exemple"><Sparkles className="h-4 w-4" /><span className={collapsed ? 'hidden' : ''}>Voir un exemple</span></button>
        </div>
      </header>
    </>
  );
};