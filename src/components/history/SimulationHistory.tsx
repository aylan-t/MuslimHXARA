import React, { useState, useEffect } from 'react';
import { SimulationResult } from '../../types';
import { loadSavedSimulations, deleteSimulationFromHistory } from '../../services/storageService';
import { History, Trash2, Eye, GitCompare, ArrowRight, CheckCircle2, Plus } from 'lucide-react';

interface SimulationHistoryProps {
  onSelectSimulation: (sim: SimulationResult) => void;
  onNewSimulation: () => void;
}

export const SimulationHistory: React.FC<SimulationHistoryProps> = ({
  onSelectSimulation,
  onNewSimulation
}) => {
  const [simulations, setSimulations] = useState<SimulationResult[]>([]);
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);

  useEffect(() => {
    setSimulations(loadSavedSimulations());
  }, []);

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = deleteSimulationFromHistory(id);
    setSimulations(updated);
    setSelectedForCompare(selectedForCompare.filter(item => item !== id));
  };

  const handleToggleCompare = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedForCompare.includes(id)) {
      setSelectedForCompare(selectedForCompare.filter(item => item !== id));
    } else {
      if (selectedForCompare.length >= 2) {
        // Remplacer le 2ème
        setSelectedForCompare([selectedForCompare[0], id]);
      } else {
        setSelectedForCompare([...selectedForCompare, id]);
      }
    }
  };

  const simA = simulations.find(s => s.id === selectedForCompare[0]);
  const simB = simulations.find(s => s.id === selectedForCompare[1]);

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">

      {/* En-tête */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-purple-100 text-purple-800 rounded-2xl">
              <History className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900">
                Historique des simulations & Comparateur
              </h2>
              <p className="text-sm text-slate-600">
                Retrouvez vos calculs passés ou comparez 2 véhicules pour faire le meilleur choix à l'encan
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onNewSimulation}
          className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold shadow transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Nouvelle simulation</span>
        </button>
      </div>

      {/* Mode Comparateur Côte à Côte (Si 2 simulations cochées) */}
      {simA && simB && (
        <div className="bg-gradient-to-tr from-brand-900 to-slate-900 text-white rounded-2xl p-6 sm:p-8 shadow-xl border border-sky-400/20 space-y-6">
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div className="flex items-center space-x-2">
              <GitCompare className="w-6 h-6 text-sky-400" />
              <h3 className="text-lg font-bold text-white">Comparaison Côte à Côte de 2 véhicules</h3>
            </div>
            <button
              onClick={() => setSelectedForCompare([])}
              className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
            >
              Fermer la comparaison
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs sm:text-sm">
            {/* Véhicule A */}
            <div className="bg-white/10 rounded-xl p-4 border border-white/10 space-y-3">
              <div className="font-black text-base text-sky-300">
                {simA.vehicle.brand} {simA.vehicle.model} ({simA.vehicle.year})
              </div>
              <div className="text-slate-300">Destination : {simA.destination === 'senegal' ? 'Sénégal' : 'Maroc'}</div>
              <div className="text-xl font-black text-emerald-400">
                Profit : +{simA.estimatedNetProfitCad.toLocaleString('fr-CA')} $ CA
              </div>
              <div className="text-xs text-slate-300 space-y-1 pt-2 border-t border-white/10">
                <div>Prix d'achat : {simA.vehicle.purchasePriceCad.toLocaleString('fr-CA')} $</div>
                <div>Landed Cost : {simA.breakdown.landedCostCad.toLocaleString('fr-CA')} $</div>
                <div>Prix vente suggéré : {simA.suggestedSalePriceCad.toLocaleString('fr-CA')} $</div>
                <div>Rendement (ROI) : +{simA.estimatedRoiPercent}%</div>
              </div>
            </div>

            {/* Véhicule B */}
            <div className="bg-white/10 rounded-xl p-4 border border-white/10 space-y-3">
              <div className="font-black text-base text-amber-300">
                {simB.vehicle.brand} {simB.vehicle.model} ({simB.vehicle.year})
              </div>
              <div className="text-slate-300">Destination : {simB.destination === 'senegal' ? 'Sénégal' : 'Maroc'}</div>
              <div className="text-xl font-black text-emerald-400">
                Profit : +{simB.estimatedNetProfitCad.toLocaleString('fr-CA')} $ CA
              </div>
              <div className="text-xs text-slate-300 space-y-1 pt-2 border-t border-white/10">
                <div>Prix d'achat : {simB.vehicle.purchasePriceCad.toLocaleString('fr-CA')} $</div>
                <div>Landed Cost : {simB.breakdown.landedCostCad.toLocaleString('fr-CA')} $</div>
                <div>Prix vente suggéré : {simB.suggestedSalePriceCad.toLocaleString('fr-CA')} $</div>
                <div>Rendement (ROI) : +{simB.estimatedRoiPercent}%</div>
              </div>
            </div>
          </div>

          <div className="bg-white/5 p-3 rounded-lg text-center text-xs text-slate-300">
            {simA.estimatedNetProfitCad > simB.estimatedNetProfitCad ? (
              <span>Le <strong>{simA.vehicle.brand} {simA.vehicle.model}</strong> dégage <strong>{(simA.estimatedNetProfitCad - simB.estimatedNetProfitCad).toLocaleString('fr-CA')} $ CA</strong> de profit supplémentaire.</span>
            ) : (
              <span>Le <strong>{simB.vehicle.brand} {simB.vehicle.model}</strong> dégage <strong>{(simB.estimatedNetProfitCad - simA.estimatedNetProfitCad).toLocaleString('fr-CA')} $ CA</strong> de profit supplémentaire.</span>
            )}
          </div>
        </div>
      )}

      {/* Liste des simulations */}
      {simulations.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
            <History className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-800">Aucune simulation enregistrée</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Lorsque vous calculez la rentabilité d'un véhicule, cliquez sur « Sauvegarder dans l'historique » pour la retrouver ici et la comparer.
          </p>
          <button
            type="button"
            onClick={onNewSimulation}
            className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-brand-600 text-white text-xs font-bold shadow mt-2 cursor-pointer"
          >
            <span>Démarrer une simulation</span>
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 divide-y divide-slate-100 overflow-hidden">
          <div className="p-4 bg-slate-50 flex items-center justify-between text-xs font-semibold text-slate-600">
            <span>Sélectionnez 2 simulations pour les comparer côte à côte :</span>
            <span>{simulations.length} simulation{simulations.length > 1 ? 's' : ''}</span>
          </div>

          {simulations.map((sim) => {
            const isCompared = selectedForCompare.includes(sim.id);
            const isSenegal = sim.destination === 'senegal';

            return (
              <div
                key={sim.id}
                onClick={() => onSelectSimulation(sim)}
                className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 cursor-pointer hover:bg-slate-50 transition-colors ${isCompared ? 'bg-sky-50/60' : ''
                  }`}
              >
                <div className="flex items-start space-x-3">
                  {/* Case à cocher comparateur */}
                  <button
                    type="button"
                    onClick={(e) => handleToggleCompare(sim.id, e)}
                    className={`mt-1 w-5 h-5 rounded border flex items-center justify-center transition-all ${isCompared
                        ? 'bg-brand-600 border-brand-600 text-white'
                        : 'border-slate-300 hover:border-brand-500 bg-white'
                      }`}
                    title="Cocher pour comparer"
                  >
                    {isCompared && <CheckCircle2 className="w-4 h-4" />}
                  </button>

                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-base text-slate-900">
                        {sim.vehicle.brand} {sim.vehicle.model} ({sim.vehicle.year})
                      </span>
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${isSenegal
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-orange-100 text-orange-800'
                          }`}
                      >
                        {isSenegal ? 'SN · Sénégal' : 'MA · Maroc'}
                      </span>
                    </div>

                    <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-x-4 gap-y-1">
                      <span>Achat : {sim.vehicle.purchasePriceCad.toLocaleString('fr-CA')} $ CA</span>
                      <span>Landed Cost : {sim.breakdown.landedCostCad.toLocaleString('fr-CA')} $ CA</span>
                      <span>Créé le : {new Date(sim.createdAt).toLocaleDateString('fr-CA')}</span>
                    </div>
                  </div>
                </div>

                {/* Profit et Actions */}
                <div className="flex items-center justify-between sm:justify-end space-x-4 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                  <div className="text-right">
                    <div className="text-base sm:text-lg font-black text-emerald-700">
                      +{sim.estimatedNetProfitCad.toLocaleString('fr-CA')} $ CA
                    </div>
                    <div className="text-xs text-slate-500 font-semibold">
                      ROI : +{sim.estimatedRoiPercent}%
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void import('../../services/pdfExportService').then(({ generateSimulationPdf }) => generateSimulationPdf(sim));
                      }}
                      className="p-2 text-slate-500 hover:text-brand-600 hover:bg-slate-100 rounded-lg transition-colors"
                      title="Télécharger le PDF"
                    >
                      <Eye className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={(e) => handleDelete(sim.id, e)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Supprimer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
};

