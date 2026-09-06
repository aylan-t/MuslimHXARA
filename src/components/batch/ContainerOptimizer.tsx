import React, { useState } from 'react';
import { DestinationCountry, GlobalReferenceConfig } from '../../types';
import { calculateBatchOptimization } from '../../services/calculationEngine';
import { Container, Ship, CheckCircle, AlertCircle, ArrowRight, TrendingUp } from 'lucide-react';
import { Tooltip } from '../common/Tooltip';

interface ContainerOptimizerProps {
  config: GlobalReferenceConfig;
  defaultCountry?: DestinationCountry;
}

export const ContainerOptimizer: React.FC<ContainerOptimizerProps> = ({
  config,
  defaultCountry = 'senegal'
}) => {
  const [country, setCountry] = useState<DestinationCountry>(defaultCountry);
  const optimization = calculateBatchOptimization(country, config);

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">

      {/* En-tête */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-amber-100 text-amber-900 rounded-2xl">
              <Container className="w-8 h-8 text-amber-700" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900">
                Optimiseur de Conteneur & Groupage (Batch)
              </h2>
              <p className="text-sm text-slate-600">
                Faut-il envoyer votre véhicule seul en RoRo ou mutualiser dans un conteneur de 40 pieds ?
              </p>
            </div>
          </div>

          {/* Sélecteur de Pays */}
          <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200 self-start sm:self-center">
            <button
              type="button"
              onClick={() => setCountry('senegal')}
              className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all ${country === 'senegal'
                  ? 'bg-white text-emerald-800 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
                }`}
            >
              SN · Vers Sénégal (Dakar)
            </button>
            <button
              type="button"
              onClick={() => setCountry('maroc')}
              className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all ${country === 'maroc'
                  ? 'bg-white text-orange-800 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
                }`}
            >
              MA · Vers Maroc (Casablanca)
            </button>
          </div>
        </div>

        {/* Recommandation en langage clair (Section 5.9 imposée) */}
        <div className="mt-6 p-4 rounded-xl bg-gradient-to-r from-sky-50 to-indigo-50 border border-sky-200 flex items-start space-x-3">
          <CheckCircle className="w-5 h-5 text-brand-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-slate-800 leading-relaxed">
            <div className="font-bold text-brand-900 mb-0.5">Conseil d'optimisation pour Karim :</div>
            <div>{optimization.recommendation}</div>
          </div>
        </div>

        {/* Tableau comparatif 1 à 4 véhicules */}
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-bold uppercase text-slate-500 bg-slate-50">
                <th className="py-3 px-4">Remplissage conteneur 40'</th>
                <th className="py-3 px-4 text-center">Fret unitaire conteneur</th>
                <th className="py-3 px-4 text-center">Coût équivalent RoRo</th>
                <th className="py-3 px-4 text-center">Économie / véhicule</th>
                <th className="py-3 px-4 text-right">Économie totale batch</th>
                <th className="py-3 px-4 text-center">Verdict</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {optimization.scenarios.map((s) => (
                <tr
                  key={s.vehicleCount}
                  className={`hover:bg-slate-50/80 transition-colors ${s.isContainerBetter ? 'bg-emerald-50/30' : ''
                    }`}
                >
                  <td className="py-3.5 px-4 font-bold text-slate-900">
                    <div className="flex items-center space-x-2">
                      <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-800 text-xs flex items-center justify-center font-black">
                        {s.vehicleCount}
                      </span>
                      <span>{s.vehicleCount} voiture{s.vehicleCount > 1 ? 's' : ''}</span>
                    </div>
                  </td>

                  <td className="py-3.5 px-4 text-center font-bold text-slate-800">
                    {s.containerCostPerCar.toLocaleString('fr-CA')} $ CA
                  </td>

                  <td className="py-3.5 px-4 text-center text-slate-600">
                    {s.roroCostPerCar.toLocaleString('fr-CA')} $ CA
                  </td>

                  <td className="py-3.5 px-4 text-center font-bold">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs ${s.savingsPerCar > 0
                          ? 'text-emerald-800 bg-emerald-100'
                          : 'text-red-700 bg-red-100'
                        }`}
                    >
                      {s.savingsPerCar > 0 ? `-${s.savingsPerCar.toLocaleString('fr-CA')} $` : `+${Math.abs(s.savingsPerCar).toLocaleString('fr-CA')} $`}
                    </span>
                  </td>

                  <td className="py-3.5 px-4 text-right font-black text-slate-900">
                    {s.totalSavingsBatch > 0 ? (
                      <span className="text-emerald-700">+{s.totalSavingsBatch.toLocaleString('fr-CA')} $ CA</span>
                    ) : (
                      <span className="text-red-600">-{Math.abs(s.totalSavingsBatch).toLocaleString('fr-CA')} $ CA</span>
                    )}
                  </td>

                  <td className="py-3.5 px-4 text-center">
                    {s.isContainerBetter ? (
                      <span className="inline-flex items-center space-x-1 text-xs font-bold text-emerald-700">
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Conteneur gagnant</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center space-x-1 text-xs font-semibold text-slate-500">
                        <span>Privilégier le RoRo</span>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Détails logistiques du conteneur */}
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 text-xs text-slate-700">
            <div className="font-bold text-slate-900 text-sm">Conteneur 40 pieds High Cube (HC)</div>
            <p>
              Capacité maximale : 3 berlines moyennes ou 2 SUV + 1 citadine. L'empotage nécessite des cales professionnelles ou un chargement en rampe surbaissée.
            </p>
            <div className="font-semibold text-slate-900 pt-1">
              Coût forfaitaire total : {optimization.containerFixedTotal.toLocaleString('fr-CA')} $ CA
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 text-xs text-slate-700">
            <div className="font-bold text-slate-900 text-sm">Navire Roulier (RoRo individuel)</div>
            <p>
              Véhicule roulant conduit directement à l'intérieur du navire. Idéal si vous n'avez qu'un seul véhicule prêt à partir et ne voulez pas attendre d'autres acheteurs.
            </p>
            <div className="font-semibold text-slate-900 pt-1">
              Coût individuel total : {optimization.roroPerCar.toLocaleString('fr-CA')} $ CA
            </div>
          </div>
        </div>

      </div>

    </div>
  );
};

