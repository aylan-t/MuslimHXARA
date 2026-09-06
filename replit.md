# AutoTransat QC

## Run

- Install dependencies with the project package manager.
- Start the web app with `npm run dev -- --host 0.0.0.0 --port 5000`.
- Build with `npm run build`.
- Run calculation checks with `npm test`.

## Product data policy

- Never describe hardcoded transport amounts as official carrier prices.
- A transport price is confirmed only when it comes from a carrier tariff, official calculator, API, or a dated carrier quote.
- When no carrier price is available, keep the calculation usable but label it as indicative and tell the user a quote is required.
- Keep source names, verification dates, inclusions, and exclusions visible wherever a user could rely on a number.

## Regulatory calculator conventions

- Treat the imported regulatory/FX specification and its golden tests as the source of truth for eligibility, compliance fees, and tax formulas.
- Keep live market/settlement FX separate from versioned customs-assessed FX; a live refresh must never overwrite a customs rate.
- `src/` is the canonical calculator implementation. After changing shared types, defaults, prefill validation, or calculation logic, run `npm run sync:extension-engine` inside `marketplace-extension/` and validate both projects.