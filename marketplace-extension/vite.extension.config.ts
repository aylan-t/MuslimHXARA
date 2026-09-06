import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const extRoot = dirname(fileURLToPath(import.meta.url));

/**
 * Finalise dist-extension/ après le build : copie manifest.json, popup.html,
 * popup.js (popup diagnostic statique, sans bundling) et écrit build-info.json
 * (version extension + version moteur + date build, lus par le popup).
 * Le dossier dist-extension/ est ainsi chargeable tel quel via
 * chrome://extensions ou brave://extensions (mode développeur).
 */
function copyStatic(): Plugin {
  return {
    name: 'axc-copy-static',
    writeBundle() {
      const out = resolve(extRoot, 'dist-extension');
      mkdirSync(out, { recursive: true });
      for (const f of ['manifest.json', 'popup.html', 'popup.js']) {
        copyFileSync(resolve(extRoot, f), resolve(out, f));
      }
      let version = '0.0.0';
      try {
        version = JSON.parse(readFileSync(resolve(extRoot, 'manifest.json'), 'utf8')).version ?? version;
      } catch { /* défaut */ }
      let engineVersion = 'unknown';
      try {
        const m = /EXTENSION_ENGINE_VERSION\s*=\s*"([^"]+)"/.exec(
          readFileSync(resolve(extRoot, 'src/engine/version.ts'), 'utf8'),
        );
        if (m) engineVersion = m[1];
      } catch { /* défaut */ }
      writeFileSync(
        resolve(out, 'build-info.json'),
        JSON.stringify({ version, engineVersion, builtAt: new Date().toISOString() }),
      );
    }
  };
}

// Build MV3 SÉPARÉ de l'app (MARKETPLACE_EXTENSION.md §6) :
// - outDir dist-extension/ (jamais dist/ de l'app)
// - CSS inline (cssCodeSplit: false + assetsInlineLimit élevé), scopé sous #axc-overlay (AGENT-05)
// - ZÉRO code distant : aucune URL externe dans le bundle, seul réseau autorisé au
//   runtime = FX live optionnel (src/fx.ts, timeout 4 s, fallback local).
// Entrée unique : content = pipeline complet (content-main), bundle en UN SEUL
// fichier IIFE (content.js, référencé par manifest.json). L'IIFE est obligatoire :
// les content scripts MV3 déclarés en manifest sont chargés comme scripts
// classiques — un bundle ESM (`import ... from "./fx.js"`) meurt en silence avec
// une SyntaxError et RIEN ne s'affiche. src/fx.ts est importé par content-main
// et donc inliné par rollup (pas d'entrée séparée).
export default defineConfig({
  plugins: [react(), copyStatic()],
  publicDir: false,
  build: {
    outDir: 'dist-extension',
    emptyOutDir: true,
    target: 'es2020',
    minify: true,
    cssCodeSplit: false,
    assetsInlineLimit: 100 * 1024 * 1024,
    rollupOptions: {
      input: {
        content: resolve(extRoot, 'src/content-main.tsx')
      },
      output: {
        format: 'iife',
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
        inlineDynamicImports: true
      }
    }
  }
});
