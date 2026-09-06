// Point d'entrée content script (MV3) — orchestre tout le pipeline local.
// Détection SPA (content-detection) → lecture DOM → parseListing →
// normalizeListing → FX live/fallback → calculateSimulation → overlay.
// Calcul 100 % local, aucun backend. Zéro sélecteur par classes FB hashées.

import React from 'react';
import { observeListingId, getListingIdFromUrl } from './content-detection';
import { axcLog, isVerbose } from './logger';
import { chooseTextSource, visibleText } from './domSource';
import { parseListing, type RawListing } from './parser';
import { normalizeListing, type NormalizedInputs } from './normalize';
import { calculateSimulation } from './engine/calculationEngine';
import { DEFAULT_CONFIG } from './engine/defaultData';
import { EXTENSION_ENGINE_VERSION } from './engine/version';
import { fetchLiveFxRates } from './fx';
import { buildPrefillUrl } from './prefill';
import { loadExtensionOptions } from './options';
import { mountNode, mountOverlay, mountOverlaySkeleton, unmountOverlay } from './content';
import { RejectionBlock } from './overlay-states';
import type { DestinationCountry, GlobalReferenceConfig } from './engine/types';

let currentInputs: NormalizedInputs | null = null;
let currentFxLive = false;
let currentBaseUrl = 'http://localhost:3000';
let currentDestination: DestinationCountry = 'senegal';
let runToken = 0;
/** Dernier `{id}::{h1}` traité jusqu'au bout + succès (overlay monté). */
let lastSettledKey: string | null = null;
let lastSettleOk = false;
/** ID de la dernière annonce montée avec succès (anti-boucle). */
let lastSettledId: string | null = null;

const YEAR_IN_H1_RE = /(19[89]\d|20[0-2]\d)/;

/** true si un h1 du DOM porte déjà une année (titre d'annonce rendu). */
function hasYearH1(): boolean {
  try {
    return Array.from(document.querySelectorAll('h1')).some((el) =>
      YEAR_IN_H1_RE.test(el.textContent ?? ''),
    );
  } catch {
    return true; // DOM illisible : ne pas bloquer, le parser tranchera.
  }
}

function readDom(listingId: string): { h1: string; h1Candidates: string[]; bodyText: string; source: 'main' | 'body'; headings: Array<{ tag: string; text: string }> } {
  // Le premier h1 du DOM n'est pas toujours le titre de l'annonce sur FB :
  // on prefere le h1 contenant une annee (titre "2013 Lexus is", jamais le
  // logo ni un titre de section). Les autres h1 servent d'ancres de repli.
  const h1Texts = Array.from(document.querySelectorAll('h1'))
    .map((el) => (el.textContent ?? '').trim())
    .filter(Boolean);
  const h1 = h1Texts.find((t) => /(19[89]\d|20[0-2]\d)/.test(t)) ?? h1Texts[0] ?? '';
  // Le <main> ne contient pas toujours la colonne annonce sur FB ; le choix
  // main/body se fait sur la présence des ancres H1 (domSource, testé).
  // IMPORTANT : texte VISIBLE (innerText) — textContent inclut les <script>
  // (~150 Ko de JS inline en tête de body sur FB : prix introuvable et faux
  // positifs type "8Us" pris pour du $US).
  const mainText = visibleText(document.querySelector('main'));
  const bodyFull = visibleText(document.body);
  const { text, source } = chooseTextSource(mainText, bodyFull, h1Texts);
  const bodyText = text.slice(0, 150000);
  const headings = Array.from(document.querySelectorAll('h1, h2'))
    .slice(0, 20)
    .map((el) => ({ tag: el.tagName.toLowerCase(), text: (el.textContent ?? '').trim().slice(0, 120) }));
  void listingId;
  return { h1, h1Candidates: h1Texts.slice(0, 8), bodyText, source, headings };
}

/**
 * Attend le rendu du titre (un h1 avec année) après une navigation SPA :
 * Facebook bascule l'URL avant d'afficher le contenu, et parser la coquille
 * transitoire ("Notifications", 59 car.) donne un faux NOT_VEHICLE qui
 * restait collé. Rapide si le contenu est déjà là, borné sinon (le parser
 * tranche : année en bloc, ou vrai rejet). Le skeleton reste affiché.
 */
async function waitForTitleYear(token: number, timeoutMs = 4000): Promise<void> {
  if (hasYearH1()) return;
  axcLog.debug('titre non rendu, attente…');
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (token !== runToken) return;
    await new Promise((r) => setTimeout(r, 250));
    if (token !== runToken) return;
    if (hasYearH1()) {
      axcLog.debug('titre rendu après attente', { ms: Date.now() - start });
      return;
    }
  }
  axcLog.debug('attente titre dépassée, parse quand même');
}

function mountRejection(message: string, code: RawListing['rejection']): void {
  mountNode(
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <RejectionBlock rejection={code ? { code: code.code, message } : null} />
    </div>,
    'rejected',
  );
}

async function runPipeline(listingId: string): Promise<void> {
  const token = ++runToken;
  axcLog.info('pipeline start', { listingId });
  mountOverlaySkeleton('Analyse de l’annonce…');
  try {
    const opts = await loadExtensionOptions().catch((e) => {
      axcLog.warn('options illisibles, défauts utilisés', e instanceof Error ? e.message : e);
      return null;
    });
    currentBaseUrl = opts?.baseUrl ?? 'http://localhost:3000';
    currentDestination = opts?.destination ?? 'senegal';
    axcLog.debug('options', { baseUrl: currentBaseUrl, destination: currentDestination });

    // Navigation SPA : l'URL bascule avant le rendu. On attend le titre
    // (remplace l'ancien retry aveugle de 1.5 s).
    await waitForTitleYear(token);
    if (token !== runToken) return;

    const dom = readDom(listingId);
    axcLog.debug('DOM lu', { h1: dom.h1.slice(0, 80), h1Count: dom.h1Candidates.length, bodyLen: dom.bodyText.length, headings: dom.headings.length, source: dom.source });
    if (isVerbose()) {
      const anchorAt = dom.h1.trim() ? dom.bodyText.indexOf(dom.h1.trim()) : -1;
      const dollarAt = dom.bodyText.indexOf('$');
      axcLog.debug('ancrage H1', anchorAt >= 0 ? `trouvé à ${anchorAt}` : 'INTROUVABLE dans le texte');
      axcLog.debug(
        'snippet prix',
        dollarAt >= 0
          ? dom.bodyText.slice(Math.max(0, dollarAt - 150), dollarAt + 150)
          : '(aucun "$" dans le texte — format prix inattendu, copier ce log)',
      );
    }
    if (!dom.h1 && dom.bodyText.length < 200) {
      axcLog.warn('DOM quasi vide après attente, parse quand même');
    }
    const url = window.location.href;
    const raw = parseListing({ h1: dom.h1, h1Candidates: dom.h1Candidates, bodyText: dom.bodyText, headings: dom.headings, url, listingId });
    if (token !== runToken) return;
    axcLog.info('parse', raw.rejection
      ? { rejection: raw.rejection.code, message: raw.rejection.message }
      : { title: raw.titleH1, price: raw.priceValue, currency: raw.currencyFlag, city: raw.city, km: raw.mileageKm, year: raw.yearInTitle ?? raw.yearInBlock });
    if (raw.priceFallbackWholeText && !raw.rejection) {
      axcLog.warn('prix trouve par balayage integral (ancre H1 introuvable) — verifier le montant');
    }

    if (raw.rejection) {
      mountRejection(raw.rejection.message, raw.rejection);
      currentInputs = null;
      settle(listingId, dom.h1, false);
      return;
    }

    const norm = normalizeListing(raw, { destination: currentDestination });
    if (token !== runToken) return;
    if (!norm.ok) {
      axcLog.info('normalize rejet', { code: norm.rejection.code, message: norm.rejection.message });
      mountRejection(norm.rejection.message, { code: norm.rejection.code, message: norm.rejection.message });
      currentInputs = null;
      settle(listingId, dom.h1, false);
      return;
    }
    currentInputs = norm.inputs;
    if (norm.warnings.length > 0) axcLog.debug('normalize warnings', norm.warnings);
    axcLog.debug('vehicle', { ...currentInputs.vehicle });

    // FX live optionnel, fallback barèmes (pastille Référence).
    let config: GlobalReferenceConfig = DEFAULT_CONFIG;
    currentFxLive = false;
    try {
      const live = await fetchLiveFxRates();
      if (token !== runToken) return;
      if (live.isLive) {
        currentFxLive = true;
        axcLog.debug('FX live', { MAD: live.CAD_to_MAD, XOF: live.CAD_to_XOF });
        config = {
          ...DEFAULT_CONFIG,
          fxRates: { ...DEFAULT_CONFIG.fxRates, CAD_to_MAD: live.CAD_to_MAD, CAD_to_XOF: live.CAD_to_XOF, lastUpdated: live.lastUpdated, isLive: true },
        };
      } else {
        axcLog.debug('FX fallback barèmes (hors ligne)');
      }
    } catch (e) {
      currentFxLive = false;
      axcLog.warn('FX indisponible, barèmes locaux', e instanceof Error ? e.message : e);
    }

    const sim = calculateSimulation(
      currentInputs.vehicle,
      currentInputs.destination,
      currentInputs.financing,
      currentInputs.transport,
      currentInputs.customs,
      currentInputs.targetMarginPercent,
      config,
    );
    if (token !== runToken) return;

    axcLog.info('calcul OK', {
      landedCad: sim.breakdown.landedCostCad,
      profitCad: sim.estimatedNetProfitCad,
      eligible: sim.isEligible,
      severity: sim.eligibilitySeverity,
      fx: currentFxLive ? 'live' : 'reference',
    });
    mountOverlay({
      sim,
      raw,
      fxLive: currentFxLive,
      engineVersion: EXTENSION_ENGINE_VERSION,
      onToggleCountry: (next) => {
        void retoggle(next, raw);
      },
      onClose: () => unmountOverlay(),
      onMinimize: () => undefined,
      onComplete: (prefillUrl) => {
        const target = prefillUrl || safePrefillUrl();
        if (target) window.open(target, '_blank', 'noopener');
      },
    });
    settle(listingId, dom.h1, true);
  } catch (e) {
    if (token !== runToken) return;
    axcLog.error('pipeline exception', e instanceof Error ? `${e.name}: ${e.message}` : e);
    mountRejection(e instanceof Error ? e.message : 'Analyse impossible.', null);
    settle(listingId, null, false);
  }
}

/** Mémorise le dernier `{id}::{h1}` traité : un changement de h1 ultérieur
 *  pour le même ID ne relance le pipeline que si le précédent run n'a pas
 *  abouti à un overlay (anti-boucle sur h1 instables, ex. compteurs). */
function settle(listingId: string, h1: string | null, ok: boolean): void {
  lastSettledKey = h1 ? `${listingId}::${h1}` : null;
  lastSettleOk = ok;
  lastSettledId = ok ? listingId : lastSettledId === listingId ? null : lastSettledId;
}

function safePrefillUrl(): string {
  if (!currentInputs) return '';
  try {
    return buildPrefillUrl(currentBaseUrl, currentInputs, {
      listingId: getListingIdFromUrl(window.location.href) ?? '',
      listingUrl: window.location.href,
      listingTitle: document.querySelector('h1')?.textContent?.trim() ?? '',
      engineVersion: EXTENSION_ENGINE_VERSION,
    });
  } catch {
    return '';
  }
}

async function retoggle(next: DestinationCountry, raw: RawListing): Promise<void> {
  currentDestination = next;
  const norm = normalizeListing(raw, { destination: next });
  if (!norm.ok || !currentInputs) return;
  currentInputs = { ...norm.inputs, financing: currentInputs.financing, targetMarginPercent: currentInputs.targetMarginPercent };
  const sim = calculateSimulation(
    currentInputs.vehicle, currentInputs.destination, currentInputs.financing,
    currentInputs.transport, currentInputs.customs, currentInputs.targetMarginPercent, DEFAULT_CONFIG,
  );
  mountOverlay({
    sim, raw, fxLive: currentFxLive, engineVersion: EXTENSION_ENGINE_VERSION,
    onToggleCountry: (n) => { void retoggle(n, raw); },
    onClose: () => unmountOverlay(), onMinimize: () => undefined,
    onComplete: (u) => { const t = u || safePrefillUrl(); if (t) window.open(t, '_blank', 'noopener'); },
  });
}

function boot(): void {
  axcLog.info('content script injecté', { url: window.location.href, verbose: 'console: __axcDebug(true) ou ?axcdebug=1' });
  // L'observer émet immédiatement l'état initial (force=true) : pas d'appel
  // direct à runPipeline ici (sinon double exécution à chaque chargement).
  observeListingId(({ id, h1 }) => {
    if (!id) {
      axcLog.debug('navigation SPA (hors annonce)');
      runToken++;
      unmountOverlay();
      lastSettledKey = null;
      lastSettleOk = false;
      lastSettledId = null;
      return;
    }
    // Annonce déjà montée avec succès : les fluctuations du h1 pendant le
    // rendu FB ne doivent pas tout recalculer (le toggle pays passe par
    // retoggle, pas par ici). Un run non abouti, lui, est toujours repris.
    if (lastSettleOk && lastSettledId === id) {
      axcLog.debug('maj post-montage ignorée', { id, h1: h1.slice(0, 60) });
      return;
    }
    axcLog.debug('navigation SPA', id);
    void runPipeline(id);
  });
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') boot();
