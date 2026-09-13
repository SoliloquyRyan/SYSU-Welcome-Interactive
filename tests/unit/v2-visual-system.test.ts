import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(import.meta.dirname, '../..')

function read(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
}

function sfcBlock(source: string, tag: 'script' | 'template' | 'style') {
  const pattern = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'u')
  return source.match(pattern)?.[1] ?? ''
}

function customProperty(style: string, name: string) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  return style.match(new RegExp(`${escapedName}:\\s*([^;]+);`, 'u'))?.[1].trim() ?? ''
}

function cssRule(style: string, selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  return style.match(new RegExp(`(?:^|\\n)\\s*${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`, 'u'))?.[1] ?? ''
}

function outerTemplate(source: string) {
  const start = source.indexOf('<template>')
  const end = source.lastIndexOf('</template>')
  return start >= 0 && end > start ? source.slice(start, end + '</template>'.length) : ''
}

describe('V2 mobile visual system contracts', () => {
  it('keeps the complete heading accessible while the visible copy types with a trailing caret', () => {
    const title = read('frontend/src/pages/student/SignalTypeTitle.vue')
    const script = sfcBlock(title, 'script')
    const template = sfcBlock(title, 'template')
    const style = sfcBlock(title, 'style')

    expect(template).toContain(':aria-label="accessibleLabel || text.replaceAll(\'\\n\', \'\')"')
    expect(template).toMatch(/class="signal-type-title__measure"\s+aria-hidden="true"/u)
    expect(template).toMatch(/class="signal-type-title__typed"[\s\S]*?aria-hidden="true"/u)
    expect(template).toMatch(/\{\{\s*visibleText\s*\}\}\s*<span class="signal-type-title__caret">/u)
    expect(script).toContain("const visibleText = computed(() => glyphs.value.slice(0, visibleCount.value).join(''))")
    expect(script).toContain('delayMs: { type: Number, default: 90 }')
    expect(script).toContain('window.setTimeout(revealNext, Math.max(0, props.delayMs))')
    expect(style).toMatch(/\.signal-type-title__caret\s*\{[\s\S]*?display:\s*inline-block/u)
    expect(style).toMatch(/\.signal-type-title__caret\s*\{[\s\S]*?animation:\s*signal-caret-blink/u)
    expect(style).toMatch(/\.signal-type-title__typed\.is-reduced \.signal-type-title__caret\s*\{[\s\S]*?animation:\s*none/u)
  })

  it('finishes titles instead of replaying motion for reduced, hidden, or recovered views', () => {
    const title = read('frontend/src/pages/student/SignalTypeTitle.vue')
    const script = sfcBlock(title, 'script')
    const animationGateWatch = script.match(
      /watch\(\(\) => \[props\.animate, props\.reduced\],[\s\S]*?\n\}\)/u,
    )?.[0] ?? ''

    expect(script).toContain('if (!props.animate || props.reduced || document.hidden)')
    expect(script).toMatch(/function onVisibilityChange\(\)\s*\{\s*if \(document\.hidden\) finishReveal\(\)/u)
    expect(script).toContain("document.addEventListener('visibilitychange', onVisibilityChange)")
    expect(script).toContain('watch(() => [props.text, props.replayKey], playReveal')
    expect(animationGateWatch).toContain('finishReveal()')
    expect(animationGateWatch).not.toContain('playReveal')

    const page = read('frontend/src/pages/student/V2WelcomeExperience.vue')
    expect(page).toContain('accessible-label="为你的星选择颜色"')
    expect(page).toContain(':reduced="reducedMotion"')
  })

  it('delays the discovery title until the participant signal is framed, then types the personalized welcome', () => {
    const page = read('frontend/src/pages/student/V2WelcomeExperience.vue')
    const script = sfcBlock(page, 'script')
    const discovery = page.match(
      /<div\s+class="discovery-copy"[\s\S]*?(?=<div\s+class="selection-copy")/u,
    )?.[0] ?? ''

    expect(script).toContain("participant.value?.displayName ?? '同学'")
    expect(script).toContain('participant.value?.personalStarCode ?? participant.value?.ownPublicStarId')
    expect(discovery).toContain('{{ participantDisplayName }}')
    expect(discovery).toContain('text="找到属于你的星"')
    expect(discovery).toContain(':accessible-label="`找到属于 ${participantDisplayName} 的星`"')
    expect(discovery).toContain(':animate="titleMotionEnabled && cinematic === \'discovering\'"')
    expect(discovery).toContain(':delay-ms="Math.round(DISCOVERY_CINEMATIC_DURATION_MS * 0.72)"')
    expect(discovery).toContain('星星编号 {{ personalStarCode }}')
    expect(discovery).toContain('欢迎参加智能工程学院迎新晚会')
  })

  it('draws all four gift signals as original inline SVG rather than text glyphs', () => {
    const icon = read('frontend/src/pages/student/GiftSignalIcon.vue')
    const template = sfcBlock(icon, 'template')
    const style = sfcBlock(icon, 'style')

    expect(template).toContain('<svg class="gift-signal-icon"')
    expect(template).toContain("giftId === 'gift-glimmer'")
    expect(template).toContain("giftId === 'gift-beacon'")
    expect(template).toContain("giftId === 'gift-orbit'")
    expect(template.match(/<g\b/gu)).toHaveLength(4)
    expect(template).toMatch(/<g v-else>/u)
    expect(template).toMatch(/<(?:path|circle|ellipse)\b/u)
    expect(template).not.toMatch(/<img\b|✦|🎁|🚀/u)
    expect(style).toContain('stroke: currentColor')
    expect(style).toContain('vector-effect: non-scaling-stroke')

    const page = read('frontend/src/pages/student/V2WelcomeExperience.vue')
    expect(page).toContain('<GiftSignalIcon :gift-id="gift.id" />')
  })

  it('opens the gift explanation freely but keeps every actual send behind server gates', () => {
    const page = read('frontend/src/pages/student/V2WelcomeExperience.vue')
    const script = sfcBlock(page, 'script')
    // The page contains nested Vue <template> blocks, so search the complete SFC here.
    const template = page
    const trigger = template.match(
      /<button\s+ref="giftTrigger"[\s\S]*?<\/button>/u,
    )?.[0] ?? ''
    const sendButton = template.match(
      /<button\s+v-for="gift in currentProgram\.giftCatalog"[\s\S]*?<\/button>/u,
    )?.[0] ?? ''
    const openGift = script.match(/async function openGift\(\)[\s\S]*?\n\}/u)?.[0] ?? ''
    const sendGift = script.match(/async function sendGift\(gift\)[\s\S]*?\n\}/u)?.[0] ?? ''
    const readyGate = script.match(
      /const giftInteractionReady = computed\(\(\) =>[\s\S]*?Boolean\(currentProgram\.value[^\n]+\),\s*\)/u,
    )?.[0] ?? ''

    expect(trigger).toContain('aria-haspopup="dialog"')
    expect(trigger).toContain('@click="openGift"')
    expect(trigger).toContain('余额 {{ participant.powerBalance }}')
    expect(trigger).not.toContain('disabled')
    expect(openGift).toContain('giftOpen.value = true')
    expect(openGift).not.toContain('giftInteractionReady')

    expect(readyGate).toContain('writesReady.value')
    expect(readyGate).toContain("actionAllowed(snapshot.value, 'SEND_GIFT')")
    expect(readyGate).toContain("currentProgram.value.kind === 'PERFORMANCE'")
    expect(template).toContain(':disabled="!selectedGift || !giftInteractionReady || participant.powerBalance < giftTotal || Boolean(busy)"')
    expect(template).not.toContain('首礼减免')
    expect(sendButton).toContain('@click="selectedGiftId = gift.id"')
    expect(template).toContain('@click="sendGift(selectedGift)"')
    expect(sendGift).toContain('if (!currentProgram.value) return')
    expect(sendGift).toContain("await runCommand('SEND_GIFT'")
    expect(sendGift).toContain('programId: currentProgram.value.id')
    expect(sendGift).toContain('giftId: gift.id')
    expect(sendGift).toContain('quantity: giftQuantity.value')
    expect(template).toContain('aria-label="减少礼物数量"')
    expect(template).toContain('aria-label="增加礼物数量"')
    expect(template).toContain('v-if="currentProgram?.giftCatalog?.length"')
    expect(template).toContain('{{ gift.powerCost }}')
    expect(template).toContain('{{ participant.powerBalance }}')
    expect(template).toContain('id="gift-availability"')
    expect(template).toContain('aria-label="当前节目收到的礼物"')
    expect(template).toContain('participant.giftHistory')
    expect(template).toContain('participant.barrageHistory')
    expect(template).toContain('<GiftStarshipFlight')
    const barrage = read('frontend/src/pages/student/MobileBarrage.vue')
    expect(barrage).toMatch(/<TransitionGroup\b[^>]*\bname="chat-rise"/u)
    expect(barrage).toContain('background:linear-gradient(105deg,rgba(9,25,46,.5),rgba(11,28,48,.24))')
    const screen = read('frontend/src/pages/screen/V2ScreenExperience.vue')
    expect(screen).toContain('<GiftStarshipFlight')
    expect(screen).toContain('applyGiftEvent(payload.gift)')
  })

  it('uses a local mobile font with system fallback and retains small asymmetric corners', () => {
    const page = read('frontend/src/pages/student/V2WelcomeExperience.vue')
    const style = sfcBlock(page, 'style')
    const tokens = read('frontend/src/styles/tokens.css')

    const cjk = customProperty(tokens, '--font-family-cjk')
    const display = customProperty(tokens, '--font-family-display')
    const signal = customProperty(tokens, '--font-family-signal')
    const data = customProperty(tokens, '--font-family-data')
    expect(cjk).toMatch(/system-ui|PingFang SC|Microsoft YaHei/u)
    expect(display).toMatch(/Cascadia Code|Cascadia Mono|ui-monospace/u)
    expect(signal).toMatch(/Bahnschrift|Segoe UI Variable/u)
    expect(data).toMatch(/Cascadia Mono|SFMono-Regular|Consolas/u)
    expect(customProperty(style, '--font-ui')).toMatch(/^"Welcome Sans SC",\s*var\(--font-family-cjk\)$/u)
    expect(customProperty(style, '--font-display')).toBe('var(--font-ui)')
    expect(customProperty(style, '--font-signal')).toBe('var(--font-ui)')
    expect(customProperty(style, '--font-data')).toContain('var(--font-family-data)')
    const mobileFont = read('frontend/src/styles/mobile-font.css')
    expect(mobileFont).toContain('font-display: swap')
    expect(mobileFont).toContain('font-weight: 400 700')
    expect(mobileFont).toMatch(/src:\s*url\("\.\.\/assets\/fonts\/[^"\n]+\.woff2"\)/u)
    expect(mobileFont).not.toMatch(/url\(["']?(?:https?:|data:)/u)
    expect(cssRule(style, '.v2-welcome__main h2')).toContain('font-family: var(--font-display)')

    for (const token of ['--shape-panel', '--shape-control', '--shape-item']) {
      const radii = customProperty(tokens, token).split(/\s+/u)
      expect(radii, `${token} must use four-corner syntax`).toHaveLength(4)
      expect(new Set(radii).size, `${token} must be visibly asymmetric`).toBeGreaterThan(1)
      expect(
        radii.every((radius) => Number.parseFloat(radius) <= 8),
        `${token} must stay subtly bent rather than rounded-card sized`,
      ).toBe(true)
      expect(style).toContain(`var(${token})`)
    }

    expect(cssRule(style, '.operation-dock')).toContain('border-radius: var(--shape-panel)')
    const logout = cssRule(style, '.v2-welcome__logout')
    expect(logout).toContain('min-height: 44px')
    expect(logout).toContain('border: 0')
    expect(Number.parseFloat(logout.match(/border-radius:\s*([^;]+)/u)?.[1] ?? '999')).toBeLessThanOrEqual(4)
    expect(style).toMatch(/\.v2-welcome__logout::before,[\s\S]*?\.v2-welcome__logout::after\s*\{/u)
  })

  it('shares Orbital Signal semantics while keeping the admin surface operational and explicit', () => {
    const tokens = read('frontend/src/styles/tokens.css')
    const app = read('frontend/src/App.vue')
    const shell = read('frontend/src/style.css')
    const admin = read('frontend/src/pages/admin/V2AdminConsole.vue')
    const formalBuild = read('scripts/build-formal.mjs')

    for (const token of [
      '--color-orbit-surface-1',
      '--color-orbit-text-primary',
      '--color-orbit-border-subtle',
      '--color-orbit-success',
      '--color-orbit-warning',
      '--color-orbit-danger',
      '--color-orbit-disabled-surface',
      '--color-orbit-focus',
    ]) {
      expect(customProperty(tokens, token), `${token} must be defined`).not.toBe('')
    }

    expect(shell).toMatch(/\.app-shell\.route-admin\s*\{[\s\S]*?--color-bg-canvas:\s*var\(--color-orbit-midnight\)/u)
    expect(admin).toContain('data-visual-palette="orbital-signal-spectrum"')
    expect(admin).toContain('data-surface-role="operations"')
    expect(admin).toContain("NONE: '无活动投影'")
    expect(admin).toContain('{{ presentationLabel }}')
    expect(admin).not.toContain('{{ presentation.type }}')
    expect(admin).toContain("protectedRuntime ? '现场后台登录' : '排练后台登录'")
    expect(admin).toContain('<BaseCard v-if="!protectedRuntime"')
    expect(app).toContain('import.meta.env.VITE_SITE_EDITION')
    expect(app).toContain("deploymentCopy(import.meta.env.VITE_SITE_NOTICE, '仅使用固定合成数据')")
    expect(formalBuild).toContain("VITE_DATA_PROFILE: 'PROTECTED'")
    expect(formalBuild).toContain("VITE_SITE_NOTICE: process.env.VITE_SITE_NOTICE ?? '受保护名单 · NFC 匿名入口'")
  })

  it('keeps one top-level typed heading for program and archive views', () => {
    const page = read('frontend/src/pages/student/V2WelcomeExperience.vue')
    const program = page.match(
      /<section v-else-if="activeTab === 'programs'"[\s\S]*?<\/section>/u,
    )?.[0] ?? ''
    const archive = page.match(/<section v-else class="archive"[\s\S]*?<\/section>/u)?.[0] ?? ''

    expect(page.match(/id="view-title"/gu)).toHaveLength(1)
    // Visible line breaks preserve the canonical, complete accessible heading.
    expect(page).toContain(':text="viewCopy.displayTitle ?? viewCopy.title"')
    expect(page).toContain(':accessible-label="viewCopy.title"')
    for (const panel of [program, archive]) {
      expect(panel).toContain('aria-labelledby="view-title"')
      expect(panel).not.toMatch(/<h[1-3]\b/u)
    }
    expect(program).not.toContain('class="panel-context"')
    expect(archive).toContain('<strong class="archive-owner">{{ participantDisplayName }}</strong>')
  })

  it('validates an 8-digit assisted entry locally and sends the same value privately', () => {
    const page = read('frontend/src/pages/student/V2WelcomeExperience.vue')
    const script = sfcBlock(page, 'script')
    const assisted = script.match(/function activateAssisted\(\)[\s\S]*?\n\}/u)?.[0] ?? ''

    expect(page).toContain('<label>学生姓名<input')
    expect(page).toContain('<label>8 位学号<input')
    expect(page).toContain('inputmode="numeric"')
    expect(page).toContain('maxlength="8"')
    expect(page).toContain('pattern="[0-9]{8}"')
    expect(assisted).toContain("if (!/^\\d{8}$/.test(studentNumber.value))")
    expect(assisted).toContain("persistentError.value = '请输入 8 位学号。'")
    expect(assisted).toContain("void activate('ASSISTED_STUDENT'")
    expect(assisted).toContain('studentNumber: studentNumber.value')
    expect(assisted).not.toContain('studentNumber: `2026${studentNumber.value}`')
    expect(page).toContain('输入学生姓名与 8 位学号')
  })

  it('orders the named archive, omits admission status and exposes dismissible metric explanations', () => {
    const page = read('frontend/src/pages/student/V2WelcomeExperience.vue')
    const script = sfcBlock(page, 'script')
    const archive = page.match(/<section v-else class="archive"[\s\S]*?<\/section>/u)?.[0] ?? ''
    const escapeHandler = script.match(/function onEscape\(event\)[\s\S]*?\n\}/u)?.[0] ?? ''

    expect(archive).not.toContain('<dt>星星编号</dt>')
    expect(archive.indexOf('archive-owner')).toBeLessThan(archive.indexOf('<dt>星色</dt>'))
    expect(archive).toContain('{{ participantDisplayName }}')
    expect(archive).toContain('{{ personalStarCode }}')
    expect(archive).not.toContain('<dt>入场</dt>')
    expect(archive).not.toContain('participant.starlight')
    for (const metric of ['power']) {
      const trigger = archive.match(
        new RegExp(`<button type="button"[^>]*archiveMetricHelp === '${metric}'[^>]*>`, 'u'),
      )?.[0] ?? ''
      expect(trigger).toContain('aria-controls="archive-metric-help"')
      expect(trigger).toContain(':aria-expanded=')
      expect(trigger).toContain(':aria-describedby=')
      expect(trigger).toContain(`@click="toggleArchiveMetricHelp('${metric}')"`)
    }
    expect(archive).toContain(':role="archiveMetricMessage ? \'tooltip\' : undefined"')
    expect(archive).toContain(":aria-hidden=\"archiveMetricMessage ? undefined : 'true'\"")
    expect(escapeHandler).toContain("if (event.key !== 'Escape') return")
    expect(escapeHandler).toContain("else archiveMetricHelp.value = ''")
  })

  it('does not render the retired English decorative labels', () => {
    const template = outerTemplate(read('frontend/src/pages/student/V2WelcomeExperience.vue'))
    const retiredLabels = [
      'PROGRAM INDEX',
      'PERSONAL ARCHIVE',
      'FINALE',
      'LIVE GALAXY',
      'SIGNAL ACQUISITION',
      'ASSISTED SYNTHETIC ENTRY',
      'A QUIET SIGNAL',
      'YOUR STAR',
      'LIGHT REGISTERED',
      'PERSONAL ORBIT',
      'A NOTE FOR THE FUTURE',
      'ORBIT ENTRY',
      'NOW PLAYING',
      'LIVE GIFT',
      'POWER BALANCE',
      'LEAVE SESSION',
    ]

    for (const label of retiredLabels) expect(template).not.toContain(label)
  })
})
