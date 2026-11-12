import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { defineConfig, Plugin } from 'vite';

/**
 * Emits root-level static assets (mock-data.json and presentation markdown) into the
 * production bundle output so direct URL fetches work identically in production builds
 * without relying on development-only Vite middleware.
 */
function emitRootAssetsPlugin(): Plugin {
  const rootDir = import.meta.dirname || process.cwd();
  const assetFiles = ['mock-data.json', 'UG_PROJECT_FIRST_REVIEW_PRESENTATION.md'];

  return {
    name: 'emit-root-assets',
    apply: 'build',
    generateBundle() {
      for (const fileName of assetFiles) {
        const filePath = path.resolve(rootDir, fileName);
        if (fs.existsSync(filePath)) {
          this.emitFile({
            type: 'asset',
            fileName,
            source: fs.readFileSync(filePath, 'utf-8')
          });
        }
      }
    }
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), emitRootAssetsPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.')
      }
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        '/api': {
          target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:4000',
          changeOrigin: true
        }
      }
    },
    preview: {
      proxy: {
        '/api': {
          target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:4000',
          changeOrigin: true
        }
      }
    }
  };
});
