# Checklist Extension Chrome — AutoTransat QC sur Facebook Marketplace

> **Objectif :** extension MV3 parfaitement fonctionnelle du premier coup.
> **Références :** `MARKETPLACE_EXTENSION.md` (spec), `src/services/calculationEngine.ts` (formules), `src/types/index.ts` (contrats), `src/data/defaultData.ts` (barèmes), Image 1 (layout uniquement).
> **Règles inviolables (§7) :** calcul 100 % local · zéro chiffre en dur hors `engine/defaultData.ts` · `null` = « non inclus » jamais `0` · âge « approximatif (année uniquement) » · SN = 10 ans (décret 2025-1845), jamais 8 · optimiste jamais garanti · FX = scénarios ± % uniquement.
> **Branding :** `AutoTransat QC` (jamais `AutoExport Cost`). **Layout :** Image 1. **Données :** moteur réel, 7 postes `CostBreakdown`, pas les 6 lignes fictives de l'image.

---

## 0. Contrats partagés (lus par les 6 agents AVANT de démarrer — aucun agent ne redéfinit ces interfaces)

```ts
// RawListing (sortie parser.ts — entrée normalize.ts)
interface RawListing {
  listingId: string; listingUrl: string; titleH1: string;
  priceRaw: string | null; priceValue: number | null; currencyFlag: 'CAD' | 'US' | 'UNKNOWN';
  locationRaw: string | null; city: string | null;
  mileageKm: number | null; fuelRaw: string | null; engineLitres: number | null;
  yearInTitle: number | null; yearInBlock: number | null;
  blockFormat: 'apropos' | 'renseignements' | 'none';
  descriptionText: string; isLeaseSuspect: boolean;
  rejection: null | { code: 'USD_PRICE' | 'LEASE_PRICE' | 'NO_PRICE' | 'NO_YEAR' | 'NOT_VEHICLE'; message: string };
}
// NormalizedInputs (sortie normalize.ts — entrée overlay + prefill.ts)
interface NormalizedInputs {
  vehicle: Vehicle; destination: DestinationCountry;
  financing: FinancingConfig; transport: TransportSelection;
  customs: CustomsSelection; targetMarginPercent: number;
}
// PrefillPayload (prefill.ts → App.tsx ?prefill=)
interface PrefillPayload extends NormalizedInputs {
  meta: { listingId: string; listingUrl: string; listingTitle: string; engineVersion: string };
}
```

- `Vehicle/FinancingConfig/TransportSelection/CustomsSelection/GlobalReferenceConfig` = copies à l'identique de `src/types/index.ts`. Ne pas ajouter `fuelType` (n'existe pas dans le type actuel).
- `EXTENSION_ENGINE_VERSION = "<commit hash src/>"` affiché en footer overlay + injecté dans `meta.engineVersion`.
- FX : `fetchLiveFxRates()` copié de `src/services/liveDataService.ts` (timeout 4 s, `XOF = EUR*655.957` si absent, fallback `7.35 / 440.0`, pastille `En direct / Référence`).
- Deep link : méthode URL unique `BASE/?prefill=<base64url(json)>`, < 2 000 car. Documentée, pas de fallback `prefillRef` (décision prise pour la démo).
- Démo MVP : annonce BMW 2014 Laval 5 500 $ → hero + 7 postes + éligibilité SN âge approximatif + encart non-renseignés + `Compléter →` ouvre l'app pré-remplie aux chiffres identiques.

---

## AGENT-01 — Infra, Manifest, Build & Moteur versionné

**Possède :** `marketplace-extension/manifest.json`, `package.json`, `vite.extension.config.ts`, `scripts/sync-engine.mjs`, `src/engine/*`, `src/fx.ts`, `README.md` (squelette).

- [x] 01.1 Créer `marketplace-extension/` + `package.json` (TS + React + vite + vitest, `lucide-react` même version que root) + `vite.extension.config.ts` (build séparé, `outDir dist-extension/`,�ွင်င pas de code distant, CSS inline scopé).
- [x] 01.2 `manifest.json` MV3 : `matches: ["*://www.facebook.com/marketplace/item/*"]`, `run_at: document_idle`, `host_permissions: ["*://www.facebook.com/*"]` uniquement, `optional_host_permissions` vers BASE app configurable, `permissions: ["storage"]` (défauts destination/méthode). Zéro `tabs`, zéro cookies, zéro script distant. Justifier chaque permission en README.
- [x] 01.3 `scripts/sync-engine.mjs` : copie `src/types/index.ts` → `engine/types.ts`, `src/services/calculationEngine.ts` → `engine/calculationEngine.ts`, `src/data/defaultData.ts` → `engine/defaultData.ts` (adapter imports relatifs), injecte `EXTENSION_ENGINE_VERSION`. Ajouter `npm run sync:extension-engine` + doc README.
- [x] 01.4 Exécuter le sync, vérifier `DEFAULT_CONFIG` complet (FX 7.35/440.0 · SN 44.5 % + 10/15 ans + décret · MA 17.5+0.25+TVA20 + MRE 5 ans/90 % · 6 routes · 3 transferts · 7 régions · marketData 12 pts · 6 OFFICIAL_SOURCES).
- [x] 01.5 `src/fx.ts` : portage `fetchLiveFxRates()` (timeout 4 s, 0 retry, fallback + flag `isLive`).
- [x] 01.6 Test d'équivalence moteur (avec AGENT-03) : RAV4 2018 14 200 $ → Dakar RoRo marge 18 % → `landedCostCad`, `customsAndTaxesCad`, `suggestedSalePriceCad`, `estimatedNetProfitCad` **strictement identiques** app vs extension.
- [x] 01.7 `README.md` : justification permissions + version moteur + commande sync + méthode build/zip (`dist-extension/` chargeable mode développeur).

**Acceptation :** `npm run sync:extension-engine && npm run build && npm run test:equivalence` verts · `chrome://extensions` charge le zip sans warning · aucun fetch de calcul (seul FX optionnel).

---

## AGENT-02 — Parser content-script + Fixtures + Tests

**Possède :** `src/parser.ts`, `src/fixtures/*`, `tests/parser.test.ts`, `src/content.tsx` (partie détection/observation uniquement).

- [x] 02.1 Convertir `facebook-marketplace-captures-2026-09-05-20-47.json` en fixtures (min 6 contrastées : BMW 2014 standard · Elantra `$US` · Civic `-1.0 L` · CR-V `Carburant` · Mazda 2 `Renseignements/C$` · EV6 lease `370 $`).
- [x] 02.2 Implémenter `parser.ts` (DOM → `RawListing`, **aucun calcul, aucun réseau**) : `h1` titre · conteneur `À propos de ce véhicule` / `About this vehicle` (remonter ≤ 3 niveaux, découper en lignes) + fallback `Renseignements` · prix/lieu par regex sur conteneur principal · **jamais de sélecteur par classes `x…` hashées**.
- [x] 02.3 Regex §5.2 + 2 correctifs terrain : accepter `C$` comme CAD · fallback année bloc si H1 sans année (`Voiture Mazda 2` → `Année 2012`). Prix : `([\d\s\u202f]+)\s?\$\s?(US|USD)?` + rejet lease `prix<1000 ET (km<60000 OU /transfert de location|lease transfer|location|transfert de bail/i)` → `LEASE_PRICE`. Marqueur US → `USD_PRICE`. Moteur : garder 0.6–8.0 sinon `null`. Fuel : informatif uniquement.
- [x] 02.4 FR + EN (`Driven X km`, `Fuel type:`, `Engine size:`, `Listed … in … QC`). Garde-fou : ni bloc ni année → `NOT_VEHICLE`, overlay inactif.
- [x] 02.5 `content.tsx` (partie) : observer SPA (`history.pushState` + `MutationObserver` sur `h1`), re-parser si `listingId` change, démonter hors `/marketplace/item/`.
- [x] 02.6 Tests : prix/devise/lieu/km/fuel/cylindrée (ou absence) corrects · lease rejeté · USD rejeté-avec-message · `-1.0 L` → `null` · non-véhicule → inactif. 6 cas verts min.

**Acceptation :** `npm run test:parser` 6/6 verts sur fixtures réelles · vérifié que `textCandidates` (classes `x1i10hfl…`) ne sont jamais utilisés · BMW 2014 Laval 5 500 $/240 000 km/Essence parsé exact.

---

## AGENT-03 — Normalize + Prefill protocol + Tests d'entrée moteur

**Possède :** `src/normalize.ts`, `src/prefill.ts`, `tests/normalize.test.ts`, `tests/equivalence.test.ts` (avec AGENT-01).

- [x] 03.1 `normalize.ts` (`RawListing` → `NormalizedInputs`, §4) : `brand` = 1er token H1 capitalisé + dédup (`MAZDA MAZDA3` → `Mazda`/`MAZDA3`, `Voiture Mazda 2` → `Mazda`/`2`) · `year` = titre sinon bloc (1980–2027) sinon `NO_YEAR` · `purchasePriceCad` = CAD seul (`$`/`C$`/CAD), rejet `USD_PRICE`/`LEASE_PRICE` · `mileageKm` sinon `120000` (informatif) · `category` heuristique (`cr-v/rx/santa fe/c-hr/ev6`→suv · `f-150/pickup`→camionnette · `fit/yaris/500e/cooper/mazda2`→citadine · défaut suv + note « supposée, à vérifier ») · `condition bon` · `source particulier` · encan/courtier `0` · `originRegionId` via ville (Montréal/Laval/Mont-Royal→`grand-montreal`, sinon meilleur match `QUEBEC_REGIONS`) · `isNonRunning` sur `pour pièces|parts only|non roulant|accidenté|scrap`.
- [x] 03.2 Défauts §4.2 : `financing {plateforme_transfert, 15, 0.7, 1.2}` · `transport {mtl-dkr-roro SN / mtl-casa-roro MA, batch 1, annexes 400/180/250/200, réparations 0}` · `customs {country, invoice, MRE false}` (ne pas saisir `estimatedArgusValueCad`, laisser le moteur estimer) · marge `18` · destination = `chrome.storage.local` sinon `senegal`.
- [x] 03.3 `prefill.ts` : `buildPrefillUrl(BASE, inputs, meta)` → `BASE/?prefill=<base64url>` < 2 000 car + `parsePrefill()` partagé avec l'app. Pas de `fuelType`, pas de cylindrée/VIN dans `Vehicle`.
- [x] 03.4 Tests normalize : BMW 2014 → `Vehicle` §4.1 exact · USD → rejet · lease → rejet · `-1.0 L` → absent · `Carburant`/absent → sans impact · `MAZDA MAZDA3` dédupliqué · Mont-Royal → `grand-montreal`.
- [x] 03.5 Test d'équivalence (avec AGENT-01) : même entrée app/extension → 4 montants identiques (scénario RAV4 démo).

**Acceptation :** `npm run test:normalize && npm run test:equivalence` verts · `VGA`/`accident réparé` (Elantra/Civic) remontés en avertissement informatif, jamais en rejet · `328i xdrive` en description jamais utilisé comme cylindrée.

---

## AGENT-04 — Overlay UI core (layout Image 1 + données moteur réelles)

**Possède :** `src/overlay.tsx` (structure, header, hero, breakdown, éligibilité), `src/content.tsx` (partie montage).

- [x] 04.1 Coquille : panneau fixe droit `~380 px`, `z-index` > FB, boutons réduire/fermer, ne masque jamais le bouton message vendeur, scope `#axc-overlay`, toggle SN/MA en tête (recalcule local via `calculateSimulation()`).
- [x] 04.2 Header : logo `Ship` + `AutoTransat QC` + pastille FX (`En direct`/`Référence`) + `Live estimate` + chip titre annonce. Footer : `Propulsé par AutoTransat QC — moteur vX` + disclaimer footer app (estimation prévisionnelle, validation transitaire).
- [x] 04.3 Hero : `Estimation rendue à {Dakar|Casablanca}` + `landedCostCad` grand + `+X $ de frais (+Y %)` (landed − achat) + verdict 1 phrase (wording `ResultsDashboard`) + devise locale (`XOF`/`MAD`).
- [x] 04.4 Badge éligibilité `success/warning/error` + **message intégral du moteur** + mention « âge approximatif (année uniquement) ». État `isEligible=false` : règle d'âge + « calcul indicatif, import refoulé ».
- [x] 04.5 Détail des coûts = **7 postes réels** (`CostBreakdown.tsx` : achat, spread+virement, transport A-Z en 6 sous-postes, encan, annexes 400/180/250/200, douane CAF + base + mode facture/Argus + `customsDifferenceArgusCad`) avec icônes `lucide-react` + pastilles `Montant exact / Estimation`. Interdit : reprendre les 6 lignes fictives de l'image (`Export Canada 1200`, `Douanes ≈20%`, etc.).
- [x] 04.6 Montage : `content.tsx` monte l'overlay après parse+normalize réussis, skeleton pendant calcul, démonte hors annonce.

**Acceptation :** sur BMW 2014 Laval 5 500 $ : hero + 7 postes + éligibilité SN affichés, chiffres = `calculateSimulation()` local (zéro dur), pastille FX correcte.

---

## AGENT-05 — Overlay interactivité, États, Options & Styles scopés

**Possède :** `src/overlay.tsx` (blocs avancés), `src/overlay.css`, `options.html`, `src/options.ts`.

- [x] 05.1 `marketComparison` si match (verdict + écart %, wordings `MarketComparison.tsx`), sinon encart neutre existant. FX compact : 3 pastilles pessimiste/réaliste/optimiste (optimiste jamais garanti, mention « estimation »).
- [x] 05.2 Contrôles : slider marge 8–30 (défaut 18, recalcule local) · sélecteur route du pays (RoRo/conteneur, `batchVehiclesCount` 1–4 si conteneur) · 3 presets transfert issus de `config.transferMethods` · toggles frais annexes · toggle MRE si MA + option `argus_official` (sans saisir de valeur).
- [x] 05.3 Encart ambre « infos manquantes » : `Cylindrée Non renseignée / VIN Non renseigné` + bouton `Compléter →` (deep link §6.3). `WarningCard`-like pour warning MRE/commercial Maroc.
- [x] 05.4 États : chargement skeleton · prix rejeté (lease/USD messagé, jamais de calcul) · annonce non-véhicule inactif · FX indisponible → pastille `Référence` sans erreur.
- [x] 05.5 `overlay.css` dark cohérent app : fond `slate-900/95` + `backdrop-blur`, cartes `slate-800/60`, bordures `slate-700`, accents `senegal #16a34a` / `morocco #ea580c` / `brand #0284c7`, Inter, `rounded-2xl`, `shadow-2xl`. Strictement sous `#axc-overlay` (zéro fuite vers FB, zéro dépendance aux classes FB).
- [x] 05.6 `options.html` : BASE URL app (défaut `http://localhost:3000`, modifiable prod) + destination + méthode de transfert par défaut (persistés `chrome.storage.local`).

**Acceptation :** chaque contrôle recalcule localement sans réseau · `null` affiché « non inclus » jamais `0 $` · aucune régression visuelle FB (message vendeur cliquable, scroll intact).

---

## AGENT-06 — Intégration App host (`?prefill=`), QA E2E & Release

**Possède :** `src/App.tsx` (ajout prefill), `tests/e2e-prefill.test.*`, `dist-extension/` + zip, section QA du `README.md`.

- [x] 06.1 `App.tsx` au boot : lire `?prefill=` via `parsePrefill()` partagé, hydrater `vehicle/destination/financing/transport/customs/targetMargin`, onglet `wizard` étape 1, bandeau « Pré-rempli depuis l'annonce <titre> — vérifiez les champs » + lien URL FB d'origine. Submit inchangé (`calculateSimulation()` → `results` → `localStorage` → PDF).
- [x] 06.2 Garde-fous : payload invalide/trop grand (> 2 000 car) → ignorer proprement + message, jamais de crash. Pas de router à ajouter (reste SPA à onglets).
- [x] 06.3 E2E : annonce → overlay → `Compléter →`/`Voir le détail complet` → wizard pré-rempli → `Calculer` → résultats **identiques à l'overlay** (4 montants). Scénario MVP BMW 2014 vert.
- [x] 06.4 QA navigateurs : Chrome + Edge, navigation SPA inter-annonces (re-parse sur `listingId`), FR + EN, cas limites (`$US`, leases 57 $/370 $, `-1.0 L`, `Carburant`/absent, `Renseignements`, `MAZDA MAZDA3`, Mont-Royal).
- [x] 06.5 Release : `npm run build` → zip `dist-extension/` chargeable en mode développeur sans erreur MV3 · README QA + version moteur + périmètre (hors scope : Web Store, Firefox/Safari, multi-annonces, images, VIN decoder).

**Acceptation (MVP démo réussie) :** sur BMW 2014 Laval 5 500 $, overlay complet + `Compléter →` ouvre l'app pré-remplie qui mène aux mêmes chiffres · checklist §8 items 1–5 cochés avec preuves (captures + logs de tests).

---

## Graphe d'exécution parallèle

```
AGENT-01 (infra/moteur) ──┬──> AGENT-04 (overlay core)
AGENT-02 (parser) ─────────┼──> AGENT-03 (normalize/prefill) ──> AGENT-04/05
AGENT-03 (contrat prefill) ──> AGENT-06 (App ?prefill=)  [indépendant dès contrat §0 figé]
AGENT-04 + AGENT-05 ──> AGENT-06 (E2E finale)
```

**Règle anti-blocage :** si un agent attend un autre, il avance avec mocks typés selon §0 puis converge au checkpoint d'intégration (équivalence RAV4 + MVP BMW).

---

## Suivi terrain v1.1.0 (post-MVP, sans subagents)

- [x] 07.1 Logs persistants : `src/logStore.ts` (anneau 300 + miroir `chrome.storage.local`, testé `tests/logStore.test.ts`), `logger.ts` branché dessus (console inchangée, `debug` stocké seulement en verbeux, flag aussi via storage pour le popup).
- [x] 07.2 Popup diagnostic (clic icône) : `popup.html` + `popup.js` statiques (vanilla, sans build) — version extension (`manifest`), version moteur + date build (`build-info.json` généré), annonce détectée sur l'onglet actif, journal auto-refresh + Copier/Effacer, toggle « Logs détaillés ». `manifest.json` : `action.default_popup` + version **1.1.0**.
- [x] 07.3 Robustesse NO_PRICE terrain : H1 préféré avec année + `h1Candidates` + ancres multiples + fenêtre élargie + repli `body` si `<main>` incomplet + balayage intégral avec drapeau `priceFallbackWholeText` (parser + content-main + 3 tests dont cas réel Lexus 2013 / 7 950 $).
- [x] 07.4 Panneau décalé sous le header FB (`top:70px`, `content.tsx` + `content-main.tsx`) — ne chevauche plus les icônes.
- [x] 07.5 Vérifié : `tsc` propre, parser 13/13, vitest 33/33, build vert (`content.js` IIFE + `popup.html/js` + `build-info.json` + `manifest.json` en `dist-extension/`).

## Suivi terrain v1.1.1 (logs utilisateur : `textContent` = 150 Ko de JS inline)

Constat via popup Copier : `bodyLen:150000` + `ancrage H1 INTROUVABLE` + `snippet prix`
rempli de JS (`cr:1801726…DebugOwl…`), puis faux positif `USD_PRICE (8Us)` pris
dans du code JS. Cause : `textContent` inclut les `<script>` ; FB ouvre son body
par ~150 Ko de JS inline avant le contenu réel.

- [x] 07.6 `src/domSource.ts` (pur, testé `tests/domSource.test.ts`) : `visibleText()`
  (`innerText` = texte rendu uniquement, repli `textContent`), `chooseTextSource()`
  (main préféré sauf < 200 car. visibles ou sans ancre H1 → body).
- [x] 07.7 `content-main.tsx` : `readDom` sur texte visible + source loggée ;
  `boot()` ne lance plus le pipeline en double (l'observer émet l'état initial).
- [x] 07.8 `manifest.json` version **1.1.1** (popup : vérifiable d'un coup d'œil).
- [x] 07.9 Vérifié : `tsc` propre, parser 13/13, vitest 37/37, build vert.

## Suivi terrain v1.2.0 (overlay transparent : CSS jamais embarqué)

Constat capture : pipeline 100 % vert (parse 16900 CAD → calcul 30621 → mount)
mais overlay sans aucun style. Cause : `overlay.css` seulement cité en
commentaires, jamais importé ; utilitaires Tailwind d'`overlay.tsx` inexistants
dans l'extension.

- [x] 07.10 `src/axc-bridge.css` : pont d'utilitaires scopé `#axc-overlay`
  (~100 classes employées : layout, spacing, typo, couleurs) mappées au thème
  dark Image 1 (pas de Tailwind, pas de preflight : zéro fuite vers FB).
- [x] 07.11 Injection en ligne : `?inline` (`vite-env.d.ts`) + `ensureAxcStyles()`
  dans `content.tsx`, `mountNode()` centralisé (racine React unique — plus de
  conflit createRoot), `mountRejection` passé par `mountNode` (carte de rejet
  stylée elle aussi).
- [x] 07.12 `manifest.json` version **1.2.0**. Vérifié : `tsc` propre, parser
  13/13, vitest 37/37, build vert, CSS présent dans `content.js`
  (`#axc-overlay`, `.axc-card`, `.bg-senegal`, `backdrop-filter`, shimmer).

## Suivi terrain v1.2.1 (flash navy 1 ms puis transparent)

Cause : `createRoot` supprime les enfants pré-existants du conteneur au premier
rendu — dont le `<style>` injecté dans l'hôte (skeleton réinjecte → flash →
overlay le resupprime → transparent).

- [x] 07.13 Styles injectés dans `<head>` (scope `#axc-overlay` inchangé, zéro
  fuite) + `logPaintCheck` après peinture (`styleTags`, `hostBg` loggés).
- [x] 07.14 `manifest.json` version **1.2.1**. Vérifié : `tsc` propre, build vert.

## Suivi terrain v1.2.2 (faux NOT_VEHICLE collé après navigation SPA)

Logs : pipeline démarré 40 ms après navigation sur DOM transitoire
(`h1:"Notifications"`, `bodyLen:59`) → rejet, puis plus aucune relance à
l'arrivée du vrai contenu (l'observer ne suivait que l'ID, inchangé).

- [x] 07.15 `content-detection.ts` : émission aussi sur changement de h1
  (debounce 350 ms, payload `{id, h1}`), émission immédiate sur changement
  d'ID, état initial explicite.
- [x] 07.16 `content-main.tsx` : `waitForTitleYear` (poll h1 peu coûteux,
  max ~4 s, skeleton affiché, remplace le retry aveugle 1.5 s) + garde
  anti-boucle (`lastSettledId` : même annonce montée ignorée, run non abouti
  toujours repris).
- [x] 07.17 `manifest.json` version **1.2.2**. Vérifié : `tsc` propre, build
  vert. À valider : annonce → `/marketplace` → autre annonce **sans reload**
  → skeleton puis estimation (logs : `h1-settle` → `titre rendu` → `calcul OK`).

## Suivi terrain v1.2.3 (minimize → bulle ferry)

- [x] 07.18 `overlay.tsx` : état minimize = bulle circulaire 56 px (icône
  `Ship`, pastille d'éligibilité vert/ambre/rouge, hover scale, alignée à
  droite de l'hôte). Clic → réouvre (`handleMinimize` existant).
- [x] 07.19 Styles `.axc-bubble` dans `overlay.css` (gradient brand, ombre,
  embarqués en ligne comme le reste). `manifest.json` version **1.2.3**.
  Vérifié : `tsc` propre, build vert.

## Suivi terrain v1.2.4 (bulle = gros blob navy)

Capture : la bulle (bonne) flottait sur le fond navy 380 px de l'hôte.
Cause : `#axc-overlay` garde son fond/bordure/largeur même en minimize.

- [x] 07.20 `overlay.tsx` : `useEffect` posant `data-axc-min="1|0"` sur l'hôte
  + règle `#axc-overlay[data-axc-min="1"]` (fond/bordure/ombre/padding
  neutralisés, `width:auto`, `!important` contre les styles inline).
- [x] 07.21 `manifest.json` version **1.2.4**. Vérifié : `tsc` propre, build vert.

## Suivi terrain v1.2.5 (flèches scrollbar au hover de la bulle)

Capture : triangles de scrollbar Windows autour de la bulle au survol.
Cause : le zoom hover (`scale(1.07)`) fait déborder la bulle de son hôte en
`overflow:auto` → barres système.

- [x] 07.22 `#axc-overlay[data-axc-min="1"]` : `overflow:visible` +
  `max-height:none` (`!important`). Le zoom hover est conservé, sans clipping.
- [x] 07.23 `manifest.json` version **1.2.5**. Vérifié : `tsc` propre, build vert.

## Rework visuel v1.3.0 (« cockpit de négociant », non committé)

Constats captures : header tronqué/2 badges redondants, verdict noyé, mur de
texte légal + bug « 0 an(s) », titres de postes tronqués (contenu illisible),
hash moteur 40 car. en footer, blocs marché/FX/manquant construits mais jamais
montés.

- [x] 08.1 `src/services/calculationEngine.ts` : `ageLabel` (« moins d'un an »
  si âge ≤ 0, 5 messages) + `sync:extension-engine` 11/11 (moteur 7b76b76).
- [x] 08.2 `overlay.tsx` réécrit : topbar pleine (1 pastille live), hero
  (chiffre gradient 40px), bannière verdict profit/perte (+ROI/marge),
  éligibilité compacte + texte légal en `<details>` (ouvert si refus),
  lignes de coûts SANS troncature (grille icône/texte/montant+%/pastille),
  barre animée, `MarketBlock` + `FxBlock` + `MreWarningBlock`
  (via `DEFAULT_CONFIG`) + `MissingInfoBlock` câblés, CTA, footer hash court.
- [x] 08.3 CSS : entrée en cascade, pastille live pulsante, toggle SN/MA,
  verdicts, éligibilité 3 tons, lignes/détails, CTA, footer ; `tabular-nums`
  au pont. Zéro changement logique/métier.
- [x] 08.4 `manifest.json` version **1.3.0**. Vérifié : `tsc` propre (ext +
  root), parser 13/13, vitest 37/37 (équivalence OK), build vert.
  Note : `node test_calculations.mjs` (root) est cassé de façon pré-existante
  (import ESM de dossier sous Node 25, vérifié via stash) — hors scope.

## Placement v1.3.1 (drawer latéral ancré, capture rectangle rouge)

Demande : overlay ancré à droite et en bas (flush), sous le header FB —
plus de panneau flottant.

- [x] 09.1 Hôte : `top:64px; right:0; bottom:0; width:400px` (inline +
  fallback CSS), radius haut-gauche seul, ombre portée vers la gauche,
  bordures droite/basse supprimées (flush écran).
- [x] 09.2 Mode bulle : `data-axc-min="1"` neutralise aussi `top/right/bottom`
  (la bulle reste flottante en haut à droite, fini le tiroir étiré).
- [x] 09.3 `manifest.json` version **1.3.1**. Vérifié : `tsc` propre, build vert.
