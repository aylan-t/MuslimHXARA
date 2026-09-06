// AGENT-05 — Overlay : blocs d'états (présentationnels, 100 % locaux).
// Utilisés par overlay.tsx (AGENT-04) : <MarketBlock/> <FxBlock/> <MissingInfoBlock/>
// <RejectionBlock/> <MreWarningBlock/> + <OverlaySkeleton/> <InactiveBlock/>.
// Règle inviolable : valeur null/undefined => "non inclus", jamais "0 $".

import type {
  CustomsSelection,
  DestinationCountry,
  MarketComparison as MarketComparisonType,
  SimulationResult,
} from './engine/types';

export type RejectionCode = 'USD_PRICE' | 'LEASE_PRICE' | 'NO_PRICE' | 'NO_YEAR' | 'NOT_VEHICLE';

export interface OverlayRejection {
  code: RejectionCode;
  message: string;
}

/** null/undefined/NaN => "non inclus" (jamais "0 $"). */
export function formatCadOrMissing(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return 'non inclus';
  return `${value.toLocaleString('fr-CA')} $`;
}

// --- Marché local -----------------------------------------------------------

export interface MarketBlockProps {
  comparison?: MarketComparisonType;
  suggestedSalePriceCad: number;
  suggestedSalePriceLocal: number;
  currencyCode: 'MAD' | 'XOF';
}

/** Wording repris de MarketComparison.tsx : verdict + écart %, sinon encart neutre. */
export function MarketBlock({
  comparison,
  suggestedSalePriceCad,
  suggestedSalePriceLocal,
  currencyCode,
}: MarketBlockProps) {
  if (!comparison) {
    return (
      <div className="axc-card axc-neutral">
        <p className="axc-card-title">Aucune donnée de marché directe pour ce modèle exact.</p>
        <p className="axc-muted">
          Prix suggéré calculé sur votre marge cible :{' '}
          {suggestedSalePriceCad.toLocaleString('fr-CA')} $ CA /{' '}
          {suggestedSalePriceLocal.toLocaleString('fr-CA')} {currencyCode}.
        </p>
      </div>
    );
  }
  const cheaper = comparison.priceDifferencePercent <= 0;
  return (
    <div className="axc-card">
      <div className="axc-card-title">Marché local — {comparison.matchedModel}</div>
      <div className="axc-market-grid">
        <div>
          <div className="axc-muted">Votre prix suggéré</div>
          <div className="axc-market-price">
            {suggestedSalePriceCad.toLocaleString('fr-CA')} $
          </div>
          <div className="axc-muted">
            {suggestedSalePriceLocal.toLocaleString('fr-CA')} {currencyCode}
          </div>
        </div>
        <div>
          <div className="axc-muted">Moyenne observée ({comparison.source})</div>
          <div className="axc-market-price">
            {comparison.averageMarketPriceCad.toLocaleString('fr-CA')} $
          </div>
          <div className="axc-muted">
            {comparison.averageMarketPriceLocal.toLocaleString('fr-CA')} {currencyCode}
          </div>
        </div>
      </div>
      <div className="axc-verdict">
        <strong>{comparison.verdictLabel}</strong> ·{' '}
        {cheaper ? (
          <span>
            {Math.abs(comparison.priceDifferencePercent)} % moins cher que la moyenne
          </span>
        ) : (
          <span>+{comparison.priceDifferencePercent} % plus cher que la moyenne</span>
        )}
        <p className="axc-muted">{comparison.verdictDescription}</p>
        <p className="axc-muted">Référence : {comparison.referenceDate} · estimation.</p>
      </div>
    </div>
  );
}

// --- FX : 3 pastilles ---------------------------------------------------------

export interface FxBlockProps {
  fxScenarios: SimulationResult['fxScenarios'];
  /** false => fallback barèmes : pastille "Référence", sans erreur. */
  isLive: boolean;
}

/** Scénarios ± % uniquement (jamais de prédiction) ; optimiste jamais garanti. */
export function FxBlock({ fxScenarios, isLive }: FxBlockProps) {
  return (
    <div className="axc-card">
      <div className="axc-margin-row">
        <span className="axc-card-title">Sensibilité change (estimation)</span>
        <span className={`axc-pastille${isLive ? ' axc-live' : ' axc-ref'}`}>
          {isLive ? 'En direct' : 'Référence'}
        </span>
      </div>
      <div className="axc-fx-grid">
        <div className="axc-pastille axc-pessi">
          <span>Pessimiste (-7,5 %)</span>
          <strong className="axc-fx-profit">
            {fxScenarios.pessimistic.profitCad.toLocaleString('fr-CA')} $
          </strong>
          <span className="axc-fx-sub">ROI {fxScenarios.pessimistic.roiPercent} %</span>
        </div>
        <div className="axc-pastille axc-real">
          <span>Réaliste (taux du jour)</span>
          <strong className="axc-fx-profit">
            {fxScenarios.realistic.profitCad.toLocaleString('fr-CA')} $
          </strong>
          <span className="axc-fx-sub">ROI {fxScenarios.realistic.roiPercent} %</span>
        </div>
        <div className="axc-pastille axc-opti">
          <span>Optimiste (+7,5 %)</span>
          <strong className="axc-fx-profit">
            +{fxScenarios.optimistic.profitCad.toLocaleString('fr-CA')} $
          </strong>
          <span className="axc-fx-sub">ROI {fxScenarios.optimistic.roiPercent} %</span>
        </div>
      </div>
      <p className="axc-note">
        Scénario optimiste favorable, jamais garanti. Estimation : le cours réel peut varier.
      </p>
    </div>
  );
}

// --- Infos manquantes ----------------------------------------------------------

export interface MissingInfoBlockProps {
  /** Deep link §6.3 : ouvre BASE/?prefill=… (construit par le parent). */
  onComplete: () => void;
  vin?: string | null;
  engineLitres?: number | null;
  fuel?: string | null;
}

/** Encart ambre : cylindrée/VIN non renseignés (normal sur Marketplace), sans bloquer. */
export function MissingInfoBlock({ onComplete, vin, engineLitres, fuel }: MissingInfoBlockProps) {
  return (
    <div className="axc-card axc-missing">
      <span className="axc-card-title">Infos manquantes (non bloquantes)</span>
      <ul className="axc-missing-list">
        <li>
          Cylindrée : <strong>{engineLitres ? `${engineLitres} L` : 'Non renseignée'}</strong>
        </li>
        <li>
          Carburant : <strong>{fuel || 'Non renseigné'}</strong>
        </li>
        <li>
          VIN : <strong>{vin || 'Non renseigné'}</strong>
        </li>
      </ul>
      <p className="axc-muted">
        Vérifiez ces données avant toute décision. Le calcul actuel n&apos;en dépend pas.
      </p>
      <button type="button" className="axc-btn axc-btn-primary" onClick={onComplete}>
        Compléter →
      </button>
    </div>
  );
}

// --- Rejets (jamais de calcul) --------------------------------------------------

const REJECTION_COPY: Record<RejectionCode, { title: string; hint: string }> = {
  USD_PRICE: {
    title: 'Prix en $US — estimation refusée',
    hint: 'Saisissez le prix en $ CAD dans l\u2019app pour lancer l\u2019estimation.',
  },
  LEASE_PRICE: {
    title: 'Prix de location détecté — aucun calcul',
    hint: 'Mensualité ou transfert de bail : montant non interprétable pour un achat.',
  },
  NO_PRICE: {
    title: 'Prix introuvable sur l\u2019annonce',
    hint: 'Vérifiez l\u2019annonce ou renseignez le prix via « Compléter → ».',
  },
  NO_YEAR: {
    title: 'Année introuvable (titre et fiche)',
    hint: 'L\u2019éligibilité (âge approximatif, année uniquement) exige une année.',
  },
  NOT_VEHICLE: {
    title: 'Annonce non-véhicule',
    hint: 'Overlay inactif : aucun bloc véhicule ni année détectés.',
  },
};

export function RejectionBlock({ rejection }: { rejection: OverlayRejection | null }) {
  if (!rejection) return null;
  const copy = REJECTION_COPY[rejection.code];
  return (
    <div className="axc-card axc-reject" role="alert">
      <span className="axc-card-title">{copy.title}</span>
      <p>{rejection.message}</p>
      <p className="axc-muted">{copy.hint}</p>
    </div>
  );
}

// --- Warning MRE / commercial Maroc (WarningCard-like) ----------------------------

export interface MreWarningBlockProps {
  country: DestinationCountry;
  customs: CustomsSelection;
  /** Depuis config.customsRules.morocco.legalWarning (prop, jamais en dur). */
  legalWarning: string;
  /** Depuis config.customsRules.morocco.mreMaxAgeYears. */
  mreMaxAgeYears: number;
  /** Depuis config.customsRules.morocco.mreMaxDiscountPercent. */
  mreMaxDiscountPercent: number;
}

export function MreWarningBlock({
  country,
  customs,
  legalWarning,
  mreMaxAgeYears,
  mreMaxDiscountPercent,
}: MreWarningBlockProps) {
  if (country !== 'maroc') return null;
  const isMRE = customs.moroccoOptions?.isMRE ?? false;
  if (isMRE) {
    return (
      <div className="axc-card axc-mre" role="note">
        <span className="axc-card-title">Régime MRE activé — conditions à valider</span>
        <p className="axc-muted">
          Abattement {mreMaxDiscountPercent} % sous réserve : véhicule de {mreMaxAgeYears} ans
          maximum, acquéreur 60 ans et plus, 10 ans de résidence à l&apos;étranger. Estimation
          indicative — confirmation en douane requise.
        </p>
      </div>
    );
  }
  return (
    <div className="axc-card axc-warn-card" role="note">
      <span className="axc-card-title">Import commercial au Maroc — encadré</span>
      <p className="axc-muted">{legalWarning}</p>
    </div>
  );
}

// --- États overlay ------------------------------------------------------------------

/** Chargement : skeleton pendant parse/normalize/calcul. */
export function OverlaySkeleton() {
  return (
    <div className="axc-card" aria-busy="true" aria-label="Chargement de l'estimation">
      <div className="axc-skeleton axc-skel-title" />
      <div className="axc-skeleton axc-skel-line" />
      <div className="axc-skeleton axc-skel-line" />
      <div className="axc-skeleton axc-skel-line" />
    </div>
  );
}

/** Page non-véhicule : overlay inactif, aucune donnée, aucun calcul. */
export function InactiveBlock() {
  return (
    <div className="axc-card axc-inactive">
      <span className="axc-card-title">AutoTransat QC — inactif ici</span>
      <p className="axc-muted">
        Aucun véhicule détecté sur cette page (ni bloc véhicule, ni année). L&apos;estimation
        s&apos;affiche uniquement sur une annonce véhicule Marketplace.
      </p>
    </div>
  );
}
