import type { GlobalReferenceConfig } from './engine/types';

/**
 * fx.ts (AGENT-01) — Portage de fetchLiveFxRates() depuis
 * src/services/liveDataService.ts (contrat §0 + MARKETPLACE_EXTENSION.md §6.2).
 *
 * Seul réseau autorisé de l'extension : FX live optionnel (timeout 4 s, 0 retry).
 * Fallback : valeurs DEFAULT_CONFIG (7.35 / 440.0) + flag isLive=false
 * (pastille « Référence » dans l'overlay).
 */

export interface LiveFxResult {
  CAD_to_MAD: number;
  CAD_to_XOF: number;
  lastUpdated: string;
  isLive: boolean;
  sourceName: string;
}

const FALLBACK_MAD = 7.35;
const FALLBACK_XOF = 440.0;
const XOF_PER_EUR = 655.957; // Franc CFA arrimé à l'euro (jamais en dur ailleurs)
const FX_TIMEOUT_MS = 4000;

const FALLBACK_RATES: LiveFxResult = {
  CAD_to_MAD: FALLBACK_MAD,
  CAD_to_XOF: FALLBACK_XOF,
  lastUpdated: new Date().toLocaleDateString('fr-CA'),
  isLive: false,
  sourceName: 'Données de référence locales'
};

/**
 * Injecte uniquement les taux de marché dans une configuration de calcul.
 * Les taux douaniers évalués restent les références statiques/versionnées.
 */
export function applyLiveMarketRates(
  config: GlobalReferenceConfig,
  live: LiveFxResult,
): GlobalReferenceConfig {
  if (!live.isLive) return config;
  return {
    ...config,
    fxRates: {
      ...config.fxRates,
      marketCAD_to_MAD: live.CAD_to_MAD,
      marketCAD_to_XOF: live.CAD_to_XOF,
      lastUpdated: live.lastUpdated,
      isLive: true,
    },
  };
}

/** Taux de change en direct, sinon fallback local. 1 seul essai, jamais de retry. */
export async function fetchLiveFxRates(): Promise<LiveFxResult> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FX_TIMEOUT_MS);

    const res = await fetch('https://open.er-api.com/v6/latest/CAD', {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}`);
    }

    const data = await res.json();
    if (data && data.rates) {
      const cadToMad = data.rates.MAD || FALLBACK_MAD;

      // Le franc CFA (XOF) est arrimé à l'euro (1 EUR = 655.957 XOF)
      let cadToXof = data.rates.XOF;
      if (!cadToXof && data.rates.EUR) {
        cadToXof = data.rates.EUR * XOF_PER_EUR;
      }
      if (!cadToXof) {
        cadToXof = FALLBACK_XOF;
      }

      const dateStr = new Date().toLocaleDateString('fr-CA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      return {
        CAD_to_MAD: Math.round(cadToMad * 100) / 100,
        CAD_to_XOF: Math.round(cadToXof * 10) / 10,
        lastUpdated: dateStr,
        isLive: true,
        sourceName: 'ExchangeRate-API (En direct)'
      };
    }
  } catch (error) {
    console.warn(
      "Impossible de joindre l'API de taux en direct, utilisation du taux de repli:",
      error
    );
  }

  return FALLBACK_RATES;
}
