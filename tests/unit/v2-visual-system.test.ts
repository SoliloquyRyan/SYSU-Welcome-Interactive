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
      /const giftInteractionReady = computed\(\(\) =>[\s\S]*?Boolean\(currentProgram\.value\),\s*\)/u,
    )?.[0] ?? ''

    expect(trigger).toContain('aria-haspopup="dialog"')
    expect(trigger).toContain('@click="openGift"')
    expect(trigger).toContain('余额 {{ participant.powerBalance }}')
    expect(trigger).not.toContain('disabled')
    expect(openGift).toContain('giftOpen.value = true')
    expect(openGift).not.toContain('giftInteractionReady')

    expect(readyGate).toContain('writesReady.value')
    expect(readyGate).toContain("actionAllowed(snapshot.value, 'SEND_GIFT')")
    expect(readyGate).toContain('Boolean(currentProgram.value)')
    expect(sendButton).toContain(':disabled="!giftInteractionReady || participant.powerBalance < gift.powerCost || Boolean(busy)"')
    expect(sendButton).toContain('@click="sendGift(gift)"')
    expect(sendGift).toContain('if (!currentProgram.value) return')
    expect(sendGift).toContain("await runCommand('SEND_GIFT'")
    expect(sendGift).toContain('programId: currentProgram.value.id')
    expect(sendGift).toContain('giftId: gift.id')
    expect(template).toContain('v-if="currentProgram?.giftCatalog?.length"')
    expect(template).toContain('{{ gift.powerCost }}')
    expect(template).toContain('{{ participant.powerBalance }}')
    expect(template).toContain('id="gift-availability"')
  })

  it('defines role-specific typography and reusable asymmetric corner tokens', () => {
    const page = read('frontend/src/pages/student/V2WelcomeExperience.vue')
    const style = sfcBlock(page, 'style')

    const cjk = customProperty(style, '--font-stack-cjk')
    const signal = customProperty(style, '--font-stack-signal')
    const data = customProperty(style, '--font-stack-data')
    expect(cjk).toMatch(/system-ui|PingFang SC|Microsoft YaHei/u)
    expect(signal).toMatch(/Bahnschrift|Segoe UI Variable/u)
    expect(data).toMatch(/Cascadia Mono|SFMono-Regular|Consolas/u)
    expect(style).toContain('var(--font-stack-cjk)')
    expect(style).toContain('var(--font-stack-signal)')
    expect(style).toContain('var(--font-stack-data)')

    for (const token of ['--shape-panel', '--shape-control', '--shape-item']) {
      const radii = customProperty(style, token).split(/\s+/u)
      expect(radii, `${token} must use four-corner syntax`).toHaveLength(4)
      expect(new Set(radii).size, `${token} must be visibly asymmetric`).toBeGreaterThan(1)
      expect(style).toContain(`var(${token})`)
    }
  })
})
