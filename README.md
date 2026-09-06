# AutoTransat QC 🚗🚢

**Calculateur de rentabilité pour l'export de véhicules usagés (Québec → Maroc & Sénégal)**

Application d'aide à la décision conçue pour les particuliers et petits exportateurs québécois (cible : Karim, 45-55 ans). L'outil centralise **tous les frais cachés**, intègre les **règles d'éligibilité douanière récentes** et affiche le **profit net prévisionnel**, avec comparaison au marché local et rapport PDF prêt à imprimer.

---

## ✨ Fonctionnalités Clés

1. **Parcours guidé étape par étape (Wizard UX 40+ ans)** :
   - Formulaire épuré (une idée par écran).
   - Gros boutons tactiles, police lisible ($\ge 16$ px), contraste élevé.
   - Info-bulles pédagogiques sans jargon financier ou douanier (Spread FX, Droits CAF, RoRo vs Conteneur).

2. **Règles d'éligibilité légales intégrées** :
   - 🇸🇳 **Sénégal** : Limitation stricte à **10 ans d'âge** pour les véhicules de tourisme selon le **Décret n° 2025-1845 du 24 octobre 2025** (relevé de 8 à 10 ans). Blocage immédiat si le véhicule dépasse la limite.
   - 🇲🇦 **Maroc** : Avertissement légal fort sur la restriction d'importation commerciale pour non-résidents. Module **Régime MRE (Marocains Résidant à l'Étranger)** avec limite à 5 ans d'âge et abattement de 90%.

3. **Moteur de calcul complet (*Landed Cost*)** :
   - Prix d'achat CAD au Québec.
   - Coût caché du **Spread FX** (écart entre le taux officiel et le taux réel consenti par la banque).
   - Frais de virement bancaire (fixes et variables selon la méthode).
   - **Transport complet de A à Z** : Transport terrestre QC, Frais portuaires départ, Fret maritime RoRo ou Conteneur, Assurance maritime (1.5%), Frais portuaires arrivée, Acheminement local à destination.
   - Frais d'encan (Copart, IAAI) et commission courtier.
   - **Douane et taxes à destination** : Base taxable CAF (Coût + Assurance + Fret) et taux légal (~44.5% pour le Sénégal).

4. **Tableau de bord de résultats à fort impact visuel** :
   - **Résumé en une phrase claire** en tête d'écran : *« Cette voiture peut te rapporter environ 1 450 $ CA de profit net »*.
   - Jauge de rentabilité et indicateur de ROI.
   - Décomposition détaillée des 6 postes de coûts sous forme d'accordéon interactif avec proportion visuelle.
   - Curseur dynamique de marge cible (8% à 30%).

5. **Outils d'aide à la décision avancés** :
   - **Simulateur de sensibilité aux devises (FX)** : Scénarios Pessimiste (-7.5%), Réaliste (0%) et Optimiste (+7.5%) pour anticiper les variations de cours pendant le transit.
   - **Optimiseur de groupage en conteneur 40'** : Détermine le seuil de rentabilité (breakeven à 3 véhicules) par rapport au navire roulier RoRo.
   - **Comparateur de marché local** : Positionnement du prix de revente face aux moyennes observées sur Avito.ma et Expat-Dakar (10 modèles de référence).
   - **Historique & Comparateur Côte à Côte** : Permet de comparer 2 véhicules simultanément pour faire le meilleur choix à l'achat.
   - **Tables de référence éditables** : Modification en temps réel des taux de change, coûts de route et taxes douanières sans redéploiement.
   - **Export PDF professionnel** : Génération d'une fiche d'étude de rentabilité complète en 1 clic.

---

## 🚀 Démarrage Rapide

### Frontend (React + Vite + TypeScript)

```bash
# Installation des dépendances
npm install

# Lancement du serveur de développement (Port 3000)
npm run dev

# Build de production
npm run build
```

Accédez ensuite à [http://localhost:3000](http://localhost:3000).

### Backend API (Python FastAPI - Optionnel)

```bash
# Installation des prérequis
pip install -r backend/requirements.txt

# Lancement de l'API FastAPI (Port 8000)
python -m uvicorn backend.main:app --reload --port 8000
```

Documentation interactive Swagger disponible sur [http://localhost:8000/docs](http://localhost:8000/docs).

---

## 🧪 Tests Automatisés

Le moteur de calcul et les règles légales sont validés par la suite de tests :

```bash
npm test
```

## Extension Chrome v1.3.1

```bash
cd marketplace-extension
npm install
npm run sync:extension-engine
npm test
npm run typecheck
npm run build
```

Chargez ensuite `marketplace-extension/dist-extension/` depuis
`chrome://extensions` en mode développeur. L'application cible par défaut
`http://localhost:3000` et accepte le préremplissage sécurisé `?prefill=`.

## Voice assistant (ai-audio-mode)

One-time setup (installs npm + Python deps):

```bash
npm run setup
```

Then a single command starts both servers (web :3000 + API :8000):

```bash
npm run dev
```

(`dev:web` / `dev:api` run each server alone. Replit uses `dev:web`.)

.env setup: copy `.env.example` → `.env` and fill `GROQ_API_KEY` (get a key at https://console.groq.com/keys). Voice playback needs no key (browser Web Speech API). Never commit `.env` — it is covered by `.gitignore`; only `.env.example` is committed.

Demo hosting note: the backend must run alongside the frontend — use a second Replit workflow or a separate host for the API.

Frontend: point the voice service at the backend with `VITE_API_BASE_URL` (default `http://localhost:8000`).

