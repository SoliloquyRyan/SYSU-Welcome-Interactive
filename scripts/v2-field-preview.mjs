import { chromium } from '@playwright/test'
import { isIP } from 'node:net'
import os from 'node:os'

import QRCode from 'qrcode'

import { startDemoTestStack } from '../tests/e2e/fixtures/demo-stack.ts'

const smokeMode = process.env.V2_FIELD_PREVIEW_SMOKE === '1'
const FRONTEND_PORT = Number.parseInt(process.env.V2_FIELD_FRONTEND_PORT ?? '5173', 10)

function privateLanAddress(address) {
  const [first, second] = address.split('.').map((part) => Number.parseInt(part, 10))
  return first === 10
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
    || (first === 100 && second >= 64 && second <= 127)
}

function activeAddresses() {
  return Object.entries(os.networkInterfaces()).flatMap(([name, entries]) =>
    (entries ?? [])
      .filter((entry) => entry.family === 'IPv4' && !entry.internal)
      .map((entry) => ({ name, address: entry.address })),
  )
}

function browserHost() {
  const requested = process.env.DEMO_HOST?.trim()
  if (smokeMode && !requested) return '127.0.0.1'
  if (!requested || isIP(requested) !== 4 || !privateLanAddress(requested)) {
    throw new Error('请先把 DEMO_HOST 设置为当前电脑的可信局域网 IPv4，例如 192.168.x.x。')
  }
  const match = activeAddresses().find(({ address, name }) =>
    address === requested && !/bluetooth|docker|hyper-v|tailscale|virtual|vmware|vpn|vethernet|wsl/iu.test(name),
  )
  if (!match) {
    throw new Error('DEMO_HOST 必须属于当前电脑已启用的非虚拟网络接口。')
  }
  return requested
}

async function launchBrowser() {
  for (const options of [{ channel: 'chrome' }, { channel: 'msedge' }, {}]) {
    try {
      return await chromium.launch({ ...options, headless: smokeMode })
    } catch {
      // Try the next locally available browser.
    }
  }
  throw new Error('未找到可用于现场预览的 Chrome、Edge 或 Playwright Chromium。')
}

async function main() {
  const host = browserHost()
  if (!Number.isInteger(FRONTEND_PORT) || FRONTEND_PORT < 1 || FRONTEND_PORT > 65_535) {
    throw new Error('V2_FIELD_FRONTEND_PORT 必须是 1～65535 的整数。')
  }

  const stack = await startDemoTestStack({
    protocolVersion: '2',
    participantCount: 300,
    inProcess: true,
    browserHost: host,
    frontendPort: smokeMode ? undefined : FRONTEND_PORT,
  })
  let browser
  let closing = false
  const close = async () => {
    if (closing) return
    closing = true
    await Promise.allSettled([browser?.close() ?? Promise.resolve(), stack.stop()])
  }

  process.once('SIGINT', () => void close())
  process.once('SIGTERM', () => void close())

  try {
    browser = await launchBrowser()
    const context = await browser.newContext({
      baseURL: stack.baseURL,
      viewport: { width: 1440, height: 900 },
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
    })
    const admin = await context.newPage()
    admin.on('dialog', (dialog) => void dialog.accept())
    await admin.goto('/admin')
    await admin.getByLabel('账号').fill(stack.credentials.admin.username)
    await admin.getByLabel('密码').fill(stack.credentials.admin.password)
    await admin.getByRole('button', { name: '登录', exact: true }).click()
    await admin.getByRole('heading', { name: '三场景控制台' }).waitFor()

    const screen = await context.newPage()
    await screen.goto('/screen')
    await screen.getByRole('heading', { name: '星海集结' }).waitFor()

    const invitation = new URL('/welcome', stack.baseURL)
    invitation.searchParams.set('token', stack.credentials.participant.inviteToken)
    const invitationQr = await QRCode.toString(invitation.toString(), {
      type: 'terminal',
      small: true,
      errorCorrectionLevel: 'M',
    })
    const invitationQrImage = await QRCode.toDataURL(invitation.toString(), {
      width: 560,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#07101fff',
        light: '#f6f9ffff',
      },
    })

    if (smokeMode) {
      if (!invitationQr.includes('\u001b[')) throw new Error('现场预览二维码未生成')
      if (!invitationQrImage.startsWith('data:image/png;base64,')) {
        throw new Error('现场预览二维码图片未生成')
      }
      console.log('V2 field preview smoke passed')
      await close()
      return
    }

    const qrPage = await context.newPage()
    await qrPage.setContent(`<!doctype html>
      <html lang="zh-CN">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width,initial-scale=1">
          <title>手机验收二维码 · SYSU Welcome</title>
          <style>
            :root { color-scheme: dark; font-family: Inter, "PingFang SC", "Microsoft YaHei", sans-serif; }
            * { box-sizing: border-box; }
            body { min-height: 100vh; margin: 0; display: grid; place-items: center; color: #eef4ff; background: radial-gradient(circle at 50% 20%, #122347, #050a15 58%); }
            main { width: min(92vw, 680px); padding: 36px; text-align: center; border: 1px solid #293b62; border-radius: 30px; background: #07101fee; box-shadow: 0 28px 80px #0009; }
            h1 { margin: 0 0 8px; font-size: clamp(26px, 4vw, 40px); }
            p { margin: 8px 0; color: #aebedf; line-height: 1.7; }
            img { display: block; width: min(70vw, 560px); max-width: 100%; margin: 24px auto; padding: 12px; border-radius: 24px; background: #f6f9ff; }
            .host { color: #7fb2ff; font-family: ui-monospace, "Cascadia Code", monospace; }
            .notice { margin-top: 18px; padding: 12px 16px; border-radius: 16px; color: #d9e6ff; background: #102144; }
          </style>
        </head>
        <body>
          <main>
            <p>VIVO X300 · D-028 FRESH INVITATION</p>
            <h1>手机验收二维码</h1>
            <p>关闭旧的 welcome 标签后，用手机扫码一次。扫码后保持浏览器前台约 4 秒。</p>
            <img src="${invitationQrImage}" alt="一次性合成邀请二维码">
            <p class="host">${stack.baseURL}</p>
            <p class="notice">应先看到约 2.8 秒穿越式寻星，再进入选色；刷新后不应重播。</p>
          </main>
        </body>
      </html>`)
    await qrPage.bringToFront()

    console.log('\n协议 v2 局域网现场预览已启动（仅临时合成数据）。')
    console.log(`后台与三端入口：${stack.baseURL}`)
    console.log(`OBS 浏览器源：${new URL('/screen', stack.baseURL)}`)
    console.log('手机请扫描下方一次性合成邀请二维码；令牌不会以文字输出。')
    console.log(invitationQr)
    console.log('电脑浏览器已打开后台和大屏。按 Ctrl+C 关闭并删除临时数据库。')

    await new Promise((resolve) => {
      browser.once('disconnected', resolve)
      process.once('SIGINT', resolve)
      process.once('SIGTERM', resolve)
    })
    await close()
  } catch (error) {
    await close()
    throw error
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
