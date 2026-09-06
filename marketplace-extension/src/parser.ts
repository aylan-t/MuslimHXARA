// marketplace-extension/src/parser.ts — AGENT-02
//
// DOM -> RawListing. AUCUN calcul, AUCUN reseau (pas de fetch, pas d'import moteur).
// Ciblage par contenu texte uniquement : le parser travaille sur du texte deja
// extrait (h1, bodyText, headings). Il ne connait pas le DOM et surtout :
//
//   JAMAIS de selecteur par classes CSS hashees Facebook (chaines en `x…`
//   regenerees a chaque build FB : tout selecteur les ciblant casserait sans
//   preavis). Le content-script ne doit selectionner que par balises stables
//   (h1) et par contenu texte ("A propos de ce vehicule", "Renseignements"),
//   avec regex sur le bodyText. Les champs de capture contenant des classes
//   generees ne sont volontairement jamais lus ici.
//
// Interface RawListing : copie a l'identique du §0 de checklist_extension_chrome.md
// (contrat partage, ne pas redefinir).

export interface RawListing {
  listingId: string;
  listingUrl: string;
  titleH1: string;
  priceRaw: string | null;
  priceValue: number | null;
  currencyFlag: 'CAD' | 'US' | 'UNKNOWN';
  /** true si le prix vient du balayage integral (ancre H1 introuvable). */
  priceFallbackWholeText?: boolean;
  locationRaw: string | null;
  city: string | null;
  mileageKm: number | null;
  fuelRaw: string | null;
  engineLitres: number | null;
  yearInTitle: number | null;
  yearInBlock: number | null;
  blockFormat: 'apropos' | 'renseignements' | 'none';
  descriptionText: string;
  isLeaseSuspect: boolean;
  rejection: null | {
    code: 'USD_PRICE' | 'LEASE_PRICE' | 'NO_PRICE' | 'NO_YEAR' | 'NOT_VEHICLE';
    message: string;
  };
}

/** Entree "dom-like" construite par le content-script (texte extrait, pas de DOM). */
export interface ListingDomLike {
  h1: string;
  /** Tous les textes h1 trouves (le content-script met le titre avec annee
   *  en premier ; les autres servent d'ancres de repli). */
  h1Candidates?: string[];
  bodyText: string;
  /** Soit textes de headings, soit objets {tag, text} tels que captures. */
  headings: string[] | Array<{ tag: string; text: string }>;
  url: string;
  listingId: string;
}

// ---------------------------------------------------------------------------
// Regex de reference — §5.2 de MARKETPLACE_EXTENSION.md + 2 correctifs terrain
// ---------------------------------------------------------------------------

/** Chiffres avec separateurs de milliers (espaces, \u202f / \u00a0, virgule
 *  US "5,500", point "5.500", apostrophe "5'500"). Commence ET finit par un
 *  chiffre (gourmand borne) : le nombre est capture en entier, jamais
 *  tronque ("5 500" et non "5" ou "0"). EXCLU : \n et \r (un prix ne
 *  s'etend jamais sur 2 lignes ; cela evite d'avaler le "2" de "Mazda 2"). */
const NUM = '[\\d](?:[\\d \\t  ,.\'’]*[\\d])?';

/** Prix §5.2 etendu bilingue — le marqueur monetaire est OBLIGATOIRE dans la
 *  regex elle-meme (un nombre seul comme "240 000 km" ou "2014" ne matche
 *  jamais, inutile de filtrer apres coup) :
 *  - "$5,500", "C$ 1 700" : symbole AVANT le nombre ;
 *  - "5 500 $", "1 700 C$", "11 000 $US", "23 485 CAD" : symbole APRES.
 *  `\$\s?US` est place AVANT `\$` pour que "11 000 $US" soit capture avec
 *  son marqueur US (sinon Elantra passerait en CAD). */
const PRICE_RE = new RegExp(
  '(?:(C\\$|CA\\$|\\$)\\s?(' + NUM + '))|(?:(' + NUM + ')\\s?(C\\$|CA\\$|\\$\\s?US|\\$|CAD|US|USD))',
  'i',
);

/** Lieu FR + EN (§5.2). */
const LOCATION_RES = [
  /Mis en vente[^.]*?sur\s+([A-Za-zÀ-ÿ\-\s']+),\s*QC/i,
  /Listed[^.]*?in\s+([A-Za-zÀ-ÿ\-\s']+),\s*QC/i,
];

/** Kilometrage FR + EN + format "Renseignements" (Km : 258752). */
const KM_RES = [
  /A roulé\s+([\d \t  ]+)\s*km/i,
  /Driven\s+([\d \t  ]+)\s*km/i,
  /Km\s*:\s*([\d \t  ]+)/i,
];

/** Carburant FR + EN — informatif uniquement (jamais moteur). */
const FUEL_RE =
  /Type de carburant\s*:\s*([^\n·|]+)|Fuel type\s*:\s*([^\n·|]+)/i;

/** Cylindree FR + EN — gardee seulement si 0.6–8.0 L, sinon absente. */
const ENGINE_RE =
  /Taille du moteur\s*:\s*(-?[\d.,]+)\s*L|Engine size\s*:\s*(-?[\d.,]+)\s*L/i;

/** Annee dans le H1 (§5.2). */
const YEAR_RE = /(19[89]\d|20[0-2]\d)\b/;

/** Annee etiquetee dans le bloc (fallback H1 sans annee : "Voiture Mazda 2"). */
const YEAR_LABELLED_RE = /(?:Année|Year)\s*:?\s*(19[89]\d|20[0-2]\d)\b/i;

/** Plage d'annees acceptees (correctif terrain 1980–2027). */
const YEAR_MIN = 1980;
const YEAR_MAX = 2027;

/** Mots-cles location/transfert (§5.2). Inclut la variante "Transfère de
 *  location" observee telle quelle (EV6) ; le terme nu "location" couvre
 *  les autres formulations. */
const LEASE_KEYWORDS_RE =
  /transfert de location|transfère de location|transfere de location|lease transfer|transfert de bail|location/i;

/** Conteneur vehicule FR + EN. */
const APROPOS_RE = /À propos de ce véhicule|About this vehicle/i;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** "5 500 " -> 5500. Seuls les chiffres comptent (espaces = separateurs). */
function parseFrNumber(raw: string): number | null {
  const digits = raw.replace(/[^\d]/g, '');
  if (digits.length === 0) return null;
  const value = parseInt(digits, 10);
  return Number.isFinite(value) ? value : null;
}

/** Nombre d'un prix : ignore les centimes ("5 500,00 $" -> 5500, sinon les
 *  ",00" deviendraient 550000). Seuls les chiffres comptent ensuite. */
function parsePriceNumber(raw: string): number | null {
  const noCents = raw.replace(/[,.'’]\d{2}$/, '');
  return parseFrNumber(noCents);
}

function headingsToTexts(
  headings: ListingDomLike['headings'],
): string[] {
  return headings.map((h) =>
    typeof h === 'string' ? h : (h.text ?? ''),
  );
}

function detectBlockFormat(
  headingTexts: string[],
  bodyText: string,
): RawListing['blockFormat'] {
  if (
    headingTexts.some((t) => APROPOS_RE.test(t)) ||
    APROPOS_RE.test(bodyText)
  ) {
    return 'apropos';
  }
  // "Renseignements" EXACT (pas "Renseignements sur le vendeur", toujours
  // present) : heading seul ou ligne isolee du bodyText (format Mazda 2).
  if (
    headingTexts.some((t) => t.trim().toLowerCase() === 'renseignements') ||
    /(^|\n)\s*Renseignements\s*(\n|$)/.test(bodyText)
  ) {
    return 'renseignements';
  }
  return 'none';
}

function findYearInTitle(h1: string): number | null {
  const m = YEAR_RE.exec(h1);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  return year >= YEAR_MIN && year <= YEAR_MAX ? year : null;
}

/** Fallback annee bloc si H1 sans annee : d'abord "Année 2012" etiquetee,
 *  sinon premier entier annee plausible du texte (1980–2027). */
function findYearInBlock(bodyText: string): number | null {
  const labelled = YEAR_LABELLED_RE.exec(bodyText);
  if (labelled) {
    const year = parseInt(labelled[1], 10);
    if (year >= YEAR_MIN && year <= YEAR_MAX) return year;
  }
  const re = new RegExp(YEAR_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(bodyText)) !== null) {
    const year = parseInt(m[1], 10);
    if (year >= YEAR_MIN && year <= YEAR_MAX) return year;
  }
  return null;
}

interface PriceResult {
  priceRaw: string | null;
  priceValue: number | null;
  currencyFlag: RawListing['currencyFlag'];
  /** true si le prix vient du balayage integral (aucune ancre H1 trouvee). */
  fallbackWholeText: boolean;
}

/**
 * Prix cherche dans une fenetre resserree autour du H1 (titre -> prix ->
 * "Mis en vente") : le bodyText contient aussi les prix parasites de la
 * colonne "Selection du jour" (995 $, 120 $, …) qu'il faut ignorer.
 * Si le H1 est introuvable, repli sur le debut du texte (8000 car.).
 */
function extractPrice(h1: string, bodyText: string, h1Candidates: string[] = []): PriceResult {
  const none: PriceResult = {
    priceRaw: null,
    priceValue: null,
    currencyFlag: 'UNKNOWN',
    fallbackWholeText: false,
  };
  // Ancres essayees dans l'ordre : h1 choisi puis chaque h1 candidat
  // (le premier h1 du DOM n'est pas toujours le titre sur FB). Fenetre
  // elargie : 500 car. avant (le prix est juste apres le titre en rendu).
  const anchors = [h1.trim(), ...h1Candidates.map((t) => (t ?? '').trim())]
    .filter(Boolean)
    .filter((t, i, arr) => arr.indexOf(t) === i);
  for (const anchor of anchors) {
    const start = bodyText.indexOf(anchor);
    if (start < 0) continue;
    const window = bodyText.slice(Math.max(0, start - 500), start + 12000);
    const found = findPriceInWindow(window);
    if (found) return { ...found, fallbackWholeText: false };
  }
  // Repli : balayage integral (aucune ancre trouvee).
  const found = findPriceInWindow(bodyText);
  if (found) return { ...found, fallbackWholeText: true };
  return none;
}
/** Balaye une fenetre a la recherche du premier prix (marqueur obligatoire).
 *  Groupes : 1 = symbole avant, 2 = nombre apres symbole,
 *             3 = nombre avant symbole, 4 = symbole apres.
 *  Le marqueur etant obligatoire dans la regex, le premier match avec un
 *  nombre valide EST le prix (les "240 000 km" / "2014" ne matchent jamais). */
function findPriceInWindow(window: string): Omit<PriceResult, 'fallbackWholeText'> | null {
  const re = new RegExp(PRICE_RE.source, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(window)) !== null) {
    const numPart = (m[2] ?? m[3] ?? '').trim();
    const marker = ((m[1] ?? '') + (m[4] ?? '')).trim();
    if (!numPart) continue;
    const value = parsePriceNumber(numPart);
    if (value === null) continue;
    const usMarker = /us/i.test(marker);
    return {
      priceRaw: m[0].trim(),
      priceValue: value,
      currencyFlag: usMarker ? 'US' : 'CAD',
    };
  }
  return null;
}

function extractLocation(bodyText: string): {
  locationRaw: string | null;
  city: string | null;
} {
  for (const re of LOCATION_RES) {
    const m = re.exec(bodyText);
    if (m) {
      return { locationRaw: m[0].trim(), city: (m[1] ?? m[2] ?? '').trim() || null };
    }
  }
  return { locationRaw: null, city: null };
}

function extractMileage(bodyText: string): number | null {
  for (const re of KM_RES) {
    const m = re.exec(bodyText);
    if (m) {
      const group = m[1] ?? m[2] ?? m[3] ?? '';
      const value = parseFrNumber(group);
      if (value !== null) return value;
    }
  }
  return null;
}

function extractFuel(bodyText: string): string | null {
  const m = FUEL_RE.exec(bodyText);
  if (!m) return null;
  const raw = (m[1] ?? m[2] ?? '').trim();
  return raw.length > 0 ? raw : null;
}

/** "-1.0 L" (Civic) -> null ; 0.6–8.0 L conserve, sinon null. Informatif. */
function extractEngine(bodyText: string): number | null {
  const m = ENGINE_RE.exec(bodyText);
  if (!m) return null;
  const raw = (m[1] ?? m[2] ?? '').replace(',', '.');
  const value = parseFloat(raw);
  if (!Number.isFinite(value)) return null;
  if (value < 0.6 || value > 8.0) return null;
  return value;
}

// ---------------------------------------------------------------------------
// parseListing
// ---------------------------------------------------------------------------

export function parseListing(input: ListingDomLike): RawListing {
  const h1 = (input.h1 ?? '').trim();
  const bodyText = input.bodyText ?? '';
  const headingTexts = headingsToTexts(input.headings ?? []);
  const listingId = input.listingId ?? '';
  const listingUrl =
    (input.url ?? '').trim() ||
    (listingId
      ? `https://www.facebook.com/marketplace/item/${listingId}`
      : '');

  const titleH1 = h1;
  const blockFormat = detectBlockFormat(headingTexts, bodyText);
  const yearInTitle = findYearInTitle(h1);
  const yearInBlock = findYearInBlock(bodyText);
  const price = extractPrice(h1, bodyText, input.h1Candidates ?? []);
  const { locationRaw, city } = extractLocation(bodyText);
  const mileageKm = extractMileage(bodyText);
  const fuelRaw = extractFuel(bodyText);
  const engineLitres = extractEngine(bodyText);

  // Rejet lease §5.2 : prix < 1000 ET (km < 60000 OU mot-cle location/transfert).
  const isLeaseSuspect =
    price.priceValue !== null &&
    price.priceValue < 1000 &&
    (mileageKm !== null
      ? mileageKm < 60000 || LEASE_KEYWORDS_RE.test(bodyText)
      : LEASE_KEYWORDS_RE.test(bodyText));

  // Ordre des rejets : garde-fou vehicule d'abord (overlay inactif),
  // puis devise, lease, prix absent, annee absente.
  let rejection: RawListing['rejection'] = null;
  if (
    blockFormat === 'none' &&
    yearInTitle === null &&
    yearInBlock === null
  ) {
    rejection = {
      code: 'NOT_VEHICLE',
      message:
        'Page non-véhicule : ni bloc véhicule (« À propos » / « Renseignements ») ni année détectés — overlay inactif.',
    };
  } else if (price.currencyFlag === 'US') {
    rejection = {
      code: 'USD_PRICE',
      message: `Prix en $US (${price.priceRaw ?? 'montant inconnu'}) : devise américaine, saisissez le prix en $ CAD pour estimer — aucune conversion automatique.`,
    };
  } else if (isLeaseSuspect) {
    rejection = {
      code: 'LEASE_PRICE',
      message: `Prix non interprétable (${price.priceRaw ?? 'montant inconnu'}) : annonce de location / transfert de bail détectée — aucun calcul sur un loyer.`,
    };
  } else if (price.priceValue === null) {
    rejection = {
      code: 'NO_PRICE',
      message: 'Prix introuvable dans l’annonce — aucun calcul possible.',
    };
  } else if (yearInTitle === null && yearInBlock === null) {
    rejection = {
      code: 'NO_YEAR',
      message: 'Année du véhicule introuvable (ni dans le titre ni dans le bloc) — aucun calcul possible.',
    };
  }

  return {
    listingId,
    listingUrl,
    titleH1,
    priceRaw: price.priceRaw,
    priceValue: price.priceValue,
    currencyFlag: price.currencyFlag,
    priceFallbackWholeText: price.fallbackWholeText,
    locationRaw,
    city,
    mileageKm,
    fuelRaw,
    engineLitres,
    yearInTitle,
    yearInBlock,
    blockFormat,
    descriptionText: bodyText,
    isLeaseSuspect,
    rejection,
  };
}
