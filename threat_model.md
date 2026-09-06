# Threat Model

## Project Overview

AutoTransat QC is a React/Vite vehicle-import cost calculator with an optional FastAPI calculation API. It handles user-entered vehicle and cost assumptions, computes estimates, stores configuration and simulation history in the browser, fetches public exchange-rate data, and exports reports as PDFs. The reviewed code has no accounts, shared persistence, payment processing, or administrative server state. Deployment metadata reports no active deployment.

## Assets

- **User-entered simulation data** — vehicle details and financial assumptions may be commercially sensitive, though they remain in the user's browser in the current architecture.
- **Calculation integrity** — users may make business decisions based on transport, customs, exchange-rate, and profitability estimates.
- **Application availability** — the calculator and optional API should remain responsive to malformed public input.
- **Reference configuration and provenance** — tariff assumptions, customs rules, source labels, and verification dates must not be misrepresented or silently changed across users.

## Trust Boundaries

- **Browser to FastAPI API** — if the optional backend is served, request bodies are attacker-controlled. The API is public and currently provides stateless calculations and public reference configuration only.
- **Browser local storage** — local configuration and histories can be modified by the browser user or scripts executing in the same origin; they must never be treated as trusted server policy.
- **Browser to exchange-rate provider** — the client consumes availability and rate data from `open.er-api.com`; responses are untrusted external data and failure must not silently masquerade as verified current data.
- **Browser to generated PDF / external market links** — user-entered values cross into downloadable documents and outbound navigation and must remain data rather than executable markup or URLs.

## Scan Anchors

- Production entry points: `src/main.tsx`, `src/App.tsx`, and optional `backend/main.py`.
- Highest-risk areas: `backend/schemas.py` input constraints, `backend/main.py` calculations/CORS, `src/services/storageService.ts`, `src/services/pdfExportService.ts`, `src/services/liveDataService.ts`, and `src/services/platformLinksService.ts`.
- All current API operations are public and stateless; there is no authenticated or admin server boundary. The UI's configuration editor changes browser-local data only.
- Ignore `node_modules/`, `.local/`, caches, and generated `dist/` as source-of-truth code unless build output demonstrates client secret exposure.

## Threat Categories

### Spoofing

There are no user or service identities in the current product. If accounts, shared data, or privileged configuration are introduced, every protected API operation must establish a trusted server-side subject; browser-local role or configuration state cannot provide authentication.

### Tampering

All browser values and FastAPI request fields are attacker-controlled. Calculation inputs must be finite and constrained to meaningful ranges before arithmetic. Reference configuration that becomes shared or authoritative must only be mutable through authenticated, authorized server operations. External exchange-rate data must be validated before use and clearly retain its source and freshness status.

### Information Disclosure

Simulation data should remain local unless users explicitly submit it. Client bundles and generated artifacts must contain no privileged credentials. Future list, export, or persistence endpoints must scope private records to the authenticated owner or tenant and avoid returning unnecessary fields.

### Denial of Service

Public API inputs must not trigger unbounded work, pathological numeric behavior, or process instability. Request/body limits and upstream rate controls should match deployment exposure. External data requests need timeouts and graceful fallback so third-party outages do not break the calculator.

### Elevation of Privilege

The current backend has no privileged actions. Any future server-side admin, tariff editing, upload, billing, or shared-history feature must enforce authorization on the exact object and action. Database queries, filesystem paths, templates, redirects, and outbound requests introduced later must keep untrusted input away from dangerous sinks or apply specific validation and scoping.
