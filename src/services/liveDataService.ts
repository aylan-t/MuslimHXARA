export interface LiveFxResult {
  CAD_to_MAD: number;
  CAD_to_XOF: number;
  lastUpdated: string;
  isLive: boolean;
  sourceName: string;
  officialSourceUrl?: string;
  providerUpdatedAt?: string | null;
  nextUpdateAt?: string | null;
  fetchedAt?: string;
  cacheStatus?: 'live' | 'cached';
}

/**
 * Récupère le dernier taux de marché publié depuis le backend.
 * L’API renvoie aussi la date de cotation; aucune valeur locale n’est
 * substituée silencieusement si la source est indisponible.
 */
export async function fetchLiveFxRates(forceRefresh = false): Promise<LiveFxResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`/api/fx-rates${forceRefresh ? '?refresh=1' : ''}`, {
      signal: controller.signal,
      cache: 'no-store'
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`HTTP ${res.status}: ${detail}`);
    }
    return await res.json() as LiveFxResult;
  } finally {
    clearTimeout(timeoutId);
  }
}

