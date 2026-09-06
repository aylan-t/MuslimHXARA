// marketplace-extension/src/content.tsx
// AGENT-04 — PARTIE MONTAGE uniquement.
// - Monte l'overlay sous `#axc-overlay` (div isolée, positionnement owned ici).
// - Skeleton pendant le calcul, démontage propre.
// - NE PAS implémenter ici : détection SPA / observation `h1` / re-parse sur
//   `listingId` (AGENT-02, `parser.ts`), ni contrôles avancés / styles scopés
//   (AGENT-05, `overlay.css`). Ce module ne fait AUCUN calcul et AUCUN réseau :
//   le parent fournit `sim` déjà calculé via `calculateSimulation()`.

import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AutoTransatOverlay, type AutoTransatOverlayProps } from './overlay';
import { axcLog } from './logger';
// Styles embarqués en ligne (bundle IIFE : aucun fichier externe, MV3 OK).
import overlayCss from './overlay.css?inline';
import bridgeCss from './axc-bridge.css?inline';

/** Ancre unique de l'extension (scope CSS `#axc-overlay` — cf. AGENT-05). */
export const AXC_OVERLAY_HOST_ID = 'axc-overlay';

export type OverlayMountProps = AutoTransatOverlayProps;

let hostEl: HTMLElement | null = null;
let reactRoot: Root | null = null;

/**
 * Crée (ou réutilise) l'hôte isolé. Positionnement panneau fixe droit ~400 px,
 * `z-index` max au-dessus de FB. Laisse le bas de page libre pour ne pas
 * piéger le scroll / les CTA vendeur (QA finale AGENT-06).
 */
function ensureHost(): HTMLElement {
  if (hostEl && document.contains(hostEl)) return hostEl;
  const existing = document.getElementById(AXC_OVERLAY_HOST_ID);
  if (existing instanceof HTMLElement) {
    hostEl = existing;
    return hostEl;
  }
  const host = document.createElement('div');
  host.id = AXC_OVERLAY_HOST_ID;
  host.setAttribute('data-axc-state', 'ready');
  host.setAttribute('style',
    'position:fixed;' +
    'top:64px;right:0;bottom:0;' +
    'width:400px;max-width:100vw;' +
    'overflow-y:auto;' +
    'z-index:2147483647;'
  );
  document.documentElement.appendChild(host);
  hostEl = host;
  ensureAxcStyles(host);
  return host;
}

/** Injecte les styles embarqués (une seule fois par document).
 *  DANS <head> et non dans l'hôte : React createRoot supprime tous les
 *  enfants pré-existants du conteneur au premier rendu (dont un <style>),
 *  ce qui effaçait les styles 1 ms après injection (flash navy puis
 *  transparent). Le scope #axc-overlay garantit zéro fuite vers Facebook. */
export function ensureAxcStyles(host: HTMLElement): void {
  void host;
  try {
    if (document.querySelector('style[data-axc]')) {
      axcLog.debug('styles déjà présents (head)');
      return;
    }
    const css = overlayCss + '\n' + bridgeCss;
    const style = document.createElement('style');
    style.setAttribute('data-axc', '1');
    style.textContent = css;
    (document.head ?? document.documentElement).prepend(style);
    axcLog.debug('styles injectés (head)', { cssLen: css.length });
  } catch (e) {
    axcLog.warn('styles non injectés', e instanceof Error ? e.message : e);
  }
}

/** Vérifie après peinture que les styles sont appliqués (preuve loggée). */
function logPaintCheck(stage: string): void {
  try {
    const run = () => {
      try {
        const styleTags = document.querySelectorAll('style[data-axc]').length;
        const host = document.getElementById(AXC_OVERLAY_HOST_ID);
        const hostBg = host ? getComputedStyle(host).backgroundColor : '(sans hôte)';
        axcLog.debug('check styles', { stage, styleTags, hostBg });
      } catch { /* ignore */ }
    };
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => setTimeout(run, 60));
    } else {
      setTimeout(run, 120);
    }
  } catch { /* ignore */ }
}

function ensureRoot(host: HTMLElement): Root {
  if (!reactRoot) reactRoot = createRoot(host);
  return reactRoot;
}

/**
 * Monte un nœud quelconque avec la racine React unique (évite les conflits
 * de createRoot multiples sur le même hôte). Idempotent.
 */
export function mountNode(node: React.ReactNode, state = 'ready'): () => void {
  const host = ensureHost();
  host.setAttribute('data-axc-state', state);
  ensureRoot(host).render(node);
  logPaintCheck(state);
  return unmountOverlay;
}

/**
 * Monte (ou met à jour) l'overlay avec une simulation prête.
 * Idempotent : ré-appeler avec de nouveaux `props` (ex. toggle SN/MA recalculé
 * par le parent) re-rend sans recréer l'hôte. Retourne `unmountOverlay`.
 */
export function mountOverlay(props: OverlayMountProps): () => void {
  axcLog.debug('mount overlay', { dest: props.sim.destination, landed: props.sim.breakdown.landedCostCad });
  return mountNode(<AutoTransatOverlay {...props} />, 'ready');
}

const SKELETON_BLOCKS = ['62%', '88%', '74%', '95%', '70%'];

/** Skeleton affiché pendant parse + normalize + `calculateSimulation()`. */
function OverlaySkeleton({ message }: { message: string }): React.ReactElement {
  return (
    <div
      className="axc-panel axc-skeleton w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl"
      style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
      role="status"
      aria-label={message}
    >
      <div className="mb-3 h-5 w-2/3 rounded bg-slate-200" />
      <div className="mb-2 h-9 w-full rounded-xl bg-slate-100" />
      {SKELETON_BLOCKS.map((w, i) => (
        <div key={i} className="mb-2 h-4 rounded bg-slate-100" style={{ width: w }} />
      ))}
      <p className="mt-3 text-xs font-semibold text-slate-500">{message}</p>
    </div>
  );
}

/** Monte le skeleton de chargement (avant `sim` disponible). */
export function mountOverlaySkeleton(message = 'Calcul AutoTransat QC en cours…'): () => void {
  return mountNode(<OverlaySkeleton message={message} />, 'loading');
}

/** Démonte proprement : unmount React + suppression de l'hôte. */
export function unmountOverlay(): void {
  try {
    reactRoot?.unmount();
  } finally {
    reactRoot = null;
    hostEl?.remove();
    hostEl = null;
  }
}
