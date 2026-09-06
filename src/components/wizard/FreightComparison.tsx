import React, { useEffect, useMemo, useState } from 'react';
import { Check, ExternalLink, Loader2, RefreshCw, Search, ShieldAlert } from 'lucide-react';
import {
  FreightComparisonResult,
  FreightMarketOffer,
  TransportRoute,
} from '../../types';
import { compareFreightRates } from '../../services/freightComparisonService';

interface FreightComparisonProps {
  routes: TransportRoute[];
  selectedRouteId: string;
  vehicleCount: number;
  selectedOffer?: FreightMarketOffer;
  onSelectOffer: (offer: FreightMarketOffer) => void;
  onSelectRoute: (routeId: string) => void;
}

export const FreightComparison: React.FC<FreightComparisonProps> = ({
  routes,
  selectedRouteId,
  vehicleCount,
  selectedOffer,
  onSelectOffer,
  onSelectRoute,
}) => {
  const [result, setResult] = useState<FreightComparisonResult>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const searchableRoutes = useMemo(
    () => routes.filter((route) => route.mode !== 'roro'),
    [routes],
  );

  const runSearch = async () => {
    setLoading(true);
    setError('');
    try {
      setResult(await compareFreightRates(searchableRoutes, vehicleCount));
    } catch {
      setError('La comparaison automatique est temporairement indisponible.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void runSearch();
  }, [vehicleCount, searchableRoutes.map((route) => route.id).join('|')]);

  const selectOffer = (offer: FreightMarketOffer) => {
    onSelectRoute(offer.routeId);
    onSelectOffer(offer);
  };

  return (
    <section className="rounded-2xl border-2 border-brand-200 bg-gradient-to-br from-brand-50/80 to-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-3">
          <div className="rounded-xl bg-brand-100 p-2 text-brand-700"><Search className="h-5 w-5" /></div>
          <div>
            <h3 className="font-black text-slate-900">Comparaison automatique</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              Recherche des offres disponibles et comparaison sur une même base. Les prix marketplace restent à confirmer avant réservation.
            </p>
          </div>
        </div>
        <button type="button" onClick={() => void runSearch()} disabled={loading} className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-brand-200 bg-white px-3 text-xs font-bold text-brand-800 hover:bg-brand-50 disabled:opacity-60">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Actualiser
        </button>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {(result?.providerStatuses ?? []).map((provider) => (
          <div key={provider.provider} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-black text-slate-900">{provider.provider}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                provider.status === 'available' ? 'bg-emerald-100 text-emerald-800' :
                provider.status === 'configuration_required' ? 'bg-blue-100 text-blue-800' :
                'bg-amber-100 text-amber-900'
              }`}>
                {provider.status === 'available' ? 'Disponible' : provider.status === 'configuration_required' ? 'À connecter' : 'Aucune offre'}
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-600">{provider.message}</p>
          </div>
        ))}
      </div>

      {loading && <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-white p-5 text-sm font-semibold text-slate-600"><Loader2 className="h-5 w-5 animate-spin text-brand-600" /> Recherche des tarifs disponibles…</div>}
      {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-800">{error}</p>}

      {!loading && result?.offers.length === 0 && (
        <div className="mt-4 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <ShieldAlert className="h-5 w-5 shrink-0 text-amber-700" />
          <div>
            <p className="text-sm font-bold text-amber-950">Aucun tarif instantané pour ces routes</p>
            <p className="mt-1 text-xs text-amber-900">Les routes RoRo et certaines destinations africaines nécessitent souvent une demande de devis. Les budgets indicatifs restent visibles plus bas.</p>
          </div>
        </div>
      )}

      {(result?.offers.length ?? 0) > 0 && (
        <div className="mt-4 space-y-3">
          {result?.offers.sort((a, b) => a.amountCad - b.amountCad).map((offer) => {
            const route = routes.find((item) => item.id === offer.routeId);
            const active = selectedOffer?.id === offer.id && selectedRouteId === offer.routeId;
            return (
              <button key={offer.id} type="button" onClick={() => selectOffer(offer)} className={`w-full rounded-xl border-2 p-4 text-left transition ${active ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white hover:border-brand-300'}`}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-black text-slate-900">{route?.name}</p>
                    <p className="mt-1 text-xs text-slate-600">Fourchette maritime : {offer.lowCad.toLocaleString('fr-CA')}–{offer.highCad.toLocaleString('fr-CA')} $ CA</p>
                    <a href={offer.sourceUrl} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-brand-700 underline">
                      Source Freightos <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black text-brand-900">{offer.amountCad.toLocaleString('fr-CA')} $ CA</p>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">point milieu indicatif</p>
                    {active && <span className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-emerald-700"><Check className="h-4 w-4" /> Retenu</span>}
                  </div>
                </div>
              </button>
            );
          })}
          <p className="text-[10px] leading-relaxed text-slate-500">Données © Freightos, utilisées avec attribution conformément aux conditions de l’API publique beta. Une estimation marketplace n’est pas un devis ferme.</p>
        </div>
      )}
    </section>
  );
};