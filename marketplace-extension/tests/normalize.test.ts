/**
 * normalize.test.ts — AGENT-03
 * `npx vitest run tests/normalize.test.ts` (scripts `test:normalize`, câblés par AGENT-01).
 */
import { describe, expect, it } from 'vitest';
import {
  normalizeListing,
  resolveOriginRegionId,
  type NormalizedInputs,
  type RawListing,
} from '../src/normalize';
import { buildPrefillUrl, parsePrefill, parsePrefillFromUrl } from '../src/prefill';

function baseRaw(overrides: Partial<RawListing> = {}): RawListing {
  return {
    listingId: '1278702150685897',
    listingUrl: 'https://www.facebook.com/marketplace/item/1278702150685897',
    titleH1: '2014 BMW 3 Series',
    priceRaw: '5 500 $',
    priceValue: 5500,
    currencyFlag: 'CAD',
    locationRaw: 'Mis en vente il y a 3 jours sur Laval, QC',
    city: 'Laval',
    mileageKm: 240000,
    fuelRaw: 'Essence',
    engineLitres: 2,
    yearInTitle: 2014,
    yearInBlock: null,
    blockFormat: 'apropos',
    descriptionText: 'BMW 328i xdrive, très propre, entretien à jour.',
    vin: null,
    steeringSide: 'LHD',
    steeringEvidence: null,
    isLeaseSuspect: false,
    rejection: null,
    ...overrides,
  };
}

describe('normalizeListing — cas MVP BMW 2014 Laval 5 500 $ (§4.1 exact)', () => {
  it('produit le Vehicle exact + défauts §4.2', () => {
    const res = normalizeListing(baseRaw());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const { inputs } = res;
    // Vehicle §4.1 exact : la description « 328i xdrive » n'est jamais une cylindrée.
    expect(inputs.vehicle).toEqual({
      brand: 'Bmw',
      model: '3 Series',
      year: 2014,
      mileageKm: 240000,
      purchasePriceCad: 5500,
      engineCc: 2000,
      fuelType: 'Gasoline',
      steering: 'LHD',
      isJdm: false,
      vehicleClassification: 'passenger',
      grossVehicleWeightKg: 2000,
      classificationVerified: true,
      category: 'suv', // défaut + flag « supposée »
      condition: 'bon',
      source: 'particulier',
      auctionFeesCad: 0,
      brokerCommissionCad: 0,
      originRegionId: 'grand-montreal',
      isNonRunning: false,
    });
    expect(res.categoryAssumed).toBe(true);
    // Défauts §4.2
    expect(inputs.destination).toBe('senegal');
    expect(inputs.financing).toEqual({
      method: 'plateforme_transfert',
      fixedFeeCad: 15,
      variableFeePercent: 0.7,
      fxSpreadPercent: 1.2,
    });
    expect(inputs.transport.routeId).toBe('mtl-dkr-roro');
    expect(inputs.transport.batchVehiclesCount).toBe(1);
    expect(inputs.transport.additionalCosts).toMatchObject({
      transitAgentFeeCad: 400,
      roroCleaningFeeCad: 180,
      portStorageBufferCad: 250,
      batteryKeyFeeCad: 200,
      includeBatteryKeyFee: false,
      customRepairsCad: 0,
    });
    expect(inputs.customs.country).toBe('senegal');
    expect(inputs.customs.valuationBasis).toBe('invoice');
    expect(inputs.customs.moroccoOptions?.isMRE).toBe(false);
    expect(inputs.customs.estimatedArgusValueCad).toBeUndefined(); // moteur seul
    expect(inputs.targetMarginPercent).toBe(18);
  });
});

describe('normalizeListing — rejets propagés (jamais de calcul)', () => {
  it('prix $US → rejet USD_PRICE (Elantra)', () => {
    const res = normalizeListing(
      baseRaw({
        titleH1: '2020 Hyundai Elantra',
        priceRaw: '11 000 $US',
        priceValue: 11000,
        currencyFlag: 'US',
        yearInTitle: 2020,
        rejection: { code: 'USD_PRICE', message: 'Prix en $US' },
      }),
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.rejection.code).toBe('USD_PRICE');
  });

  it('marqueur US passé au travers du parser → rejet USD_PRICE côté normalize', () => {
    const res = normalizeListing(
      baseRaw({ priceRaw: '11 000 $US', priceValue: 11000, currencyFlag: 'US' }),
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.rejection.code).toBe('USD_PRICE');
  });

  it('lease suspect → rejet LEASE_PRICE (EV6 370 $)', () => {
    const res = normalizeListing(
      baseRaw({
        titleH1: '2025 Kia EV6',
        priceRaw: '370 $',
        priceValue: 370,
        yearInTitle: 2025,
        mileageKm: 25800,
        isLeaseSuspect: true,
        descriptionText: 'transfert de location, mensualité 370 $',
        rejection: { code: 'LEASE_PRICE', message: 'location probable' },
      }),
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.rejection.code).toBe('LEASE_PRICE');
  });

  it('prix absent → rejet NO_PRICE', () => {
    const res = normalizeListing(baseRaw({ priceRaw: null, priceValue: null }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.rejection.code).toBe('NO_PRICE');
  });

  it('année absente (titre + bloc) → rejet NO_YEAR', () => {
    const res = normalizeListing(
      baseRaw({ titleH1: 'Superbe voiture à vendre', yearInTitle: null, yearInBlock: null }),
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.rejection.code).toBe('NO_YEAR');
  });

  it('année fallback bloc si H1 sans année (Mazda 2 → Année 2012)', () => {
    const res = normalizeListing(
      baseRaw({
        titleH1: 'Voiture Mazda 2',
        yearInTitle: null,
        yearInBlock: 2012,
        city: 'Montreal',
      }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.inputs.vehicle.brand).toBe('Mazda');
    expect(res.inputs.vehicle.model).toBe('2');
    expect(res.inputs.vehicle.year).toBe(2012);
    expect(res.inputs.vehicle.category).toBe('citadine');
  });
});

describe('normalizeListing — champs informatifs sans impact', () => {
  it('« -1.0 L » neutralisé → absent, calcul inchangé (Civic)', () => {
    const res = normalizeListing(
      baseRaw({
        titleH1: '2025 Honda Civic',
        yearInTitle: 2025,
        engineLitres: null, // parser : hors plage 0.6–8.0 → null
        descriptionText: 'Taille du moteur : -1.0 L',
      }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect('engineLitres' in res.inputs.vehicle).toBe(false);
    // Le contrat moteur synchronisé exige désormais ces champs; ils sont
    // explicitement présents même lorsque le parser a neutralisé une valeur
    // de cylindrée invalide.
    expect(res.inputs.vehicle.engineCc).toBe(0);
    expect(res.inputs.vehicle.fuelType).toBe('Gasoline');
  });

  it('« Carburant » ou fuel absent → sans impact (CR-V / Santa Fe)', () => {
    for (const fuelRaw of ['Carburant', null, 'Essence', 'Électrique', 'Hybride']) {
      const res = normalizeListing(
        baseRaw({ titleH1: '2021 Honda CR-V', yearInTitle: 2021, fuelRaw }),
      );
      expect(res.ok).toBe(true);
      if (!res.ok) continue;
      expect(res.inputs.vehicle.category).toBe('suv');
      expect(res.categoryAssumed).toBe(false);
    }
  });

  it('« 328i xdrive » en description jamais utilisé comme cylindrée', () => {
    const res = normalizeListing(baseRaw());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(JSON.stringify(res.inputs.vehicle)).not.toContain('328');
    expect('engineLitres' in res.inputs.vehicle).toBe(false);
  });

  it('mileage absent → 120000 par défaut', () => {
    const res = normalizeListing(baseRaw({ mileageKm: null }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.inputs.vehicle.mileageKm).toBe(120000);
  });
});

describe('normalizeListing — dédup marque/modèle', () => {
  it('« MAZDA MAZDA3 » → Mazda / MAZDA3', () => {
    const res = normalizeListing(
      baseRaw({ titleH1: '2014 Mazda MAZDA MAZDA3', yearInTitle: 2014 }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.inputs.vehicle.brand).toBe('Mazda');
    expect(res.inputs.vehicle.model).toBe('MAZDA3');
  });
});

describe('normalizeListing — régions QC', () => {
  it('Mont-Royal → grand-montreal', () => {
    expect(resolveOriginRegionId('Mis en vente sur Mont-Royal, QC', 'Mont-Royal')).toBe(
      'grand-montreal',
    );
  });

  it('Laval / Montréal / Longueuil / Brossard / Terrebonne → grand-montreal', () => {
    for (const city of ['Laval', 'Montréal', 'Longueuil', 'Brossard', 'Terrebonne']) {
      expect(resolveOriginRegionId(null, city)).toBe('grand-montreal');
    }
  });

  it('Québec → quebec-levis, Sherbrooke → estrie, inconnue → grand-montreal', () => {
    expect(resolveOriginRegionId(null, 'Québec')).toBe('quebec-levis');
    expect(resolveOriginRegionId(null, 'Sherbrooke')).toBe('estrie');
    expect(resolveOriginRegionId(null, 'Gatineau')).toBe('outaouais');
    expect(resolveOriginRegionId(null, null)).toBe('grand-montreal');
  });
});

describe('normalizeListing — avertissements informatifs (jamais de rejet)', () => {
  it('VGA / accident réparé → warning, calcul maintenu, isNonRunning false', () => {
    for (const descriptionText of [
      'VGA reconstruit, dossier SAAQ en règle.',
      'Petit accident réparé professionnellement, facture à l’appui.',
    ]) {
      const res = normalizeListing(baseRaw({ descriptionText }));
      expect(res.ok).toBe(true);
      if (!res.ok) continue;
      expect(res.warnings.length).toBeGreaterThan(0);
      expect(res.warnings.some((w) => /accident|VGA/i.test(w))).toBe(true);
      expect(res.inputs.vehicle.isNonRunning).toBe(false);
    }
  });

  it('« pour pièces » → isNonRunning true, toujours pas de rejet', () => {
    const res = normalizeListing(
      baseRaw({ descriptionText: 'Vente pour pièces seulement, moteur HS.' }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.inputs.vehicle.isNonRunning).toBe(true);
  });
});

describe('normalizeListing — catégories heuristiques', () => {
  it.each([
    ['2021 Toyota C-HR', 'suv'],
    ['2017 Lexus RX', 'suv'],
    ['2012 Hyundai Santa Fe', 'suv'],
    ['2010 MINI Cooper', 'citadine'],
    ['2026 Fiat 500E', 'citadine'],
    ['2019 Ford F-150', 'camionnette'],
  ])('%s → %s (non supposée)', (titleH1, category) => {
    const res = normalizeListing(baseRaw({ titleH1, yearInTitle: 2018 }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.inputs.vehicle.category).toBe(category);
    expect(res.categoryAssumed).toBe(false);
  });
});

describe('normalizeListing — destination param (défaut senegal)', () => {
  it('maroc → route mtl-casa-roro + customs MA', () => {
    const res = normalizeListing(baseRaw(), { destination: 'maroc' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.inputs.destination).toBe('maroc');
    expect(res.inputs.transport.routeId).toBe('mtl-casa-roro');
    expect(res.inputs.customs.country).toBe('maroc');
  });
});

// ---------------------------------------------------------------------------
// prefill.ts — protocole partagé avec l'app (zéro dépendance)
// ---------------------------------------------------------------------------

function sampleInputs(): { inputs: NormalizedInputs; meta: { listingId: string; listingUrl: string; listingTitle: string; engineVersion: string } } {
  const res = normalizeListing(baseRaw(), {
    verifiedVehicle: {
      year: 2014,
      brand: 'Bmw',
      model: '3 Series',
      purchasePriceCad: 5500,
      engineCc: 2000,
      fuelType: 'Gasoline',
      steering: 'LHD',
      vehicleClassification: 'passenger',
      grossVehicleWeightKg: 2000,
      classificationVerified: true,
    },
  });
  if (!res.ok) throw new Error('fixture BMW invalide');
  return {
    inputs: res.inputs,
    meta: {
      listingId: '1278702150685897',
      listingUrl: 'https://www.facebook.com/marketplace/item/1278702150685897',
      listingTitle: '2014 BMW 3 Series',
      engineVersion: 'test',
    },
  };
}

describe('prefill — buildPrefillUrl / parsePrefill (même code des deux côtés)', () => {
  it('roundtrip : parse(build(url)) restitue inputs + meta à l’identique', () => {
    const { inputs, meta } = sampleInputs();
    const url = buildPrefillUrl('http://localhost:3000', inputs, meta);
    expect(url.startsWith('http://localhost:3000/?prefill=')).toBe(true);
    expect(url.length).toBeLessThan(2000);
    const back = parsePrefillFromUrl(url);
    expect(back).not.toBeNull();
    expect(back).toEqual({ ...inputs, meta });
  });

  it('parsePrefill inverse le segment seul', () => {
    const { inputs, meta } = sampleInputs();
    const url = buildPrefillUrl('http://localhost:3000/', inputs, meta);
    const encoded = url.split('?prefill=')[1];
    expect(parsePrefill(encoded)).toEqual({ ...inputs, meta });
  });

  it('payload surdimensionné → throw avec message (< 2 000 car)', () => {
    const { inputs, meta } = sampleInputs();
    const huge = {
      ...inputs,
      transport: {
        ...inputs.transport,
        quote: {
          routeId: inputs.transport.routeId,
          carrierName: 'Transporteur test',
          quotedAt: '2026-09-06',
          amountCad: 2500,
          fileName: `${'X'.repeat(5000)}.pdf`,
        },
      },
    };
    expect(() => buildPrefillUrl('http://localhost:3000', huge, meta)).toThrow(/trop longue/);
  });

  it('payload corrompu → throw (l’app ignore + message, jamais de crash)', () => {
    expect(() => parsePrefill('%%%non-base64%%%')).toThrow(/illisible|invalide/);
    expect(() => parsePrefill('e30')).toThrow(/invalide/); // "{}" valide JSON mais incomplet
    expect(parsePrefillFromUrl('http://localhost:3000/')).toBeNull(); // démarrage normal
  });

  it('diacritiques préservées dans le roundtrip (ex. « Mont-Royal »)', () => {
    const res = normalizeListing(baseRaw({ city: 'Montréal', locationRaw: 'sur Montréal, QC' }), {
      verifiedVehicle: {
        year: 2014,
        brand: 'Bmw',
        model: '3 Series',
        purchasePriceCad: 5500,
        engineCc: 2000,
        fuelType: 'Gasoline',
        steering: 'LHD',
        vehicleClassification: 'passenger',
        grossVehicleWeightKg: 2000,
        classificationVerified: true,
      },
    });
    if (!res.ok) throw new Error('fixture invalide');
    const url = buildPrefillUrl('http://localhost:3000', res.inputs, {
      ...sampleInputs().meta,
      listingTitle: 'Véhicule à Montréal — vérifié ✓',
    });
    const back = parsePrefillFromUrl(url);
    expect(back?.meta.listingTitle).toBe('Véhicule à Montréal — vérifié ✓');
  });
});
