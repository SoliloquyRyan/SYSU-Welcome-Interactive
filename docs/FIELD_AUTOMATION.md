# 真机自动化脚手架（vivo X300 · B7）

> 状态：`脚手架就绪`——只做脚手架与文档，不代跑任何验收结论。
> 配套脚本：[`scripts/vivo-field-automation.mjs`](../scripts/vivo-field-automation.mjs)。
> 相关文档：[`V2_10_FIELD_ACCEPTANCE.md`](./V2_10_FIELD_ACCEPTANCE.md)（唯一人工签核门）、[`RUNBOOK.md`](./RUNBOOK.md) §4（现场预览）、[`DECISIONS.md`](./DECISIONS.md)（决策记录）。

## 1. 目的与边界

**目的**：在 V2-10 现场人工验收前，对项目负责人的 vivo X300 真机做一次**只读自动化预检**：

- 经 `adb forward` + Chrome DevTools（CDP）连接真机 Chrome；
- 用 `preview:v2:field` 的临时合成栈与一次性合成邀请打开 `/welcome`，断言地址栏令牌被立即清除；
- 按 D-030 金标节奏截图（入口、开播后约 1.5s / 5.5s 的首次旅程、选色态）；
- 记录真实视口、UA、`deviceScaleFactor`（DPR）与真机 `prefers-reduced-motion` 实际值；
- 把当前可见文本 dump 到 `state.txt`，汇总 `report.json`。

**边界（不可妥协）**：

- **真机预检 ≠ 人工签核**。桌面自动化、截图或 AI 观察都不能代签真机/现场验收；最终以
  [`V2_10_FIELD_ACCEPTANCE.md`](./V2_10_FIELD_ACCEPTANCE.md) 的人工 `PASS` / `FAIL` 为准。本脚本产出只是线索。
- **只读**：不点击选色 / 胶囊 / 场景按钮，不提交任何业务命令，不写业务数据，不读取、切换或重置 `backend/.data/`。
- **令牌纪律**：令牌只在地址栏存在到 SPA 接管为止；脚本断言清除成功后才拍第一张截图，报告与日志不出现令牌原文
  （日志打印为 `<redacted>`）。

## 2. 前置条件

1. **adb**：Windows 安装 Android platform-tools，`adb` 在 PATH 中；或设置 `$env:ADB_PATH` 指向 `adb.exe`。
2. **vivo X300**：开发者选项 → 开启「USB 调试」；USB 连接电脑并在手机上授权（信任此电脑 / RSA 指纹）。
3. **真机 Chrome 可远程调试**：Chrome 需开放 devtools 远程入口（`chrome_devtools_remote`，入口差异见 §6）。
4. **现场预览栈已启动**（只读观察的目标栈，临时合成数据）：

   ```powershell
   $env:DEMO_HOST = '192.168.x.x'   # 本机可信私网 IPv4，只接受显式私网地址
   pnpm preview:v2:field
   ```

5. **环境变量来源**（`DEMO_HOST` 与 `DEMO_INVITE_TOKEN` 均来自 preview:v2:field 的合成邀请）：
   - `DEMO_HOST`：与 preview 相同的可信私网入口，脚本写法为 `http://192.168.x.x:5173`。
   - `DEMO_INVITE_TOKEN`：当前 preview 会话的一次性合成邀请令牌。preview 出于安全**从不以文字打印令牌**
     （只渲染二维码）；令牌保存在启动器写入 OS 临时目录的种子清单
     （`tests/e2e/fixtures/demo-stack.ts` 的 `DEMO_SEED_MANIFEST_PATH`）：
     `%TEMP%\sysu-welcome-e2e-*\demo-seed-manifest.json` 的 `participants[0].inviteToken`
     （预览二维码使用的正是第一个参与者）。PowerShell 取法示例：

     ```powershell
     $manifest = Get-ChildItem $env:TEMP -Directory -Filter 'sysu-welcome-e2e-*' |
       Sort-Object LastWriteTime -Descending | Select-Object -First 1
     $env:DEMO_INVITE_TOKEN = (Get-Content (Join-Path $manifest.FullName 'demo-seed-manifest.json') -Raw |
       ConvertFrom-Json).participants[0].inviteToken
     ```

   - 每次重启 preview 都会生成**新令牌、新会话**；旧令牌失效。令牌属于合成演示数据，但同样不得写入报告或截图。

## 3. 使用步骤

1. 按 §2 启动 preview 栈，确认后台、大屏与二维码页正常。
2. 手机 USB 连接电脑，开启 USB 调试并授权；确认真机 Chrome 已打开并停留在前台。
3. 运行（不启动任何服务，脚本只做连接与观察）：

   ```powershell
   $env:DEMO_HOST = 'http://192.168.x.x:5173'
   $env:DEMO_INVITE_TOKEN = '…'          # 取自 §2 的种子清单
   node scripts/vivo-field-automation.mjs
   ```

   可选：`$env:ADB_PATH = 'C:\path\to\adb.exe'`。
4. 阅读控制台 `[PASS]` / `[FAIL]` 与结尾一行 JSON；打开报告与截图目录核对。
5. 预检完成后，按 [`V2_10_FIELD_ACCEPTANCE.md`](./V2_10_FIELD_ACCEPTANCE.md) 在真机人工走完整旅程并填表；
   脚本发现的问题只是线索，不构成签核结论。

## 4. 输出说明

**输出目录自动判定**（脚本读取根 `.gitignore` 后决定，逻辑见脚本内 `resolveOutputDir`）：

- 首选 `<仓库>/output/vivo-field/`——仅当该目录被忽略时使用；
- **当前仓库的根 `.gitignore` 只忽略 `output/playwright/`，并未整体忽略 `output/`**，因此脚本自动改写到被忽略的
  `<仓库>/output/playwright/vivo-field/`，并在 `report.json` 的 `note` 字段说明这一事实；
- 若两种仓库路径都无法确认被忽略，则落到 OS 临时目录 `%TEMP%\vivo-field\` 并在控制台打印绝对路径。

**文件清单**（位于上述输出目录）：

| 文件 | 内容 |
|---|---|
| `01-entry.png` | 入口状态（令牌清除断言通过后才拍摄，避免截到令牌） |
| `02a-first-journey.png` | 首次旅程，开播后约 1.5s（寻星中段） |
| `02b-first-journey.png` | 首次旅程，开播后约 5.5s（寻星落定 / 进入选色） |
| `03-color.png` | 选色态（仅当检测到 `color-onboarding--settled` 时生成） |
| `state.txt` | 当前可见文本 dump（`document.body.innerText`），只读观察，无写入 |
| `report.json` | 一行式 JSON 汇总 |

**`report.json` 字段**：

```jsonc
{
  "timestamp": "ISO 时间",
  "demoHost": "本次 DEMO_HOST",
  "outputDir": "实际输出目录绝对路径",
  "note": "输出目录偏离 output/vivo-field 的说明（如有）",
  "viewport": { "width": 1080, "height": 2400, "deviceScaleFactor": 3 },
  "ua": "真机 navigator.userAgent",
  "reducedMotion": true/false,           // 真机 matchMedia('(prefers-reduced-motion: reduce)')
  "screenshots": ["绝对路径…"],
  "errors": ["步骤名: 原因…"]
}
```

## 5. 判定与退出码

- **观察流程全容错**：任一步失败打印 `[FAIL] <步骤>: <原因>` 并继续，错误进 `errors`。
- **连接前置致命**：`adb devices` 无设备 / `adb forward` 失败 / 30s 内 CDP 端点不可达 → 直接终止并写失败报告。
- **退出码**：`0` = 无错误；`1` = 存在任一 `FAIL` 或致命错误（方便脚本化调用方感知）。
- 令牌未清除时**跳过 `01-entry.png`**（红线：令牌不得进入截图），记录 FAIL 并继续后续观察。

## 6. 已知限制

- **不做业务写入**：选色、胶囊、场景按钮一律不自动点击；完整旅程与业务写入必须在真机人工操作，
  脚本只负责「连得上、打得开、看得见、留证据」。
- **Chrome devtools 入口差异**：不同安卓系统 / Chrome 版本，`localabstract` 套接字名可能不同
  （`chrome_devtools_remote` 是常见默认）；个别设备需在 Chrome 内开启「Enable USB debugging」或以
  `--enable-remote-debugging` 启动。脚本按规格只尝试 `chrome_devtools_remote`，失败请按此排查或改用备用方案。
- **页面需保持前台**：手机锁屏、切后台会暂停动画并隐藏地址栏行为，截图与节奏会失真。
- **令牌一次性 / 会话绑定**：同一令牌不能重复验证第二次「首次镜头」；重跑需重启 preview 换新邀请。
- **备用方案**：若 `adb forward` + CDP 在真机上不可用，可改用 Appium / WebDriver（UiAutomator2 + chromedriver）
  做真机自动化；那是另一套依赖与本脚本无关，且同样不能代签人工验收。
- **本脚本不启动任何服务**：`preview:v2:field` 需要人工先起好；脚本退出前会 `adb forward --remove tcp:9222` 清理。
