# Voice Assistant — Checklist (6 subagents, equitable split)

Plan ref: `VOICE_ASSISTANT_PLAN.md`. Codebase anchors: `src/App.tsx`, `src/components/wizard/StepVehicle.tsx`, `src/types/index.ts`, `backend/main.py`.

> Dispatch rule: 6 parallel agents, no shared files except the contract below. Each agent owns its files + verifies with its own command. No coding started yet — this is the work breakdown.

## Shared contract (do not change unilaterally)

- `POST /api/voice/parse-audio` (multipart `audio`, `current_step`, `known_json`) → `{ updates, confidence, transcript, missing_for_current_step, next_prompt, future_hits }`.
- `POST /api/voice/speak` (`{ text, voice, pace }`) → `audio/mpeg`.
- Confidence gate `>= 0.7`, last-wins per field, no audio persisted, English only.

---

## Agent 1 — Backend: parse-audio route (owner: `backend/main.py`, `backend/schemas.py`)

- [ ] Add voice pydantic models in `backend/schemas.py` (`VoiceParseResponse`, `VoiceSpeakRequest`, ...). Do NOT reuse `VehicleInput` as-is (it lacks `originRegionId`/`isNonRunning`).
- [ ] Add `POST /api/voice/parse-audio` multipart handler (audio + current_step + known_json, where known_json includes `confirmed: string[]`).
- [ ] Call Gemini `gemini-2.0-flash` audio-in with strict JSON prompt (Step-1 + future destination/transport detection, numbers-words → ints). **Prompt must include brand→VEHICLE_CATALOG normalization (closest of the 19 catalog brands, raw string + confidence <= 0.5 if no close match) and never return a model without a matched brand.**
- [ ] Validate response shape + confidence passthrough; never persist audio (volatile only).
- [ ] Handle Gemini timeout/error → 502 with `{ error, retryable: true }`.
- [ ] Verify: `uvicorn backend.main:app --reload` + curl multipart sample → valid JSON contract.

## Agent 2 — Backend: speak route + config (owner: `backend/requirements.txt`, `backend/main.py`, `.gitignore`, env docs)

- [ ] **Step-0 safety: add `.env` (and `.env.*` except `.env.example`) to `.gitignore` BEFORE creating any `.env` with the key.**
- [ ] Add `google-generativeai>=0.8`, `python-multipart` to `backend/requirements.txt`.
- [ ] Add `POST /api/voice/speak` → Gemini `gemini-2.5-flash-tts` (voice Kore, slow, short sentences) → `audio/mpeg`.
- [ ] Wire `GEMINI_API_KEY` from env, no key in code/logs; document `.env` (not committed) + provide `.env.example` with empty key.
- [ ] Document frontend plumbing contract: `VITE_API_BASE_URL` (default `http://localhost:8000`) + how the backend is hosted for the demo (second Replit workflow or separate host) + run command `uvicorn backend.main:app --reload --port 8000`.
- [ ] Cap text length (e.g. 280 chars) + handle TTS errors → 502 retryable.
- [ ] Verify: `pip install -r backend/requirements.txt` + curl speak → playable MP3; verify `git check-ignore .env` returns `.env`.

## Agent 3 — Frontend: recording loop service (owner: `src/services/voiceService.ts` only, + `vite.config.ts` proxy)

- [ ] Read API base URL from `import.meta.env.VITE_API_BASE_URL` (fallback `http://localhost:8000`); add `/api → localhost:8000` dev proxy in `vite.config.ts`.
- [ ] Implement chunk loop: `MediaRecorder` webm/opus, 8-10s max, flush on 3s silence (AnalyserNode VAD).
- [ ] Upload queue (max 1 in flight), payload `{ audio, currentStep, known }` where `known` includes `confirmed: string[]`, 8s timeout + abort.
- [ ] Auto-stop on `visibilitychange` hidden + 5-min global timeout; expose `start/stop/isRecording/onChunk/onError`.
- [ ] Pre-check secure context (`window.isSecureContext`): if false, emit dedicated error "Microphone needs HTTPS or localhost" instead of failing silently.
- [ ] Never store audio beyond upload; expose TTS `playMp3(bytes)` helper.
- [ ] Verify: `npx tsc --noEmit` + manual Chrome mic test with mocked endpoint.

## Agent 4 — Frontend: bubble UI + states (owner: `src/components/voice/VoiceAssistantBubble.tsx` only)

- [ ] Fixed bubble mid-right (`fixed right-4 top-1/2 z-50`), 72px target, assistant avatar, "Tap to stop anytime".
- [ ] States: `idle | listening (waveform) | thinking | speaking | error`, `aria-live`, keyboard Enter/Space, focus ring.
- [ ] Props-only component: `state, onToggle, nextPrompt, errorMsg`; no direct backend calls.
- [ ] Large text, high contrast, senior-friendly copy (English).
- [ ] Verify: `npx tsc --noEmit` + visual check at 360px and 1280px widths.

## Agent 5 — Frontend: wizard wiring + gating + recap (owner: `src/App.tsx`, `src/components/wizard/StepVehicle.tsx`)

- [ ] Global voice state: apply `updates` → setters, checklist "Still need: ...", cross-step banner "+N infos for later", stepper dot (no auto-jump).
- [ ] **Combobox semantics (hard requirement): always apply `brand` before `model`; drop a `model` whose brand is unmatched (StepVehicle clears model on brand change). Maintain `confirmed: string[]` — defaults (year 2018, mileage 120000, category suv) count as missing until spoken/confirmed.**
- [ ] When voice touches `destination`/`year`/`category`, let Step-2 eligibility (`checkEligibility`) recompute — surface its message, never bypass the gate.
- [ ] StepVehicle highlights: yellow flash on fill → green on confirm + "filled by voice" badge; inputs stay editable; respect existing `isFormValid`.
- [ ] Recap gate before Calculate: summary card + [Correct — Continue], voice "Say correct to continue, or say change X".
- [ ] Verify: `npx tsc --noEmit` + flow test: partial Step-1 + "Senegal" stays Step-1 with future dot; test brand-change clears stale model.

## Agent 6 — QA + fallbacks + a11y (owner: `tests/` notes + verification matrix, no feature code)

- [ ] Mic-denied/unsupported → banner + manual fallback, never blocked.
- [ ] Backend timeout → local Web Speech standby badge "Offline mode" (spec only, no impl clash with Agent 3).
- [ ] 2× low-confidence (<0.7) → freeze voice for that field, show big "Tap to type".
- [ ] Matrix: out-of-order fill, correction last-wins ("No, nineteen"), noisy numbers, tab-hide stop, full-sim cost < $0.05.
- [ ] Non-regression: existing `npm test` suite (`test_calculations.ts` + `tests/e2e-prefill.test.ts`) stays green; `marketplace-extension` untouched (voice adds files only, no shared synced files modified).
- [ ] Error copy: insecure-context mic denial shows the dedicated HTTPS/localhost message.
- [ ] A11y pass: keyboard-only bubble toggle, screen-reader announcements, contrast check.
- [ ] Verify: `npm run build` passes + written QA report (pass/fail per row).

## Final integration order (after all 6 green)

1. Agents 1+2 backend contract live → 2. Agent 3 loop against real endpoints → 3. Agent 4 bubble on mock states → 4. Agent 5 wiring → 5. Agent 6 full-matrix sign-off.
