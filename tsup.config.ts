import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/extension.ts'],
  outDir: 'dist',
  format: 'cjs',
  target: 'node18',
  platform: 'node',
  bundle: true,
  minify: false,
  sourcemap: false,
  clean: true,
  external: ['vscode'],
  noExternal: ['@modelcontextprotocol/sdk', 'zod'],
})
