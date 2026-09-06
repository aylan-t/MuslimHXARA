// Overlay AutoTransat QC — direction « cockpit de négociant » (v1.3.0).
// RÈGLES INVOLABLES (inchangées) :
// - 100 % des chiffres viennent de la prop `sim`. Zéro taux/taxe/fret/âge en dur.
// - Seules dérivations : soustractions/ratios d'AFFICHAGE depuis `sim`.
// - Les 7 postes réels de CostBreakdown.tsx, jamais les lignes fictives.
// - `null` = « non inclus ». Âge approximatif uniquement.
// - Verdict 1 phrase : wording de ResultsDashboard.tsx.

import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  Gavel,
  Landmark,
  Minus,
  Package,
  Percent,
  Ship,
  ShoppingCart,
  Truck,
  X,
  XCircle,
} from 'lucide-react';
import type {
  CostBreakdown,
  DestinationCountry,
  SimulationResult,
} from './engine/types';
import { DEFAULT_CONFIG } from './engine/defaultData';
import type { RawListing } from './normalize';
import {
  FxBlock,
  MarketBlock,
  MissingInfoBlock,
  MreWarningBlock,
} from './overlay-states';

export interface AutoTransatOverlayProps {
  /** Résultat de `calculateSimulation()` (parent). Unique source de chiffres. */
  sim: SimulationResult;
  /** Annonce parsée (chip titre). */
  raw: RawListing;
  /** Pastille FX : true = « En direct », false = « Référence ». */
  fxLive: boolean;
  /** `EXTENSION_ENGINE_VERSION` (parent). Affiché court en footer. */
  engineVersion: string;
  /** Toggle SN/MA en tête — le parent recalcule localement via `calculateSimulation()`. */
  onToggleCountry: (next: DestinationCountry) => void;
  onClose: () => void;
  onMinimize: () => void;
  /** Intent « voir le détail complet » (`BASE/?prefill=…` construit par le parent). */
  onComplete: (prefillUrl: string) => void;
}

/** Formatage d'affichage uniquement (aucun calcul métier). */
function fmtCad(n: number): string {
  return n.toLocaleString('fr-CA');
}

type BadgeKind = 'Montant exact' | 'Estimation';

interface CostPoste {
  id: string;
  title: string;
  subtitle: string;
  amountCad: number;
  badge: BadgeKind;
  barColor: string;
  Icon: typeof Truck;
  details: Array<{ label: string; value: string }>;
}

/**
 * Les 7 postes RÉELS — logique reprise de `src/components/results/CostBreakdown.tsx`.
 * Chaque montant est lu dans `sim.breakdown` ; AUCUNE valeur saisie ici.
 */
function buildPostes(sim: SimulationResult): CostPoste[] {
  const b: CostBreakdown = sim.breakdown;
  const money = (n: number) => `${fmtCad(n)} $ CA`;
  return [
    {
      id: 'purchase',
      title: "Prix d’achat du véhicule",
      subtitle: 'Montant versé au vendeur au Québec',
      amountCad: b.vehiclePurchaseCad,
      badge: 'Montant exact',
      barColor: 'bg-sky-500',
      Icon: ShoppingCart,
      details: [{ label: 'Prix d’acquisition brut', value: money(b.vehiclePurchaseCad) }],
    },
    {
      id: 'spread',
      title: 'Écart de change (Spread FX)',
      subtitle: `Commission invisible de change (${sim.financing.fxSpreadPercent} %)`,
      amountCad: b.fxSpreadCostCad,
      badge: 'Estimation',
      barColor: 'bg-amber-500',
      Icon: Percent,
      details: [
        { label: 'Taux officiel de référence', value: `1 $ CA = ${b.baseFxRate.toFixed(2)} ${b.localCurrencyCode}` },
        { label: 'Taux effectif appliqué', value: `1 $ CA = ${b.effectiveFxRate.toFixed(2)} ${b.localCurrencyCode}` },
        { label: 'Marge retenue par l’intermédiaire', value: `${sim.financing.fxSpreadPercent} % (${money(b.fxSpreadCostCad)})` },
      ],
    },
    {
      id: 'transfer',
      title: 'Frais de transfert d’argent',
      subtitle: 'Frais fixes de virement et commissions',
      amountCad: b.bankTransferCostCad,
      badge: 'Estimation',
      barColor: 'bg-indigo-500',
      Icon: CreditCard,
      details: [{ label: 'Frais de transaction bancaire', value: money(b.bankTransferCostCad) }],
    },
    {
      id: 'transport',
      title: 'Transport complet de A à Z',
      subtitle: 'Convoyage terrestre, fret maritime et assurance',
      amountCad: b.totalTransportCad,
      badge: 'Estimation',
      barColor: 'bg-blue-600',
      Icon: Truck,
      details: [
        { label: '1. Transport terrestre QC (Origine)', value: money(b.inlandOriginCad) },
        { label: '2. Frais portuaires départ', value: money(b.originPortFeesCad) },
        { label: '3. Fret maritime (navire)', value: money(b.oceanFreightCad) },
        { label: '4. Assurance transport', value: money(b.marineInsuranceCad) },
        { label: '5. Frais portuaires arrivée', value: money(b.destinationPortFeesCad) },
        { label: '6. Acheminement final (Destination)', value: money(b.inlandDestinationCad) },
      ],
    },
    {
      id: 'auction',
      title: 'Encan & Frais d’enchères',
      subtitle: 'Frais de vente aux enchères ou commission',
      amountCad: b.auctionAndBrokerFeesCad,
      badge: 'Estimation',
      barColor: 'bg-purple-500',
      Icon: Gavel,
      details: [{ label: 'Frais d’enchère & courtier', value: money(b.auctionAndBrokerFeesCad) }],
    },
    {
      id: 'additional',
      title: 'Frais annexes & Préparation',
      subtitle: 'Transitaire local, décontamination RoRo, magasinage',
      amountCad: b.totalAdditionalFeesCad,
      badge: 'Estimation',
      barColor: 'bg-teal-600',
      Icon: Package,
      details: [
        { label: 'Transitaire / Déclarant agréé au port', value: money(b.transitAgentFeeCad) },
        { label: 'Décontamination & Lavage châssis RoRo', value: money(b.roroCleaningFeeCad) },
        { label: 'Provision magasinage portuaire (5 j)', value: money(b.portStorageBufferCad) },
        { label: 'Batterie / Clés & Réparations prévues', value: money(b.batteryAndRepairsCad) },
      ],
    },
    {
      id: 'customs',
      title: 'Douane & Taxes à destination',
      subtitle: `Base ${fmtCad(b.customsTaxableValueCad)} $ CA — ${b.customsValuationBasis === 'argus_official' ? 'Cote Argus' : 'Facture'}`,
      amountCad: b.customsAndTaxesCad,
      badge: 'Estimation',
      barColor: 'bg-emerald-600',
      Icon: Landmark,
      details: [
        {
          label: 'Mode de valorisation retenu',
          value: b.customsValuationBasis === 'argus_official' ? 'Cote Argus officielle (Prudent)' : 'Prix d’achat facturé',
        },
        { label: 'Assiette taxable (Valeur CAF)', value: money(b.customsTaxableValueCad) },
        { label: 'Total droits & taxes calculés', value: money(b.customsAndTaxesCad) },
        // Les taxes sont évaluées par la douane à son taux officiel, distinct du taux de règlement.
        {
          label: 'Contrevaleur en devise locale',
          value: `${fmtCad(Math.round(b.customsAndTaxesCad * b.customsAssessedFxRate))} ${b.localCurrencyCode}`,
        },
        ...(b.customsDifferenceArgusCad > 0
          ? [{ label: 'Risque réévaluation Argus vs Facture', value: `+${money(b.customsDifferenceArgusCad)}` }]
          : []),
      ],
    },
  ];
}

const ELIGIBILITY_META: Record<
  SimulationResult['eligibilitySeverity'],
  { label: string; Icon: typeof CheckCircle2 }
> = {
  success: { label: 'Éligible', Icon: CheckCircle2 },
  warning: { label: 'Attention', Icon: AlertTriangle },
  error: { label: 'Non éligible', Icon: XCircle },
};

export const AutoTransatOverlay: React.FC<AutoTransatOverlayProps> = ({
  sim,
  raw,
  fxLive,
  engineVersion,
  onToggleCountry,
  onClose,
  onMinimize,
  onComplete,
}) => {
  const [minimized, setMinimized] = useState(false);

  // L'hôte #axc-overlay a son propre fond navy : en mode bulle il doit
  // devenir invisible (attribut lu par overlay.css). Sans ça : gros blob navy.
  useEffect(() => {
    try {
      document.getElementById('axc-overlay')?.setAttribute('data-axc-min', minimized ? '1' : '0');
    } catch {
      /* non critique */
    }
  }, [minimized]);

  const b = sim.breakdown;
  const destCity = sim.destination === 'senegal' ? 'Dakar' : 'Casablanca';
  const destShort = sim.destination === 'senegal' ? 'Dakar' : 'Casa';
  const isProfit = sim.estimatedNetProfitCad > 0;

  // Dérivations d'AFFICHAGE uniquement, à partir de `sim` (aucun barème).
  const feesDeltaCad = b.landedCostCad - sim.vehicle.purchasePriceCad;
  const feesPercent =
    sim.vehicle.purchasePriceCad > 0 ? Math.round((feesDeltaCad / sim.vehicle.purchasePriceCad) * 100) : 0;

  // Verdict 1 phrase — wording repris à l'identique de ResultsDashboard.tsx.
  const verdict = isProfit
    ? `Cette voiture peut te rapporter environ ${fmtCad(sim.estimatedNetProfitCad)} $ CA de profit net.`
    : `Attention : cette opération risque d’être déficitaire de ${fmtCad(Math.abs(sim.estimatedNetProfitCad))} $ CA.`;

  const postes = buildPostes(sim);
  const elig = ELIGIBILITY_META[sim.eligibilitySeverity];
  const EligIcon = elig.Icon;
  const profitAbs = Math.abs(sim.estimatedNetProfitCad);

  const handleMinimize = () => {
    setMinimized((v) => !v);
    onMinimize();
  };

  if (minimized) {
    // Bulle flottante : pastille reflétant l'éligibilité (vert/ambre/rouge).
    const dotColor =
      sim.eligibilitySeverity === 'success'
        ? '#4ade80'
        : sim.eligibilitySeverity === 'warning'
          ? '#fbbf24'
          : '#f87171';
    return (
      <button
        type="button"
        onClick={handleMinimize}
        aria-label="Rouvrir l'estimation AutoTransat QC"
        title="Rouvrir l'estimation AutoTransat QC"
        className="axc-bubble"
      >
        <Ship className="axc-bubble-icon" aria-hidden="true" />
        <span className="axc-bubble-dot" style={{ backgroundColor: dotColor }} aria-hidden="true" />
      </button>
    );
  }

  const moroccoRules = DEFAULT_CONFIG.customsRules.morocco;

  return (
    <div
      className="axc-panel"
      role="complementary"
      aria-label="Estimation AutoTransat QC"
    >
      {/* Barre de titre : marque pleine + pastille live + actions */}
      <div className="axc-topbar">
        <span className="axc-brand">
          <Ship className="axc-brand-icon" aria-hidden="true" />
          <span className="axc-brand-name">AutoTransat <em>QC</em></span>
        </span>
        <span
          className={`axc-live ${fxLive ? 'axc-live-on' : 'axc-live-off'}`}
          title={fxLive ? 'Taux de change en direct' : 'Taux de change de référence (hors ligne)'}
        >
          <span className="axc-live-dot" aria-hidden="true" />
          {fxLive ? 'En direct' : 'Référence'}
        </span>
        <span className="axc-topbar-spacer" />
        <button type="button" onClick={handleMinimize} aria-label="Réduire le panneau" className="axc-iconbtn">
          <Minus className="axc-iconbtn-icon" aria-hidden="true" />
        </button>
        <button type="button" onClick={onClose} aria-label="Fermer le panneau" className="axc-iconbtn">
          <X className="axc-iconbtn-icon" aria-hidden="true" />
        </button>
      </div>

      <div className="axc-body">
        {/* Annonce source */}
        <p className="axc-listing-chip" title={raw.titleH1}>
          {raw.titleH1}
        </p>

        {/* Destination : toggle recalculé localement par le parent */}
        <div className="axc-dest" role="group" aria-label="Destination">
          <button
            type="button"
            aria-pressed={sim.destination === 'senegal'}
            onClick={() => sim.destination !== 'senegal' && onToggleCountry('senegal')}
            className={`axc-dest-btn ${sim.destination === 'senegal' ? 'axc-dest-active-sn' : ''}`}
          >
            Sénégal · Dakar
          </button>
          <button
            type="button"
            aria-pressed={sim.destination === 'maroc'}
            onClick={() => sim.destination !== 'maroc' && onToggleCountry('maroc')}
            className={`axc-dest-btn ${sim.destination === 'maroc' ? 'axc-dest-active-ma' : ''}`}
          >
            Maroc · Casa
          </button>
        </div>

        {/* Hero : coût total rendu */}
        <section className="axc-hero" aria-label="Coût total rendu">
          <div className="axc-kicker">Coût total rendu · {destCity}</div>
          <div className="axc-hero-num tabular-nums">{fmtCad(b.landedCostCad)}&nbsp;$</div>
          <div className="axc-hero-fees tabular-nums">
            +{fmtCad(feesDeltaCad)} $ de frais (+{feesPercent} %)
          </div>
          <div className="axc-hero-local tabular-nums">
            {fmtCad(b.landedCostLocal)} {b.localCurrencyCode}
          </div>
        </section>

        {/* Verdict : profit net, codé couleur */}
        <section className={`axc-verdict ${isProfit ? 'axc-verdict-profit' : 'axc-verdict-loss'}`} aria-label="Verdict de rentabilité">
          <div className="axc-verdict-label">{isProfit ? 'Profit net estimé' : 'Perte nette estimée'}</div>
          <div className="axc-verdict-num tabular-nums">
            {isProfit ? '+' : '−'}{fmtCad(profitAbs)} $ CA
          </div>
          <div className="axc-verdict-sub tabular-nums">
            {fmtCad(sim.estimatedNetProfitLocal)} {b.localCurrencyCode} · ROI {isProfit ? '+' : ''}{sim.estimatedRoiPercent} % · marge {sim.targetMarginPercent} %
          </div>
          <p className="axc-verdict-phrase">{verdict}</p>
        </section>

        {/* Éligibilité : badge + résumé, texte légal intégral en repli */}
        <section className={`axc-elig axc-elig-${sim.eligibilitySeverity}`} aria-label="Éligibilité import">
          <div className="axc-elig-head">
            <EligIcon className="axc-elig-icon" aria-hidden="true" />
            <span className="axc-elig-label">{elig.label}</span>
            <span className="axc-elig-year tabular-nums">
              {sim.vehicle.year} · âge approximatif
            </span>
          </div>
          <details className="axc-elig-details" open={!sim.isEligible}>
            <summary className="axc-elig-summary">Texte légal intégral</summary>
            <p className="axc-elig-message">{sim.eligibilityMessage}</p>
            {!sim.isEligible && (
              <p className="axc-elig-refused">Calcul affiché à titre indicatif — import refoulé.</p>
            )}
          </details>
        </section>

        {/* Marché local (si le modèle est référencé) */}
        <MarketBlock
          comparison={sim.marketComparison}
          suggestedSalePriceCad={sim.suggestedSalePriceCad}
          suggestedSalePriceLocal={sim.suggestedSalePriceLocal}
          currencyCode={b.localCurrencyCode}
        />

        {/* Détail des coûts — 7 postes RÉELS du moteur */}
        <section aria-label="Détail des coûts">
          <div className="axc-label">
            <span>Détail des coûts</span>
            <span className="axc-label-right tabular-nums">
              {fmtCad(b.landedCostCad)} $ CA
            </span>
          </div>

          <div className="axc-prop" aria-hidden="true">
            {postes.map((p, i) => {
              const pct = b.landedCostCad > 0 ? Math.round((p.amountCad / b.landedCostCad) * 100) : 0;
              return pct > 0 ? (
                <div
                  key={p.id}
                  style={{ width: `${pct}%`, animationDelay: `${i * 90}ms` }}
                  className={`axc-prop-seg ${p.barColor}`}
                  title={`${p.title} : ${pct}%`}
                />
              ) : null;
            })}
          </div>

          <div className="axc-rows">
            {postes.map((p) => {
              const pct = b.landedCostCad > 0 ? Math.round((p.amountCad / b.landedCostCad) * 100) : 0;
              const PosteIcon = p.Icon;
              return (
                <details key={p.id} className="axc-row">
                  <summary className="axc-row-head">
                    <span className="axc-row-icon">
                      <PosteIcon className="axc-row-glyph" aria-hidden="true" />
                    </span>
                    <span className="axc-row-text">
                      <span className="axc-row-title">{p.title}</span>
                      <span className="axc-row-sub">{p.subtitle}</span>
                    </span>
                    <span className="axc-row-amount">
                      <span className="axc-row-money tabular-nums">{fmtCad(p.amountCad)}&nbsp;$</span>
                      <span className="axc-row-meta">
                        <span className="axc-row-pct tabular-nums">{pct}&nbsp;%</span>
                        <span className={`axc-row-dot ${p.badge === 'Montant exact' ? 'axc-dot-exact' : 'axc-dot-est'}`} title={p.badge} />
                      </span>
                    </span>
                  </summary>
                  <div className="axc-row-details">
                    {p.details.map((d, i) => (
                      <div key={i} className="axc-row-line">
                        <span className="axc-row-key">{d.label}</span>
                        <span className="axc-row-val tabular-nums">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
        </section>

        {/* Sensibilité change */}
        <FxBlock fxScenarios={sim.fxScenarios} isLive={fxLive} />

        {/* Avertissement MRE / commercial (Maroc) */}
        <MreWarningBlock
          country={sim.destination}
          customs={sim.customs}
          legalWarning={moroccoRules.legalWarning}
          mreMaxAgeYears={moroccoRules.mreMaxAgeYears}
          mreMaxDiscountPercent={moroccoRules.mreMaxDiscountPercent}
        />

        {/* Infos manquantes + Compléter */}
        <MissingInfoBlock
          onComplete={() => onComplete('')}
          vin={raw.vin}
          engineLitres={raw.engineLitres}
          fuel={raw.fuelRaw}
        />

        <button type="button" onClick={() => onComplete('')} className="axc-cta">
          Voir le détail complet <span aria-hidden="true">→</span>
        </button>

        <footer className="axc-footer">
          <p className="axc-footer-brand">Propulsé par AutoTransat QC — moteur {engineVersion.slice(0, 7)}</p>
          <p className="axc-footer-legal">
            Estimation prévisionnelle d’aide à la décision. Taxes, frets et taux réels à
            confirmer avec un transitaire agréé avant tout engagement.
          </p>
        </footer>
      </div>
    </div>
  );
};
