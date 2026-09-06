/**
 * sync-engine.mjs (AGENT-01) — Synchronise le moteur de calcul dans l'extension.
 *
 * Copie (MARKETPLACE_EXTENSION.md §6) :
 *   <root>/src/types/index.ts              → <ext>/src/engine/types.ts
 *   <root>/src/services/calculationEngine.ts → <ext>/src/engine/calculationEngine.ts
 *   <root>/src/data/defaultData.ts           → <ext>/src/engine/defaultData.ts
 *   <root>/src/services/prefill.ts            → <ext>/src/prefill.ts
 * en adaptant les imports relatifs vers ./types / ./defaultData,
 * puis injecte EXTENSION_ENGINE_VERSION (dernier commit ayant modifié les
 * sources canoniques copiées, fallback "dev") dans <ext>/src/engine/version.ts
 * + en-tête de chaque fichier copié.
 *
 * Usage : npm run sync:extension-engine (depuis marketplace-extension/)
 */
import { execSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const extRoot = resolve(scriptsDir, '..');
const repoRoot = resolve(extRoot, '..');

const COPIES = [
  { from: 'src/types/index.ts', to: 'src/engine/types.ts' },
  { from: 'src/services/calculationEngine.ts', to: 'src/engine/calculationEngine.ts' },
  { from: 'src/data/defaultData.ts', to: 'src/engine/defaultData.ts' },
  { from: 'src/services/prefill.ts', to: 'src/prefill.ts' }
];

/** Adapte les imports relatifs du repo vers le layout plat de src/engine/. */
function adaptImports(source, target) {
  const typesTarget = target === 'src/prefill.ts' ? './engine/types' : './types';
  return source
    .replace(/from\s+(['"])\.\.\/types\1/g, `from '${typesTarget}'`)
    .replace(/from\s+(['"])\.\.\/data\/defaultData\1/g, "from './defaultData'");
}

function sourceGitHash() {
  try {
    const sources = COPIES.map(({ from }) => from).join(' ');
    return execSync(`git log -1 --format=%H -- ${sources}`, {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim();
  } catch {
    return 'dev';
  }
}

function countOccurrences(text, needle) {
  return text.split(needle).length - 1;
}

const version = sourceGitHash();
const stamp = new Date().toISOString();
mkdirSync(resolve(extRoot, 'src/engine'), { recursive: true });

for (const { from, to } of COPIES) {
  const raw = readFileSync(resolve(repoRoot, from), 'utf8');
  const header =
    `// AUTO-GÉNÉRÉ par scripts/sync-engine.mjs — NE PAS ÉDITER.\n` +
    `// Source : ${from} · EXTENSION_ENGINE_VERSION=${version} · sync=${stamp}\n`;
  writeFileSync(resolve(extRoot, to), header + adaptImports(raw, to), 'utf8');
  console.log(`[sync] ${from} -> ${to}`);
}

writeFileSync(
  resolve(extRoot, 'src/engine/version.ts'),
  `// AUTO-GÉNÉRÉ par scripts/sync-engine.mjs — NE PAS ÉDITER.\n` +
    `/** Hash du commit <root>/src/ embarqué dans l'extension (affiché en footer overlay + meta.engineVersion). */\n` +
    `export const EXTENSION_ENGINE_VERSION = ${JSON.stringify(version)};\n`,
  'utf8'
);
console.log(`[sync] EXTENSION_ENGINE_VERSION=${version} -> src/engine/version.ts`);

// --- Vérification DEFAULT_CONFIG complet (checklist 01.4) ---
const dd = readFileSync(resolve(extRoot, 'src/engine/defaultData.ts'), 'utf8');
const checks = [
  ['FX CAD→MAD 7.35', dd.includes('CAD_to_MAD: 7.35') || dd.includes('CAD_to_MAD:7.35')],
  ['FX CAD→XOF 440.0', dd.includes('CAD_to_XOF: 440')],
  ['SN 44.786 % (formule détaillée du guide)', dd.includes('taxRatePercent: 44.786')],
  ['SN 10/15 ans + décret 2025-1845', dd.includes('maxAgeYearsTourism: 10') && dd.includes('maxAgeYearsTrucks: 15') && dd.includes('2025-1845')],
  ['MA 17.5 + 0.25 + TVA 20', dd.includes('standardImportRatePercent: 17.5') && dd.includes('parafiscalRatePercent: 0.25') && dd.includes('vatRatePercent: 20')],
  ['MA MRE 10 ans / abattement 85 %', dd.includes('mreMaxAgeYears: 10') && dd.includes('mreMaxDiscountPercent: 85')],
  ['6 routes', countOccurrences(dd, 'destinationPort:') === 6],
  ['3 méthodes de transfert', countOccurrences(dd, 'typicalSpreadPercent:') === 3],
  ['7 régions QC', countOccurrences(dd, 'costToHalifaxCad:') === 7],
  ['marketData 12 pts', countOccurrences(dd, 'averagePriceLocal:') === 12],
  ['6 OFFICIAL_SOURCES', countOccurrences(dd, 'countryCode:') === 6]
];

let failed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? '[ok]  ' : '[FAIL]'} ${label}`);
  if (!ok) failed++;
}

// Aucun import relatif résiduel vers le repo parent (sandbox MV3 : moteur autonome).
const engineFiles = [...COPIES.map((c) => c.to), 'src/engine/version.ts'];
for (const rel of engineFiles) {
  const content = readFileSync(resolve(extRoot, rel), 'utf8');
  if (/\.\.\//.test(content)) {
    console.error(`[FAIL] import relatif '../' résiduel dans ${rel}`);
    failed++;
  }
}

if (failed > 0) {
  console.error(`\n[sync] ÉCHEC : ${failed} vérification(s) en défaut.`);
  process.exit(1);
}
console.log('\n[sync] Moteur synchronisé et vérifié (11/11).');
