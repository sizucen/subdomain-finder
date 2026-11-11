import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { buildManifest } from './manifest.config.js';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

function emitManifest(target) {
  return {
    name: 'emit-manifest',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.json',
        source: JSON.stringify(buildManifest(target, pkg.version), null, 2),
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const target = mode === 'firefox' ? 'firefox' : 'chromium';
  return {
    base: './', // extension pages load assets with relative paths
    plugins: [react(), emitManifest(target)],
    build: { outDir: `dist/${target}`, emptyOutDir: true },
  };
});
