// AGENT-05 — Page d'options : BASE URL app + défauts destination/méthode.
// Persistés via chrome.storage.local. Aucun réseau, aucun calcul.
// Accès chrome via globalThis (aucune dépendance @types/chrome requise).

import type { DestinationCountry, FinancingMethod } from './engine/types';

export interface ExtensionOptions {
  baseUrl: string;
  destination: DestinationCountry;
  transferMethod: FinancingMethod;
}

// Dev URL Replit utilisée tant que l’application n’a pas encore de domaine publié.
// Elle reste modifiable depuis la page Options de l’extension.
export const DEFAULT_APP_URL = 'https://affd2521-e15e-41f1-9f07-2c61358ea6ec-00-2bj9x15jf2i1i.picard.replit.dev';

export const DEFAULT_OPTIONS: ExtensionOptions = {
  baseUrl: DEFAULT_APP_URL,
  destination: 'senegal',
  transferMethod: 'plateforme_transfert',
};

const STORAGE_KEY_BASE_URL = 'axcBaseUrl';
const STORAGE_KEY_DESTINATION = 'axcDestination';
const STORAGE_KEY_METHOD = 'axcTransferMethod';

const VALID_DESTINATIONS: DestinationCountry[] = ['senegal', 'maroc'];
const VALID_METHODS: FinancingMethod[] = [
  'virement_bancaire',
  'plateforme_transfert',
  'interac_autre',
];

interface AxcStorageArea {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

const memoryFallback = new Map<string, unknown>();

function getStorageArea(): AxcStorageArea | null {
  const g = globalThis as unknown as {
    chrome?: { storage?: { local?: AxcStorageArea } };
  };
  return g.chrome?.storage?.local ?? null;
}

function isLocalhostUrl(value: unknown): boolean {
  if (typeof value !== 'string' || value.trim() === '') return false;
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0';
  } catch {
    return false;
  }
}

/** Normalise l'URL (http/https uniquement, sans slash final). Lève si invalide. */
export function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  const url = new URL(trimmed);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('URL http(s) requise');
  }
  return url.toString().replace(/\/+$/, '');
}

export function sanitizeOptions(partial: Partial<ExtensionOptions>): ExtensionOptions {
  let baseUrl = DEFAULT_OPTIONS.baseUrl;
  try {
    if (partial.baseUrl) baseUrl = normalizeBaseUrl(partial.baseUrl);
  } catch {
    baseUrl = DEFAULT_OPTIONS.baseUrl;
  }
  return {
    baseUrl,
    destination: partial.destination && VALID_DESTINATIONS.includes(partial.destination)
      ? partial.destination
      : DEFAULT_OPTIONS.destination,
    transferMethod: partial.transferMethod && VALID_METHODS.includes(partial.transferMethod)
      ? partial.transferMethod
      : DEFAULT_OPTIONS.transferMethod,
  };
}

export async function loadExtensionOptions(): Promise<ExtensionOptions> {
  const area = getStorageArea();
  if (!area) {
    const rawBaseUrl = memoryFallback.get(STORAGE_KEY_BASE_URL) as string | undefined;
    const options = sanitizeOptions({
      baseUrl: isLocalhostUrl(rawBaseUrl) ? DEFAULT_APP_URL : rawBaseUrl,
      destination: memoryFallback.get(STORAGE_KEY_DESTINATION) as
        | DestinationCountry
        | undefined,
      transferMethod: memoryFallback.get(STORAGE_KEY_METHOD) as FinancingMethod | undefined,
    });
    if (isLocalhostUrl(rawBaseUrl)) memoryFallback.set(STORAGE_KEY_BASE_URL, options.baseUrl);
    return options;
  }
  const stored = await area.get([
    STORAGE_KEY_BASE_URL,
    STORAGE_KEY_DESTINATION,
    STORAGE_KEY_METHOD,
  ]);
  const rawBaseUrl = stored[STORAGE_KEY_BASE_URL] as string | undefined;
  const options = sanitizeOptions({
    baseUrl: isLocalhostUrl(rawBaseUrl) ? DEFAULT_APP_URL : rawBaseUrl,
    destination: stored[STORAGE_KEY_DESTINATION] as DestinationCountry | undefined,
    transferMethod: stored[STORAGE_KEY_METHOD] as FinancingMethod | undefined,
  });
  if (isLocalhostUrl(rawBaseUrl)) await area.set({ [STORAGE_KEY_BASE_URL]: options.baseUrl });
  return options;
}

export async function saveExtensionOptions(options: ExtensionOptions): Promise<ExtensionOptions> {
  const clean = sanitizeOptions(options);
  const area = getStorageArea();
  if (!area) {
    memoryFallback.set(STORAGE_KEY_BASE_URL, clean.baseUrl);
    memoryFallback.set(STORAGE_KEY_DESTINATION, clean.destination);
    memoryFallback.set(STORAGE_KEY_METHOD, clean.transferMethod);
    return clean;
  }
  await area.set({
    [STORAGE_KEY_BASE_URL]: clean.baseUrl,
    [STORAGE_KEY_DESTINATION]: clean.destination,
    [STORAGE_KEY_METHOD]: clean.transferMethod,
  });
  return clean;
}

// --- Câblage DOM (options.html) -------------------------------------------------

function getInput(id: string): HTMLInputElement | HTMLSelectElement | null {
  if (typeof document === 'undefined') return null;
  return document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
}

async function initOptionsPage(): Promise<void> {
  const baseUrlEl = getInput('axc-base-url');
  const destinationEl = getInput('axc-destination');
  const methodEl = getInput('axc-method');
  const form = typeof document !== 'undefined'
    ? document.getElementById('axc-options-form')
    : null;
  const status = typeof document !== 'undefined'
    ? document.getElementById('axc-status')
    : null;
  if (!baseUrlEl || !destinationEl || !methodEl || !form) return;

  const current = await loadExtensionOptions();
  baseUrlEl.value = current.baseUrl;
  destinationEl.value = current.destination;
  methodEl.value = current.transferMethod;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    void (async () => {
      try {
        const saved = await saveExtensionOptions({
          baseUrl: baseUrlEl.value,
          destination: destinationEl.value as DestinationCountry,
          transferMethod: methodEl.value as FinancingMethod,
        });
        baseUrlEl.value = saved.baseUrl;
        if (status) status.textContent = 'Options enregistrées (stockage local).';
      } catch {
        if (status) status.textContent = 'URL invalide : http(s) requis (défaut restauré).';
      }
    })();
  });
}

if (typeof document !== 'undefined') {
  void initOptionsPage();
}
