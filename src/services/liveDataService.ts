export interface LiveFxResult {
  CAD_to_MAD: number;
  CAD_to_XOF: number;
  lastUpdated: string;
  isLive: boolean;
  sourceName: string;
}

const FALLBACK_RATES: LiveFxResult = {
  CAD_to_MAD: 7.35,
  CAD_to_XOF: 440.0,
  lastUpdated: new Date().toLocaleDateString('fr-CA'),
  isLive: false,
  sourceName: 'Données de référence locales'
};

/**
 * Récupère un taux de marché indicatif depuis une API publique sans clé.
 * Ce taux n'est jamais présenté comme un cours officiel de banque centrale.
 */
export async function fetchLiveFxRates(): Promise<LiveFxResult> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000); // 4s timeout

    const res = await fetch('https://open.er-api.com/v6/latest/CAD', {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}`);
    }

    const data = await res.json();
    if (data && data.rates) {
      const cadToMad = data.rates.MAD || 7.35;

      // Le franc CFA (XOF) est arrimé à l'Euro (1 EUR = 655.957 XOF)
      let cadToXof = data.rates.XOF;
      if (!cadToXof && data.rates.EUR) {
        cadToXof = data.rates.EUR * 655.957;
      }
      if (!cadToXof) {
        cadToXof = 440.0;
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
        sourceName: 'Open Exchange Rates API — taux de marché indicatif'
      };
    }
  } catch (error) {
    console.warn('Impossible de joindre le fournisseur de taux, utilisation d’une référence locale datée:', error);
  }

  return FALLBACK_RATES;
}

