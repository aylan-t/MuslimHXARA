/// <reference types="vite/client" />

/**
 * voiceService — senior-friendly English voice loop (Agent 3 slice).
 *
 * - Continuous listening via MediaRecorder, chunked on 3s silence (AnalyserNode VAD)
 *   or a 10s hard cap, with seamless recorder restart while recording stays on.
 * - Each chunk is uploaded (serialized, max 1 in flight) to
 *   POST {base}/api/voice/parse-audio as multipart { audio, current_step, known_json }.
 * - TTS playback helper for MP3 bytes returned by POST {base}/api/voice/speak.
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
const MSG_PLAYBACK =
  'Could not play the voice message. Please read the text on screen.';

const SILENCE_RMS_THRESHOLD = 0.02;
const SILENCE_BEFORE_FLUSH_MS = 3000;
const MAX_CHUNK_MS = 10000;
const MIN_CHUNK_MS = 1000;
const VAD_TICK_MS = 200;
const UPLOAD_TIMEOUT_MS = 8000;
const GLOBAL_TIMEOUT_MS = 5 * 60 * 1000;
const CHUNK_FILENAME = 'chunk.webm';

/** API base from env, fallback to local backend. Never ends with a slash. */
export function getApiBase(): string {
  const raw = import.meta.env.VITE_API_BASE_URL as string | undefined;
  const trimmed = (raw ?? '').trim().replace(/\/+$/, '');
  return trimmed === '' ? DEFAULT_API_BASE : trimmed;
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
  const { onChunk, onError } = options;

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
  // Serialize uploads: each chunk waits for the previous one — never parallel.
  let uploadTail: Promise<void> = Promise.resolve();

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
    releaseHardware();
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
    if (!active) {
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
    if (chunkLen >= MAX_CHUNK_MS) {
      flush();
    } else if (chunkLen >= MIN_CHUNK_MS && now - lastSpeech >= SILENCE_BEFORE_FLUSH_MS) {
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
      recorder = null;
      if (wasActive) {
        // Restart seamlessly so listening continues while the chunk uploads.
        chunkStart = Date.now();
        lastSpeech = Date.now();
        startSegment();
      }
      if (blob.size > 0) {
        enqueueUpload(blob);
      }
    };
    chunkStart = Date.now();
    lastSpeech = Date.now();
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
    uploadTail = uploadTail.then(() => uploadChunk(blob, step, snapshot));
  };

  const uploadChunk = async (blob: Blob, step: number, snapshot: VoiceKnownState): Promise<void> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
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
      const message =
        serverMessage === 'GEMINI_API_KEY not configured'
          ? 'The voice server is missing its API key. Add GEMINI_API_KEY to the .env file and restart the server, then tap the microphone again.'
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
      mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        report('mic-denied', true, MSG_MIC_DENIED);
        throw new VoiceError('mic-denied', MSG_MIC_DENIED, true);
      }
      if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        report('unsupported', false, MSG_NO_MIC);
        throw new VoiceError('unsupported', MSG_NO_MIC, false);
      }
      report('unsupported', false, MSG_UNSUPPORTED);
      throw new VoiceError('unsupported', MSG_UNSUPPORTED, false);
    }
    active = true;
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

  return { start, stop, isRecording };
}

let currentAudio: HTMLAudioElement | null = null;

/** Stop any in-flight TTS playback. */
export function stopPlayback(): void {
  if (currentAudio) {
    const audio = currentAudio;
    currentAudio = null;
    try {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    } catch {
      // Ignore cleanup errors.
    }
  }
}

/**
 * Play TTS MP3 bytes (from POST /api/voice/speak) via an object URL.
 * Resolves on `ended`; the object URL is always revoked afterwards.
 */
export function playMp3(bytes: Blob | ArrayBuffer): Promise<void> {
  stopPlayback();
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes], { type: 'audio/mpeg' });
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  currentAudio = audio;
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      URL.revokeObjectURL(url);
      if (currentAudio === audio) {
        currentAudio = null;
      }
      fn();
    };
    audio.onended = (): void => {
      settle(resolve);
    };
    audio.onerror = (): void => {
      settle(() => reject(new VoiceError('network', MSG_PLAYBACK, false)));
    };
    void audio
      .play()
      .catch(() => settle(() => reject(new VoiceError('network', MSG_PLAYBACK, true))));
  });
}
