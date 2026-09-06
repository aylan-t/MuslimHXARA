// marketplace-extension/tests/parser.test.ts — AGENT-02
// Lancement : node --test marketplace-extension/tests/parser.test.ts
// (depuis la racine C:\Portfolio Prog\muslimhacks2026).
// 6 fixtures reelles + 1 garde-fou non-vehicule. Aucun reseau, aucun calcul.

import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseListing } from '../src/parser.ts';

const FIXTURES_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'fixtures',
);

interface Fixture {
  listingId: string;
  url: string;
  pageTitle: string;
  h1: string;
  bodyText: string;
  headings: Array<{ tag: string; text: string }>;
}

function loadFixture(file: string): Fixture {
  const raw = fs.readFileSync(path.join(FIXTURES_DIR, file), 'utf8');
  return JSON.parse(raw) as Fixture;
}

function parseFixture(file: string) {
  const f = loadFixture(file);
  return parseListing({
    h1: f.h1,
    bodyText: f.bodyText,
    headings: f.headings,
    url: f.url,
    listingId: f.listingId,
  });
}

describe('parser — fixtures reelles Facebook Marketplace', () => {
  it('BMW 2014 standard exact (Laval, 5500 $, 240000 km, Essence)', () => {
    const r = parseFixture('1278702150685897-bmw-2014-standard.json');
    assert.equal(r.listingId, '1278702150685897');
    assert.equal(r.titleH1, '2014 BMW 3 series');
    assert.equal(r.priceValue, 5500);
    assert.equal(r.currencyFlag, 'CAD');
    assert.equal(r.city, 'Laval');
    assert.ok(r.locationRaw?.includes('Laval'));
    assert.equal(r.mileageKm, 240000);
    assert.equal(r.fuelRaw, 'Essence');
    assert.equal(r.engineLitres, null);
    assert.equal(r.yearInTitle, 2014);
    assert.equal(r.blockFormat, 'apropos');
    assert.equal(r.isLeaseSuspect, false);
    assert.equal(r.rejection, null);
  });

  it('Elantra 2020 $US rejete avec message (USD_PRICE)', () => {
    const r = parseFixture('2435303743955050-elantra-2020-usd.json');
    assert.equal(r.priceValue, 11000);
    assert.equal(r.currencyFlag, 'US');
    assert.ok(r.priceRaw?.includes('$US') || r.priceRaw?.includes('$ US'));
    assert.equal(r.city, 'Montréal');
    assert.equal(r.mileageKm, 86000);
    assert.equal(r.fuelRaw, 'Essence');
    assert.equal(r.yearInTitle, 2020);
    assert.equal(r.isLeaseSuspect, false);
    assert.equal(r.rejection?.code, 'USD_PRICE');
    assert.match(r.rejection?.message ?? '', /CAD/);
  });

  it('Civic 2025 : "-1.0 L" -> cylindree null (garbage), reste parse', () => {
    const r = parseFixture('2172514816620002-civic-2025-moteur-negatif.json');
    assert.equal(r.priceValue, 22500);
    assert.equal(r.currencyFlag, 'CAD');
    assert.equal(r.mileageKm, 15780);
    assert.equal(r.fuelRaw, 'Essence');
    assert.equal(r.engineLitres, null);
    assert.equal(r.yearInTitle, 2025);
    assert.equal(r.rejection, null);
  });

  it('CR-V 2021 : "Type de carburant : Carburant" informatif, sans rejet', () => {
    const r = parseFixture('878197834687061-crv-2021-carburant.json');
    assert.equal(r.priceValue, 31999);
    assert.equal(r.currencyFlag, 'CAD');
    assert.equal(r.city, 'Montréal');
    assert.equal(r.mileageKm, 82000);
    assert.equal(r.fuelRaw, 'Carburant');
    assert.equal(r.yearInTitle, 2021);
    assert.equal(r.rejection, null);
  });

  it('Mazda 2 : format Renseignements + C$ + annee fallback bloc (2012)', () => {
    const r = parseFixture('1016869297640749-mazda2-renseignements.json');
    assert.equal(r.blockFormat, 'renseignements');
    assert.equal(r.priceValue, 1700);
    assert.equal(r.currencyFlag, 'CAD');
    assert.ok(r.priceRaw?.includes('C$'));
    assert.equal(r.city, 'Montréal');
    assert.equal(r.mileageKm, 258752);
    assert.equal(r.fuelRaw, null);
    assert.equal(r.yearInTitle, null);
    assert.equal(r.yearInBlock, 2012);
    assert.equal(r.rejection, null);
  });

  it('EV6 2025 lease 370 $ rejete (LEASE_PRICE, suspect=true)', () => {
    const r = parseFixture('1794586041727635-ev6-2025-lease.json');
    assert.equal(r.priceValue, 370);
    assert.equal(r.mileageKm, 25800);
    assert.equal(r.yearInTitle, 2025);
    assert.equal(r.isLeaseSuspect, true);
    assert.equal(r.rejection?.code, 'LEASE_PRICE');
    assert.match(r.rejection?.message ?? '', /location|bail|loyer/i);
  });

  it('format anglais : "$5,500" ($ avant, virgule) -> 5500 CAD', () => {
    const r = parseListing({
      h1: '2019 Honda Civic',
      bodyText:
        '2019 Honda Civic\n$5,500\nListed 3 weeks ago in Montreal, QC\nAbout this vehicle\nDriven 120 000 km\nFuel type: Gasoline',
      headings: [
        { tag: 'h1', text: '2019 Honda Civic' },
        { tag: 'h2', text: 'About this vehicle' },
      ],
      url: 'https://www.facebook.com/marketplace/item/1/',
      listingId: '1',
    });
    assert.equal(r.priceValue, 5500);
    assert.equal(r.currencyFlag, 'CAD');
    assert.equal(r.yearInTitle, 2019);
    assert.equal(r.rejection, null);
  });

  it('centimes ignores : "5 500,00 $" -> 5500 (pas 550000)', () => {
    const r = parseListing({
      h1: '2018 Toyota Corolla',
      bodyText:
        '2018 Toyota Corolla\n5 500,00 $\nMis en vente sur Laval, QC\nÀ propos de ce véhicule\nA roulé 100 000 km',
      headings: [
        { tag: 'h1', text: '2018 Toyota Corolla' },
        { tag: 'h2', text: 'À propos de ce véhicule' },
      ],
      url: 'https://www.facebook.com/marketplace/item/2/',
      listingId: '2',
    });
    assert.equal(r.priceValue, 5500);
    assert.equal(r.currencyFlag, 'CAD');
    assert.equal(r.rejection, null);
  });

  it('annee et compteurs sans $ ignores : "2014 ... 240 000 km ... 5 500 $"', () => {
    const r = parseListing({
      h1: '2014 BMW 3 series',
      bodyText:
        '2014 BMW 3 series\n2 propriétaires\nA roulé 240 000 km\n5 500 $\nMis en vente sur Laval, QC\nÀ propos de ce véhicule',
      headings: [
        { tag: 'h1', text: '2014 BMW 3 series' },
        { tag: 'h2', text: 'À propos de ce véhicule' },
      ],
      url: 'https://www.facebook.com/marketplace/item/3/',
      listingId: '3',
    });
    assert.equal(r.priceValue, 5500);
    assert.equal(r.mileageKm, 240000);
    assert.equal(r.rejection, null);
  });

  it('cas reel Lexus 2013 : "2013 Lexus is" + "7 950 $" + "A roulé 234 500 km"', () => {
    const r = parseListing({
      h1: '2013 Lexus is',
      bodyText:
        'Marketplace\n2013 Lexus is\n7 950 $\nMis en vente il y a 10 heures sur Laval, QC\nÀ propos de ce véhicule\nA roulé 234 500 km\nBoîte de vitesses automatique\nType de carburant : Essence\nChevaux-vapeur : 204 hp',
      headings: [
        { tag: 'h1', text: '2013 Lexus is' },
        { tag: 'h2', text: 'À propos de ce véhicule' },
      ],
      url: 'https://www.facebook.com/marketplace/item/9/',
      listingId: '9',
    });
    assert.equal(r.priceValue, 7950);
    assert.equal(r.currencyFlag, 'CAD');
    assert.equal(r.city, 'Laval');
    assert.equal(r.mileageKm, 234500);
    assert.equal(r.yearInTitle, 2013);
    assert.equal(r.rejection, null);
  });

  it('mauvais premier h1 : ancre de repli via h1Candidates', () => {
    const r = parseListing({
      h1: 'Facebook',
      h1Candidates: ['Facebook', '2013 Lexus is'],
      bodyText:
        'Facebook\nMarketplace\n2013 Lexus is\n7 950 $\nMis en vente sur Laval, QC\nÀ propos de ce véhicule\nA roulé 234 500 km',
      headings: [{ tag: 'h1', text: '2013 Lexus is' }],
      url: 'https://www.facebook.com/marketplace/item/9/',
      listingId: '9',
    });
    assert.equal(r.priceValue, 7950);
    assert.equal(r.priceFallbackWholeText, false);
    assert.equal(r.rejection, null);
  });

  it('aucune ancre : repli balayage integral avec drapeau', () => {
    const r = parseListing({
      h1: '',
      bodyText:
        '2013 Lexus is\n7 950 $\nMis en vente sur Laval, QC\nÀ propos de ce véhicule',
      headings: [{ tag: 'h2', text: 'À propos de ce véhicule' }],
      url: 'https://www.facebook.com/marketplace/item/9/',
      listingId: '9',
    });
    assert.equal(r.priceValue, 7950);
    assert.equal(r.priceFallbackWholeText, true);
    assert.equal(r.rejection, null);
  });

  it('garde-fou : ni bloc ni annee -> NOT_VEHICLE (overlay inactif)', () => {    const r = parseListing({
      h1: 'MacBook Pro 16 pouces',
      bodyText:
        'MacBook Pro 16 pouces\n2 400 $\nMis en vente hier sur Laval, QC\nEnvoyez un message',
      headings: [{ tag: 'h1', text: 'MacBook Pro 16 pouces' }],
      url: 'https://www.facebook.com/marketplace/item/999/',
      listingId: '999',
    });
    assert.equal(r.blockFormat, 'none');
    assert.equal(r.yearInTitle, null);
    assert.equal(r.yearInBlock, null);
    assert.equal(r.rejection?.code, 'NOT_VEHICLE');
  });
});
