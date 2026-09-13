import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const root = fileURLToPath(new URL('..', import.meta.url))
process.chdir(root)
const require = createRequire(path.join(root, 'frontend/package.json'))
const { build } = await import(pathToFileURL(require.resolve('vite')).href)
const source = path.join(root, 'frontend/preview/galaxy-shot')
const output = path.join(root, 'output/playwright/galaxy-shot-20260906')
// Bundle in memory. This tool never cleans a directory or starts an application
// server. Its artifact works from file:// and contains no external resources.
const result = await build({
  configFile: false, root: source, logLevel: 'warn',
  build: { write: false, minify: false, target: 'es2022',
    lib: { entry: path.join(source, 'main.js'), name: 'GalaxyShotPreview', formats: ['iife'] } },
})
const chunks = (Array.isArray(result) ? result : [result]).flatMap(result => result.output)
const script = chunks.filter(chunk => chunk.type === 'chunk').map(chunk => chunk.code).join('\n')
const template = await readFile(path.join(source, 'index.html'), 'utf8')
const fontPath = 'frontend/src/assets/fonts/welcome-sans-sc-ui.woff2'
const font = await readFile(path.join(root, fontPath))
const fontLicensePath = 'frontend/public/licenses/welcome-sans-sc-OFL.txt'
const fontLicense = await readFile(path.join(root, fontLicensePath), 'utf8')
const html = template.replace('../../src/assets/fonts/welcome-sans-sc-ui.woff2', `data:font/woff2;base64,${font.toString('base64')}`)
  .replace('</head>', `<!-- Embedded Welcome Sans SC / Noto Sans SC license:\n${fontLicense.replaceAll('--', '- -')}\n-->\n</head>`)
  .replace('<script type="module" src="./main.js"></script>', `<script>${script.replaceAll('</script', '<\\/script')}</script>`)
await mkdir(output, { recursive: true })
await writeFile(path.join(output, 'index.html'), html)
const sources = ['frontend/preview/galaxy-shot/scene.js', 'frontend/preview/galaxy-shot/main.js', 'frontend/preview/galaxy-shot/index.html', 'frontend/src/pages/screen/galaxy-renderer.js', 'frontend/src/styles/orbital-signal.js', fontPath, fontLicensePath]
const hashes = Object.fromEntries(await Promise.all(sources.map(async name => [name, createHash('sha256').update(await readFile(path.join(root, name))).digest('hex')])))
await writeFile(path.join(output, 'source-manifest.json'), JSON.stringify({ generatedAt: new Date().toISOString(), previewOnly: true, databaseAccess: false, productionRoutesChanged: false, sources: hashes, bytes: Buffer.byteLength(html) }, null, 2))
console.log(JSON.stringify({ artifact: path.join(output, 'index.html'), bytes: Buffer.byteLength(html), previewOnly: true }))
