# AutoTransat QC — Extension Marketplace v1.3.1

Extension Chrome/Edge **Manifest V3** : estimation locale du coût rendu
(Dakar/Casablanca) sur les annonces véhicules Facebook Marketplace.
Spec : `../MARKETPLACE_EXTENSION.md`. Le moteur avancé et le contrat prefill du
repo racine sont les sources canoniques ; l'extension en embarque une copie
versionnée pour fonctionner localement sous Manifest V3.

## Permissions (justification — checklist 01.2)

| Permission | Pourquoi |
|---|---|
| `storage` | Persister les défauts utilisateur (destination SN/MA, méthode de transfert, BASE app). Aucune donnée annonce stockée. |
| `host_permissions: ["*://www.facebook.com/*"]` | **Parser uniquement** : lire le DOM des pages `facebook.com/marketplace/item/*` (titre, prix, bloc véhicule). Aucune exfiltration. |
| `optional_host_permissions: ["http://localhost:3000/*"]` | BASE app par défaut (modifiable en options, AGENT-05) pour le deep link `Compléter →`. Simple ouverture d'URL, pas un POST. Étendre la liste au domaine prod au déploiement. |

**Interdits respectés** : zéro `tabs`, zéro cookies, zéro script distant.
Seul réseau autorisé : FX live optionnel (`open.er-api.com`, timeout 4 s,
0 retry, fallback `DEFAULT_CONFIG` + pastille `Référence`, voir `src/fx.ts`).

## Version du moteur embarqué

`src/engine/version.ts` → `EXTENSION_ENGINE_VERSION = "<commit hash src/>"`
(affiché en footer overlay + injecté dans `meta.engineVersion` du prefill).
Après chaque changement de `../src/types`, `../src/services/calculationEngine.ts`,
`../src/data/defaultData.ts` ou `../src/services/prefill.ts`, resynchroniser :

```bash
npm run sync:extension-engine
```

Le script copie les quatre sources vers `src/engine/` et `src/prefill.ts`
(imports relatifs adaptés), régénère `version.ts` avec le dernier commit ayant
modifié ces sources (fallback `"dev"`) et vérifie `DEFAULT_CONFIG` complet (FX 7.35/440.0 · SN
44.5 % + 10/15 ans + décret 2025-1845 · MA 17.5+0.25+TVA20 + MRE 5 ans/90 % ·
6 routes · 3 transferts · 7 régions · marketData 12 pts · 6 OFFICIAL_SOURCES).
**Ne jamais éditer `src/engine/` à la main.**

## Build / test / zip (chargeable mode développeur)

```bash
npm install
npm run sync:extension-engine
npm run build              # → dist-extension/ (+ manifest.json copié)
npm run test:equivalence   # moteur app vs extension : 4 montants identiques
npm run typecheck           # tsc --noEmit
```

Chargement : `chrome://extensions` → mode développeur → « Charger l'extension
non empaquetée » → `dist-extension/`. Zip : compresser le contenu de
`dist-extension/`.

## État de la migration

- Overlay v1.3.1, options et diagnostic inclus.
- `http://localhost:3000` reste la base par défaut.
- Le prefill partagé valide les six groupes de données, la taille maximale et
  l'URL Facebook Marketplace d'origine.
- Les tests d'équivalence couvrent aussi `calculationStatus` et `assumptions`.

## QA E2E & Release (AGENT-06)

### 1. Deep link `?prefill=` côté app (implémenté, build root vert)

- `src/App.tsx` lit `?prefill=` au boot via `parsePrefillFromUrl()` (base64url →
  JSON `PrefillPayload`, validation minimale des 6 clés `vehicle / destination /
  financing / transport / customs / targetMarginPercent`, `< 2 000` car).
- Si valide : hydrate les 6 `useState` wizard, force `currentTab='wizard'` /
  `currentStep=1` / `maxReachedStep=1`, affiche le bandeau
  « Pré-rempli depuis l'annonce \<titre\> — vérifiez les champs » + lien
  `<a href=listingUrl target=_blank>`.
- Si invalide / trop grand : `console.warn`, jamais de crash. Pas de router
  (SPA à onglets inchangée, submit `calculateSimulation()` → `results` →
  `localStorage` → PDF inchangé).
- `marketplace-extension/src/prefill.ts` est généré depuis le service partagé ;
  l'application et l'extension appliquent donc exactement le même contrat.

### 2. Procédure E2E (annonce → overlay → app → résultats)

1. Ouvrir une annonce véhicule FB (`/marketplace/item/<listingId>`).
2. Vérifier l'overlay : hero + 7 postes moteur local + éligibilité SN
   « âge approximatif (année uniquement) » + encart non-renseignés.
3. Cliquer `Compléter →` / `Voir le détail complet` (deep link
   `BASE/?prefill=<base64url>`).
4. Vérifier le wizard pré-rempli étape 1 + bandeau + lien annonce d'origine.
5. Cliquer `Calculer` : les 4 montants (`landedCostCad`,
   `customsAndTaxesCad`, `suggestedSalePriceCad`, `estimatedNetProfitCad`)
   doivent être **identiques à l'overlay**.
6. Test automatisé (sans navigateur, sans navigation FB réelle) :
   `node tests/e2e-prefill.test.mjs` → 26/26 verts.

### 3. MVP BMW 2014 (référence démo)

- Annonce `1278702150685897` « 2014 BMW 3 Series », Laval, `5 500 $`,
  `240 000 km`, Essence → `Vehicle { BMW / 3 Series / 2014 / 5500 /
  240000 / berline / bon / particulier / grand-montreal }`, `destination
  senegal`, `transport mtl-dkr-roro`, `financing plateforme_transfert
  15 / 0.7 / 1.2`, `marge 18`. URL prefill = 982 car (< 2 000).

### 4. QA navigateurs & cas limites (revue de code, pas de navigation FB réelle)

- Chrome + Edge : manifest MV3 (`matches marketplace/item/*`,
  `run_at document_idle`) compatible ; re-parse SPA sur `listingId`
  à la charge d'AGENT-02 (`history.pushState` + `MutationObserver` sur `h1`).
- FR + EN : parser §5.2 bilingue ; `parsePrefillParam` robuste aux query
  params voisins (testé : `?foo=1&prefill=…&lang=en`).
- Cas limites couverts par les tests : `$US` / leases `57 $` / `370 $` →
  rejet côté parser/normalize (jamais calculés) ; `-1.0 L` → `null` ;
  `Carburant` / absent → sans impact (pas de `fuelType`) ;
  `Renseignements` (Mazda 2) ; `MAZDA MAZDA3` dédupliqué ; Mont-Royal →
  `grand-montreal`. Côté prefill : base64 invalide, clés manquantes, marge
  non-numérique, destination inconnue, payload > 2 000 car → tous ignorés
  proprement (`null` + `console.warn`).
- Vérifié : `npx tsc --noEmit` (root) + `npm run build` (`tsc && vite
  build`) verts après la modif `App.tsx`.

### 5. Release (état au 2026-09-06)

- `manifest.json` MV3 présent (`storage` + `host_permissions *.facebook.com`,
  `optional_host_permissions` BASE app, zéro `tabs`/cookies/script distant).
- `marketplace-extension/dist-extension/` complet : `manifest.json` +
  `content.js` (bundle IIFE unique — les content scripts MV3 sont chargés
  comme scripts classiques, un bundle ESM meurt en silence). Zip final
  chargeable (`chrome://extensions` ou `brave://extensions` → mode
  développeur → charger `dist-extension/`).
- `dist/` (app) buildé avec succès côté root.

### 6. Diagnostic (rien ne s'affiche sur Facebook ?)

1. Rebuilder et recharger : `npm run build` dans `marketplace-extension/`,
   puis `brave://extensions` → icône reload de l'extension → **recharger
   l'onglet Facebook** (un content script ne s'injecte pas dans les onglets
   déjà ouverts avant l'installation).
2. **Popup diagnostic (recommandé) : cliquez l'icône de l'extension** dans la
   barre d'outils Brave. Il affiche : version extension + version moteur +
   date du build (vérifiez que c'est bien le dernier build !), l'annonce
   détectée sur l'onglet actif, et le **journal des logs** (Actualiser /
   Copier / Effacer, auto-refresh 1,5 s). La case « Logs détaillés » active
   le mode verbeux sans toucher à la console. Le bouton « Copier » donne un
   bloc prêt à coller pour le debug.
3. Console (alternative) : F12 → filtrer `AutoTransatQC`. Étapes normales :
   `content script injecté` → `pipeline start` → `parse` → `calcul OK` →
   overlay. Un rejet ($US, lease, année absente) s'affiche comme `parse` /
   `normalize rejet` + carte dans la page. Détail complet : `__axcDebug(true)`
   puis recharger, ou `?axcdebug=1` dans l'URL.
4. Si même `content script injecté` n'apparaît pas : vérifier que l'URL
   matche `*.facebook.com/marketplace/item/<id>`, que l'extension est
   activée, et désactiver Shields (Brave) pour le site le temps du test.
   Les `Failed to apply filter` en console viennent du bloqueur de pub
   (uBlock), pas de cette extension : à ignorer.

### 7. Hors scope (rappel §8)

Publication Chrome Web Store, Firefox/Safari, multi-annonces/recherche,
extraction d'images, décodeur VIN.
