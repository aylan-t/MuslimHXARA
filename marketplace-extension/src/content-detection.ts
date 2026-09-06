// marketplace-extension/src/content-detection.ts — AGENT-02 (detection only)
// Observe la navigation SPA de Facebook Marketplace et signale les changements
// d'annonce. PAS d'overlay ici (reserve AGENT-04/05) : ce module ne fait que
// detecter le listingId courant et notifier.
//
// Strategie (spec §5.1) :
// - `listingId` extrait de l'URL `/marketplace/item/<id>` (jamais du DOM) ;
// - patch `history.pushState` / `history.replaceState` + ecoute `popstate`
//   (navigation SPA sans reload) ;
// - `MutationObserver` sur le `h1` (balise stable — JAMAIS de selecteur par
//   classes x… hashees) pour detecter les transitions inter-annonces ;
// - hors `/marketplace/item/` -> notifie `null` (l'appelant doit demonter).

import { axcLog } from './logger';

export interface ListingChange {
  /** null hors page annonce (l'appelant doit démonter). */
  id: string | null;
  /** Texte du premier h1 (témoin de rendu, pas une donnée métier). */
  h1: string;
}

export type ListingChangeHandler = (change: ListingChange) => void;
const ITEM_RE = /\/marketplace\/item\/(\d+)/;

/** Extrait le listingId d'une URL, ou `null` hors page annonce. */
export function getListingIdFromUrl(url: string): string | null {
  const m = ITEM_RE.exec(url);
  return m ? m[1] : null;
}

/** Vrai si l'URL est une page annonce (overlay autorise a vivre). */
export function isListingUrl(url: string): boolean {
  return ITEM_RE.test(url);
}

function currentH1Text(): string {
  if (typeof document === 'undefined') return '';
  return (document.querySelector('h1')?.textContent ?? '').trim();
}

/**
 * Observe les changements d'annonce. `onChange` reçoit `{id, h1}` :
 * - `id` null quand on quitte `/marketplace/item/` ;
 * - émis quand l'ID change (immédiat) MAIS AUSSI quand le h1 change à ID
 *   égal (debouncé) : en navigation SPA, l'URL bascule avant le rendu du
 *   contenu, et parser le DOM transitoire donne un faux NOT_VEHICLE collé.
 * Retourne `stop()` qui debranche l'observer et restaure `history`.
 */
export function observeListingId(onChange: ListingChangeHandler): () => void {
  let lastId: string | null | undefined;
  let lastH1 = currentH1Text();
  let raf = 0;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const emit = (id: string | null, h1: string, reason: string): void => {
    axcLog.debug('emit listing', { from: lastId ?? null, to: id, reason });
    lastId = id;
    lastH1 = h1;
    onChange({ id, h1 });
  };

  const clearDebounce = (): void => {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  };

  // Notifie après stabilisation du h1 (rendu FB en cours) : coalesce les
  // rafales de mutations d'une transition en une seule émission tardive.
  const scheduleH1Emit = (): void => {
    if (stopped || typeof window === 'undefined') return;
    clearDebounce();
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      if (stopped || typeof window === 'undefined') return;
      const id = getListingIdFromUrl(window.location.href);
      const h1 = currentH1Text();
      if (id !== lastId || h1 !== lastH1) emit(id, h1, 'h1-settle');
    }, 350);
  };

  const checkNow = (): void => {
    if (stopped || typeof window === 'undefined') return;
    const id = getListingIdFromUrl(window.location.href);
    const h1 = currentH1Text();
    if (id !== lastId) {
      clearDebounce();
      emit(id, h1, id === null ? 'leave' : 'id-change');
      return;
    }
    if (h1 !== lastH1) scheduleH1Emit();
  };

  const scheduleCheck = (): void => {
    if (stopped || typeof window === 'undefined') return;
    if (raf) return;
    raf = window.requestAnimationFrame(() => {
      raf = 0;
      checkNow();
    });
  };

  // 1) Patch SPA : pushState / replaceState ne declenchent aucun event natif.
  const history = window.history;
  const origPush = history.pushState.bind(history);
  const origReplace = history.replaceState.bind(history);
  history.pushState = (...args: Parameters<History['pushState']>) => {
    origPush(...args);
    scheduleCheck();
  };
  history.replaceState = (...args: Parameters<History['replaceState']>) => {
    origReplace(...args);
    scheduleCheck();
  };
  const onPopState = (): void => scheduleCheck();
  window.addEventListener('popstate', onPopState);

  // 2) MutationObserver : le H1 change a chaque transition inter-annonces.
  const observer =
    typeof MutationObserver !== 'undefined'
      ? new MutationObserver(scheduleCheck)
      : null;
  observer?.observe(document.documentElement, {
    childList: true,
    characterData: true,
    subtree: true,
  });

  // Etat initial (monte ou reste inactif si hors annonce).
  if (typeof window !== 'undefined') {
    const id = getListingIdFromUrl(window.location.href);
    emit(id, currentH1Text(), 'boot');
  }

  return () => {
    stopped = true;
    clearDebounce();
    if (raf) window.cancelAnimationFrame(raf);
    observer?.disconnect();
    window.removeEventListener('popstate', onPopState);
    history.pushState = origPush as History['pushState'];
    history.replaceState = origReplace as History['replaceState'];
  };
}
