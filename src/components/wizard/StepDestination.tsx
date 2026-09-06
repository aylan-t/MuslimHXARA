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
                Douane estimée : <strong>~44.5%</strong> sur base CAF
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
                Régime MRE : <strong>5 ans max</strong> (abattement 90%)<br />
                Régime commercial : <strong>autorisation requise</strong>
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
              Au port de Dakar, la douane calcule les taxes sur la <strong>valeur CAF</strong> (Coût d'achat du véhicule + Assurance maritime + Fret maritime). Le taux cumulé moyen est de <strong>44.5%</strong> (Droits de douane + TVA 18% + prélèvements communautaires UEMOA/OHADA).
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
              Si l'acheteur au Maroc bénéficie du statut MRE (retour définitif ou retraité MRE de 60 ans et plus ayant résidé au moins 10 ans à l'étranger), il a droit à un <strong>abattement exceptionnel de 90%</strong> sur les droits de douane.
            </p>

            {isMRE && (
              <div className="bg-white p-3.5 rounded-lg border border-orange-200 space-y-3 text-xs text-slate-800">
                 <div className="font-bold text-orange-950">Confirmez chaque condition avant d’appliquer l’abattement :</div>
                <div className="flex items-center space-x-2">
                  <span className={vehicleAge <= 5 ? "text-emerald-600 font-bold" : "text-red-600 font-bold"}>
                    {vehicleAge <= 5 ? "Conforme" : "À vérifier"}
                  </span>
                  <span>Véhicule de moins de 5 ans (Actuel : {vehicleAge} an(s) - Année min. {CURRENT_YEAR - 5})</span>
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

        {/* NOUVEAU : Base de valorisation douanière (Angle mort terrain) */}
        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <FileText className="w-5 h-5 text-brand-600" />
              <label className="text-base font-bold text-slate-900">
                 Assiette de calcul de la douane
              </label>
              <Tooltip
                title="Pourquoi ce choix est déterminant ?"
                 content="La douane peut réévaluer un véhicule acheté sous le prix du marché. N'utilisez une autre assiette que si vous avez un document ou une référence vérifiable; sinon la simulation conserve la facture."
              />
            </div>

            {/* Lien officiel de douane */}
            <a
              href={country === 'senegal' ? 'https://www.douanes.sn/' : 'https://www.douane.gov.ma/'}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-1 text-xs font-bold text-brand-700 hover:text-brand-900 bg-white px-2.5 py-1 rounded-lg border border-slate-300 hover:border-brand-500 shadow-sm transition-colors"
            >
              <span>{country === 'senegal' ? 'Douanes du Sénégal (douanes.sn)' : 'Douanes du Maroc (douane.gov.ma)'}</span>
              <ExternalLink className="w-3 h-3 text-brand-600" />
            </a>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <label
              className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all ${(customs.valuationBasis || 'invoice') === 'invoice'
                  ? 'border-brand-600 bg-brand-50/50 shadow-sm'
                  : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
            >
              <input
                type="radio"
                name="valuationBasis"
                checked={(customs.valuationBasis || 'invoice') === 'invoice'}
                onChange={() => onCustomsChange({ valuationBasis: 'invoice' })}
                className="sr-only"
              />
              <div className="font-bold text-sm text-slate-900">1. Prix d'achat facturé ({vehicle.purchasePriceCad.toLocaleString('fr-CA')} $ CAD)</div>
              <div className="text-xs text-slate-500 mt-1">
                Idéal si acheté chez un concessionnaire ou particulier au prix normal du marché.
              </div>
            </label>

            <label
              className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all ${customs.valuationBasis === 'argus_official'
                  ? 'border-brand-600 bg-brand-50/50 shadow-sm'
                  : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
            >
              <input
                type="radio"
                name="valuationBasis"
                checked={customs.valuationBasis === 'argus_official'}
                onChange={() => onCustomsChange({ valuationBasis: 'argus_official' })}
                className="sr-only"
              />
              <div className="font-bold text-sm text-brand-900 flex items-center justify-between">
                <span>2. Valeur douanière documentée</span>
                <span className="text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded font-black">Document requis</span>
              </div>
              <div className="text-xs text-slate-600 mt-1">
                Utilisez uniquement une valeur reçue d’une source douanière ou professionnelle identifiable.
              </div>
            </label>
          </div>
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

