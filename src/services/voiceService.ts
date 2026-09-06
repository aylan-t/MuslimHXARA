/// <reference types="vite/client" />

/**
 * voiceService — senior-friendly English voice loop (Agent 3 slice).
 *
 * - Continuous listening via MediaRecorder, chunked on 3s silence (AnalyserNode VAD)
 *   or a 10s hard cap, with seamless recorder restart while recording stays on.
 * - Each chunk is uploaded (serialized, max 1 in flight) to
 *   POST {base}/api/voice/parse-audio as multipart { audio, current_step, known_json }.
 * - Speech output via the browser's free Web Speech API (English voice, slow
 *   rate) — no backend TTS call, no key, no cost.
 * - Privacy: audio is never persisted (no localStorage / IndexedDB / cookies) —
 *   chunks live only in memory until uploaded, then are dropped.
 */

export type VoiceErrorKind =
  | 'mic-denied'
  | 'unsupported'
  | 'timeout'
  | 'server'
  | 'network'
  | 'insecure-context';

export class VoiceError extends Error {
  readonly kind: VoiceErrorKind;
  readonly retryable: boolean;

  constructor(kind: VoiceErrorKind, message: string, retryable = false) {
    super(message);
    this.name = 'VoiceError';
    this.kind = kind;
    this.retryable = retryable;
  }
}

/** Backend contract: POST /api/voice/parse-audio → 200 JSON. */
export interface VoiceParseResult {
  updates: Record<string, unknown>;
  confidence: number;
  transcript: string;
  missing_for_current_step: string[];
  next_prompt: string;
  future_hits: string[];
}

export interface VoiceLoopError {
  kind: VoiceErrorKind;
  retryable: boolean;
  message: string;
}

export interface VoiceLoopOptions {
  onChunk: (result: VoiceParseResult) => void;
  onError: (error: VoiceLoopError) => void;
  /** Called when uploads start (true) and when none remain in flight (false) — drives the 'thinking' state. */
  onUploadState?: (uploading: boolean) => void;
  /** Called whenever the loop actually stops (toggle, fatal error, tab hide, global timeout). */
  onStopped?: () => void;
}

/**
 * Per-chunk snapshot of what the wizard already knows.
 * `confirmed` lists fields the user already confirmed by voice (defaults such
 * as year 2018 / mileage 120000 / category suv count as missing until present here).
 */
export interface VoiceKnownState {
  confirmed: string[];
  [field: string]: unknown;
}

export interface VoiceLoop {
  /** Start listening. Updates the step/known snapshot when already recording. */
  start: (currentStep: number, known: VoiceKnownState) => Promise<void>;
  stop: () => void;
  isRecording: () => boolean;
  /** Pause capture while the assistant speaks (drops mic input so the TTS echo is never transcribed). */
  suspendCapture: () => void;
  /** Resume capture after speaking. */
  resumeCapture: () => void;
}

const DEFAULT_API_BASE = 'http://localhost:8000';

const MSG_INSECURE =
  'Microphone needs HTTPS or localhost';
const MSG_MIC_DENIED =
  'Microphone is blocked. Please allow the microphone in your browser, or type your answer instead.';
const MSG_UNSUPPORTED =
  'This browser cannot record audio. Please use Chrome or Edge, or type your answer instead.';
const MSG_NO_MIC =
  'No microphone was found. Please connect a microphone, or type your answer instead.';
const MSG_TIMEOUT =
  'The assistant is taking too long. Please try again, or type your answer instead.';
const MSG_SERVER =
  'The assistant had a problem. Please try again, or type your answer instead.';
const MSG_NETWORK =
  'No connection to the assistant. Please check your internet, or type your answer instead.';

const SILENCE_RMS_THRESHOLD = 0.02;
const SILENCE_BEFORE_FLUSH_MS = 3000;
const MAX_CHUNK_MS = 10000;
const MIN_CHUNK_MS = 1000;
const VAD_TICK_MS = 200;
const UPLOAD_TIMEOUT_MS = 40000; // Groq parse worst case: STT 10s + LLM 12s x2 (fallback retry) = 34s
const GLOBAL_TIMEOUT_MS = 5 * 60 * 1000;
const CHUNK_FILENAME = 'chunk.webm';

/** API base from env, fallback to local backend. Never ends with a slash. */
export function getApiBase(): string {
  const raw = import.meta.env.VITE_API_BASE_URL as string | undefined;
  const trimmed = (raw ?? '').trim().replace(/\/+$/, '');
  return trimmed === '' ? DEFAULT_API_BASE : trimmed;
}

/**
 * Fire-and-forget voice decision event to the backend debug file
 * (logs/voice-debug.txt, backend caps length and appends). Shows WHY a heard
 * chunk did or did not fill fields. Never throws, never blocks the loop.
 */
export function logVoiceEvent(kind: string, detail: string): void {
  try {
    const body = JSON.stringify({ kind, detail });
    void fetch(`${getApiBase()}/api/voice/client-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    }).catch(() => undefined);
  } catch {
    // Logging must never break the voice loop.
  }
}

/** Microphone requires a secure context — fail fast with a dedicated error. */
export function ensureSecureContext(): void {
  if (typeof window === 'undefined' || !window.isSecureContext) {
    throw new VoiceError('insecure-context', MSG_INSECURE, false);
  }
}

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return '';
  }
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
    return 'audio/webm;codecs=opus';
  }
  if (MediaRecorder.isTypeSupported('audio/webm')) {
    return 'audio/webm';
  }
  return '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === 'string') {
      out.push(item);
    }
  }
  return out;
}

function toNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function toText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizeResult(data: unknown): VoiceParseResult {
  if (!isRecord(data)) {
    throw new VoiceError('server', MSG_SERVER, true);
  }
  return {
    updates: isRecord(data.updates) ? data.updates : {},
    confidence: toNumber(data.confidence, 0),
    transcript: toText(data.transcript),
    missing_for_current_step: toStringArray(data.missing_for_current_step),
    next_prompt: toText(data.next_prompt),
    future_hits: toStringArray(data.future_hits),
  };
}

export function createVoiceLoop(options: VoiceLoopOptions): VoiceLoop {
  const { onChunk, onError, onUploadState, onStopped } = options;

  let active = false;
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let mimeType = '';
  let audioCtx: AudioContext | null = null;
  let micSource: MediaStreamAudioSourceNode | null = null;
  let analyser: AnalyserNode | null = null;
  let vadTimer: ReturnType<typeof setInterval> | null = null;
  let globalTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingBlobs: Blob[] = [];
  let chunkStart = 0;
  let lastSpeech = 0;
  let currentStep = 1;
  let known: VoiceKnownState = { confirmed: [] };
  // While true (assistant speaking), VAD never flushes and recorder output is
  // discarded: the mic must not hear our own prompts.
  let captureSuspended = false;
  // Set before a deliberate silent restart so onstop drops the audio.
  let dropNextStop = false;
  // Serialize uploads: each chunk waits for the previous one — never parallel.
  let uploadTail: Promise<void> = Promise.resolve();
  let inFlightUploads = 0;
  const activeControllers = new Set<AbortController>();

  const notifyUpload = (uploading: boolean): void => {
    try {
      onUploadState?.(uploading);
    } catch {
      // Never let a consumer callback break the loop.
    }
  };

  const report = (kind: VoiceErrorKind, retryable: boolean, message: string): void => {
    try {
      onError({ kind, retryable, message });
    } catch {
      // Never let a consumer callback break the loop.
    }
  };

  const deliver = (result: VoiceParseResult): void => {
    try {
      onChunk(result);
    } catch {
      // Never let a consumer callback break the loop.
    }
  };

  const stop = (): void => {
    if (!active && !recorder && !stream) {
      return;
    }
    active = false;
    captureSuspended = false;
    dropNextStop = false;
    if (vadTimer !== null) {
      clearInterval(vadTimer);
      vadTimer = null;
    }
    if (globalTimer !== null) {
      clearTimeout(globalTimer);
      globalTimer = null;
    }
    document.removeEventListener('visibilitychange', handleVisibility);
    if (recorder && recorder.state !== 'inactive') {
      // Final flush: onstop uploads the trailing audio (no restart, active === false).
      try {
        recorder.stop();
      } catch {
        recorder = null;
      }
    }
    // Abort in-flight uploads so no chunk lands after the UI went idle.
    for (const controller of activeControllers) {
      try {
        controller.abort();
      } catch {
        // Ignore abort errors.
      }
    }
    releaseHardware();
    try {
      onStopped?.();
    } catch {
      // Never let a consumer callback break the loop.
    }
  };

  const handleVisibility = (): void => {
    if (document.visibilityState === 'hidden') {
      stop();
    }
  };

  function releaseHardware(): void {
    if (audioCtx) {
      const ctx: AudioContext = audioCtx;
      audioCtx = null;
      micSource = null;
      analyser = null;
      void ctx.close().catch(() => undefined);
    }
    if (stream) {
      const tracks = stream.getTracks();
      stream = null;
      for (const track of tracks) {
        track.stop();
      }
    }
  }

  const flush = (): void => {
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        // A new segment starts on the next VAD tick if still active.
      }
    }
  };

  const tickVad = (): void => {
    if (!active || captureSuspended) {
      return;
    }
    const now = Date.now();
    if (!analyser) {
      // VAD unavailable (best-effort) — fall back to the 10s hard cap.
      if (now - chunkStart >= MAX_CHUNK_MS) {
        flush();
      }
      return;
    }
    const bins = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(bins);
    let sum = 0;
    for (let i = 0; i < bins.length; i += 1) {
      const v = (bins[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / bins.length);
    if (rms >= SILENCE_RMS_THRESHOLD) {
      lastSpeech = now;
    }
    const chunkLen = now - chunkStart;
    // Only flush on silence if actual voice was heard in THIS segment
    // (lastSpeech moved past segment start). Pure-silence segments are never
    // uploaded: they produced 1KB chunks that Whisper hallucinated on
    // ("you", "Thank you", "The"), which made the assistant nag in a loop.
    const heardVoice = lastSpeech > chunkStart;
    if (chunkLen >= MAX_CHUNK_MS) {
      if (heardVoice) {
        flush();
      } else {
        // 10s of pure silence: restart the segment silently (drop, no upload)
        // instead of feeding Whisper hallucination fuel.
        dropNextStop = true;
        flush();
      }
    } else if (heardVoice && chunkLen >= MIN_CHUNK_MS && now - lastSpeech >= SILENCE_BEFORE_FLUSH_MS) {
      flush();
    }
  };

  const startSegment = (): void => {
    if (!active || !stream) {
      return;
    }
    pendingBlobs = [];
    try {
      recorder = mimeType === '' ? new MediaRecorder(stream) : new MediaRecorder(stream, { mimeType });
    } catch {
      report('unsupported', false, MSG_UNSUPPORTED);
      stop();
      return;
    }
    recorder.ondataavailable = (event: BlobEvent): void => {
      if (event.data.size > 0) {
        pendingBlobs.push(event.data);
      }
    };
    recorder.onstop = (): void => {
      const blob = new Blob(pendingBlobs, { type: 'audio/webm' });
      pendingBlobs = [];
      const wasActive = active;
      const dropped = dropNextStop;
      dropNextStop = false;
      recorder = null;
      if (wasActive && !captureSuspended) {
        // Restart seamlessly so listening continues while the chunk uploads.
        // Same timestamp for both: the "heard voice" guard relies on
        // lastSpeech > chunkStart becoming true only on real speech.
        chunkStart = Date.now();
        lastSpeech = chunkStart;
        startSegment();
      }
      // Suspended capture (TTS echo window) and deliberate silent restarts
      // are discarded, never uploaded.
      if (blob.size > 0 && !captureSuspended && !dropped) {
        enqueueUpload(blob);
      }
    };
    chunkStart = Date.now();
    lastSpeech = chunkStart;
    try {
      recorder.start();
    } catch {
      report('unsupported', false, MSG_UNSUPPORTED);
      stop();
    }
  };

  const enqueueUpload = (blob: Blob): void => {
    const step = currentStep;
    const snapshot: VoiceKnownState = { ...known, confirmed: [...known.confirmed] };
    inFlightUploads += 1;
    notifyUpload(true);
    uploadTail = uploadTail.then(() => uploadChunk(blob, step, snapshot));
  };

  const uploadChunk = async (blob: Blob, step: number, snapshot: VoiceKnownState): Promise<void> => {
    const controller = new AbortController();
    activeControllers.add(controller);
    const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
    try {
      let res: Response;
      try {
        const form = new FormData();
        form.append('audio', blob, CHUNK_FILENAME);
        form.append('current_step', String(step));
        form.append('known_json', JSON.stringify(snapshot));
        // Timeout style imitates src/services/liveDataService.ts (AbortSignal + abort).
        res = await fetch(`${getApiBase()}/api/voice/parse-audio`, {
          method: 'POST',
          body: form,
          signal: controller.signal,
        });
      } catch (err) {
        clearTimeout(timeoutId);
        if (err instanceof DOMException && err.name === 'AbortError') {
          // Stopped by the user (or tab hidden) mid-upload: stay silent, UI already idle.
          if (!active) {
            return;
          }
          report('timeout', true, MSG_TIMEOUT);
        } else {
          report('network', true, MSG_NETWORK);
        }
        return;
      }
      clearTimeout(timeoutId);
    if (!res.ok) {
      // Read the server's own diagnosis so the UI (and terminal watcher) sees
      // the real cause instead of a generic "had a problem".
      let serverMessage = '';
      let serverRetryable: boolean | null = null;
      try {
        const body: unknown = await res.json();
        if (typeof body === 'object' && body !== null) {
          const errText = (body as { error?: unknown }).error;
          if (typeof errText === 'string' && errText.length > 0) serverMessage = errText;
          const retryFlag = (body as { retryable?: unknown }).retryable;
          if (typeof retryFlag === 'boolean') serverRetryable = retryFlag;
        }
      } catch {
        // Body isn't JSON (proxy error page, etc.) — fall back to generic text.
      }
      const retryable = serverRetryable ?? (res.status >= 500 || res.status === 429);
      const isMissingKey =
        serverMessage.includes('GROQ_API_KEY') ||
        serverMessage.includes('no usable auth');
      const message = isMissingKey
        ? 'The voice server is missing its API key. Add GROQ_API_KEY (from console.groq.com/keys) to the repo-root .env file without quotes and restart the server, then tap the microphone again.'
        : serverMessage !== ''
          ? `${MSG_SERVER} Server says: ${serverMessage}`
          : MSG_SERVER;
      report('server', retryable, message);
      return;
    }
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      report('server', true, MSG_SERVER);
      return;
    }
    try {
      deliver(normalizeResult(data));
    } catch (err) {
      if (err instanceof VoiceError) {
        report(err.kind, err.retryable, err.message);
      } else {
        report('server', true, MSG_SERVER);
      }
    }
    } finally {
      activeControllers.delete(controller);
      inFlightUploads = Math.max(0, inFlightUploads - 1);
      if (inFlightUploads === 0) {
        notifyUpload(false);
      }
    }
  };

  const start = async (step: number, knownState: VoiceKnownState): Promise<void> => {
    currentStep = step;
    known = knownState;
    if (active) {
      return;
    }
    try {
      ensureSecureContext();
    } catch (err) {
      const message = err instanceof VoiceError ? err.message : MSG_INSECURE;
      report('insecure-context', false, message);
      throw err;
    }
    if (typeof MediaRecorder === 'undefined') {
      report('unsupported', false, MSG_UNSUPPORTED);
      throw new VoiceError('unsupported', MSG_UNSUPPORTED, false);
    }
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      report('unsupported', false, MSG_UNSUPPORTED);
      throw new VoiceError('unsupported', MSG_UNSUPPORTED, false);
    }
    let mic: MediaStream;
    try {
      // Echo cancellation first: without it the mic re-ingests our own TTS
      // prompts (seen in logs as "Please provide the brand..." transcripts).
      mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'OverconstrainedError') {
        // Device can't do echo cancellation: fall back to a plain mic rather
        // than failing (capture-suspend during TTS still prevents echo).
        try {
          mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch {
          report('unsupported', false, MSG_NO_MIC);
          throw new VoiceError('unsupported', MSG_NO_MIC, false);
        }
      } else if (name === 'NotAllowedError' || name === 'SecurityError') {
        report('mic-denied', true, MSG_MIC_DENIED);
        throw new VoiceError('mic-denied', MSG_MIC_DENIED, true);
      } else if (name === 'NotFoundError') {
        report('unsupported', false, MSG_NO_MIC);
        throw new VoiceError('unsupported', MSG_NO_MIC, false);
      } else {
        report('unsupported', false, MSG_UNSUPPORTED);
        throw new VoiceError('unsupported', MSG_UNSUPPORTED, false);
      }
    }
    active = true;
    captureSuspended = false;
    dropNextStop = false;
    stream = mic;
    mimeType = pickMimeType();
    try {
      audioCtx = new AudioContext();
      micSource = audioCtx.createMediaStreamSource(mic);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      micSource.connect(analyser);
      await audioCtx.resume().catch(() => undefined);
    } catch {
      // VAD is best-effort: without it the 10s hard cap still chunks audio.
      if (audioCtx) {
        const ctx: AudioContext = audioCtx;
        audioCtx = null;
        void ctx.close().catch(() => undefined);
      }
      micSource = null;
      analyser = null;
    }
    document.addEventListener('visibilitychange', handleVisibility);
    globalTimer = setTimeout(stop, GLOBAL_TIMEOUT_MS);
    vadTimer = setInterval(tickVad, VAD_TICK_MS);
    startSegment();
    if (!active || !recorder) {
      // startSegment already reported the cause and stopped the loop.
      throw new VoiceError('unsupported', MSG_UNSUPPORTED, false);
    }
  };

  const isRecording = (): boolean => active;

  const suspendCapture = (): void => {
    captureSuspended = true;
    // Cut the current segment immediately; onstop discards it (see above).
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        recorder = null;
      }
    }
    pendingBlobs = [];
  };

  const resumeCapture = (): void => {
    captureSuspended = false;
    // Restart a fresh segment so post-speech audio starts on a clean chunk.
    if (active && !recorder) {
      chunkStart = Date.now();
      lastSpeech = chunkStart;
      startSegment();
    }
  };

  return { start, stop, isRecording, suspendCapture, resumeCapture };
}

/** Stop any in-flight local speech. Same name/signature as before so callers are untouched. */
export function stopPlayback(): void {
  try {
    if (typeof speechSynthesis !== 'undefined') {
      speechSynthesis.cancel();
    }
  } catch {
    // Ignore cleanup errors.
  }
}

/** Pick an English voice (prompts are English-only). Falls back to browser default. */
function pickEnglishVoice(): SpeechSynthesisVoice | null {
  try {
    if (typeof speechSynthesis === 'undefined') return null;
    const voices = speechSynthesis.getVoices();
    if (voices.length === 0) return null;
    return (
      voices.find((v) => v.lang.toLowerCase() === 'en-ca') ??
      voices.find((v) => v.lang.toLowerCase() === 'en-us') ??
      voices.find((v) => v.lang.toLowerCase().startsWith('en')) ??
      null
    );
  } catch {
    return null;
  }
}

/**
 * Speak a prompt with the browser's free local synthesis (Web Speech API).
 * No backend call, no key, no cost. Resolves on `end`.
 */
export function speakLocal(text: string): Promise<void> {
  stopPlayback();
  return new Promise<void>((resolve) => {
    try {
      if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') {
        resolve();
        return;
      }
      const utter = new SpeechSynthesisUtterance(text.slice(0, 280));
      utter.lang = 'en-US';
      utter.rate = 0.9; // slow, senior-friendly
      utter.pitch = 1;
      const voice = pickEnglishVoice();
      if (voice) {
        utter.voice = voice;
        utter.lang = voice.lang;
      }
      let settled = false;
      const done = (): void => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };
      utter.onend = done;
      utter.onerror = done;
      speechSynthesis.speak(utter);
      // Safety: never hang the UI if the voice engine stalls.
      window.setTimeout(done, 15000);
    } catch {
      resolve();
    }
  });
}
