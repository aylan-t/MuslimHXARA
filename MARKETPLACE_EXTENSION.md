# MARKETPLACE_EXTENSION.md — Spec extension navigateur « AutoTransat QC sur Facebook Marketplace »

> **Destinataire :** agent développeur chargé de construire l'extension.
> **But :** décrire EXACTEMENT quoi construire, à partir de quoi, et comment — sans ambiguïté.
> **Projet parent :** `C:\Portfolio Prog\muslimhacks2026` — **Vite 6 + React 18 + TypeScript + Tailwind 3** (SPA sans router). Ce document remplace toute spec antérieure référençant Next.js / `/api/calculate` / `calc-types.ts` / `PRD.md` : **ces éléments n'existent pas dans ce codebase**.
> **Sources de vérité métier :** `src/services/calculationEngine.ts` (formules), `src/types/index.ts` (contrats), `src/data/defaultData.ts` (barèmes). Le backend `backend/main.py` (FastAPI) est **optionnel et divergent** — ne pas l'utiliser.

---

## 1. Objectif

Créer une **extension navigateur Chrome / Edge, Manifest V3** qui, sur une page annonce véhicule Facebook Marketplace (`facebook.com/marketplace/item/<listingId>`), affiche un **panneau overlay « AutoTransat QC »** estimant le coût rendu (landed cost) et le profit net vers le **Sénégal (Dakar)** ou le **Maroc (Casablanca / Tanger Med)**.

Principes non négociables :

1. **Calcul 100 % local dans l'extension.** Il n'y a pas d'API de calcul dans ce projet (le frontend calcule côté client via `calculateSimulation()`). L'extension embarque une copie versionnée du moteur — elle n'appelle aucun backend pour calculer.
2. **Aucun chiffre inventé.** Taux, taxes, âges limites, frets : uniquement ceux de `DEFAULT_CONFIG` importé. Jamais de taux en dur dans le code de l'extension.
3. **`null / undefined` = inconnu, jamais `0`.** Un frais inconnu s'affiche « non inclus », jamais « 0 $ ».
4. **Âge approximatif.** L'annonce ne donne qu'une année → l'overlay affiche toujours « âge approximatif (année uniquement) », car les règles SN (≤ 10 ans) / MRE (≤ 5 ans) portent sur la date exacte.

---

## 2. Contexte codebase existant (à réutiliser, ne pas réinventer)

| Élément | Emplacement réel | Contrat exact |
|---|---|---|
| Types | `src/types/index.ts` | `Vehicle`, `FinancingConfig`, `TransportSelection` (+ `AdditionalExportCosts`), `CustomsSelection` (+ `MoroccoCustomsOptions`), `CostBreakdown`, `SimulationResult`, `GlobalReferenceConfig`, `DestinationCountry` |
| Moteur (client) | `src/services/calculationEngine.ts` | `calculateSimulation(vehicle, country, financing, transport, customs, targetMargin, config): SimulationResult` · `checkEligibility(vehicle, country, customs, config)` · `calculateBatchOptimization(country, config)` · `CURRENT_YEAR = 2026` |
| Barèmes | `src/data/defaultData.ts` | `DEFAULT_CONFIG` (FX `CAD→MAD 7.35`, `CAD→XOF 440.0` ; douane SN `44.5 %` CAF, décret n° 2025-1845 24 oct. 2025, 10 ans tourisme / 15 camions ; Maroc standard `17.5 % + 0.25 % + TVA 20 %`, MRE `5 ans max`, abattement `90 %` ; 6 routes RoRo/cont40 ; 3 méthodes de transfert ; 7 régions QC ; 10 `PRELOADED_VEHICLES` ; 12 points `marketData` ; 6 `OFFICIAL_SOURCES`), `DEMO_VEHICLE` (RAV4 2018, 14 200 $), `QUEBEC_REGIONS` |
| App SPA | `src/App.tsx` | 6 onglets sans router : `wizard` (4 étapes) / `results` / `cargo` / `optimizer` / `history` / `config`. État en `useState`, persistance `localStorage` via `src/services/storageService.ts` |
| Wizard | `src/components/wizard/` | `StepVehicle` (marque/modèle/année/prix/km/catégorie/région QC/non-roulant + autofill 10 modèles) → `StepDestination` (cartes SN/MA + éligibilité temps réel + base facture/Argus + MRE) → `StepFinancing` (3 méthodes, reco Wise 1.2 % vs banque 3.4 %) → `StepTransport` (routes filtrées par pays + groupage 1-4 + checklist frais annexes 400/180/250/200 $) |
| Résultats | `src/components/results/` | `ResultsDashboard` (verdict 1 phrase + 4 KPI + marge slider 8-30 % + sauvegarde + PDF) + `CostBreakdown` (accordéon 7 postes + barre proportion) + `FxSensitivity` (±7.5 % + slider ±15 %) + `MarketComparison` (4 verdicts) + `LocalMarketLinks` (Avito/Moteur/Dakar-Auto/CoinAfrique via `src/services/platformLinksService.ts`) |
| FX live | `src/services/liveDataService.ts` | `fetchLiveFxRates()` → `open.er-api.com/v6/latest/CAD`, timeout 4 s, `XOF = EUR*655.957` si absent, fallback `7.35 / 440.0`, `isLive` flag |
| PDF | `src/services/pdfExportService.ts` | `generateSimulationPdf(sim)` (jsPDF 1 page) |
| Backend (à ignorer) | `backend/main.py`, `backend/schemas.py` | Version simplifiée divergente (pas de frais annexes, pas d'Argus, pas de régions, pas de scénarios FX). **L'extension ne doit pas l'appeler.** |

Formule landed cost (rappel, vit dans le moteur) :
```
landed = achat + spreadFX + virement + transportTotal
       + encan/courtier + fraisAnnexes + douane(CAF)
CAF = baseVéhicule(facture ou Argus) + fret + assurance(1.5 %)
SN  = CAF * 44.5 %
MA standard = droit 17.5 % + parafiscal 0.25 % + TVA 20 % sur (base+droit)
MA MRE = (17.5 %+20 %) * (1-90 %)
```

---

## 3. Données source : `facebook-marketplace-captures-2026-09-05-20-47.json`

15 captures vérifiées (`{ listingId, url, timestamp, pageTitle, bodyText, headings[], textCandidates[] }`). IDs et titres constatés :

- `1278702150685897` 2014 BMW 3 Series · `1016869297640749` Voiture Mazda 2 (format `Renseignements`, pas de `À propos`) · `3177445169120493` 2021 Toyota C-HR · `1019155947514160` 2010 MINI Cooper · `1802319030609563` 2017 Lexus RX · `2435303743955050` 2020 Hyundai Elantra (**prix `$US`**) · `878197834687061` 2021 Honda CR-V (`Type de carburant : Carburant`) · `2580068895787032` 2012 Hyundai Santa Fe (pas de fuel) · `1761189968458950` 2015 Chrysler 200 (pas de fuel) · `2172514816620002` 2025 Honda Civic (`Taille du moteur : -1.0 L`) · `1775113550149853` 2026 Fiat 500E (**lease `57 $`**, 301 km, Électrique) · `1081380931030162` 2014 Mazda MAZDA MAZDA3 · `2985363921832527` 2024 Lamborghini Revuelto (Hybride) · `1794586041727635` 2025 Kia EV6 (**lease `370 $`**, 25 800 km) · `1057054373914126` 2014 Mazda MAZDA MAZDA6 (Mont-Royal)

### 3.1. Champs exploitables

- **Titre** (`h1`, toujours présent) : année + marque + modèle (`2014 BMW 3 Series`, `Voiture Mazda 2`, `2014 Mazda MAZDA MAZDA3` → dédupliquer).
- **Prix** (`bodyText`) : `5 500 $`, `23 485 $`, `370 $`, `11 000 $US`.
- **Lieu** : `Mis en vente … sur Laval, QC` / `Listed … in Montreal, QC`.
- **Bloc véhicule** (14/15 `À propos de ce véhicule`, 1/15 `Renseignements`) : `A roulé X km`, `Boîte automatique`, `Type de carburant : …`, `Taille du moteur : …` (**1/15 seulement**), `Km : 258752 | Année 2012 | …` (format Mazda 2).
- **Description vendeur** : texte libre (`328i xdrive`, `BMW 750 Xdrive 2015`) — indice cylindrée possible, jamais fiable seul.

### 3.2. Pièges réels (tous observés — à gérer explicitement)

1. **Devise `$US`** (Elantra) → rejeter avec message, ne jamais convertir côté extension.
2. **Prix leurres de location** (Fiat 500e `57 $` / 301 km, EV6 `370 $` / transfert de location) → rejeter avec message explicite, jamais calculer dessus.
3. **Cylindrée garbage** (`-1.0 L` sur Civic 2025) → traiter comme absente.
4. **Carburant non mappable** (`Carburant`, absent) → `other` équivalent local : ne pas envoyer de `fuelType` (le type `Vehicle` actuel n'a pas ce champ) ; ne rien déduire, laisser le calcul standard.
5. **Hybride / Électrique** (Revuelto, 500e, EV6) → informatif uniquement, aucun impact sur le moteur actuel.
6. **Format `Renseignements`** (Mazda 2) → pattern secondaire obligatoire.
7. **Vendeur particulier vs commerçant** : non structuré → toujours `source: 'particulier'`, `auctionFeesCad: 0`, `brokerCommissionCad: 0`.
8. **VIN / cylindrée / chevaux fiscaux / date exacte 1re immat** : jamais présents → affichés comme « non renseignés » dans l'overlay, sans bloquer le calcul.

---

## 4. Mapping annonce → entrées du moteur réel

Le moteur prend `(Vehicle, DestinationCountry, FinancingConfig, TransportSelection, CustomsSelection, targetMargin, config)`. L'extension construit :

### 4.1. `Vehicle`

| Champ | Règle d'extraction | Défaut |
|---|---|---|
| `brand` / `model` | Titre `h1` : année retirée, 1er token = marque (capitalize, dédupliquer `MAZDA MAZDA3` → `Mazda` / `MAZDA3`), reste = modèle. `Voiture Mazda 2` → `Mazda` / `2` | Obligatoires ; si absents → pas de calcul, état « annonce non interprétable » |
| `year` | Premier entier 1980–2027 dans le `h1` | Obligatoire ; si absent → pas de calcul |
| `purchasePriceCad` | Regex §5.2. N'accepter que `$`/`C$`/CAD. Si marqueur US/USD → rejet « prix en $US, saisissez le prix CAD ». Si lease-détecté → rejet « prix non interprétable (location) » | Si absent/rejeté → pas de calcul |
| `mileageKm` | `A roulé X km` / `Driven X km` / `Km : X` | `120000` si absent (informatif, pas fiscal) |
| `category` | Heuristique titre : `cr-v`, `rx`, `santa fe`, `c-hr`, `ev6` → `suv` ; `f-150`, `pickup` → `camionnette` ; `fit`, `yaris`, `500e`, `cooper`, `mazda2`, `2` seule → `citadine` ; sinon `berline` si berline explicite, défaut `suv` + note « catégorie supposée, à vérifier » | `suv` |
| `condition` / `source` | Non détectables | `bon` / `particulier` |
| `auctionFeesCad` / `brokerCommissionCad` | Non détectables | `0` |
| `originRegionId` | Ville extraite → `grand-montreal` (Montréal, Laval, Longueuil, Mont-Royal…) ; autres villes QC → meilleur match `QUEBEC_REGIONS`, sinon `grand-montreal` | `grand-montreal` |
| `isNonRunning` | Mots-clés `pour pièces`, `parts only`, `non roulant`, `accidenté`, `scrap` | `false` |

### 4.2. `FinancingConfig`, `TransportSelection`, `CustomsSelection`, marge

- `financing` : `{ method: 'plateforme_transfert', fixedFeeCad: 15, variableFeePercent: 0.7, fxSpreadPercent: 1.2 }` (recommandé app). Champs modifiables dans l'overlay (3 presets issus de `config.transferMethods`).
- `transport` : `{ routeId: 'mtl-dkr-roro' (SN) ou 'mtl-casa-roro' (MA), batchVehiclesCount: 1 }`, modifiable (liste des routes du pays + toggle RoRo/conteneur). `additionalCosts` : défauts app (transitaire 400, lavage 180, magasinage 250, batterie 200 si source encan → ici `false`, réparations 0), toggles dans l'overlay.
- `customs` : `{ country, valuationBasis: 'invoice', moroccoOptions: { isMRE: false, … } }`. Toggle MRE dans l'overlay quand MA. Option `argus_official` proposée (le moteur estime l'Argus seul si `estimatedArgusValueCad` absent — ne pas saisir de valeur, laisser le moteur faire).
- `targetMarginPercent` : `18` défaut, slider 8–30 dans l'overlay.
- `destinationCountry` : toggle SN/MA en tête d'overlay, défaut = dernier choix (`chrome.storage.local`), sinon `senegal`.
- `config` : `DEFAULT_CONFIG` **importé tel quel** du repo (copie versionnée, champ `EXTENSION_ENGINE_VERSION = "<commit hash>"` affiché dans l'overlay). FX : tenter `fetchLiveFxRates()` avec timeout 4 s, sinon valeurs `DEFAULT_CONFIG`, pastille `En direct / Référence`.

---

## 5. Spec du parser (content script)

### 5.1. Ciblage

- **Manifest V3**, `matches: ["*://www.facebook.com/marketplace/item/*"]`, `run_at: "document_idle"`.
- **Ne jamais sélectionner par classes CSS** (`x1i10hfl…`, hashées). Parser par contenu texte : `h1` pour le titre ; élément contenant `À propos de ce véhicule` / `About this vehicle` (remonter max 3 niveaux pour le conteneur, découper en lignes) avec fallback `Renseignements` ; prix et lieu par regex sur le `bodyText` du conteneur principal.
- **SPA** : observer `history.pushState` + `MutationObserver` sur `h1`, re-parser quand `listingId` change, démonter l'overlay hors `/marketplace/item/`.
- **Langues** FR + EN (`About this vehicle`, `Driven X km`, `Fuel type:`, `Engine size:`, `Listed … in Montreal, QC`).
- **Garde-fou véhicule** : si ni bloc véhicule ni année dans le titre → rester inactif (page non-véhicule).

### 5.2. Regex de référence (implémenter + tester sur les 15 fixtures)

```text
PRIX  : ([\d\s\u202f]+)\s?\$\s?(US|USD)?   → chiffres (espaces insécables inclus) + marqueur USD optionnel
        + rejet lease : prix < 1000 ET (km < 60 000 OU description contient "transfert de location|lease transfer|location|transfert de bail") → REJET location
LIEU  : /Mis en vente[^.]*?sur\s+([A-Za-zÀ-ÿ\-\s']+),\s*QC|Listed[^.]*?in\s+([A-Za-zÀ-ÿ\-\s']+),\s*QC/
KM    : /A roulé\s+([\d\s\u202f]+)\s*km|Driven\s+([\d\s\u202f]+)\s*km|Km\s*:\s*(\d+)/i
FUEL  : /Type de carburant\s*:\s*([^\n·|]+)|Fuel type\s*:\s*([^\n·|]+)/i   (informatif uniquement)
MOTEUR: /Taille du moteur\s*:\s*(-?[\d.,]+)\s*L|Engine size\s*:\s*(-?[\d.,]+)\s*L/i → garder seulement si 0.6–8.0, sinon absent (informatif uniquement)
ANNÉE : /(19[89]\d|20[0-2]\d)\b/ dans le h1
```

### 5.3. Tests du parser (obligatoires)

- Convertir les 15 captures en fixtures (au minimum 6 contrastées : BMW 2014 standard, Elantra `$US`, Civic `-1.0 L`, CR-V `Carburant`, Mazda 2 `Renseignements`, EV6 lease `370 $`).
- Assertions : prix/devise/lieu/km/fuel/cylindrée (ou absence) corrects ; lease rejeté ; USD rejeté-avec-message ; `-1.0 L` → absent ; page non-véhicule → inactif.

---

## 6. Architecture de l'extension

```
marketplace-extension/
├── manifest.json            # MV3, permissions minimales (§6.1)
├── src/
│   ├── parser.ts            # §5 : DOM → données brutes annonce (aucun calcul, aucun réseau)
│   ├── normalize.ts         # §4 : données brutes → (Vehicle, FinancingConfig, TransportSelection, CustomsSelection, targetMargin)
│   ├── engine/
│   │   ├── calculationEngine.ts  # COPIE VERSIONNÉE de src/services/calculationEngine.ts (ne pas réécrire, synchroniser + tagger version)
│   │   ├── defaultData.ts        # COPIE VERSIONNÉE de src/data/defaultData.ts (DEFAULT_CONFIG, QUEBEC_REGIONS…)
│   │   └── types.ts              # COPIE VERSIONNÉE de src/types/index.ts
│   ├── overlay.tsx          # panneau UI (§6.4, style aligné ResultsDashboard/CostBreakdown)
│   ├── prefill.ts           # construction URL /?prefill=… (§6.3)
│   └── fixtures/            # captures JSON de test (§5.3)
├── options.html             # base URL app + destination par défaut + méthode de transfert par défaut
└── README.md                # justification permissions + version moteur embarqué
```

**Pourquoi une copie et pas un import direct ?** L'extension est buildée et sandboxée séparément (pas d'accès au `src/` au runtime, pas de code distant autorisé en MV3). Synchronisation par script `npm run sync:extension-engine` (copie + bump `EXTENSION_ENGINE_VERSION`) — documenter la commande dans le README de l'extension.

### 6.1. `manifest.json` — permissions minimales

- `host_permissions: ["*://www.facebook.com/*"]` (parser uniquement). Pas de `tabs`, pas de cookies, pas de script distant.
- `optional_host_permissions` vers la base app configurable (défaut `http://localhost:3000`, modifiable dans les options pour la prod) — uniquement pour le deep link, pas pour le calcul.
- Justifier chaque permission dans le README de l'extension.

### 6.2. Réseau

- **Aucun appel de calcul.** Le seul réseau autorisé : FX live optionnel (`open.er-api.com`, timeout 4 s, 0 retry, fallback `DEFAULT_CONFIG` + pastille `Référence`), comme `liveDataService.ts`.
- Le deep link « Compléter → » est une simple ouverture d'URL locale, pas un POST.

### 6.3. Deep link « Compléter → » / « Voir le détail complet » (nécessite un ajout côté app — à implémenter)

L'app actuelle n'a **pas de router** et ne lit aucun query param. Ajouter côté repo principal (pas dans l'extension) :

- Au boot de `App.tsx` : lire `?prefill=` (JSON base64url `{ vehicle, destination, financing, transport, customs, targetMarginPercent, meta: { listingId, listingUrl, listingTitle } }`), hydrater les `useState` du wizard, positionner l'onglet `wizard` étape 1, afficher un bandeau « Pré-rempli depuis l'annonce <titre> — vérifiez les champs » avec lien vers l'URL FB d'origine.
- L'extension construit : `` `${BASE}/?prefill=${base64url(json)}` `` (garder < 2 000 car ; si dépassé → fallback `chrome.storage.local` + `/?prefillRef=<id>` — **choisir UNE méthode et la documenter**, méthode URL préférée pour la démo).
- Le submit reste inchangé (`calculateSimulation()` → onglet `results` → sauvegarde `localStorage` → PDF).

### 6.4. Overlay UI

- **Position** : panneau fixe latéral droit (~380 px), `z-index` supérieur à FB, bouton réduire/fermer, ne jamais masquer le bouton message vendeur. Toggle SN/MA en tête (recalcule localement au changement). Scope CSS sous `#axc-overlay`.
- **Contenu (100 % issu de `calculateSimulation()` local)** : titre `Estimation rendue à {Dakar|Casablanca}` + chip titre annonce ; hero `landedCostCad` + `+X $ de frais (+Y %)` ; verdict 1 phrase (réutiliser la formulation `ResultsDashboard`) ; badge `success/warning/error` d'éligibilité avec message intégral ; liste des 7 postes (réutiliser la logique `CostBreakdown` : achat, spread, virement, transport A-Z, encan, annexes, douane + base CAF et mode facture/Argus) ; `marketComparison` si match (verdict + écart %) ; scénarios FX pessimiste/réaliste/optimiste ; encart « Non renseignés : cylindrée, VIN… » (informatif) ; `WarningCard`-like pour le warning MRE/commercial ; bouton « Voir le détail complet » (deep link §6.3) ; mention `Propulsé par AutoTransat QC — moteur vX` + pastille FX `En direct/Référence` ; **disclaimer repris du footer app** (estimation prévisionnelle, validation transitaire requise).
- **États** : chargement (skeleton) ; `isEligible=false` (règle d'âge + « calcul affiché à titre indicatif, import refoulé ») ; prix rejeté (lease/USD avec message) ; annonce non-véhicule (inactif) ; FX live indisponible (pastille `Référence`, pas d'erreur).
- **Style** : tokens du site (`brand/senegal/morocco`, `Inter`, cartes blanches, bordures `slate-200`) pour continuité visuelle.

---

## 7. Règles métier inviolables

1. Aucun taux/taxe/frais/âge/formule/FX en dur hors `engine/defaultData.ts` versionné.
2. `null/undefined` = inconnu, jamais `0`.
3. Ne jamais présenter le scénario optimiste comme garanti (pastilles + mention « estimation » obligatoires).
4. Ne jamais prédire le FX (scénarios ± % uniquement).
5. Âge affiché comme approximatif (année seule) ; ne pas affirmer la conformité au jour près.
6. Règle Sénégal = **10 ans tourisme** (décret 2025-1845) ; ancienne règle 8 ans interdite dans tous les textes. L'extension n'a pas à connaître le décret par cœur — le moteur tranche — mais ses textes ne doivent pas le contredire.

---

## 8. Ordre de construction + critères d'acceptation

1. Fixtures + `parser.ts` + tests (critère : 6 cas §5.3 verts).
2. `normalize.ts` + tests (BMW 2014 Laval 5 500 $ → `Vehicle` §4.1 exact ; USD → rejet ; lease → rejet ; `-1.0 L` → absent ; `Carburant`/absent → informatif sans impact ; `MAZDA MAZDA3` dédupliqué).
3. Sync moteur (`calculationEngine` + `defaultData` + `types` copiés, `EXTENSION_ENGINE_VERSION` renseigné) + test d'équivalence : même entrée dans l'app et dans l'extension → `landedCostCad`, `customsAndTaxesCad`, `suggestedSalePriceCad`, `estimatedNetProfitCad` identiques (démo : RAV4 2018 14 200 $ → Dakar RoRo, marge 18 %).
4. Ajout `?prefill=` côté app + test bout-en-bout (annonce → overlay → Compléter → wizard pré-rempli → résultats identiques à l'overlay).
5. `overlay.tsx` + états + options (base URL, destination/méthode par défaut) + README + build zip chargeable en mode développeur.

**MVP démo réussi si :** sur l'annonce BMW 2014 Laval 5 500 $, l'overlay affiche le hero, le breakdown à 7 postes issu du moteur local, l'éligibilité SN avec âge approximatif, l'encart « non renseignés », et « Compléter → » ouvre l'app pré-remplie qui mène aux mêmes chiffres. **Hors scope :** publication Chrome Web Store, Firefox/Safari, multi-annonces/recherche, extraction d'images, décodeur VIN.
