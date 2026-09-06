# Voice Assistant Bubble — Plan (Senior English Mode)

Source: grill interview 2026-09-06. No code changed yet.

## 1. Locked decisions

1. Q1 Guided question-by-question (tolerant to out-of-order).
2. Q2 Focus Step 1 Vehicle (`brand, model, year, mileageKm, purchasePriceCad, category`), silent background prefill for Steps 2-4.
3. Q3 Listen via Gemini audio (not Web Speech as primary).
4. Q4 English only (`en-CA`).
5. Q5 Extraction via Gemini (`gemini-2.0-flash`, strict JSON + confidence).
6. Q6 Secured backend: `POST /api/voice/parse-audio` on existing FastAPI (`backend/main.py`), key in env, local Web Speech fallback.
7. Q8 Continuous listening.
8. Q9 Stay on current step until required fields done + discreet banner "+N infos for later", no auto-jump.
9. Q10 Correction = last-wins vocal, confidence threshold 0.7, manual edit always allowed.
10. Q11 Chunks 8-10s, cut on 3s silence (VAD).
11. Q12 Triple safety net (mic banner + offline mode + tap-to-type after 2 low-conf).
12. Q13 Static assistant bubble mid-right.
13. Q14 Global bubble across Steps 1-4.
14. Q15 Native browser mic permission only (B).
15. Q16 Vocal + visual recap before Calculate ("Say correct to continue").
16. Q17 Voice = V2 Gemini TTS direct (`gemini-2.5-flash-tts`) via `POST /api/voice/speak`, no browser-voice V1.

## 2. Current codebase anchors (MuslimHXARA survey 2026-09-06)

- `src/App.tsx`: wizard state (`vehicle, destination, financing, transport, customs, targetMargin`), tabs wizard/results/cargo/optimizer/history/config. Step gating is delegated: Step 1 Next disabled by `isFormValid`, **Step 2 Next disabled by `!checkEligibility(...)` (`StepDestination.tsx:363`)**, Steps 3-4 never disabled.
- `src/components/wizard/StepVehicle.tsx`: card `max-w-3xl`. **Brand/model are NOT text inputs but `AccessibleCombobox` bound to `VEHICLE_CATALOG` (19 brands, `src/data/vehicleCatalog.ts`)**: model select is `disabled` until brand is set, **changing brand clears model** (`onChange: {brand, model:''}`), and category is auto-set from the catalog match (`onCommit`). `isFormValid` = brand+model non-empty, year 2000-CURRENT_YEAR, price > 0. `CURRENT_YEAR` is dynamic (`new Date().getFullYear()`, `calculationEngine.ts:16`).
- `INITIAL_VEHICLE` (`App.tsx:54`) ships with defaults: `year: 2018, mileageKm: 120000, category: 'suv', condition: 'tres_bon', source: 'particulier', originRegionId: 'grand-montreal'`. The form can be "valid" without the user ever speaking → **defaults must be treated as unconfirmed** (see §4).
- `src/types/index.ts`: `Vehicle`, `DestinationCountry`, `TransportSelection`, `CustomsSelection`.
- `backend/main.py` (FastAPI): `/`, `/api/config`, `/api/calculate`. CORS `*`. In-memory config, no DB/env/dotenv. **The backend is optional and divergent (calculation-only, no annexes/Argus/regions) — the frontend never calls it.**
- **No frontend→backend plumbing exists**: zero `fetch` to any backend, zero `VITE_*` vars, zero `.env` files, no dev proxy in `vite.config.ts` (port 3000 local / 5000 Replit, backend docs mention 8000). This plumbing is part of the build (see §3 step 0).
- `backend/requirements.txt`: fastapi, uvicorn, pydantic only. `backend/schemas.py`: `VehicleInput` has NO `originRegionId`/`isNonRunning`, `CustomsSelectionInput` has NO `valuationBasis` — voice needs new/extra pydantic models, not a reuse as-is.
- **`.gitignore` contains only `node_modules` — `.env` is NOT ignored.** Adding the ignore rule is step 0 (otherwise `GEMINI_API_KEY` will be committed on the first `git add .`).
- No existing voice, MediaRecorder, or Gemini code anywhere (only these .md files mention them).
- Deploy: single Replit workflow (frontend only). **The FastAPI backend must be deployed/running alongside for voice to work in the demo** (second Replit process or separate host) — decided in build, default: document + run locally + note prod host.
- Mic requires secure context: Replit webview (HTTPS) OK, `localhost` OK, plain-HTTP LAN IP will fail `getUserMedia` — needs a dedicated error message (see §5).

## 3. Target architecture

### Step 0 — Plumbing (prerequisite, no voice logic)

- `.gitignore`: add `.env` (and `.env.*` except `.env.example`).
- Frontend API config: `VITE_API_BASE_URL` (default `http://localhost:8000`), read once in `voiceService` via `import.meta.env`; add dev proxy in `vite.config.ts` (`/api → localhost:8000`) to avoid CORS surprises. CORS backend already `*`.
- Backend hosting: document how to run (`uvicorn backend.main:app --reload --port 8000`) + decide demo host (second Replit workflow or separate host). Voice is dead without it.
- `backend/schemas.py`: add dedicated voice models (`VoiceParseRequest` via multipart fields, `VoiceParseResponse`, `VoiceSpeakRequest`) — do NOT force-fit `VehicleInput` (missing `originRegionId`/`isNonRunning`).

### Frontend (React + Vite + Tailwind)

- New `src/components/voice/VoiceAssistantBubble.tsx`:
  `fixed right-4 top-1/2 -translate-y-1/2 z-50`, 72px hit target, assistant avatar, states `idle | listening | thinking | speaking | error`, waveform/pulse, `aria-live="polite"`, keyboard operable (Enter/Space), "Tap to stop anytime" microcopy.
- New `src/services/voiceService.ts`:
  `MediaRecorder` (webm/opus) loop, simple VAD via `AnalyserNode` (3s silence or 10s max → flush), upload queue (one in flight), auto-stop on tab hidden + 5 min timeout, per-chunk payload `{ audio Blob, currentStep, known }`, MP3 TTS playback via `<audio>`.
- `src/App.tsx` wiring:
  Global voice state, apply `updates` to `setVehicle/setDestination/setTransport/setCustoms`, gating checklist "Still need: ...", cross-step banner, stepper dot for prefilled future steps. **Apply order matters: always set `brand` before `model`** (brand change clears model in StepVehicle); ignore a `model` whose brand is unknown/unmatched. When voice touches `destination`, `year` or `category`, recompute Step-2 eligibility display.
- `StepVehicle.tsx` (minimal touch):
  Yellow flash on voice-filled field → green locked on confirm, "filled by voice" badge, inputs stay editable.

### Backend (FastAPI)

- `POST /api/voice/parse-audio` (multipart: `audio`, `current_step: int`, `known_json: str`):
  Calls Gemini `gemini-2.0-flash` audio-in. Returns `{ updates, confidence, transcript, missing_for_current_step, next_prompt, future_hits }`. No audio persisted (volatile transcribe then drop).
- `POST /api/voice/speak` (`{ text, voice="Kore", pace="slow" }`):
  Calls Gemini `gemini-2.5-flash-tts` → MP3 bytes (or base64). Short senior-friendly sentences only.
- Deps add: `google-generativeai>=0.8`, `python-multipart`. Env `GEMINI_API_KEY` (never committed).

### Gemini prompts (draft for build)

- Parse system: "You are a form filler for Quebec car export. English only. Step-1 fields: brand, model, year int 2000-CURRENT_YEAR, purchasePriceCad int, mileageKm int, category enum. Also detect future: destination senegal|maroc + transport hints. Numbers-words → ints. Last value wins per field. **Brand normalization: map the heard brand to the closest entry of this catalog [Toyota, Honda, Ford, ...full 19 from VEHICLE_CATALOG...]; if no close match, return the raw string with confidence <= 0.5 and do NOT invent a model. Never return a model without a matched brand.** Return ONLY JSON {updates, confidence 0-1, transcript, missing, next_prompt, future_hits}."
- Speak style: slow, short: "What is the brand?", "I heard 2018. Say yes or no.", final recap: "Here's what I got: ... Say correct to continue, or say change X."

## 4. Data contract

```jsonc
// POST /api/voice/parse-audio → 200
{
  "updates": { "vehicle": { "brand": "Toyota" }, "destination": "senegal" },
  "confidence": 0.87,
  "transcript": "...",
  "missing_for_current_step": ["purchasePriceCad"],
  "next_prompt": "What is the purchase price in Canadian dollars?",
  "future_hits": ["destination"]
}
// POST /api/voice/speak → audio/mpeg bytes
```

Validation rules reused: brand (catalog-matched)/model non-empty, year 2000-CURRENT_YEAR, price > 0, confidence >= 0.7 else ignore + re-ask.

**Defaults-are-unconfirmed rule**: `known_json` sent per chunk includes a `confirmed: string[]` list. Fields still at their `INITIAL_VEHICLE` defaults (year 2018, mileage 120000, category suv) and absent from `confirmed` MUST appear in `missing_for_current_step` (as "confirm" prompts, e.g. "Your car is from 2018, correct?"), even though `isFormValid` already passes. Only user-spoken or explicitly confirmed values count as done — the Q16 recap is the final net.

## 5. Costs / latency / risks

- ~6 chunks/min speech + short TTS prompts: well under $0.05 per full simulation (Flash STT-ish + $0.015/min TTS). Negligible for hackathon.
- Expected 2-4s latency per chunk; masked by "Thinking..." state.
- Risks accepted: native-permission-only (less reassuring, Loi 25 — mitigate with stop microcopy + no audio storage), English-only (proper nouns OK), continuous cost if forgotten (auto-stop guards), Chrome/Edge MediaRecorder dependence (banner fallback).
- Added 2026-09-06 (MuslimHXARA audit): `.env` commit risk → fixed by step-0 `.gitignore`; backend-must-be-hosted risk → step 0 decision required before any voice demo; mic secure-context risk → dedicated "Microphone needs HTTPS or localhost" error state in the Q12 safety net (plain-HTTP LAN testing will fail otherwise); catalog-mismatch risk → prompt normalization + brand-first apply order; false-valid-defaults risk → defaults-are-unconfirmed rule (§4).

## 6. Build order

0. Plumbing: `.gitignore` + `VITE_API_BASE_URL` + vite proxy + voice pydantic models + backend host decision.
1. Backend routes + contract + no-storage rule.
2. `voiceService` chunk loop + upload + playback.
3. Bubble UI + states + a11y.
4. App/wizard wiring + gating + recap gate before Calculate.
5. Fallbacks + QA matrix (out-of-order, correction, offline, mic denied).

## 7. Out of scope (explicit)

- No French/dialects, no offline-full, no per-field mic buttons, no auto-jump between steps, no audio retention/analytics, no key in frontend.
