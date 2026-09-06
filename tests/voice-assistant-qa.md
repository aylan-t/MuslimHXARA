# Voice Assistant — QA Verification Matrix (Agent 6)

Branch: `ai-audio-mode` · Date: 2026-09-06 · Environment: Windows, no mic, `GEMINI_API_KEY` empty/unset (env length 0).
Rule followed: **no live test is marked passed without running it.** Anything needing a mic, key, or browser run is `BLOCKED` with the exact human command to unblock.

## 1. Toolchain (all run locally, exact output)

| Check | Status | Evidence |
|---|---|---|
| `npx tsc --noEmit` | PASS | exit 0, no output |
| `npm run build` (`tsc && vite build`) | PASS | `vite v6.4.3 building for production… ✓ 1801 modules transformed ✓ built in 20.01s`; dist: `index.html 0.83 kB`, `assets/index-Dd-80wHQ.css 50.51 kB`, `assets/index-DkT9gd4G.js 369.50 kB`, `assets/pdfExportService-DqIJYZZ3.js 434.54 kB` |
| `npm test` (existing suite) | PASS | `test_calculations.ts`: 42 passed / 0 failed; `tests/e2e-prefill.test.ts`: 16 passed / 0 failed (prefill bilan 16/16) |
| `marketplace-extension` untouched | PASS | `git status --short -- marketplace-extension` → empty (no modifications) |

## 2. Fallback paths (static review — IMPLEMENTED / MISSING)

| Fallback | Verdict | Evidence (file:line) |
|---|---|---|
| Mic-denied banner + manual usable | IMPLEMENTED | `src/services/voiceService.ts:411-416` maps `NotAllowedError`/`SecurityError` → `VoiceError('mic-denied', MSG_MIC_DENIED)`; copy at `:77-78` ("Microphone is blocked. Please allow the microphone in your browser, or type your answer instead."). `src/App.tsx:240-244` + `:836-844` renders `role="alert"` banner with "You can keep filling the form manually — nothing is blocked." No gating on manual inputs. |
| Unsupported / no-mic → banner | IMPLEMENTED | `voiceService.ts:400-407` (no MediaRecorder/getUserMedia) + `:417-419` (`NotFoundError`/`OverconstrainedError` → "No microphone was found…", `:81-82`); generic `:79-80` ("This browser cannot record audio. Please use Chrome or Edge, or type your answer instead."). Same `App.tsx` banner path. |
| Insecure-context dedicated message | IMPLEMENTED | `voiceService.ts:75-76` `MSG_INSECURE = 'Microphone needs HTTPS or localhost'`; `ensureSecureContext()` at `:109-113` throws `VoiceError('insecure-context', …)`; enforced pre-mic at `:393-399` and in toggle at `App.tsx:494-500`; error path `App.tsx:233-239` shows it in bubble `error` state. Exact required wording present. |
| Backend timeout → "Offline mode" badge + retry | IMPLEMENTED | Upload abort at 8 s: `voiceService.ts:97` `UPLOAD_TIMEOUT_MS = 8000`, `:341-364` (`AbortController`, `AbortError` → `report('timeout', true, MSG_TIMEOUT)`). `App.tsx:246-247`: timeout/server/network → `setOfflineMode(true)` (loop kept alive for retry, no teardown). Badge `App.tsx:828-835`: "Offline mode — voice retries automatically. You can keep talking or type instead." (`role="status"`). |
| 2× low-conf (< 0.7) → freeze field + "Tap to type" | IMPLEMENTED (minor UI-size note, §4) | Gate `App.tsx:277` (`result.confidence < 0.7` → skip apply). Strike counter `:280-283`, freeze at `next >= 2` (`:284-286`), prompt `:287` `` `Tap to type ${target} — I had trouble hearing it.` `` shown via bubble `nextPrompt`. Freeze enforced on every apply path via `notFrozen` (`:296`, used at `:327,340,362,367,372,383,405,429,437,454,459`). |
| Auto-stop on tab hide + 5-min timeout | IMPLEMENTED (code; live run BLOCKED) | `voiceService.ts:228-232` `handleVisibility` → `stop()` on `hidden`; listener add/remove at `:444`/`:216`. `GLOBAL_TIMEOUT_MS = 5*60*1000` at `:98`, armed at `:445`. Hardware released on stop (`:234-249` tracks stopped, AudioContext closed). |
| No audio persistence | IMPLEMENTED | `voiceService.ts` contains zero `localStorage`/`IndexedDB`/`sessionStorage`/`cookie` writes (only the doc comment at `:11` naming the ban). Chunks live in-memory (`pendingBlobs`, `:179`) and are dropped after enqueue (`:310-322`). TTS object URL always revoked in `settle()` (`:487-498`, revoke at `:493`) + `stopPlayback` cleanup (`:462-474`). Repo `localStorage` hits are pre-existing config/history (`storageService.ts`) and `ErrorBoundary`, never audio. |
| `.env` ignored | IMPLEMENTED | `git check-ignore .env` → exit 0 (ignored via `.gitignore:4`); `git check-ignore .env.example` → exit 1 (template committable, contains empty `GEMINI_API_KEY=` + `VITE_API_BASE_URL`). `.env` exists locally, is untracked-but-ignored (absent from `git status`). `.env` content never opened by QA. |
| No secret in code | IMPLEMENTED | Grep of `src/` for `AIza|sk-ant|sk-proj|api[_-]?key\s*[:=]\s*['"][A-Za-z0-9]` → no files. Backend reads key only from env (`backend/main.py:312,409` `os.environ.get("GEMINI_API_KEY", "")`); missing key → `503 {error, retryable:false}` (`:314,411`). |

## 3. Behavior matrix (code-path evidence; live rows BLOCKED)

| # | Row | Status | Evidence / unblock command |
|---|---|---|---|
| 3.1 | Out-of-order fill (Step-1 hears destination) | PASS (code) | No step gate on apply: `App.tsx:250-481` applies `vehicle`/`destination`/`transport`/`customs` regardless of `currentStep`. Future hits accumulate to banner (`:270-272`, rendered `:845-856` "+N infos detected for later"). No auto-jump: voice never sets `currentStep` except recap-"change" → step 1 (`:259-263`). Backend prompt detects future destination/transport (`main.py:250`) and returns `future_hits` (contract `schemas.py:103-109`). |
| 3.2 | Last-wins correction ("No, nineteen") | PASS (code) | Backend prompt: "Last value wins per field" (`main.py:252`). Frontend overwrites state on each confident chunk (`App.tsx:335-336,354-357,388-392`) and re-confirms reheard fields (`:471-476`). |
| 3.3 | Noisy numbers handling | PASS (code) | Backend: "Numbers-words to ints" (`main.py:250`). Frontend `toRoundedVoiceInt` coerces string→number + `Math.round` (`App.tsx:74-81`); non-numeric → `null` → ignored, never applied. |
| 3.4 | Confidence gate 0.7 | PASS (code) | `App.tsx:277`: `confidence < 0.7` → strikes/freeze path, update skipped. Backend passes confidence through clamped 0–1 (`main.py:333-339`). |
| 3.5 | Brand-before-model | PASS (code) | `App.tsx:298-358`: brand resolved first (`:303-309`), model dropped when brand unmatched/empty (`:312-325`), brand applied before model (`:327-358`); brand change clears stale model (`:330-333`), mirroring combobox `onChange={(brand) => onChange({ brand, model: '' })}` (`StepVehicle.tsx:126`). Backend prompt: closest-of-19-catalog, raw string + conf ≤ 0.5 on no match, never model without matched brand (`main.py:252-255`, catalog `:237-241`). |
| 3.6 | Defaults-are-unconfirmed | PASS (code) | Defaults `year 2018 / mileageKm 120000 / category 'suv'` (`App.tsx:44-57`); `step1Missing` requires `confirmedFields` membership for brand/model/year/price (`App.tsx:679-691`); `known.confirmed` sent per chunk (`App.tsx:510,526-530`; `voiceService.ts:336,348`); backend treats defaults absent from `confirmed` as missing (`main.py:256-257`). |
| 3.7 | Recap gate before Calculate | PASS (code) | `VoiceRecapCard` dialog (`App.tsx:96-137`) with [Correct — Continue] / [Change]; gated calculate (`:650-657`) shows recap first when voice on; auto-recap at step 4 when nothing missing (`:666-676`); voice "correct"→calculate / "change"→step 1 (`:252-264`). Existing `isFormValid` (`StepVehicle.tsx:56-61`) and `checkEligibility` (`StepDestination.tsx:28`, recomputed every render from voice-driven state) never bypassed. |
| 3.8 | Step-2 eligibility recompute on voice destination/year/category | PASS (code) | Voice destination writes flow through the same `destination`/`customs`/`transport` state as manual changes (`App.tsx:403-421` incl. default-route sync); `StepDestination` calls `checkEligibility(vehicle, country, customs, config)` on each render (`StepDestination.tsx:28`), so any voice update re-surfaces its message. |
| 3.9 | Keyboard-only bubble toggle | PASS (code; live keyboard run BLOCKED → row 3.14) | Native `<button onClick={onToggle}>` (`VoiceAssistantBubble.tsx:59-66`) — Enter/Space activation free; `aria-pressed` + `aria-label` (`:62-64`), `focus-visible:ring-4 … ring-offset-2` (`:13-14`), 72 px target (`w-[72px] h-[72px]`), `fixed right-4 top-1/2 z-50` (`:45`), status `aria-live="polite" role="status"` (`:93-96`), "Tap to stop anytime" (`:100-102`). |
| 3.10 | Contrast (code classes) | PASS with note (§4) | Status card `text-slate-900` on `bg-white` (`:96-98`) — strong. Bubble buttons white text on `brand-600/red-500/amber-500/green-600/red-600` (`:16-22`); `thinking` amber-500/white is the weakest pair — noted, not failed (large icon + text alternative on screen). |
| 3.11 | Request shapes match contract | PASS (static) | Upload multipart `{audio, current_step, known_json}` (`voiceService.ts:345-348`, filename `chunk.webm` `:99`) vs backend `(audio, current_step=Form, known_json=Form)` (`main.py:306-311`); TTS `{text, voice, pace}` (`App.tsx:220`) vs `VoiceSpeakRequest` (`schemas.py:112-115`); 280-char cap both sides (`App.tsx:213`, `main.py:407-408`). Chunk loop: 3 s-silence VAD flush + 10 s cap (`voiceService.ts:92-96,261-290`), max 1 in-flight (`:185,334-338`), 8 s timeout (`:97`). |
| 3.12 | Cost estimate note | NOTE (no live measurement possible here) | Plan budgets "well under $0.05 per full simulation" (`VOICE_ASSISTANT_PLAN.md:90-92`). No spend incurred (no key, no calls). Live measurement BLOCKED → row 3.15. |
| 3.13 | Live mic loop (Chrome + mic) | BLOCKED | Needs human: `npm run dev` (or `npm run preview` after build), open `http://localhost:3000` in Chrome, allow mic, click bubble, speak Step-1 answer ("Toyota RAV4 twenty nineteen…"), confirm fields fill + "Still need" shrinks. |
| 3.14 | Live keyboard + screen-reader pass | BLOCKED | Needs human: keyboard-only Tab→bubble→Enter/Space toggles; screen reader announces `aria-live` status changes; check 360 px + 1280 px widths. |
| 3.15 | Live Gemini parse + speak + cost | BLOCKED | Needs human: copy `.env.example` → `.env`, set real `GEMINI_API_KEY`, run `uvicorn backend.main:app --reload --port 8000`, then `curl -F "audio=@sample.webm" -F "current_step=1" -F "known_json={\"confirmed\":[]}" http://localhost:8000/api/voice/parse-audio` (expect 200 contract JSON) and `curl -X POST http://localhost:8000/api/voice/speak -H "Content-Type: application/json" -d "{\"text\":\"Still need: brand\"}" --output tts.mp3` (expect playable MP3); without key both return the verified `503 GEMINI_API_KEY not configured`. Log chunk/TTS counts to confirm < $0.05/sim. |
| 3.16 | Live tab-hide + 5-min auto-stop | BLOCKED | Needs human: start loop per 3.13, hide tab → recording stops (mic icon released); 5-min timer is code-only (do not wait live — covered by `GLOBAL_TIMEOUT_MS` static PASS in §2). |

## 4. Concerns / follow-ups (non-blocking)

1. `frozenFields`/`lowConfStrikes` state is tracked and enforced but has no dedicated large banner element — the "Tap to type" surface is the bubble prompt text (`text-sm`). Functional PASS; consider a larger banner reusing the `role="alert"` style if seniors miss it.
2. `thinking` bubble pairs white icon on `amber-500` (weakest contrast of the five states); icon is large (32 px) and every state duplicates meaning in text — acceptable, noted.
3. `speakText` failure is silent by design (prompt text stays on screen, `App.tsx:225-227`) — correct for robustness; QA confirms no unhandled rejection path.

## Summary counts

- PASS: 13 (toolchain 4 + fallbacks 8 code-verified + behavior-code rows counted in 3.1–3.11 as 11 PASS/NOTE-code)
- Explicit per-row: §2 IMPLEMENTED ×8 (one with UI-size note) · §3 PASS(code) ×11 + NOTE ×1 · BLOCKED ×4 (3.13–3.16)
- FAIL: 0
