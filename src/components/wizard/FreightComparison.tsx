import React, { useEffect, useMemo, useState } from 'react';
import { Check, ExternalLink, FileText, Loader2, RefreshCw, Search, ShieldAlert } from 'lucide-react';
import {
  DestinationCountry,
  FreightComparisonResult,
  FreightMarketOffer,
  TransportRoute,
  Vehicle,
} from '../../types';
import { compareFreightRates } from '../../services/freightComparisonService';

interface FreightComparisonProps {
  routes: TransportRoute[];
  selectedRouteId: string;
  vehicleCount: number;
  vehicle: Vehicle;
  country: DestinationCountry;
  selectedOffer?: FreightMarketOffer;
  onSelectOffer: (offer: FreightMarketOffer) => void;
  onSelectRoute: (routeId: string) => void;
}

interface RfqResponse {
  id?: string;
  reference?: string;
  status?: string;
  emailSent?: boolean;
  message?: string;
  channels?: Array<{
    provider: string;
    url: string;
    channelType: string;
    label: string;
  }>;
}

const formatDate = (value?: string) => value
  ? new Intl.DateTimeFormat('fr-CA', { dateStyle: 'medium' }).format(new Date(value))
  : 'Non précisée';

const confidenceLabel = (confidence?: FreightMarketOffer['confidence']) => {
  if (typeof confidence === 'number') return `Confiance ${Math.round(confidence * (confidence <= 1 ? 100 : 1))} %`;
  if (confidence === 'high') return 'Confiance élevée';
  if (confidence === 'medium') return 'Confiance moyenne';
  if (confidence === 'low') return 'Confiance limitée';
  return confidence ? `Confiance : ${confidence}` : 'Confiance non précisée';
};

export const FreightComparison: React.FC<FreightComparisonProps> = ({
  routes, selectedRouteId, vehicleCount, vehicle, country, selectedOffer, onSelectOffer, onSelectRoute,
}) => {
  const [result, setResult] = useState<FreightComparisonResult>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rfqLoading, setRfqLoading] = useState(false);
  const [rfqError, setRfqError] = useState('');
  const [rfq, setRfq] = useState<RfqResponse>();
  const [rfqNotes, setRfqNotes] = useState('');

  const searchableRoutes = useMemo(() => routes, [routes]);
  const selectedRoute = routes.find((route) => route.id === selectedRouteId) ?? routes[0];
  const coverage = result?.coverage;
  const selectedRouteCoverage = coverage?.routes?.find((route) => route.routeId === selectedRouteId);
  const selectedRouteOfferCount = selectedRouteCoverage?.externalOffers
    ?? result?.offers.filter((offer) => offer.routeId === selectedRouteId).length
    ?? 0;
  const needsRfq = Boolean(result && (
    selectedRouteCoverage ? !selectedRouteCoverage.achieved : selectedRouteOfferCount < 2
  ));

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

  const submitRfq = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedRoute) return;
    setRfqLoading(true);
    setRfqError('');
    try {
      const response = await fetch('/api/freight/rfq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          route: {
            id: selectedRoute.id,
            originPort: selectedRoute.originPort,
            destinationPort: selectedRoute.destinationPort,
            mode: selectedRoute.mode,
          },
          vehicleCount,
          shipmentDetails: {
            country,
            notes: rfqNotes || undefined,
          },
          vehicleDetails: {
            brand: vehicle.brand, model: vehicle.model, year: vehicle.year,
            category: vehicle.category, condition: vehicle.condition,
            isNonRunning: vehicle.isNonRunning,
          },
          contactDetails: {},
        }),
      });
      if (!response.ok) throw new Error(`RFQ HTTP ${response.status}`);
      setRfq(await response.json() as RfqResponse);
    } catch {
      setRfqError('La demande de devis n’a pas pu être créée. Réessayez dans un instant.');
    } finally {
      setRfqLoading(false);
    }
  };

  return (
    <section className="rounded-2xl border-2 border-brand-200 bg-gradient-to-br from-brand-50/80 to-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-3">
          <div className="rounded-xl bg-brand-100 p-2 text-brand-700"><Search className="h-5 w-5" /></div>
          <div>
            <h3 className="font-black text-slate-900">Comparaison des offres de fret</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">Les offres sont interrogées via notre service de comparaison et restent à confirmer avant réservation.</p>
          </div>
        </div>
        <button type="button" onClick={() => void runSearch()} disabled={loading} className="inline-flex min-h-[42px] shrink-0 items-center gap-2 rounded-xl border border-brand-200 bg-white px-3 text-xs font-bold text-brand-800 hover:bg-brand-50 disabled:opacity-60">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Actualiser
        </button>
      </div>

      {!loading && result && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3" aria-live="polite">
          <p className="text-sm font-black text-slate-900">
            Route choisie : {selectedRouteOfferCount} offre{selectedRouteOfferCount > 1 ? 's' : ''} externe{selectedRouteOfferCount > 1 ? 's' : ''} observée{selectedRouteOfferCount > 1 ? 's' : ''}
            {coverage?.targetExternalOffers ? ` sur un objectif de ${coverage.targetExternalOffers}` : ''}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            {coverage ? `${coverage.freshOfferCount ?? 0} récente${(coverage.freshOfferCount ?? 0) > 1 ? 's' : ''}, ${coverage.staleOfferCount ?? 0} à revalider` : 'Fraîcheur en cours de vérification'}
             {coverage?.coveragePercent !== undefined ? ` · Couverture de la matrice : ${coverage.coveragePercent} %` : ''}
            {coverage?.lastRefreshedAt ? ` · relevé le ${formatDate(coverage.lastRefreshedAt)}` : ''} · Composantes de coût comparables lorsqu’elles sont détaillées.
          </p>
          {result.providerStatuses.length > 0 && (
            <p className="mt-2 text-[11px] text-slate-500">
              Sources interrogées : {result.providerStatuses.map((item) => item.provider).join(', ')}
            </p>
          )}
        </div>
      )}

      {loading && <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-white p-5 text-sm font-semibold text-slate-600"><Loader2 className="h-5 w-5 animate-spin text-brand-600" /> Recherche des tarifs disponibles…</div>}
      {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-800" role="alert">{error}</p>}

      {(result?.offers.length ?? 0) > 0 && (
        <div className="mt-4 space-y-3">
          {[...(result?.offers ?? [])].sort((a, b) => a.amountCad - b.amountCad).map((offer) => {
            const route = routes.find((item) => item.id === offer.routeId);
            const active = selectedOffer?.id === offer.id && selectedRouteId === offer.routeId;
            const firmAmount = offer.lowCad === offer.highCad;
            return (
              <button key={offer.id} type="button" onClick={() => selectOffer(offer)} className={`w-full rounded-xl border-2 p-4 text-left transition ${active ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white hover:border-brand-300'}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-slate-900">{route?.name}</p>
                    <p className="mt-1 text-xs font-bold text-brand-800">{offer.provider}{offer.carrierName ? ` · Transporteur : ${offer.carrierName}` : ''}</p>
                    <p className="mt-1 text-xs text-slate-600">Relevée le {formatDate(offer.retrievedAt)} · Valide jusqu’au {formatDate(offer.validUntil)}</p>
                    {(offer.inclusions?.length || offer.exclusions?.length) && <p className="mt-2 text-[11px] leading-relaxed text-slate-600"><span className="font-bold">Inclus :</span> {offer.inclusions?.join(', ') || 'non précisé'} <span className="font-bold">· Exclu :</span> {offer.exclusions?.join(', ') || 'non précisé'}</p>}
                    {offer.components && Object.keys(offer.components).length ? <p className="mt-1 text-[11px] text-slate-500">Composantes : {Object.keys(offer.components).join(', ')}</p> : null}
                    {offer.sourceUrl && <a href={offer.sourceUrl} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-brand-700 underline">Voir la source <ExternalLink className="h-3 w-3" /></a>}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-lg font-black text-brand-900">{firmAmount ? offer.amountCad.toLocaleString('fr-CA') : `${offer.lowCad.toLocaleString('fr-CA')}–${offer.highCad.toLocaleString('fr-CA')}`} $ CA</p>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{firmAmount ? 'montant ferme' : 'fourchette'}</p>
                    <p className="mt-1 text-[10px] font-bold text-slate-600">{confidenceLabel(offer.confidence)}</p>
                    {active && <span className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-emerald-700"><Check className="h-4 w-4" /> Retenu</span>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {needsRfq && selectedRoute && (
        <form onSubmit={submitRfq} className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex gap-3">
            <FileText className="h-5 w-5 shrink-0 text-amber-700" />
            <div className="flex-1">
              <h4 className="text-sm font-black text-amber-950">{result?.offers.length ? 'Compléter la couverture par une demande de devis' : 'Ouvrir une demande de devis documentée'}</h4>
              <p className="mt-1 text-xs leading-relaxed text-amber-900">Préremplie pour {selectedRoute.originPort} → {selectedRoute.destinationPort}, {vehicleCount} véhicule{vehicleCount > 1 ? 's' : ''}, {vehicle.year} {vehicle.brand} {vehicle.model}. Les budgets internes affichés ci-dessous restent distincts.</p>
              {!rfq && <label className="mt-3 block text-xs font-bold text-amber-950">Précisions pour le devis (facultatif)<textarea value={rfqNotes} onChange={(event) => setRfqNotes(event.target.value)} className="mt-1 min-h-[70px] w-full rounded-lg border border-amber-300 bg-white p-2 text-sm font-normal text-slate-800" placeholder="Contraintes de départ, disponibilité, etc." /></label>}
              {rfqError && <p className="mt-3 text-xs font-bold text-red-800" role="alert">{rfqError}</p>}
              {rfq ? (
                <div className="mt-3 rounded-lg bg-white p-3">
                  <p className="text-xs font-semibold text-emerald-900">
                    {rfq.emailSent ? 'Demande envoyée.' : 'Demande enregistrée dans AutoTransat — pas encore envoyée.'}
                    {rfq.reference || rfq.id ? ` Référence : ${rfq.reference ?? rfq.id}.` : ''}
                    {rfq.emailSent ? ' L’API confirme l’envoi par courriel.' : ' Cliquez sur un bouton ci-dessous pour ouvrir le formulaire officiel du fournisseur.'}
                  </p>
                  {(rfq.channels?.length ?? 0) > 0 && (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {rfq.channels?.map((channel) => (
                        <a
                          key={`${channel.provider}-${channel.url}`}
                          href={channel.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-h-[42px] items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 text-xs font-black text-amber-950 hover:bg-amber-100"
                        >
                          <span>{channel.provider} · {channel.label}</span>
                          <ExternalLink className="h-4 w-4 shrink-0" />
                        </a>
                      ))}
                    </div>
                  )}
                  {!rfq.emailSent && (
                    <p className="mt-2 text-[11px] text-slate-600">La transmission n’est pas automatique : copiez la référence AutoTransat dans votre demande au transporteur. Le statut « en attente » signifie que nous attendons encore sa réponse.</p>
                  )}
                </div>
              ) : <button type="submit" disabled={rfqLoading} className="mt-3 inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-amber-700 px-4 text-xs font-black text-white hover:bg-amber-800 disabled:opacity-60">{rfqLoading && <Loader2 className="h-4 w-4 animate-spin" />}Créer la demande de devis</button>}
            </div>
          </div>
        </form>
      )}

      {!loading && result?.offers.length === 0 && !needsRfq && <div className="mt-4 flex gap-3 rounded-xl border border-slate-200 bg-white p-4"><ShieldAlert className="h-5 w-5 shrink-0 text-slate-600" /><p className="text-xs text-slate-700">Aucune offre externe n’est disponible pour le moment. Les budgets internes de route restent affichés séparément ci-dessous.</p></div>}
    </section>
  );
};