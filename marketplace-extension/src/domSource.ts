// Source de texte DOM — pur, testé, sans dépendance.
// Leçon terrain (v1.1.0) : `textContent` inclut le contenu des <script> et
// Facebook ouvre son <body> avec ~150 000 caractères de JS inline
// (Bootloader, Relay). Résultat : prix introuvable + faux positifs
// ("8Us" dans du code JS pris pour un prix $US). `innerText` ne retourne
// que le texte RENDU (scripts/styles/masqués exclus) : c'est lui la source.

/** Choix main vs body : le <main> est préféré sauf s'il est quasi vide
 *  (< 200 car. visibles) ou sans aucune ancre H1 (colonne annonce ailleurs). */
export function chooseTextSource(
  mainText: string,
  bodyFull: string,
  h1Texts: string[],
): { text: string; source: 'main' | 'body' } {
  const useBody =
    mainText.trim().length < 200 ||
    !h1Texts.some((t) => t && mainText.includes(t));
  return { text: useBody ? bodyFull : mainText, source: useBody ? 'body' : 'main' };
}

/** Texte visible d'un élément (innerText), repli textContent si indisponible. */
export function visibleText(el: Element | null): string {
  if (!el) return '';
  try {
    const rendered = (el as HTMLElement).innerText;
    if (rendered && rendered.trim().length > 0) return rendered;
  } catch {
    /* innerText indisponible (SVG, page pré-rendue) : repli ci-dessous */
  }
  try {
    return el.textContent ?? '';
  } catch {
    return '';
  }
}
