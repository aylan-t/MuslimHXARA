import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Vehicle,
  DestinationCountry,
  FinancingConfig,
  TransportSelection,
  CustomsSelection,
  SimulationResult,
  GlobalReferenceConfig
} from './types';
import { loadStoredConfig, saveStoredConfig } from './services/storageService';
import { calculateSimulation, CURRENT_YEAR } from './services/calculationEngine';
import { fetchLiveFxRates } from './services/liveDataService';
import { parsePrefillFromUrl, type PrefillMeta } from './services/prefill';
import { DEMO_VEHICLE } from './data/defaultData';
import { Header } from './components/common/Header';
import { WizardStepper } from './components/wizard/WizardStepper';
import { StepVehicle } from './components/wizard/StepVehicle';
import { StepDestination } from './components/wizard/StepDestination';
import { StepFinancing } from './components/wizard/StepFinancing';
import { StepTransport } from './components/wizard/StepTransport';
import { ResultsDashboard } from './components/results/ResultsDashboard';
import { CargoContainerBuilder } from './components/batch/CargoContainerBuilder';
import { ContainerOptimizer } from './components/batch/ContainerOptimizer';
import { SimulationHistory } from './components/history/SimulationHistory';
import { ConfigEditor } from './components/admin/ConfigEditor';
import { OfficialSourcesModal } from './components/common/OfficialSourcesModal';
import { VoiceAssistantBubble } from './components/voice/VoiceAssistantBubble';
import type { VoiceAssistantState } from './components/voice/VoiceAssistantBubble';

// Voice kill switch (default OFF): set VITE_VOICE_ASSISTANT_ENABLED=true in
// .env and restart `npm run dev` to show the assistant bubble. When off, no
// mic is requested, no voice loop is created, no voice API call is made.
const VOICE_ASSISTANT_ENABLED: boolean =
  import.meta.env.VITE_VOICE_ASSISTANT_ENABLED === 'true';
import {
  createVoiceLoop,
  ensureSecureContext,
  logVoiceEvent,
  speakLocal,
  stopPlayback
} from './services/voiceService';
import type {
  VoiceLoop,
  VoiceLoopError,
  VoiceParseResult
} from './services/voiceService';
import { VEHICLE_CATALOG } from './data/vehicleCatalog';

const INITIAL_VEHICLE: Vehicle = {
  brand: '',
  model: '',
  year: 2018,
  mileageKm: 120000,
  purchasePriceCad: 0,
  category: 'suv',
  condition: 'tres_bon',
  source: 'particulier',
  auctionFeesCad: 0,
  brokerCommissionCad: 0,
  originRegionId: 'grand-montreal',
  isNonRunning: false
};

export interface VoiceRecapState {
  lines: string[];
  snapshot: string;
}

function isVoiceRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toTrimmedVoiceString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function toRoundedVoiceInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.round(parsed);
  }
  return null;
}

function flattenVoiceUpdatePaths(updates: Record<string, unknown>): string[] {
  const paths: string[] = [];
  for (const [key, value] of Object.entries(updates)) {
    if (isVoiceRecord(value)) {
      for (const sub of Object.keys(value)) paths.push(`${key}.${sub}`);
    } else {
      paths.push(key);
    }
  }
  return paths;
}

/** Dotted voice field path -> human words (freeze prompts must never show codes). */
const VOICE_TARGET_LABELS: Record<string, string> = {
  'vehicle.brand': 'the brand',
  'vehicle.model': 'the model',
  'vehicle.year': 'the vehicle year',
  'vehicle.purchasePriceCad': 'the purchase price',
  'vehicle.mileageKm': 'the mileage',
  'vehicle.category': 'the vehicle type',
  destination: 'the destination',
  'transport.routeId': 'the transport route',
  'transport.batchVehiclesCount': 'the number of vehicles',
  'customs.country': 'the customs country',
  'customs.valuationBasis': 'the customs value',
};

function voiceTargetLabel(target: string): string {
  return VOICE_TARGET_LABELS[target] ?? target;
}

// Inline recap gate card (Agent 5 owns it here — no new files).
function VoiceRecapCard({
  lines,
  onCorrect,
  onChange
}: {
  lines: string[];
  onCorrect: () => void;
  onChange: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-label="Voice recap"
      aria-live="polite"
      className="rounded-2xl border-2 border-brand-500 bg-white p-5 shadow-md"
    >
      <h3 className="text-lg font-bold text-slate-900">Here&apos;s what I got:</h3>
      <ul className="mt-2 space-y-1 text-base text-slate-800">
        {lines.map((line) => (
          <li key={line}>• {line}</li>
        ))}
      </ul>
      <p className="mt-2 text-sm text-slate-600">Say correct to continue, or say change.</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onCorrect}
          className="rounded-xl bg-brand-600 px-5 py-3 font-bold text-white hover:bg-brand-700"
        >
          Correct — Continue
        </button>
        <button
          type="button"
          onClick={onChange}
          className="rounded-xl border border-slate-300 px-5 py-3 font-bold text-slate-700 hover:bg-slate-100"
        >
          Change
        </button>
      </div>
    </div>
  );
}

export function App() {
  const [config, setConfig] = useState<GlobalReferenceConfig>(loadStoredConfig());
  const [currentTab, setCurrentTab] = useState<'wizard' | 'results' | 'cargo' | 'optimizer' | 'history' | 'config'>('wizard');
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [maxReachedStep, setMaxReachedStep] = useState<number>(1);
  const [isRefreshingRates, setIsRefreshingRates] = useState<boolean>(false);
  const [isSourcesModalOpen, setIsSourcesModalOpen] = useState<boolean>(false);
  const [isNavigationCollapsed, setIsNavigationCollapsed] = useState(false);

  // Formulaire d'entrée
  const [vehicle, setVehicle] = useState<Vehicle>(INITIAL_VEHICLE);
  const [destination, setDestination] = useState<DestinationCountry>('senegal');
  const [financing, setFinancing] = useState<FinancingConfig>({
    method: 'plateforme_transfert',
    fixedFeeCad: 15,
    variableFeePercent: 0.7,
    fxSpreadPercent: 1.2
  });
  const [transport, setTransport] = useState<TransportSelection>({
    routeId: 'mtl-dkr-roro',
    batchVehiclesCount: 1
  });
  const [customs, setCustoms] = useState<CustomsSelection>({
    country: 'senegal',
    valuationBasis: 'invoice',
    moroccoOptions: {
      isMRE: false,
      mreAgeOver60: false,
      residenceOver10Years: false,
      isFirstCarInLife: false
    }
  });
  const [targetMargin, setTargetMargin] = useState<number>(18);
  const [prefillMeta, setPrefillMeta] = useState<PrefillMeta | null>(null);

  // ---------- Voice assistant global state (Agent 5) ----------
  const [voiceOn, setVoiceOn] = useState<boolean>(false);
  const [voiceState, setVoiceState] = useState<VoiceAssistantState>('idle');
  const [nextPrompt, setNextPrompt] = useState<string | undefined>(undefined);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [confirmedFields, setConfirmedFields] = useState<string[]>([]);
  const [voiceFilledFields, setVoiceFilledFields] = useState<string[]>([]);
  const [futureHits, setFutureHits] = useState<string[]>([]);
  const [lowConfStrikes, setLowConfStrikes] = useState<Record<string, number>>({});
  const [frozenFields, setFrozenFields] = useState<string[]>([]);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [offlineMode, setOfflineMode] = useState<boolean>(false);
  const [recap, setRecap] = useState<VoiceRecapState | null>(null);

  // Refs mirror state for the loop callbacks (no stale closures, no restarts).
  const voiceLoopRef = useRef<VoiceLoop | null>(null);
  const currentStepRef = useRef<number>(currentStep);
  const confirmedRef = useRef<string[]>([]);
  const voiceOnRef = useRef<boolean>(false);
  const lastSpokenRef = useRef<string>('');
  const recapRef = useRef<VoiceRecapState | null>(null);
  const vehicleRef = useRef<Vehicle>(vehicle);
  const destinationRef = useRef<DestinationCountry>(destination);
  const transportRef = useRef<TransportSelection>(transport);
  const customsRef = useRef<CustomsSelection>(customs);
  const configRef = useRef<GlobalReferenceConfig>(config);
  const frozenRef = useRef<string[]>([]);
  const strikesRef = useRef<Record<string, number>>({});
  const calculateRef = useRef<() => void>(() => undefined);

  useEffect(() => { currentStepRef.current = currentStep; }, [currentStep]);
  useEffect(() => { vehicleRef.current = vehicle; }, [vehicle]);
  useEffect(() => { destinationRef.current = destination; }, [destination]);
  useEffect(() => { transportRef.current = transport; }, [transport]);
  useEffect(() => { customsRef.current = customs; }, [customs]);
  useEffect(() => { configRef.current = config; }, [config]);
  useEffect(() => { recapRef.current = recap; }, [recap]);

  // Speak a prompt with the browser's free local synthesis (Web Speech API,
  // English voice). Capture is suspended while speaking so the mic never
  // re-ingests our own prompts (TTS echo). Best-effort: text stays on screen.
  // Anti-nag: a prompt identical to the last one spoken is shown but NOT
  // re-spoken — otherwise the assistant interrupts the user in a loop
  // (silence chunk -> "I didn't catch that" -> suspend -> silence chunk...).
  const speakText = useCallback(async (text: string): Promise<void> => {
    const short = text.slice(0, 280).trim();
    if (short === '') return;
    if (short === lastSpokenRef.current) return;
    lastSpokenRef.current = short;
    setVoiceState('speaking');
    voiceLoopRef.current?.suspendCapture();
    try {
      await speakLocal(short);
    } finally {
      voiceLoopRef.current?.resumeCapture();
      setVoiceState(voiceOnRef.current ? 'listening' : 'idle');
    }
  }, []);

  const handleVoiceError = useCallback((err: VoiceLoopError): void => {
    logVoiceEvent('error', `kind=${err.kind} retryable=${err.retryable} msg=${err.message.slice(0, 200)}`);
    if (err.kind === 'insecure-context') {
      setVoiceError(err.message);
      setVoiceState('error');
      voiceOnRef.current = false;
      setVoiceOn(false);
      return;
    }
    if (err.kind === 'mic-denied' || err.kind === 'unsupported') {
      // Big banner path: the manual form stays fully usable, nothing is blocked.
      setVoiceError(err.message);
      setVoiceState('error');
      return;
    }
    if (err.kind === 'server' && err.retryable === false) {
      // Fatal server-side config (e.g. missing GROQ_API_KEY): stop the loop
      // instead of re-uploading every chunk, and show exactly what to do.
      voiceLoopRef.current?.stop();
      stopPlayback();
      voiceOnRef.current = false;
      setVoiceOn(false);
      setVoiceError(err.message);
      setVoiceState('error');
      return;
    }
    // timeout / server / network → Offline mode badge, keep the loop alive for retry.
    setOfflineMode(true);
  }, []);

  const handleVoiceChunk = useCallback((result: VoiceParseResult): void => {
    // Late chunk landing after the loop stopped (trailing flush): ignore it,
    // the UI already went idle.
    if (!voiceOnRef.current) {
      return;
    }
    // A 200 means the backend is reachable again: clear any offline badge.
    setOfflineMode(false);
    // Recap voice commands: "correct" continues, "change" goes back to step 1.
    const transcript = (result.transcript ?? '').toLowerCase();
    if (recapRef.current !== null) {
      if (transcript.includes('correct')) {
        calculateRef.current();
        return;
      }
      if (transcript.includes('change')) {
        setRecap(null);
        setCurrentStep(1);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
    }

    const missing = Array.isArray(result.missing_for_current_step)
      ? result.missing_for_current_step
      : [];
    setMissingFields(missing);
    if (Array.isArray(result.future_hits) && result.future_hits.length > 0) {
      setFutureHits((prev) => Array.from(new Set([...prev, ...result.future_hits])));
    }

    const updates: Record<string, unknown> = isVoiceRecord(result.updates) ? result.updates : {};
    logVoiceEvent(
      'chunk',
      `conf=${result.confidence} updates=[${Object.keys(updates).join(',')}] missing=[${missing.join(',')}] transcript=${(result.transcript ?? '').slice(0, 150)}`
    );

    // Low-confidence gate: 2 strikes on the same field freezes voice for it.
    if (result.confidence < 0.7) {
      const updatesEmpty = Object.keys(updates).length === 0;
      if (updatesEmpty && missing.length === 0) {
        // Heard nothing (silence/noise guard from the backend): show the
        // retry prompt but don't burn a strike on a pseudo-field.
        if (result.next_prompt) {
          setNextPrompt(result.next_prompt);
        }
        logVoiceEvent('skip-noise', `transcript=${(result.transcript ?? '').slice(0, 150)}`);
        return; // skip applying
      }
      const paths = flattenVoiceUpdatePaths(updates);
      const target = missing[0] ?? paths[0] ?? 'general';
      if (!frozenRef.current.includes(target)) {
        const next = (strikesRef.current[target] ?? 0) + 1;
        strikesRef.current = { ...strikesRef.current, [target]: next };
        setLowConfStrikes(strikesRef.current);
        let prompt: string | undefined;
        if (next >= 2) {
          frozenRef.current = [...frozenRef.current, target];
          setFrozenFields(frozenRef.current);
          prompt = `Tap to type ${voiceTargetLabel(target)} — I had trouble hearing it.`;
          setNextPrompt(prompt);
        } else if (result.next_prompt) {
          prompt = result.next_prompt;
          setNextPrompt(prompt);
        }
        // Re-prompts are spoken like confident ones so the user hears them.
        if (prompt !== undefined) {
          void speakText(prompt);
        }
        logVoiceEvent('low-conf', `target=${target} strikes=${next} frozen=${next >= 2} conf=${result.confidence}`);
      } else {
        logVoiceEvent('low-conf-frozen-skip', `target=${target} conf=${result.confidence}`);
      }
      return; // skip applying
    }

    const applied: string[] = [];
    const notFrozen = (path: string): boolean => !frozenRef.current.includes(path);

    // --- vehicle (LAST-WINS, BRAND BEFORE MODEL) ---
    if (isVoiceRecord(updates.vehicle)) {
      const v = updates.vehicle;
      const brandHeard = toTrimmedVoiceString(v.brand);
      const prevBrand = vehicleRef.current.brand;
      let canonicalBrand: string | null = null;
      if (brandHeard !== null) {
        const found = VEHICLE_CATALOG.find(
          (b) => b.name.toLowerCase() === brandHeard.toLowerCase()
        );
        canonicalBrand = found ? found.name : brandHeard;
      }
      // Drop the model when the brand is unmatched or empty.
      let modelHeard = toTrimmedVoiceString(v.model);
      if (modelHeard !== null) {
        const effectiveBrand = canonicalBrand ?? prevBrand;
        const brandEntry = VEHICLE_CATALOG.find(
          (b) => b.name.toLowerCase() === (effectiveBrand ?? '').toLowerCase()
        );
        if (!effectiveBrand || effectiveBrand.trim() === '' || !brandEntry) {
          modelHeard = null;
        } else {
          const modelFound = brandEntry.models.find(
            (m) => m.name.toLowerCase() === modelHeard!.toLowerCase()
          );
          if (modelFound) modelHeard = modelFound.name;
        }
      }
      // BRAND BEFORE MODEL: brand first, then model, in the same handler.
      if (canonicalBrand !== null && notFrozen('vehicle.brand')) {
        const b = canonicalBrand;
        const brandChanged = b.toLowerCase() !== prevBrand.toLowerCase();
        if (modelHeard === null && brandChanged) {
          // Mirror the combobox semantics: a brand change clears a stale model.
          setVehicle((prev) => ({ ...prev, brand: b, model: '' }));
          vehicleRef.current = { ...vehicleRef.current, brand: b, model: '' };
        } else {
          setVehicle((prev) => ({ ...prev, brand: b }));
          vehicleRef.current = { ...vehicleRef.current, brand: b };
        }
        applied.push('vehicle.brand');
      }
      if (modelHeard !== null && notFrozen('vehicle.model')) {
        const m = modelHeard;
        const effBrand = canonicalBrand ?? vehicleRef.current.brand;
        const brandEntry = VEHICLE_CATALOG.find(
          (b) => b.name.toLowerCase() === effBrand.toLowerCase()
        );
        const modelMatch = brandEntry?.models.find(
          (item) => item.name.toLowerCase() === m.toLowerCase()
        );
        if (modelMatch) {
          setVehicle((prev) => ({ ...prev, model: m, category: modelMatch.category }));
          vehicleRef.current = { ...vehicleRef.current, model: m, category: modelMatch.category };
          applied.push('vehicle.model', 'vehicle.category');
        } else {
          setVehicle((prev) => ({ ...prev, model: m }));
          vehicleRef.current = { ...vehicleRef.current, model: m };
          applied.push('vehicle.model');
        }
      }
      const rest: Partial<Vehicle> = {};
      const restPaths: string[] = [];
      const year = toRoundedVoiceInt(v.year);
      if (year !== null && notFrozen('vehicle.year')) {
        rest.year = year;
        restPaths.push('vehicle.year');
      }
      const mileage = toRoundedVoiceInt(v.mileageKm);
      if (mileage !== null && notFrozen('vehicle.mileageKm')) {
        rest.mileageKm = mileage;
        restPaths.push('vehicle.mileageKm');
      }
      const price = toRoundedVoiceInt(v.purchasePriceCad);
      if (price !== null && notFrozen('vehicle.purchasePriceCad')) {
        rest.purchasePriceCad = price;
        restPaths.push('vehicle.purchasePriceCad');
      }
      const category = toTrimmedVoiceString(v.category);
      if (
        category !== null &&
        (category === 'citadine' ||
          category === 'berline' ||
          category === 'suv' ||
          category === 'camionnette') &&
        notFrozen('vehicle.category')
      ) {
        rest.category = category;
        restPaths.push('vehicle.category');
      }
      if (Object.keys(rest).length > 0) {
        setVehicle((prev) => ({ ...prev, ...rest }));
        vehicleRef.current = { ...vehicleRef.current, ...rest };
        applied.push(...restPaths);
      }
    }

    // --- destination (keeps the default-route sync, like a manual change) ---
    const destRaw = updates.destination;
    const destHeard =
      typeof destRaw === 'string'
        ? destRaw
        : isVoiceRecord(destRaw)
          ? toTrimmedVoiceString(destRaw.country)
          : null;
    if (
      (destHeard === 'senegal' || destHeard === 'maroc') &&
      notFrozen('destination')
    ) {
      const country = destHeard;
      setDestination(country);
      destinationRef.current = country;
      setCustoms((prev) => ({ ...prev, country }));
      customsRef.current = { ...customsRef.current, country };
      const routes = configRef.current.routes;
      const defRoute =
        routes.find((r) => r.destinationCountry === country && r.recommended) ??
        routes.find((r) => r.destinationCountry === country);
      if (defRoute) {
        setTransport((prev) => ({ ...prev, routeId: defRoute.id }));
        transportRef.current = { ...transportRef.current, routeId: defRoute.id };
      }
      applied.push('destination');
    }

    // --- transport ---
    if (isVoiceRecord(updates.transport)) {
      const t = updates.transport;
      const patch: Partial<TransportSelection> = {};
      const tPaths: string[] = [];
      const routeId = toTrimmedVoiceString(t.routeId);
      if (routeId !== null && notFrozen('transport.routeId')) {
        const known = configRef.current.routes.some((r) => r.id === routeId);
        if (known) {
          patch.routeId = routeId;
          tPaths.push('transport.routeId');
        }
      }
      const count = toRoundedVoiceInt(t.batchVehiclesCount);
      if (count !== null && count >= 1 && count <= 4 && notFrozen('transport.batchVehiclesCount')) {
        patch.batchVehiclesCount = count;
        tPaths.push('transport.batchVehiclesCount');
      }
      if (Object.keys(patch).length > 0) {
        setTransport((prev) => ({ ...prev, ...patch }));
        transportRef.current = { ...transportRef.current, ...patch };
        applied.push(...tPaths);
      }
    }

    // --- customs ---
    if (isVoiceRecord(updates.customs)) {
      const c = updates.customs;
      const patch: Partial<CustomsSelection> = {};
      const cPaths: string[] = [];
      const cc = toTrimmedVoiceString(c.country);
      if ((cc === 'senegal' || cc === 'maroc') && notFrozen('customs.country')) {
        patch.country = cc;
        cPaths.push('customs.country');
      }
      const vb = toTrimmedVoiceString(c.valuationBasis);
      if ((vb === 'invoice' || vb === 'argus_official') && notFrozen('customs.valuationBasis')) {
        patch.valuationBasis = vb;
        cPaths.push('customs.valuationBasis');
      }
      if (Object.keys(patch).length > 0) {
        setCustoms((prev) => ({ ...prev, ...patch }));
        customsRef.current = { ...customsRef.current, ...patch };
        applied.push(...cPaths);
      }
    }

    // Track confirmed += applied field paths (LAST-WINS: re-hearing re-confirms).
    const fresh = applied.filter((p) => !frozenRef.current.includes(p));
    if (fresh.length > 0) {
      confirmedRef.current = Array.from(new Set([...confirmedRef.current, ...fresh]));
      setConfirmedFields(confirmedRef.current);
      setVoiceFilledFields((prev) => Array.from(new Set([...prev, ...fresh])));
    }
    // Diagnose "heard but not filled": anything the backend sent but we dropped
    // (frozen field, unknown brand/model, out-of-range int...).
    const heardPaths = flattenVoiceUpdatePaths(updates);
    const dropped = heardPaths.filter((p) => !applied.includes(p));
    logVoiceEvent('applied', `applied=[${applied.join(',')}] dropped=[${dropped.join(',')}] conf=${result.confidence}`);
    if (result.next_prompt) {
      setNextPrompt(result.next_prompt);
      void speakText(result.next_prompt);
    }
  }, [speakText]);

  const handleVoiceToggle = useCallback((): void => {
    if (!VOICE_ASSISTANT_ENABLED) {
      return;
    }
    if (voiceOnRef.current) {
      voiceLoopRef.current?.stop();
      stopPlayback();
      voiceOnRef.current = false;
      setVoiceOn(false);
      setVoiceState('idle');
      return;
    }
    setVoiceError(null);
    setOfflineMode(false);
    lastSpokenRef.current = '';
    try {
      ensureSecureContext();
    } catch (err) {
      setVoiceError(err instanceof Error ? err.message : 'Microphone needs HTTPS or localhost');
      setVoiceState('error');
      return;
    }
    if (voiceLoopRef.current === null) {
      voiceLoopRef.current = createVoiceLoop({
        onChunk: handleVoiceChunk,
        onError: handleVoiceError,
        onUploadState: (uploading: boolean): void => {
          if (!voiceOnRef.current) {
            return;
          }
          // 'thinking' while a chunk is being understood, back to 'listening'
          // when done — never yank the state out of 'speaking'/'error'.
          setVoiceState((prev) => {
            if (uploading) {
              return prev === 'listening' ? 'thinking' : prev;
            }
            return prev === 'thinking' ? 'listening' : prev;
          });
        },
        // Covers tab-hide, global timeout and any other loop-side stop: the
        // UI must reflect it (mic released, speech cut, back to idle).
        onStopped: (): void => {
          stopPlayback();
          voiceOnRef.current = false;
          setVoiceOn(false);
          setVoiceState('idle');
          setOfflineMode(false);
        }
      });
    }
    const loop = voiceLoopRef.current;
    setVoiceState('listening');
    void loop
      .start(currentStepRef.current, { confirmed: confirmedRef.current })
      .then(() => {
        voiceOnRef.current = true;
        setVoiceOn(true);
      })
      .catch(() => {
        // The loop already reported the cause through onError.
        voiceOnRef.current = false;
        setVoiceOn(false);
        setVoiceState((prev) => (prev === 'listening' ? 'idle' : prev));
      });
  }, [handleVoiceChunk, handleVoiceError]);

  // Keep the backend's known snapshot fresh while listening (no restart, no navigation).
  useEffect(() => {
    if (voiceOn && voiceLoopRef.current !== null) {
      void voiceLoopRef.current
        .start(currentStep, { confirmed: confirmedFields })
        .catch(() => undefined);
    }
  }, [voiceOn, currentStep, confirmedFields]);

  // Résultat actuel
  const [currentResult, setCurrentResult] = useState<SimulationResult | null>(null);

  // Récupération des taux de change en direct au montage
  useEffect(() => {
    handleRefreshLiveRates();
  }, []);

  useEffect(() => {
    try {
      const payload = parsePrefillFromUrl(window.location.href);
      if (!payload) return;
      setVehicle(payload.vehicle);
      setDestination(payload.destination);
      setFinancing(payload.financing);
      setTransport(payload.transport);
      setCustoms(payload.customs);
      setTargetMargin(payload.targetMarginPercent);
      setCurrentResult(null);
      setCurrentTab('wizard');
      setCurrentStep(1);
      setMaxReachedStep(1);
      setPrefillMeta(payload.meta);
    } catch (error) {
      console.warn('[prefill] lien ignoré', error);
    }
  }, []);

  const handleRefreshLiveRates = async () => {
    setIsRefreshingRates(true);
    try {
      const liveData = await fetchLiveFxRates();
      setConfig(prev => {
        const updated = {
          ...prev,
          fxRates: {
            ...prev.fxRates,
            CAD_to_MAD: liveData.CAD_to_MAD,
            CAD_to_XOF: liveData.CAD_to_XOF,
            lastUpdated: liveData.lastUpdated,
            isLive: liveData.isLive,
            officialSourceUrl: liveData.officialSourceUrl,
            providerUpdatedAt: liveData.providerUpdatedAt,
            nextUpdateAt: liveData.nextUpdateAt,
            fetchedAt: liveData.fetchedAt,
            cacheStatus: liveData.cacheStatus,
            sourceName: liveData.sourceName,
            errorMessage: undefined
          }
        };
        saveStoredConfig(updated);
        return updated;
      });
    } catch (e) {
      console.error('Erreur récupération taux:', e);
      setConfig(prev => ({
        ...prev,
        fxRates: {
          ...prev.fxRates,
          isLive: false,
          cacheStatus: 'unavailable',
          errorMessage: 'Source de change indisponible; valeur précédente conservée et non présentée comme actuelle.'
        }
      }));
    } finally {
      setIsRefreshingRates(false);
    }
  };

  // Synchroniser la route par défaut lors du changement de pays
  const handleCountryChange = (country: DestinationCountry) => {
    setDestination(country);
    setCustoms(prev => ({ ...prev, country }));
    const defRoute = config.routes.find(r => r.destinationCountry === country && r.recommended) || config.routes.find(r => r.destinationCountry === country);
    if (defRoute) {
      setTransport(prev => ({ ...prev, routeId: defRoute.id }));
    }
  };

  const handleStepNext = (nextStep: number) => {
    setCurrentStep(nextStep);
    if (nextStep > maxReachedStep) {
      setMaxReachedStep(nextStep);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Lancement du calcul
  const handleCalculate = () => {
    const res = calculateSimulation(
      vehicle,
      destination,
      financing,
      transport,
      customs,
      targetMargin,
      config
    );
    setCurrentResult(res);
    setCurrentTab('results');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    calculateRef.current = handleCalculate;
  });

  // Recap gate (Agent 5): spoken + visual summary before Calculate.
  const buildRecap = useCallback((): void => {
    const v = vehicleRef.current;
    const d = destinationRef.current;
    const t = transportRef.current;
    const lines = [
      `${v.brand} ${v.model} ${v.year}`.trim(),
      `${v.mileageKm.toLocaleString('en-US')} km, $${v.purchasePriceCad.toLocaleString('en-US')}`,
      `Destination: ${d === 'senegal' ? 'Senegal' : 'Morocco'}`,
      `Transport route: ${configRef.current.routes.find((r) => r.id === t.routeId)?.name ?? t.routeId} (${t.batchVehiclesCount} vehicle${t.batchVehiclesCount > 1 ? 's' : ''})`
    ];
    const snapshot = JSON.stringify({
      vehicle: v,
      destination: d,
      transport: t,
      customs: customsRef.current
    });
    const next: VoiceRecapState = { lines, snapshot };
    recapRef.current = next;
    setRecap(next);
    void speakText(
      `Here's what I got: ${v.brand} ${v.model}, ${v.year}, ${v.mileageKm} kilometers, $${v.purchasePriceCad}. Say correct to continue, or say change.`
    );
  }, [speakText]);

  // Gated Calculate: with voice on and no confirmed recap, show the recap first.
  // Existing gates (isFormValid, checkEligibility) are never bypassed.
  const handleCalculateGated = useCallback((): void => {
    if (voiceOnRef.current && recapRef.current === null) {
      buildRecap();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    calculateRef.current();
  }, [buildRecap]);

  const handleVoiceRecapChange = useCallback((): void => {
    setRecap(null);
    setCurrentStep(1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Recap as soon as step 4 has no missing fields left (voice heard everything).
  useEffect(() => {
    if (
      currentStep === 4 &&
      voiceOn &&
      recap === null &&
      missingFields.length === 0 &&
      confirmedFields.length > 0
    ) {
      buildRecap();
    }
  }, [currentStep, voiceOn, recap, missingFields, confirmedFields, buildRecap]);

  // Step-1 gating checklist: defaults count as missing until spoken/confirmed.
  const step1Missing: string[] = [];
  if (vehicle.brand.trim() === '' || !confirmedFields.includes('vehicle.brand')) {
    step1Missing.push('brand');
  }
  if (vehicle.model.trim() === '' || !confirmedFields.includes('vehicle.model')) {
    step1Missing.push('model');
  }
  if (!confirmedFields.includes('vehicle.year') || vehicle.year < 2000 || vehicle.year > CURRENT_YEAR) {
    step1Missing.push('year');
  }
  if (!confirmedFields.includes('vehicle.purchasePriceCad') || vehicle.purchasePriceCad <= 0) {
    step1Missing.push('price');
  }

  // Ajustement interactif de la marge depuis les résultats
  const handleTargetMarginChange = (margin: number) => {
    setTargetMargin(margin);
    if (currentResult) {
      const updated = calculateSimulation(
        currentResult.vehicle,
        currentResult.destination,
        currentResult.financing,
        currentResult.transport,
        currentResult.customs,
        margin,
        config
      );
      setCurrentResult(updated);
    }
  };

  // Démo en 1 clic
  const handleLoadDemo = () => {
    setRecap(null);
    setVehicle(DEMO_VEHICLE);
    setDestination('senegal');
    const demoFinancing: FinancingConfig = {
      method: 'plateforme_transfert',
      fixedFeeCad: 15,
      variableFeePercent: 0.7,
      fxSpreadPercent: 1.2
    };
    setFinancing(demoFinancing);
    const demoTransport: TransportSelection = {
      routeId: 'mtl-dkr-roro',
      batchVehiclesCount: 1
    };
    setTransport(demoTransport);
    const demoCustoms: CustomsSelection = {
      country: 'senegal'
    };
    setCustoms(demoCustoms);
    setTargetMargin(18);

    const res = calculateSimulation(
      DEMO_VEHICLE,
      'senegal',
      demoFinancing,
      demoTransport,
      demoCustoms,
      18,
      config
    );
    setCurrentResult(res);
    setMaxReachedStep(4);
    setCurrentTab('results');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Réinitialiser pour une nouvelle simulation
  const handleNewSimulation = () => {
    setRecap(null);
    setVehicle(INITIAL_VEHICLE);
    setCurrentStep(1);
    setMaxReachedStep(1);
    setCurrentResult(null);
    setCurrentTab('wizard');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Charger une simulation depuis l'historique
  const handleSelectFromHistory = (sim: SimulationResult) => {
    setRecap(null);
    setVehicle(sim.vehicle);
    setDestination(sim.destination);
    setFinancing(sim.financing);
    setTransport(sim.transport);
    setCustoms(sim.customs);
    setTargetMargin(sim.targetMarginPercent);
    setCurrentResult(sim);
    setCurrentTab('results');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className={`min-h-[100dvh] bg-[hsl(var(--paper))] flex flex-col font-sans transition-[padding] duration-300 ${isNavigationCollapsed ? 'md:pl-[76px]' : 'md:pl-[272px]'}`}>

      {/* Barre de navigation globale */}
      <Header
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        onLoadDemo={handleLoadDemo}
        hasCurrentResult={currentResult !== null}
        config={config}
        onRefreshLiveRates={handleRefreshLiveRates}
        isRefreshingRates={isRefreshingRates}
        onOpenSourcesModal={() => setIsSourcesModalOpen(true)}
        onCollapsedChange={setIsNavigationCollapsed}
      />

      {/* Contenu principal */}
      <main className="app-enter flex-1 py-6 px-4 pt-20 sm:px-6 lg:px-10 md:pt-10">

        {/* VUE 1 : Formulaire Wizard linéaire */}
        {currentTab === 'wizard' && (
          <div className="space-y-6">
            {prefillMeta && (
              <div
                className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-brand-200 bg-[hsl(var(--surface))] px-4 py-3 text-sm text-slate-700 shadow-sm"
                role="status"
              >
                <span>
                  Pré-rempli depuis l’annonce <strong className="font-bold text-slate-950">{prefillMeta.listingTitle}</strong>. Vérifiez les champs avant le calcul.
                </span>
                <a
                  href={prefillMeta.listingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold text-brand-700 underline underline-offset-4 hover:text-brand-800"
                >
                  Voir l’annonce d’origine
                </a>
                <button
                  type="button"
                  onClick={() => setPrefillMeta(null)}
                  className="ml-auto rounded-lg px-2 py-1 font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                  aria-label="Masquer le bandeau de préremplissage"
                >
                  OK
                </button>
              </div>
            )}
            <WizardStepper
              currentStep={currentStep}
              onSelectStep={setCurrentStep}
              maxReachedStep={maxReachedStep}
            />

            {/* Voice assistant status banners (Agent 5) — never block the manual form. */}
            {voiceOn && offlineMode && (
              <div
                role="status"
                className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-bold text-amber-900"
              >
                Offline mode — voice retries automatically. You can keep talking or type instead.
              </div>
            )}
            {voiceState === 'error' && voiceError && (
              <div
                role="alert"
                className="rounded-2xl border-2 border-red-400 bg-red-50 px-4 py-3 text-sm text-red-900"
              >
                <p className="font-bold">{voiceError}</p>
                <p className="mt-1">You can keep filling the form manually — nothing is blocked.</p>
              </div>
            )}
            {voiceOn && futureHits.length > 0 && (
              <div
                role="status"
                className="flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-900"
              >
                <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full bg-sky-500" />
                <span>
                  +{futureHits.length} infos detected for later — no need to move, review when you
                  get there.
                </span>
              </div>
            )}
            {voiceOn && currentStep === 1 && step1Missing.length > 0 && (
              <div
                role="status"
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700"
              >
                Still need: <strong>{step1Missing.join(', ')}</strong> — say it or type it.
              </div>
            )}

            {currentStep === 1 && (
              <StepVehicle
                vehicle={vehicle}
                onChange={(upd) => setVehicle({ ...vehicle, ...upd })}
                onNext={() => handleStepNext(2)}
                voiceFilled={voiceFilledFields}
                confirmedFields={confirmedFields}
              />
            )}

            {currentStep === 2 && (
              <StepDestination
                vehicle={vehicle}
                country={destination}
                customs={customs}
                config={config}
                onCountryChange={handleCountryChange}
                onCustomsChange={(upd) => setCustoms({ ...customs, ...upd })}
                onNext={() => handleStepNext(3)}
                onPrev={() => setCurrentStep(1)}
              />
            )}

            {currentStep === 3 && (
              <StepFinancing
                financing={financing}
                purchasePriceCad={vehicle.purchasePriceCad}
                country={destination}
                config={config}
                onChange={(upd) => setFinancing({ ...financing, ...upd })}
                onNext={() => handleStepNext(4)}
                onPrev={() => setCurrentStep(2)}
              />
            )}

            {currentStep === 4 && (
              <>
                {recap && (
                  <VoiceRecapCard
                    lines={recap.lines}
                    onCorrect={handleCalculate}
                    onChange={handleVoiceRecapChange}
                  />
                )}
                <StepTransport
                  transport={transport}
                  vehicle={vehicle}
                  country={destination}
                  purchasePriceCad={vehicle.purchasePriceCad}
                  config={config}
                  onChange={(upd) => setTransport({ ...transport, ...upd })}
                  onCalculate={handleCalculateGated}
                  onPrev={() => setCurrentStep(3)}
                />
              </>
            )}
          </div>
        )}

        {/* Global voice bubble (Agent 5): visible on wizard steps 1-4, only when enabled via .env. */}
        {VOICE_ASSISTANT_ENABLED && currentTab === 'wizard' && currentStep >= 1 && currentStep <= 4 && (
          <VoiceAssistantBubble
            state={voiceState}
            onToggle={handleVoiceToggle}
            nextPrompt={nextPrompt}
            errorMsg={voiceError ?? undefined}
          />
        )}

        {/* VUE 2 : Tableau de bord de résultats */}
        {currentTab === 'results' && currentResult && (
          <ResultsDashboard
            simulation={currentResult}
            onEdit={() => setCurrentTab('wizard')}
            onGoToOptimizer={() => setCurrentTab('cargo')}
            onTargetMarginChange={handleTargetMarginChange}
            onOpenSourcesModal={() => setIsSourcesModalOpen(true)}
          />
        )}

        {/* VUE 3 : Cargaison Conteneur (Multi-véhicules) */}
        {currentTab === 'cargo' && (
          <CargoContainerBuilder config={config} defaultCountry={destination} />
        )}

        {/* VUE 4 : Optimiseur RoRo vs Conteneur */}
        {currentTab === 'optimizer' && (
          <ContainerOptimizer config={config} defaultCountry={destination} />
        )}

        {/* VUE 5 : Historique & Comparateur */}
        {currentTab === 'history' && (
          <SimulationHistory
            onSelectSimulation={handleSelectFromHistory}
            onNewSimulation={handleNewSimulation}
          />
        )}

        {/* VUE 6 : Tables de référence & Éditeur de configuration */}
        {currentTab === 'config' && (
          <ConfigEditor
            config={config}
            onUpdateConfig={(newConf) => setConfig(newConf)}
          />
        )}

      </main>

      {/* Pied de page sobre */}
      <footer className="bg-[hsl(var(--surface))] border-t border-[hsl(var(--line))] py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>AutoTransat QC · Solution d'aide à la décision pour l'export automobile Québec → Maroc & Sénégal</span>
          <span className="text-slate-400">Règles douanières : Décret Sénégal du 24 oct. 2025 & Régime MRE Maroc</span>
        </div>
      </footer>

      {/* Modal des sources officielles et références réglementaires */}
      <OfficialSourcesModal
        isOpen={isSourcesModalOpen}
        onClose={() => setIsSourcesModalOpen(false)}
        sources={config.officialSources}
      />

    </div>
  );
}

export default App;
