import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
import { isIP } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { captureFieldSource, collectFieldChecklist, fieldChecklistReport } from './field-checklist.mjs'

import QRCode from 'qrcode'

import { startDemoTestStack } from '../tests/e2e/fixtures/demo-stack.ts'

const smokeMode = process.env.V2_FIELD_PREVIEW_SMOKE === '1'
const checklistMode = process.env.DEMO_FIELD_CHECKLIST === '1'
const FRONTEND_PORT = Number.parseInt(process.env.V2_FIELD_FRONTEND_PORT ?? '5173', 10)

// Terminal-driven checklist mirroring the D-037/D-051/D-055 gate in docs/D037_FIELD_ACCEPTANCE.md.
// Answers are evidence for the operator, not a substitute for the signed table.
const FIELD_CHECKLIST = [
  ['F01', 'normal-motion 新鲜邀请：稳定可见后按 D-030 金标约 5.4 秒寻星，无跳过按钮；寻星到主场景使用同一低饱和 Orbital Signal 背景且无换底闪断'],
  ['F02', '穿越方向/速度连续，电影、选色与入轨是同一颗恒星，交接无闪断'],
  ['F03', '选色控件交接前不可操作、交接后立即可用'],
  ['F04', '开播前隐藏则等待；开播后切后台立即静态，返回不重播'],
  ['F05', 'reduced-motion/刷新/已激活返回直接静态，不闪播'],
  ['F06', '权威锁色后约 1.0 秒闪烁，直接衔接约 4.2 秒拉远入轨'],
  ['F07', '手机、后台和大屏均无寄语/时光胶囊入口、正文或待决定页'],
  ['F08', 'READY 等待页无旧六阶段任务'],
  ['F09', '后台推进 ASSEMBLY，手机与大屏自动收敛'],
  ['F10', '首次启动恒星发放 40 星光；晚到入场直接进入当前场景，不补旧奖励'],
  ['F11', 'PROGRAM_SUPPORT 三端权威一致；0/40/80/120/160/220 人均由 420 颗不计人数的中性底星、未解析盘面光和真实星构成低倾角恒星盘，环境以非同步低振幅呼吸、真实星不随人数重排且逐颗保留星色；每颗实时新星只触发一次画外流星并沿逆时针切线进入稳定轨道。300 人仅作技术压力检查；高速段以约 60Hz 目标、首场前预热的有界 WebGL2 完成约 8.4 秒错峰螺旋汇聚、高温核心、一次非对称超新星与连续白场透明接管；稀疏场景只用无身份尘埃维持尺度；无首帧编译顿挫、显式发光 S 形旋臂、同速直线吸附、规整圆环、烟花粒子球、彩虹冲击波、霓虹描边、纯白矩形硬盖、阶段停顿、末帧清空或重复频闪；网页稳态完全透明且无节目板'],
  ['F12', '抽奖仅在 RUNNING + PROGRAM_SUPPORT 可开启；其他状态稳定拒绝'],
  ['F13', '连续抽取无重复；大屏按抽取顺序逐位揭晓并停留，未揭晓结果不进入历史；后台见合成姓名+公开星号，大屏只见公开星号'],
  ['F14', '抽奖结果在刷新/重连后恢复；暂停/换场/完成自动收屏但保留记录'],
  ['F15', '仅排练模式 Demo 管理员可清空抽奖；LIVE 或不合格条件均拒绝'],
  ['F16', '软键盘打开时弹幕输入与主提交可达，无整页横向溢出'],
  ['F17', '礼物面板可开关、焦点/返回正常，不与软键盘重叠'],
  ['F18', '礼物业务生效但不上大屏；新弹幕仅实时飘屏、离场销毁，刷新/重连不补播'],
  ['F19', 'Wi-Fi 短暂断开禁写并提示；恢复后先取权威状态且不自动补交'],
  ['F20', '刷新/返回不重播首次电影，不恢复未提交草稿'],
  ['F21', '协同完成数/准入数、进度及集体亮度随权威聚合更新；首次反馈有界，reduced-motion/恢复直接静态且不重放；终章将就绪警告合并到一次确认，三端一致'],
  ['F22', 'COMPLETED 后手机只读，错误操作不会重开写入'],
  ['F23', '顶部退出每次确认；确认后需重新扫码且旧草稿不残留'],
  ['F24', '手机连续操作无掉帧、过热、白屏或崩溃'],
  ['F25', '后台静态界面及窄屏无横向溢出，主要控制/警告/焦点/禁用态可辨；三端共享视觉语义'],
  ['O01', 'OBS：Browser Source 透明 alpha 与节目视频真实合成正确'],
  ['O02', 'OBS：0/40/80/120/160/220 人盘面密度在远距均成立，420 底星与未解析盘面光持续流动但不被误读为人数；构图读作低倾角盘面而不是显式 S 形旋臂，呼吸克制且不同步驱动真实星；逐颗真实星色与每位新同学一次画外流星轨道捕获可辨。切场前已预热且首帧无顿挫，约 8.4 秒从当前星流连续进入错峰螺旋汇聚、高温核心、一次非对称超新星与白场透明接管，稀疏场景不伪造参与者；无同速直线吸附、规整圆环、烟花粒子球、彩虹冲击波、霓虹描边、纯白矩形硬盖、阶段停顿、末帧清空、硬切或重复频闪；节目稳态无网页节目板/常驻元素，新弹幕短时飘过且抽奖可读'],
  ['O03', 'OBS：浏览器源无网页音频，节目音视频只由 OBS 控制'],
  ['O04', 'OBS：抽奖/故障/场景/互动/终章优先级符合协议，且无合成姓名或私密字段'],
  ['O05', 'OBS：连续切场、隐藏/显示源、全屏预览无黑底闪烁或残帧'],
]

async function runFieldChecklist(invitationQr, baseURL) {
  const startedAt = new Date().toISOString()
  const sourceBefore = await captureFieldSource()
  console.log('\n=== D-057 现场验收逐项检查（终端模式）===')
  console.log('回答 P=通过 / F=失败 / B=受阻 / S=跳过。空白、无效输入、EOF 或中断均保留 PENDING。')
  console.log('用 V2_FIELD_OPERATOR、V2_FIELD_DEVICE、V2_FIELD_EVIDENCE 填写执行人、设备/浏览器及脱敏证据位置；缺项保留待签核。')
  console.log('此清单只辅助现场记录，最终签核仍以 docs/D037_FIELD_ACCEPTANCE.md 为准。\n')
  console.log(`三端入口：${baseURL}`)
  console.log(invitationQr)
  const results = await collectFieldChecklist(FIELD_CHECKLIST, process.stdin, process.stdout)
  const report = fieldChecklistReport({
    results,
    startedAt,
    endedAt: new Date().toISOString(),
    sourceBefore,
    sourceAfter: await captureFieldSource(),
    metadata: {
      operator: process.env.V2_FIELD_OPERATOR?.trim(),
      device: process.env.V2_FIELD_DEVICE?.trim(),
      evidence: process.env.V2_FIELD_EVIDENCE?.trim(),
    },
  })
  console.log(`\n检查记录：${Object.entries(report.counts).map(([key, count]) => `${key}=${count}`).join(' ')}`)
  const outputDirectory = path.resolve('output', 'field-check')
  await fs.mkdir(outputDirectory, { recursive: true })
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const reportPath = path.join(outputDirectory, `field-checklist-${timestamp}.md`)
  await fs.writeFile(reportPath, report.markdown, 'utf8')
  console.log(`检查记录已写入：${reportPath}`)
  console.log('请把结果和证据回填到 docs/D037_FIELD_ACCEPTANCE.md；此记录不等于人工签核。')
  process.exitCode = report.exitCode
}

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

  if (checklistMode && !smokeMode) {
    console.log('协议 v2 局域网现场预览已启动（仅临时合成数据，终端检查单模式）。')
    console.log(`后台与三端入口：${stack.baseURL}`)
    try { await runFieldChecklist(invitationQr, stack.baseURL) }
    finally { await close() }
    return
  }

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
            <p>PHYSICAL PHONE · D-052 FIELD CHECK</p>
            <h1>手机验收二维码</h1>
            <p>关闭旧的 welcome 标签后，用手机扫码一次。扫码后保持浏览器前台约 6 秒。</p>
            <img src="${invitationQrImage}" alt="一次性合成邀请二维码">
            <p class="host">${stack.baseURL}</p>
            <p class="notice">应先看到约 5.4 秒沉入/接近/捕获寻星，再进入选色；刷新后不应重播。</p>
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
