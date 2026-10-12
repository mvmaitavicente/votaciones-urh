import { build } from 'esbuild'
import fs from 'node:fs'
const { devDependencies } = JSON.parse(fs.readFileSync('package.json', 'utf8'))
await build({
  entryPoints: ['functions/verificar-acceso.ts'], bundle: true, format: 'esm',
  platform: 'neutral', target: 'es2022', outfile: 'artifacts/verificar-acceso.js',
  external: ['jose'], plugins: [{ name: 'deno-jose', setup(builder) {
    builder.onResolve({ filter: /^jose$/ }, () => ({ path: `npm:jose@${devDependencies.jose}`, external: true }))
  } }],
})
const code = fs.readFileSync('artifacts/verificar-acceso.js', 'utf8')
if (code.includes('RBAC_DEMO') || code.includes('createDemoHandler') || code.includes('createFixtureRepository')) throw new Error('El artefacto incluye código de demo.')
console.log('Artefacto InsForge preparado: artifacts/verificar-acceso.js. No desplegado.')
