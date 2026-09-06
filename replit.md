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