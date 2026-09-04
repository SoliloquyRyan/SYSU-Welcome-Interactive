import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))

function read(relativePath) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8')
}

function requireText(content, pattern, message) {
  if (!pattern.test(content)) throw new Error(message)
}

const caddy = read('deploy/Caddyfile')
const service = read('deploy/sysu-welcome.service')
const runtimeEnvironment = read('deploy/runtime.env.example')
const caddyEnvironment = read('deploy/caddy.env.example')
const ignore = read('.gitignore')

requireText(caddy, /^\{\$SYSU_WELCOME_DOMAIN\} \{/m, 'Caddy domain must come from an environment variable')
requireText(caddy, /handle \/api\/\*/, 'Caddy must proxy API requests')
requireText(caddy, /handle \/ws\*/, 'Caddy must proxy WebSocket requests')
requireText(caddy, /reverse_proxy 127\.0\.0\.1:3000/g, 'Caddy upstream must stay on loopback')
requireText(caddy, /try_files \{path\} \/index\.html/, 'Caddy must support SPA route fallback')
requireText(caddy, /Strict-Transport-Security/, 'Caddy must emit HSTS')
if (/tls_insecure_skip_verify|auto_https\s+off|http:\/\//.test(caddy)) {
  throw new Error('Caddy deployment disables an HTTPS safety boundary')
}

for (const required of [
  /^User=sysu-welcome$/m,
  /^EnvironmentFile=\/etc\/sysu-welcome\/runtime\.env$/m,
  /^Restart=on-failure$/m,
  /^UMask=0077$/m,
  /^ProtectSystem=strict$/m,
  /^ReadWritePaths=\/var\/lib\/sysu-welcome$/m,
  /^NoNewPrivileges=true$/m,
]) {
  requireText(service, required, `systemd hardening requirement is missing: ${required}`)
}

for (const required of [
  /^NODE_ENV=production$/m,
  /^FORMAL_RUNTIME_DIR=\/var\/lib\/sysu-welcome\/private$/m,
  /^FORMAL_PUBLIC_ORIGIN=https:\/\//m,
  /^DEMO_BACKEND_HOST=127\.0\.0\.1$/m,
  /^DEMO_SECURE_COOKIES=1$/m,
  /^DEMO_TRUST_LOOPBACK_PROXY=1$/m,
]) {
  requireText(runtimeEnvironment, required, `formal environment requirement is missing: ${required}`)
}

requireText(caddyEnvironment, /^SYSU_WELCOME_DOMAIN=[A-Za-z0-9.-]+$/m, 'Caddy domain example is missing')
requireText(ignore, /^backend\/\.private\/$/m, 'protected runtime ignore rule is missing')
requireText(ignore, /^backend\/\.rehearsal\/$/m, 'rehearsal runtime ignore rule is missing')

for (const forbidden of [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /(?:github_pat_|gh[pousr]_)[A-Za-z0-9_]{20,}/,
  /FORMAL_PUBLIC_ORIGIN=https:\/\/[^\s]*\?token=/,
]) {
  if (forbidden.test(`${runtimeEnvironment}\n${caddyEnvironment}`)) {
    throw new Error('deployment examples contain a forbidden secret pattern')
  }
}

console.log('deployment-check OK: HTTPS proxy, loopback backend, persistent runtime, hardening and secret boundaries')
