import React, { useState } from 'react';
import { CostBreakdown as CostBreakdownType, FinancingConfig } from '../../types';
import { ChevronDown, ChevronUp, DollarSign, Truck, ShieldAlert, FileText, ArrowRight } from 'lucide-react';

interface CostBreakdownProps {
  breakdown: CostBreakdownType;
  financing: FinancingConfig;
}

export const CostBreakdown: React.FC<CostBreakdownProps> = ({ breakdown, financing }) => {
  const [openSection, setOpenSection] = useState<string | null>('transport');

  const toggleSection = (id: string) => {
    setOpenSection(openSection === id ? null : id);
  };

  const items = [
    {
      id: 'purchase',
      title: '1. Prix d\'achat du véhicule',
      subtitle: 'Montant versé au vendeur au Québec',
      amountCad: breakdown.vehiclePurchaseCad,
      percent: Math.round((breakdown.vehiclePurchaseCad / breakdown.landedCostCad) * 100),
      color: 'bg-sky-500',
      details: [
        { label: 'Prix d\'acquisition brut', value: `${breakdown.vehiclePurchaseCad.toLocaleString('fr-CA')} $ CA` },
      ]
    },
    {
      id: 'spread',
      title: '2. Écart de change (Spread FX)',
      subtitle: `Commission invisible de change (${financing.fxSpreadPercent}%)`,
      amountCad: breakdown.fxSpreadCostCad,
      percent: Math.round((breakdown.fxSpreadCostCad / breakdown.landedCostCad) * 100),
      color: 'bg-amber-500',
      details: [
        { label: 'Taux de marché indicatif', value: `1 $ CA = ${breakdown.baseFxRate.toFixed(2)} ${breakdown.localCurrencyCode}` },
        { label: 'Taux effectif appliqué', value: `1 $ CA = ${breakdown.effectiveFxRate.toFixed(2)} ${breakdown.localCurrencyCode}` },
        { label: 'Marge retenue par l\'intermédiaire', value: `${financing.fxSpreadPercent}% (${breakdown.fxSpreadCostCad.toLocaleString('fr-CA')} $ CA)` }
      ]
    },
    {
      id: 'transfer',
      title: '3. Frais de transfert d\'argent',
      subtitle: 'Frais fixes de virement et commissions',
      amountCad: breakdown.bankTransferCostCad,
      percent: Math.round((breakdown.bankTransferCostCad / breakdown.landedCostCad) * 100),
      color: 'bg-indigo-500',
      details: [
        { label: 'Frais de transaction bancaire', value: `${breakdown.bankTransferCostCad.toLocaleString('fr-CA')} $ CA` }
      ]
    },
    {
      id: 'transport',
      title: '4. Transport complet de A à Z',
      subtitle: 'Convoyage terrestre, fret maritime et assurance',
      amountCad: breakdown.totalTransportCad,
      percent: Math.round((breakdown.totalTransportCad / breakdown.landedCostCad) * 100),
      color: 'bg-blue-600',
      details: [
        { label: '1. Transport terrestre QC (Origine)', value: `${breakdown.inlandOriginCad.toLocaleString('fr-CA')} $ CA` },
        { label: '2. Frais portuaires départ', value: `${breakdown.originPortFeesCad.toLocaleString('fr-CA')} $ CA` },
        { label: '3. Fret maritime (navire)', value: `${breakdown.oceanFreightCad.toLocaleString('fr-CA')} $ CA` },
        { label: '4. Assurance transport (1.5%)', value: `${breakdown.marineInsuranceCad.toLocaleString('fr-CA')} $ CA` },
        { label: '5. Frais portuaires arrivée', value: `${breakdown.destinationPortFeesCad.toLocaleString('fr-CA')} $ CA` },
        { label: '6. Acheminement final (Destination)', value: `${breakdown.inlandDestinationCad.toLocaleString('fr-CA')} $ CA` }
      ]
    },
    {
      id: 'auction',
      title: '5. Encan & Frais d\'enchères',
      subtitle: 'Frais de vente aux enchères (Copart, IAAI) ou commission',
      amountCad: breakdown.auctionAndBrokerFeesCad,
      percent: Math.round((breakdown.auctionAndBrokerFeesCad / breakdown.landedCostCad) * 100),
      color: 'bg-purple-500',
      details: [
        { label: 'Frais d\'enchère & courtier', value: `${breakdown.auctionAndBrokerFeesCad.toLocaleString('fr-CA')} $ CA` }
      ]
    },
    {
      id: 'additional',
      title: '6. Frais annexes & Préparation terrain',
      subtitle: 'Transitaire local, décontamination RoRo, magasinage',
      amountCad: breakdown.totalAdditionalFeesCad,
      percent: Math.round((breakdown.totalAdditionalFeesCad / breakdown.landedCostCad) * 100),
      color: 'bg-teal-600',
      details: [
        { label: 'Transitaire / Déclarant agréé au port', value: `${breakdown.transitAgentFeeCad.toLocaleString('fr-CA')} $ CA` },
        { label: 'Décontamination & Lavage châssis RoRo', value: `${breakdown.roroCleaningFeeCad.toLocaleString('fr-CA')} $ CA` },
        { label: 'Provision magasinage portuaire (5j)', value: `${breakdown.portStorageBufferCad.toLocaleString('fr-CA')} $ CA` },
        { label: 'Batterie / Clés & Réparations prévues', value: `${breakdown.batteryAndRepairsCad.toLocaleString('fr-CA')} $ CA` }
      ]
    },
    {
      id: 'customs',
      title: '7. Douane & Taxes à destination',
      subtitle: `Droits de dédouanement (Base : ${breakdown.customsTaxableValueCad.toLocaleString('fr-CA')} $ CA - ${breakdown.customsValuationBasis === 'argus_official' ? 'Valeur documentée' : 'Facture'})`,
      amountCad: breakdown.customsAndTaxesCad,
      percent: Math.round((breakdown.customsAndTaxesCad / breakdown.landedCostCad) * 100),
      color: 'bg-emerald-600',
      details: [
        { label: 'Mode de valorisation retenu', value: breakdown.customsValuationBasis === 'argus_official' ? 'Valeur douanière documentée' : 'Prix d\'achat facturé' },
        { label: 'Assiette taxable (Valeur CAF)', value: `${breakdown.customsTaxableValueCad.toLocaleString('fr-CA')} $ CA` },
        { label: 'Total droits & taxes calculés', value: `${breakdown.customsAndTaxesCad.toLocaleString('fr-CA')} $ CA` },
        { label: 'Contrevaleur en devise locale', value: `${Math.round(breakdown.customsAndTaxesCad * breakdown.effectiveFxRate).toLocaleString('fr-CA')} ${breakdown.localCurrencyCode}` },
        ...(breakdown.customsDifferenceArgusCad > 0 ? [{ label: 'Scénario estimatif de réévaluation', value: `+${breakdown.customsDifferenceArgusCad.toLocaleString('fr-CA')} $ CA` }] : [])
      ]
    }
  ];

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">

      {/* En-tête */}
      <div className="p-6 border-b border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h3 className="text-lg font-bold text-slate-900">
            Décomposition détaillée des coûts (Landed Cost)
          </h3>
          <p className="text-xs text-slate-500">
            Cliquez sur chaque poste pour visualiser les sous-frais et formules de calcul
          </p>
        </div>
        <div className="text-right">
          <div className="text-xl font-black text-brand-900">
            {breakdown.landedCostCad.toLocaleString('fr-CA')} $ CA
          </div>
          <div className="text-xs text-brand-700 font-semibold">
            ({breakdown.landedCostLocal.toLocaleString('fr-CA')} {breakdown.localCurrencyCode})
          </div>
        </div>
      </div>

      {/* Barre visuelle de proportion */}
      <div className="px-6 pt-5">
        <div className="h-3.5 w-full bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
          {items.map(item => (
            item.percent > 0 && (
              <div
                key={item.id}
                style={{ width: `${item.percent}%` }}
                className={`${item.color} h-full transition-all`}
                title={`${item.title} : ${item.percent}%`}
              />
            )
          ))}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-slate-500">
          {items.map(item => (
            <span key={item.id} className="flex items-center space-x-1">
              <span className={`w-2.5 h-2.5 rounded-full ${item.color}`}></span>
              <span>{item.title.split('.')[1]} ({item.percent}%)</span>
            </span>
          ))}
        </div>
      </div>

      {/* Liste dépliable (Accordéon) */}
      <div className="divide-y divide-slate-200 p-6 space-y-3">
        {items.map((item) => {
          const isOpen = openSection === item.id;
          return (
            <div
              key={item.id}
              className={`rounded-xl border transition-all ${isOpen ? 'border-brand-300 bg-slate-50/50' : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
            >
              <button
                type="button"
                onClick={() => toggleSection(item.id)}
                className="w-full px-4 py-3.5 flex items-center justify-between text-left focus:outline-none"
              >
                <div className="flex items-center space-x-3">
                  <div className={`w-3 h-3 rounded-full ${item.color} flex-shrink-0`} />
                  <div>
                    <div className="font-bold text-sm sm:text-base text-slate-900">{item.title}</div>
                    <div className="text-xs text-slate-500">{item.subtitle}</div>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <div className="text-right">
                    <span className="font-bold text-sm sm:text-base text-slate-900">
                      {item.amountCad.toLocaleString('fr-CA')} $ CA
                    </span>
                    <span className="text-xs text-slate-500 ml-1.5 font-medium">
                      ({item.percent}%)
                    </span>
                  </div>
                  {isOpen ? (
                    <ChevronUp className="w-5 h-5 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-slate-400" />
                  )}
                </div>
              </button>

              {isOpen && (
                <div className="px-5 pb-4 pt-2 border-t border-slate-200 bg-white rounded-b-xl space-y-2">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    Détail des calculs :
                  </div>
                  {item.details.map((d, i) => (
                    <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-slate-100 last:border-0">
                      <span className="text-slate-600">{d.label}</span>
                      <span className="font-semibold text-slate-800">{d.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

    </div>
  );
};

