import { GlobalReferenceConfig, SimulationResult } from '../types';
import { DEFAULT_CONFIG } from '../data/defaultData';

const CONFIG_STORAGE_KEY = 'autotransat_config_v1';
const SIMULATIONS_STORAGE_KEY = 'autotransat_simulations_v1';

export function loadStoredConfig(): GlobalReferenceConfig {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const merged: GlobalReferenceConfig = {
        ...DEFAULT_CONFIG,
        ...parsed,
        quebecRegions: (Array.isArray(parsed.quebecRegions) && parsed.quebecRegions.length > 0)
          ? parsed.quebecRegions
          : DEFAULT_CONFIG.quebecRegions,
        officialSources: (Array.isArray(parsed.officialSources) && parsed.officialSources.length > 0)
          ? parsed.officialSources
          : DEFAULT_CONFIG.officialSources,
        routes: (Array.isArray(parsed.routes) && parsed.routes.length > 0)
          ? parsed.routes
          : DEFAULT_CONFIG.routes,
        fxRates: {
          ...DEFAULT_CONFIG.fxRates,
          ...(parsed.fxRates || {})
        },
        customsRules: {
          ...DEFAULT_CONFIG.customsRules,
          senegal: {
            ...DEFAULT_CONFIG.customsRules.senegal,
            ...(parsed.customsRules?.senegal || {})
          },
          morocco: {
            ...DEFAULT_CONFIG.customsRules.morocco,
            ...(parsed.customsRules?.morocco || {})
          }
        }
      };
      saveStoredConfig(merged);
      return merged;
    }
  } catch (e) {
    console.error('Erreur lors du chargement de la configuration:', e);
  }
  return DEFAULT_CONFIG;
}

export function saveStoredConfig(config: GlobalReferenceConfig): void {
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.error('Erreur lors de la sauvegarde de la configuration:', e);
  }
}

export function resetStoredConfig(): GlobalReferenceConfig {
  try {
    localStorage.removeItem(CONFIG_STORAGE_KEY);
  } catch (e) {
    console.error('Erreur lors de la réinitialisation:', e);
  }
  return DEFAULT_CONFIG;
}

export function loadSavedSimulations(): SimulationResult[] {
  try {
    const raw = localStorage.getItem(SIMULATIONS_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Erreur lors du chargement des simulations:', e);
  }
  return [];
}

export function saveSimulationToHistory(sim: SimulationResult): SimulationResult[] {
  const list = loadSavedSimulations();
  // Ne pas dupliquer si même id
  const filtered = list.filter(item => item.id !== sim.id);
  const updated = [sim, ...filtered].slice(0, 30); // garder les 30 dernières
  try {
    localStorage.setItem(SIMULATIONS_STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('Erreur lors de la sauvegarde de la simulation:', e);
  }
  return updated;
}

export function deleteSimulationFromHistory(id: string): SimulationResult[] {
  const list = loadSavedSimulations();
  const updated = list.filter(item => item.id !== id);
  try {
    localStorage.setItem(SIMULATIONS_STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('Erreur suppression:', e);
  }
  return updated;
}

