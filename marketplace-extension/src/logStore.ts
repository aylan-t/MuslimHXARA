// Magasin persistant des logs — consultable depuis le popup (clic icône).
// Le content script écrit ici (miroir chrome.storage.local), le popup lit.
// Zéro dépendance (ne pas importer logger.ts : cycle). Tout accès chrome
// est défensif (tests Node, aperçu popup hors extension).

export type AxcLogLevel = 'info' | 'debug' | 'warn' | 'error';

export interface AxcLogEntry {
  t: number;
  lvl: AxcLogLevel;
  msg: string;
}

export const AXC_LOGS_KEY = 'axcLogs';
/** Plafond conservé (mémoire + stockage) : ~300 lignes ≈ quelques Ko. */
export const AXC_LOGS_CAP = 300;

function isValidEntry(e: unknown): e is AxcLogEntry {
  if (typeof e !== 'object' || e === null) return false;
  const r = e as Record<string, unknown>;
  return (
    typeof r.t === 'number' &&
    (r.lvl === 'info' || r.lvl === 'debug' || r.lvl === 'warn' || r.lvl === 'error') &&
    typeof r.msg === 'string'
  );
}

/** Normalise des données brutes (stockage) en entrées valides, capées. Pure, testée. */
export function normalizeStoredLogs(raw: unknown, cap: number = AXC_LOGS_CAP): AxcLogEntry[] {
  if (!Array.isArray(raw)) return [];
  const valid = raw.filter(isValidEntry);
  return valid.length > cap ? valid.slice(valid.length - cap) : valid;
}

interface AxcStorageArea {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
}

function getArea(): AxcStorageArea | null {
  try {
    const g = globalThis as unknown as {
      chrome?: { storage?: { local?: AxcStorageArea } };
    };
    return g.chrome?.storage?.local ?? null;
  } catch {
    return null;
  }
}

const mem: AxcLogEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

async function flush(): Promise<void> {
  flushTimer = null;
  const area = getArea();
  if (!area || mem.length === 0) return;
  const pending = mem.splice(0, mem.length);
  try {
    const stored = await area.get([AXC_LOGS_KEY]);
    const merged = normalizeStoredLogs(
      [...normalizeStoredLogs(stored[AXC_LOGS_KEY]), ...pending],
      AXC_LOGS_CAP,
    );
    await area.set({ [AXC_LOGS_KEY]: merged });
  } catch {
    // Stockage indisponible : on remet en mémoire (capée), sans boucle infinie.
    mem.push(...pending.slice(-AXC_LOGS_CAP));
    if (mem.length > AXC_LOGS_CAP) mem.splice(0, mem.length - AXC_LOGS_CAP);
  }
}

function scheduleFlush(): void {
  if (flushTimer !== null) return;
  try {
    flushTimer = setTimeout(() => {
      void flush();
    }, 1200);
  } catch {
    /* timers indisponibles : mémoire seule */
  }
}

/** Ajoute une entrée (mémoire immédiate + miroir stockage différé). Ne throw jamais. */
export function appendLog(lvl: AxcLogLevel, msg: string): void {
  try {
    mem.push({ t: Date.now(), lvl, msg });
    if (mem.length > AXC_LOGS_CAP) mem.splice(0, mem.length - AXC_LOGS_CAP);
    scheduleFlush();
  } catch {
    /* diagnostic non critique */
  }
}

/** Lit les logs (mémoire + stockage), triés par heure croissante. Ne throw jamais. */
export async function readLogs(): Promise<AxcLogEntry[]> {
  try {
    const area = getArea();
    if (!area) return [...mem];
    const stored = await area.get([AXC_LOGS_KEY]);
    return normalizeStoredLogs([...normalizeStoredLogs(stored[AXC_LOGS_KEY]), ...mem]);
  } catch {
    return [...mem];
  }
}

/** Vide les logs (mémoire + stockage). Ne throw jamais. */
export async function clearLogs(): Promise<void> {
  mem.length = 0;
  try {
    await getArea()?.remove([AXC_LOGS_KEY]);
  } catch {
    /* non critique */
  }
}
