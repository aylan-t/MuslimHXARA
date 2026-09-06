---
name: Extension engine synchronization
description: Why shared regulatory engine changes must be synchronized and validated across the app and extension.
---

The main app owns the canonical vehicle types, defaults, prefill contract, and calculation engine. Any regulatory change must be synchronized into the browser extension, including updating the sync script’s semantic safeguards when expected legal values change.

**Why:** A compliant canonical change can leave the extension silently stale, while old safeguard strings can make a correct sync fail. Prefill fixtures also need to evolve with newly required verified inputs.

**How to apply:** After changing shared regulatory rules or vehicle inputs, update the safeguard expectations, synchronize the engine, and run the full app and extension tests, type-check, and builds as one unit.