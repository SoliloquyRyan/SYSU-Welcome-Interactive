import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const root = fileURLToPath(new URL('..', import.meta.url))
const require = createRequire(path.join(root, 'frontend/package.json'))
const { build } = await import(pathToFileURL(require.resolve('vite')).href)
const { default: vue } = await import(pathToFileURL(require.resolve('@vitejs/plugin-vue')).href)
const source = path.join(root, 'frontend/preview/cinema')
const output = path.resolve(root, process.argv[2] ?? 'output/playwright/d072-cinema')
if (!output.startsWith(path.join(root, 'output') + path.sep)) throw new Error('Preview output must stay under workspace output/')
const result = await build({
  configFile: false, root: source, plugins: [vue()], logLevel: 'warn',
  define: { 'process.env.NODE_ENV': JSON.stringify('production'), __VUE_OPTIONS_API__: true,
    __VUE_PROD_DEVTOOLS__: false, __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false },
  build: { write: false, minify: true, target: 'es2022',
    lib: { entry: path.join(source, 'main.js'), name: 'CinemaReview', formats: ['iife'] } },
})
const chunks = (Array.isArray(result) ? result : [result]).flatMap(item => item.output)
const js = chunks.filter(item => item.type === 'chunk').map(item => item.code).join('\n')
const css = chunks.filter(item => item.type === 'asset' && item.fileName.endsWith('.css')).map(item => item.source).join('\n')
const license = await readFile(path.join(root, 'frontend/public/licenses/welcome-sans-sc-OFL.txt'), 'utf8')
const html = (await readFile(path.join(source, 'index.html'), 'utf8'))
  .replace('</head>', () => `<style>${css}</style><!-- Font license:\n${license.replaceAll('--', '- -')}\n--></head>`)
  .replace('<script type="module" src="./main.js"></script>', () => `<script>${js.replaceAll('</script', '<\\/script')}</script>`)
await mkdir(output, { recursive: true })
await writeFile(path.join(output, 'index.html'), html)
const sources = ['frontend/preview/cinema/main.js', 'frontend/preview/cinema/preview.css',
  'frontend/src/components/ArrivalCount.vue', 'frontend/src/pages/student/PersonalJourneyStage.vue',
  'frontend/src/components/GiftStarshipFlight.vue', 'frontend/src/rendering/galactic-medium.js',
  'frontend/src/assets/gifts/starship-pearl-v2.png',
  'frontend/src/rendering/cinema-timing.js', 'frontend/src/pages/screen/cinematic-galaxy-scene.js',
  'frontend/src/pages/screen/galaxy-renderer.js',
  'frontend/src/pages/student/personal-journey-renderer.js',
  'frontend/src/pages/student/personal-journey-timeline.js',
    'frontend/src/rendering/stellar-flow.js', 'frontend/src/rendering/stellar-nebula.js', 'frontend/src/rendering/stellar-cloud.js', 'frontend/src/rendering/stellar-sky.js', 'frontend/src/services/star-temperature.js']
const hashes = Object.fromEntries(await Promise.all(sources.map(async name => [name,
  createHash('sha256').update(await readFile(path.join(root, name))).digest('hex') ])))
await writeFile(path.join(output, 'source-manifest.json'), JSON.stringify({ generatedAt: new Date().toISOString(),
  syntheticVisualPreview: true, databaseAccess: false, sources: hashes, bytes: Buffer.byteLength(html) }, null, 2))
console.log(JSON.stringify({ artifact: path.join(output, 'index.html'), bytes: Buffer.byteLength(html) }))
