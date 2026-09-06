import { DestinationCountry, PlatformReference } from '../types';

export const PLATFORMS_REFERENCE: PlatformReference[] = [
  // MAROC
  {
    id: 'avito-maroc',
    name: 'Avito.ma',
    country: 'maroc',
    logoText: 'Avito',
    badgeColor: 'bg-red-600 text-white',
    description: 'Leader n°1 des petites annonces au Maroc. Référence incontournable pour les véhicules d\'occasion.',
    baseUrl: 'https://www.avito.ma',
    buildSearchUrl: (brand: string, model: string, year: number) => {
      const q = encodeURIComponent(`${brand} ${model}`.trim());
      return `https://www.avito.ma/fr/maroc/voitures_d_occasion?q=${q}`;
    }
  },
  {
    id: 'moteur-maroc',
    name: 'Moteur.ma',
    country: 'maroc',
    logoText: 'Moteur.ma',
    badgeColor: 'bg-orange-600 text-white',
    description: 'Marketplace automobile spécialisée au Maroc. Annonces qualifiées souvent vérifiées par des garages.',
    baseUrl: 'https://www.moteur.ma',
    buildSearchUrl: (brand: string, model: string, year: number) => {
      const q = encodeURIComponent(`${brand} ${model}`.trim());
      return `https://www.moteur.ma/fr/voiture/achat-voiture-occasion/recherche/?marque=${encodeURIComponent(brand)}&modele=${encodeURIComponent(model)}`;
    }
  },

  // SÉNÉGAL
  {
    id: 'dakar-auto-senegal',
    name: 'Dakar-Auto.com',
    country: 'senegal',
    logoText: 'Dakar-Auto',
    badgeColor: 'bg-emerald-600 text-white',
    description: 'Plus grande place de marché automobile spécialisée au Sénégal pour véhicules d\'occasion.',
    baseUrl: 'https://dakar-auto.com',
    buildSearchUrl: (brand: string, model: string, year: number) => {
      const q = encodeURIComponent(`${brand} ${model}`.trim());
      return `https://dakar-auto.com/senegal/voitures-4?q=${q}`;
    }
  },
  {
    id: 'coinafrique-senegal',
    name: 'CoinAfrique Sénégal',
    country: 'senegal',
    logoText: 'CoinAfrique',
    badgeColor: 'bg-blue-600 text-white',
    description: 'Plateforme majeure de petites annonces généralistes à Dakar avec une catégorie véhicules très active.',
    baseUrl: 'https://sn.coinafrique.com',
    buildSearchUrl: (brand: string, model: string, year: number) => {
      const q = encodeURIComponent(`${brand} ${model}`.trim());
      return `https://sn.coinafrique.com/categorie/vehicules?q=${q}`;
    }
  }
];

export function getPlatformsForCountry(country: DestinationCountry): PlatformReference[] {
  return PLATFORMS_REFERENCE.filter(p => p.country === country);
}

