import React, { useState } from 'react';
import { GlobalReferenceConfig } from '../../types';
import { Settings, Save, RotateCcw, CheckCircle2, AlertTriangle, Ship, DollarSign } from 'lucide-react';
import { resetStoredConfig, saveStoredConfig } from '../../services/storageService';

interface ConfigEditorProps {
  config: GlobalReferenceConfig;
  onUpdateConfig: (newConfig: GlobalReferenceConfig) => void;
}

export const ConfigEditor: React.FC<ConfigEditorProps> = ({ config, onUpdateConfig }) => {
  const [localConfig, setLocalConfig] = useState<GlobalReferenceConfig>(config);
  const [saveToast, setSaveToast] = useState(false);

  const handleSave = () => {
    saveStoredConfig(localConfig);
    onUpdateConfig(localConfig);
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 3000);
  };

  const handleReset = () => {
    if (confirm('Voulez-vous réinitialiser toutes les tables de référence aux valeurs par défaut ?')) {
      const def = resetStoredConfig();
      setLocalConfig(def);
      onUpdateConfig(def);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">

      {/* En-tête */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-slate-100 text-slate-800 rounded-2xl">
            <Settings className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900">
              Tables de Référence & Paramètres Éditables
            </h2>
            <p className="text-sm text-slate-600">
              Modifiez en temps réel les barèmes douaniers, taux de change et coûts de fret maritime
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Réinitialiser</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            className="inline-flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs sm:text-sm font-bold shadow transition-colors"
          >
            <Save className="w-4 h-4" />
            <span>Enregistrer</span>
          </button>
        </div>
      </div>

      {saveToast && (
        <div className="bg-emerald-50 border border-emerald-300 p-4 rounded-xl flex items-center space-x-3 text-emerald-900 font-bold text-sm">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <span>Modifications enregistrées ! Tous les calculs utilisent désormais vos nouveaux barèmes.</span>
        </div>
      )}

      {/* 1. Taux de Change & Spread FX */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
        <div className="flex items-center space-x-2 border-b border-slate-200 pb-3 font-bold text-base text-slate-900">
          <DollarSign className="w-5 h-5 text-amber-600" />
          <span>Taux de change indicatifs & écart appliqué</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              1 CAD en Dirham marocain (MAD)
            </label>
            <input
              type="number"
              step="0.01"
              value={localConfig.fxRates.CAD_to_MAD}
              onChange={(e) =>
                setLocalConfig({
                  ...localConfig,
                  fxRates: { ...localConfig.fxRates, CAD_to_MAD: parseFloat(e.target.value) || 7.35 }
                })
              }
              className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold text-slate-900"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              1 CAD en Franc CFA (XOF)
            </label>
            <input
              type="number"
              step="1"
              value={localConfig.fxRates.CAD_to_XOF}
              onChange={(e) =>
                setLocalConfig({
                  ...localConfig,
                  fxRates: { ...localConfig.fxRates, CAD_to_XOF: parseFloat(e.target.value) || 440 }
                })
              }
              className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold text-slate-900"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Spread de change bancaire par défaut (%)
            </label>
            <input
              type="number"
              step="0.1"
              value={localConfig.fxRates.defaultSpreadPercent}
              onChange={(e) =>
                setLocalConfig({
                  ...localConfig,
                  fxRates: { ...localConfig.fxRates, defaultSpreadPercent: parseFloat(e.target.value) || 2.5 }
                })
              }
              className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold text-slate-900"
            />
          </div>
        </div>
      </div>

      {/* 2. Barèmes Douaniers par Pays */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
        <div className="border-b border-slate-200 pb-3 font-bold text-base text-slate-900">
          Règles douanières et fiscales éditables
        </div>

        {/* Sénégal */}
        <div className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-200 space-y-3">
          <div className="font-bold text-sm text-emerald-950">SN · Sénégal (Port de Dakar)</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Âge maximum légal tourisme (ans)
              </label>
              <input
                type="number"
                value={localConfig.customsRules.senegal.maxAgeYearsTourism}
                onChange={(e) =>
                  setLocalConfig({
                    ...localConfig,
                    customsRules: {
                      ...localConfig.customsRules,
                      senegal: {
                        ...localConfig.customsRules.senegal,
                        maxAgeYearsTourism: parseInt(e.target.value) || 10
                      }
                    }
                  })
                }
                className="w-full px-3 py-2 rounded-lg border border-emerald-300 bg-white font-bold"
              />
              <span className="text-[10px] text-slate-500">Décret officiel du 24 octobre 2025</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Taux cumulé droits + TVA + taxes (% CAF)
              </label>
              <input
                type="number"
                step="0.1"
                value={localConfig.customsRules.senegal.taxRatePercent}
                onChange={(e) =>
                  setLocalConfig({
                    ...localConfig,
                    customsRules: {
                      ...localConfig.customsRules,
                      senegal: {
                        ...localConfig.customsRules.senegal,
                        taxRatePercent: parseFloat(e.target.value) || 44.5
                      }
                    }
                  })
                }
                className="w-full px-3 py-2 rounded-lg border border-emerald-300 bg-white font-bold"
              />
              <span className="text-[10px] text-slate-500">Droits de douane + TVA 18% + OHADA</span>
            </div>
          </div>
        </div>

        {/* Maroc */}
        <div className="p-4 rounded-xl bg-orange-50/50 border border-orange-200 space-y-3">
          <div className="font-bold text-sm text-orange-950">MA · Maroc (Casablanca / Tanger Med)</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Âge max régime MRE (ans)
              </label>
              <input
                type="number"
                value={localConfig.customsRules.morocco.mreMaxAgeYears}
                onChange={(e) =>
                  setLocalConfig({
                    ...localConfig,
                    customsRules: {
                      ...localConfig.customsRules,
                      morocco: {
                        ...localConfig.customsRules.morocco,
                        mreMaxAgeYears: parseInt(e.target.value) || 5
                      }
                    }
                  })
                }
                className="w-full px-3 py-2 rounded-lg border border-orange-300 bg-white font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Abattement MRE (%)
              </label>
              <input
                type="number"
                value={localConfig.customsRules.morocco.mreMaxDiscountPercent}
                onChange={(e) =>
                  setLocalConfig({
                    ...localConfig,
                    customsRules: {
                      ...localConfig.customsRules,
                      morocco: {
                        ...localConfig.customsRules.morocco,
                        mreMaxDiscountPercent: parseFloat(e.target.value) || 90
                      }
                    }
                  })
                }
                className="w-full px-3 py-2 rounded-lg border border-orange-300 bg-white font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Droit d'import standard (%)
              </label>
              <input
                type="number"
                step="0.5"
                value={localConfig.customsRules.morocco.standardImportRatePercent}
                onChange={(e) =>
                  setLocalConfig({
                    ...localConfig,
                    customsRules: {
                      ...localConfig.customsRules,
                      morocco: {
                        ...localConfig.customsRules.morocco,
                        standardImportRatePercent: parseFloat(e.target.value) || 17.5
                      }
                    }
                  })
                }
                className="w-full px-3 py-2 rounded-lg border border-orange-300 bg-white font-bold"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 3. Tarifs de référence des Routes de transport */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
        <div className="flex items-center space-x-2 border-b border-slate-200 pb-3 font-bold text-base text-slate-900">
          <Ship className="w-5 h-5 text-brand-700" />
          <span>Tarifs de référence des routes maritimes ($ CA)</span>
        </div>

        <div className="divide-y divide-slate-100">
          {localConfig.routes.map((route, idx) => (
            <div key={route.id} className="py-3 grid grid-cols-1 sm:grid-cols-4 gap-3 items-center text-xs">
              <div className="font-bold text-slate-900 sm:col-span-2">
                {route.name}
              </div>
              <div>
                <label className="block text-[11px] text-slate-500">Fret maritime ($ CA)</label>
                <input
                  type="number"
                  value={route.oceanFreightCad}
                  onChange={(e) => {
                    const updatedRoutes = [...localConfig.routes];
                    updatedRoutes[idx] = { ...route, oceanFreightCad: parseFloat(e.target.value) || 0 };
                    setLocalConfig({ ...localConfig, routes: updatedRoutes });
                  }}
                  className="w-full px-2 py-1 rounded border border-slate-300 font-bold"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500">Délai estimé (j)</label>
                <input
                  type="number"
                  value={route.estimatedDays}
                  onChange={(e) => {
                    const updatedRoutes = [...localConfig.routes];
                    updatedRoutes[idx] = { ...route, estimatedDays: parseInt(e.target.value) || 20 };
                    setLocalConfig({ ...localConfig, routes: updatedRoutes });
                  }}
                  className="w-full px-2 py-1 rounded border border-slate-300 font-bold"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};

