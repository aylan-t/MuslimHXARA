// Logger de diagnostic — préfixe [AutoTransatQC], console + magasin persistant
// (consultable via le popup, clic icône). Zéro dépendance métier.
// Mode verbeux : chrome.storage axc_debug = "1" (toggle popup) OU
// localStorage.axc_debug = "1" OU ?axcdebug=1 / #axcdebug dans l'URL.
// Les erreurs passent toujours ; le détail du pipeline passe en verbeux.

import { appendLog, type AxcLogLevel } from './logStore';

const PREFIX = '[AutoTransatQC]';
const DEBUG_STORAGE_KEY = 'axc_debug';

/** Cache du flag chrome.storage (lu async au boot, suivi via onChanged). */
let cachedStorageDebug = false;

function readStorageArea(): {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
} | null {
  try {
    const g = globalThis as unknown as {
      chrome?: { storage?: { local?: { get(k: string[]): Promise<Record<string, unknown>>; set(i: Record<string, unknown>): Promise<void> } } };
    };
    return g.chrome?.storage?.local ?? null;
  } catch {
    return null;
  }
}

async function initStorageDebug(): Promise<void> {
  try {
    const v = (await readStorageArea()?.get([DEBUG_STORAGE_KEY]))?.[DEBUG_STORAGE_KEY];
    cachedStorageDebug = v === '1' || v === true;
  } catch {
    cachedStorageDebug = false;
  }
}

try {
  void initStorageDebug();
  const g = globalThis as unknown as {
    chrome?: { storage?: { onChanged?: { addListener(cb: (c: Record<string, { newValue?: unknown }>) => void): void } } };
  };
  g.chrome?.storage?.onChanged?.addListener((changes) => {
    try {
      if (DEBUG_STORAGE_KEY in changes) {
        const v = changes[DEBUG_STORAGE_KEY]?.newValue;
        cachedStorageDebug = v === '1' || v === true;
      }
    } catch {
      /* non critique */
    }
  });
} catch {
  /* environnements sans chrome.storage */
}

function readLocalFlag(): boolean {
  try {
    return (
      typeof localStorage !== 'undefined' && localStorage.getItem('axc_debug') === '1'
    );
  } catch {
    return false;
  }
}

function readUrlFlag(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const href = window.location.href;
    const q = href.split('#', 2)[1] ?? '';
    const query = href.split('?', 2)[1]?.split('#', 1)[0] ?? '';
    return /(?:^|[&#])axcdebug=1(?:[&#]|$)/.test(`?${query}#${q}`);
  } catch {
    return false;
  }
}

/** true si logs détaillés demandés (changeable sans recharger l'extension). */
export function isVerbose(): boolean {
  return cachedStorageDebug || readLocalFlag() || readUrlFlag();
}

/** Active/désactive le mode verbeux persistant (console : __axcDebug(true)).
 *  Écrit à la fois en localStorage (page) et chrome.storage (popup + onglets). */
export function setVerbose(on: boolean): void {
  try {
    if (on) localStorage.setItem('axc_debug', '1');
    else localStorage.removeItem('axc_debug');
  } catch {
    /* stockage indisponible : le flag URL reste utilisable */
  }
  try {
    cachedStorageDebug = on;
    void readStorageArea()?.set({ axc_debug: on ? '1' : '0' });
  } catch {
    /* non critique */
  }
}

function fmtArgs(args: unknown[]): unknown[] {
  return args.map((a) => {
    if (typeof a === 'string') return a;
    try {
      return JSON.stringify(a);
    } catch {
      return String(a);
    }
  });
}

function store(lvl: AxcLogLevel, args: unknown[]): void {
  try {
    appendLog(lvl, fmtArgs(args).join(' '));
  } catch {
    /* diagnostic non critique */
  }
}

export const axcLog = {
  info(...args: unknown[]): void {
    console.info(PREFIX, ...fmtArgs(args));
    store('info', args);
  },
  debug(...args: unknown[]): void {
    if (isVerbose()) console.log(`${PREFIX}[debug]`, ...fmtArgs(args));
    if (isVerbose()) store('debug', args);
  },
  warn(...args: unknown[]): void {
    console.warn(PREFIX, ...fmtArgs(args));
    store('warn', args);
  },
  error(...args: unknown[]): void {
    console.error(PREFIX, ...fmtArgs(args));
    store('error', args);
  },
};

// Expose __axcDebug(true/false) pour activer les logs depuis la console FB.
try {
  (globalThis as unknown as Record<string, unknown>).__axcDebug = setVerbose;
} catch {
  /* non critique */
}
