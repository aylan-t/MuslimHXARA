import { describe, it, expect } from 'vitest';
import { chooseTextSource } from '../src/domSource';

const H1 = ['2022 Honda civic'];

describe('domSource.chooseTextSource', () => {
  it('main complet avec ancre -> main', () => {
    const main =
      'Marketplace\n2022 Honda civic\n12 500 $\nMis en vente sur Laval, QC\n' +
      'À propos de ce véhicule\nA roulé 80 000 km\nBoîte automatique\n'.repeat(6);
    const { text, source } = chooseTextSource(main, 'body ' + main, H1);
    expect(source).toBe('main');
    expect(text).toBe(main);
  });

  it('main quasi vide (< 200 car.) -> body', () => {
    const { text, source } = chooseTextSource(
      '   ',
      '2022 Honda civic\n12 500 $',
      H1,
    );
    expect(source).toBe('body');
    expect(text).toContain('12 500 $');
  });

  it('ancre absente du main (JS inline, colonne ailleurs) -> body', () => {
    const main = 'x'.repeat(5000); // gros main sans l'annonce
    const body = main + '\n2022 Honda civic\n12 500 $\nMis en vente sur Laval, QC';
    const { text, source } = chooseTextSource(main, body, H1);
    expect(source).toBe('body');
    expect(text).toContain('12 500 $');
  });

  it('aucun h1 : main non vide conservé', () => {
    const main = 'Contenu nav ' + 'y'.repeat(300);
    const { source } = chooseTextSource(main, main + ' extra', []);
    expect(source).toBe('body'); // sans ancre, on ne peut pas valider main
  });
});
