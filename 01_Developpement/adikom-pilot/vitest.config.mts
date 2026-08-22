import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      // `server-only` lève une erreur hors contexte serveur React. Les tests
      // s'exécutent sous Node : l'alias permet d'éprouver le moteur
      // documentaire sans affaiblir la garantie en production, où il n'existe
      // pas. Voir src/lib/documents/server-only-stub.ts
      'server-only': path.resolve(
        import.meta.dirname,
        './src/lib/documents/server-only-stub.ts'
      ),
    },
  },
})
