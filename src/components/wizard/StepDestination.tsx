import React from 'react';
import { DestinationCountry, Vehicle, CustomsSelection, GlobalReferenceConfig } from '../../types';
import { Tooltip } from '../common/Tooltip';
import { Globe, AlertTriangle, CheckCircle, XCircle, ArrowLeft, ArrowRight, ShieldCheck, Info, ExternalLink, FileText } from 'lucide-react';
import { checkEligibility, CURRENT_YEAR } from '../../services/calculationEngine';

interface StepDestinationProps {
  vehicle: Vehicle;
  country: DestinationCountry;
  customs: CustomsSelection;
  config: GlobalReferenceConfig;
  onCountryChange: (country: DestinationCountry) => void;
  onCustomsChange: (customs: Partial<CustomsSelection>) => void;
  onNext: () => void;
  onPrev: () => void;
}

export const StepDestination: React.FC<StepDestinationProps> = ({
  vehicle,
  country,
  customs,
  config,
  onCountryChange,
  onCustomsChange,
  onNext,
  onPrev
}) => {
  const eligibility = checkEligibility(vehicle, country, customs, config);
  const vehicleAge = CURRENT_YEAR - vehicle.year;

  const isMRE = customs.moroccoOptions?.isMRE ?? false;
  const invoiceValue = vehicle.purchasePriceCad;
  const documentedValue = customs.estimatedArgusValueCad;
  const valuationDifference = documentedValue ? documentedValue - invoiceValue : undefined;
  const formatCad = (value: number) => `${value.toLocaleString('fr-CA')} $ CA`;

  const handleMreToggle = (checked: boolean) => {
    onCustomsChange({
      moroccoOptions: {
        isMRE: checked,
        mreAgeOver60: checked ? (customs.moroccoOptions?.mreAgeOver60 ?? false) : false,
        residenceOver10Years: checked ? (customs.moroccoOptions?.residenceOver10Years ?? false) : false,
        isFirstCarInLife: checked ? (customs.moroccoOptions?.isFirstCarInLife ?? false) : false
      }
    });
  };

  return (
    <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">

      {/* En-tête de l'étape */}
      <div className="bg-slate-50 border-b border-slate-200 px-6 py-5">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-emerald-100 text-emerald-800 rounded-xl">
            <Globe className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              Étape 2 — Choisir la destination & règles douanières
            </h2>
            <p className="text-sm text-slate-600">
              Chaque pays applique ses propres règles d'âge et droits de douane
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 sm:p-8 space-y-6">

        {/* Choix du Pays en 2 grandes cartes */}
        <div>
          <label className="block text-base font-bold text-slate-900 mb-3">
            Pays de destination finale
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Carte Sénégal */}
            <div
              onClick={() => onCountryChange('senegal')}
              className={`p-5 rounded-2xl border-2 cursor-pointer transition-all relative ${country === 'senegal'
                ? 'border-senegal bg-emerald-50/50 ring-2 ring-senegal/20 shadow-sm'
                : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                   <span className="text-xs font-bold uppercase tracking-widest text-emerald-700">SN</span>
                  <span className="text-lg font-black text-slate-900">Sénégal</span>
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
                  Port de Dakar
                </span>
              </div>
              <p className="text-xs text-slate-600 mb-3 leading-relaxed">
                Cadre standard pour véhicules d'occasion. Décret officiel récent.
              </p>
              <div className="text-[11px] font-medium text-emerald-800 bg-emerald-100/70 p-2 rounded-lg">
                Âge max : <strong>10 ans</strong> (Décret 24 oct. 2025)<br />
                Douane calculée : <strong>44,786%</strong> sur base CAF
              </div>
            </div>

            {/* Carte Maroc */}
            <div
              onClick={() => onCountryChange('maroc')}
              className={`p-5 rounded-2xl border-2 cursor-pointer transition-all relative ${country === 'maroc'
                ? 'border-morocco bg-orange-50/50 ring-2 ring-morocco/20 shadow-sm'
                : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                   <span className="text-xs font-bold uppercase tracking-widest text-orange-700">MA</span>
                  <span className="text-lg font-black text-slate-900">Maroc</span>
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-orange-100 text-orange-800 border border-orange-300">
                  Casablanca / Tanger
                </span>
              </div>
              <p className="text-xs text-slate-600 mb-3 leading-relaxed">
                Importation très réglementée. Régime MRE avantageux.
              </p>
              <div className="text-[11px] font-medium text-orange-800 bg-orange-100/70 p-2 rounded-lg">
                Standard : <strong>moins de 5 ans</strong><br />
                Retraité MRE : <strong>10 ans max</strong> (abattement DD 85%)
              </div>
            </div>

          </div>
        </div>

        {/* Message d'éligibilité en temps réel */}
        <div
          className={`p-4 rounded-xl border flex items-start space-x-3 ${eligibility.severity === 'error'
            ? 'bg-red-50 border-red-200 text-red-900'
            : eligibility.severity === 'warning'
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-emerald-50 border-emerald-200 text-emerald-900'
            }`}
        >
          {eligibility.severity === 'error' ? (
            <XCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
          ) : eligibility.severity === 'warning' ? (
            <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
          ) : (
            <CheckCircle className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" />
          )}

          <div className="text-sm leading-relaxed">
            <div className="font-bold mb-0.5">
              {eligibility.severity === 'error'
                ? 'Véhicule inéligible pour cette destination'
                : eligibility.severity === 'warning'
                  ? 'Mise en garde légale importante'
                  : 'Conformité légale validée'}
            </div>
            <div>{eligibility.message}</div>
          </div>
        </div>

        {/* Spécificités Sénégal */}
        {country === 'senegal' && (
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <div className="flex items-center space-x-2 text-slate-800 font-bold text-sm">
              <Info className="w-4 h-4 text-emerald-600" />
              <span>Détails du dédouanement au Sénégal</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Au port de Dakar, la douane calcule sur la <strong>valeur CAF</strong> : fret de référence 2 200 $ CA et assurance à 1,5%. Formule : DD 20% + RS 1% + prélèvements 1,7%, puis TVA 18% sur la CAF augmentée de ces droits (taux effectif <strong>44,786%</strong>).
            </p>
            <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200 text-slate-500">
              <span>Référence juridique : {config.customsRules.senegal.legalBasis}</span>
              <span className="font-semibold text-emerald-700">Âge véhicule : {vehicleAge} an(s) / 10 ans max</span>
            </div>
          </div>
        )}

        {/* Spécificités Maroc (Options MRE) */}
        {country === 'maroc' && (
          <div className="bg-orange-50/60 p-5 rounded-xl border border-orange-200 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-5 h-5 text-orange-600" />
                <span className="text-base font-bold text-slate-900">
                  Régime MRE (Marocain Résidant à l'Étranger)
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={isMRE}
                  onChange={(e) => handleMreToggle(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600"></div>
              </label>
            </div>

            <p className="text-xs text-slate-700 leading-relaxed">
              Si l'acheteur bénéficie du régime retraité MRE (60 ans et plus, au moins 10 ans à l'étranger), il a droit à un <strong>abattement de 85%</strong> sur le droit d’importation.
            </p>

            {isMRE && (
              <div className="bg-white p-3.5 rounded-lg border border-orange-200 space-y-3 text-xs text-slate-800">
                 <div className="font-bold text-orange-950">Confirmez chaque condition avant d’appliquer l’abattement :</div>
                <div className="flex items-center space-x-2">
                  <span className={vehicleAge <= 10 ? "text-emerald-600 font-bold" : "text-red-600 font-bold"}>
                    {vehicleAge <= 10 ? "Conforme" : "À vérifier"}
                  </span>
                  <span>Véhicule de 10 ans maximum (Actuel : {vehicleAge} an(s) - Année min. {CURRENT_YEAR - 10})</span>
                </div>
                 {[
                   ['mreAgeOver60', 'L’acquéreur a 60 ans ou plus'],
                   ['residenceOver10Years', 'Résidence effective à l’étranger depuis au moins 10 ans'],
                   ['isFirstCarInLife', 'Première admission bénéficiant de cet avantage'],
                 ].map(([key, label]) => (
                   <label key={key} className="flex min-h-[42px] cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2">
                     <input
                       type="checkbox"
                       checked={Boolean(customs.moroccoOptions?.[key as keyof typeof customs.moroccoOptions])}
                       onChange={(event) => onCustomsChange({ moroccoOptions: { ...customs.moroccoOptions!, [key]: event.target.checked } })}
                       className="h-5 w-5 rounded border-slate-300 text-orange-600"
                     />
                     <span>{label}</span>
                   </label>
                 ))}
                 <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
                   Sans confirmation complète, la simulation applique automatiquement le régime standard.
                 </p>
              </div>
            )}
          </div>
        )}

        {/* Base de valorisation douanière */}
        <fieldset className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5 space-y-4">
          <legend className="sr-only">Assiette de calcul de la douane</legend>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-2">
              <FileText className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand-600" />
              <div>
                <h3 className="text-base font-bold text-slate-900">Quelle valeur la douane doit-elle regarder ?</h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  Comparez deux valeurs du véhicule, avant d’ajouter le fret et l’assurance.
                </p>
              </div>
              <Tooltip
                title="Pourquoi ce choix est déterminant ?"
                content="La douane peut réévaluer un véhicule acheté sous le prix du marché. N'utilisez une autre assiette que si vous avez un document ou une référence vérifiable; sinon la simulation conserve la facture."
              />
            </div>

            <a
              href={country === 'senegal' ? 'https://www.douanes.sn/' : 'https://www.douane.gov.ma/'}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-fit items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-bold text-brand-700 shadow-sm transition-colors hover:border-brand-500 hover:text-brand-900"
            >
              <span>{country === 'senegal' ? 'Douanes du Sénégal' : 'Douanes du Maroc'}</span>
              <ExternalLink className="h-3 w-3 text-brand-600" />
              <span className="sr-only">(ouvre un nouvel onglet)</span>
            </a>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Base de valorisation">
            <label
              className={`relative cursor-pointer rounded-xl border-2 bg-white p-4 transition-all focus-within:ring-2 focus-within:ring-brand-500 focus-within:ring-offset-2 ${
                (customs.valuationBasis || 'invoice') === 'invoice'
                  ? 'border-brand-600 bg-brand-50/60 shadow-md'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <input
                type="radio"
                name="valuationBasis"
                value="invoice"
                checked={(customs.valuationBasis || 'invoice') === 'invoice'}
                onChange={() => onCustomsChange({ valuationBasis: 'invoice' })}
                className="sr-only"
              />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-wider text-slate-500">Option 1</div>
                  <div className="mt-1 text-sm font-bold text-slate-900">Prix d’achat facturé</div>
                </div>
                {(customs.valuationBasis || 'invoice') === 'invoice' && <CheckCircle className="h-5 w-5 flex-shrink-0 text-brand-700" aria-label="Option sélectionnée" />}
              </div>
              <div className="mt-3 text-xl font-black tracking-tight text-brand-900">{formatCad(invoiceValue)}</div>
              <div className="mt-1 text-xs leading-relaxed text-slate-600">Valeur du véhicule sur votre facture, avant fret et assurance.</div>
            </label>

            <label
              className={`relative cursor-pointer rounded-xl border-2 bg-white p-4 transition-all focus-within:ring-2 focus-within:ring-brand-500 focus-within:ring-offset-2 ${
                customs.valuationBasis === 'argus_official'
                  ? 'border-brand-600 bg-brand-50/60 shadow-md'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <input
                type="radio"
                name="valuationBasis"
                value="argus_official"
                checked={customs.valuationBasis === 'argus_official'}
                onChange={() => onCustomsChange({ valuationBasis: 'argus_official' })}
                className="sr-only"
              />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-wider text-slate-500">Option 2</div>
                  <div className="mt-1 text-sm font-bold text-slate-900">Valeur douanière documentée</div>
                </div>
                {customs.valuationBasis === 'argus_official' && <CheckCircle className="h-5 w-5 flex-shrink-0 text-brand-700" aria-label="Option sélectionnée" />}
              </div>
              <div className="mt-3 text-xl font-black tracking-tight text-brand-900">
                {documentedValue ? formatCad(documentedValue) : 'À documenter'}
              </div>
              <div className="mt-1 text-xs leading-relaxed text-slate-600">Valeur du véhicule avant fret et assurance, appuyée par une source vérifiable.</div>
              <span className="mt-3 inline-flex rounded-md bg-amber-100 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-amber-900">Document requis</span>
            </label>
          </div>

          {documentedValue && (
            <div className="flex flex-col gap-1 rounded-xl border border-brand-200 bg-white px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <span className="font-semibold text-slate-700">Écart entre les deux valeurs</span>
              <span className={`font-black ${valuationDifference && valuationDifference > 0 ? 'text-amber-800' : 'text-emerald-700'}`}>
                {valuationDifference && valuationDifference > 0 ? '+' : ''}{formatCad(valuationDifference ?? 0)}
              </span>
            </div>
          )}

          {customs.valuationBasis === 'argus_official' && (
            <div className="grid gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:grid-cols-2">
              <label className="text-xs font-bold text-slate-700">
                Valeur documentée ($ CA)
                <input type="number" min="1" value={customs.estimatedArgusValueCad || ''} onChange={(event) => onCustomsChange({ estimatedArgusValueCad: Number(event.target.value) || undefined })} className="mt-1 min-h-[46px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm" />
              </label>
              <label className="text-xs font-bold text-slate-700">
                Source ou référence du document
                <input type="text" value={customs.valuationReference || ''} onChange={(event) => onCustomsChange({ valuationReference: event.target.value })} placeholder="Ex. avis douanier, dossier, évaluateur" className="mt-1 min-h-[46px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm" />
              </label>
              {(!customs.estimatedArgusValueCad || !customs.valuationReference?.trim()) && (
                <p className="sm:col-span-2 text-xs font-semibold text-amber-900">Information incomplète : le calcul conservera le prix facturé.</p>
              )}
            </div>
          )}
        </fieldset>

      </div>

      {/* Pied de formulaire */}
      <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-between">
        <button
          type="button"
          onClick={onPrev}
          className="inline-flex items-center space-x-2 px-5 py-3 rounded-xl font-bold text-sm text-slate-700 hover:bg-slate-200 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Retour au véhicule</span>
        </button>

        <button
          type="button"
          disabled={!eligibility.isEligible}
          onClick={onNext}
          className={`inline-flex items-center space-x-2 px-6 py-3.5 rounded-xl font-bold text-base shadow transition-all ${eligibility.isEligible
            ? 'bg-brand-600 hover:bg-brand-700 text-white hover:shadow-md transform hover:-translate-y-0.5 cursor-pointer'
            : 'bg-slate-300 text-slate-500 cursor-not-allowed'
            }`}
        >
          <span>Étape 3 : Mode de financement</span>
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>

    </div>
  );
};

