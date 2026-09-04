# 测试计划（v2 现行）

> 状态：D-056 现行。D-036/D-032（2026-08-15）的自动与人工结果是变更前历史基线；D-037 改变入场、奖励、后台和大屏，D-046～D-050 建立逆时针星流、零人底星、逐人流星、摄影式逐星材质、30Hz/60Hz 与 Orbital Signal 跨端背景，D-051 改为约 8.4 秒错峰恒星坍缩、高温核心、一次非对称超新星与连续白场透明接管。D-052 取消指定手机型号门；D-053 收口三端 UI；D-054 增加 220 人受保护正式目录、随机匿名 NFC、8 位学号恢复、正式/测试隔离与 schema 14；D-055 将 220 人设为正式视觉满场参考，以盘面主导银河、420 颗无身份底星、有界人数补偿、克制环境呼吸和流星轨道捕获替换显式棒旋臂，300 人仅作技术压力端点。D-056 增加仓库外私有持久化、正式 HTTPS/loopback 启动门、NFC 逐行对账、SQLite 一致性备份/全新目录恢复、Caddy/systemd 模板与合成排练 smoke。当前仍须执行实际服务器、实体手机、正式 HTTPS/NFC 和 OBS 人工复验。v1 G0～G4 历史证据见 [`archive/v1-test-plan.md`](./archive/v1-test-plan.md)。

## 1. 目标

协议 v2 必须证明，而不只是"页面能打开"：

1. 个人入场时钟与全场运行时钟独立；核验即激活 → 锁色、成星并直接准入 → 进入当前场景；三端不再提供寄语/胶囊入口。
2. 全场只有 `ASSEMBLY`、`PROGRAM_SUPPORT`、`COOPERATIVE_LIGHT` 三场景；`COMPLETED` 是终态。
3. `READY`/`RUNNING` 接受新到与晚到者；`PAUSED`/`COMPLETED` 拒绝写入但允许只读恢复。
4. 三端共享服务端权威状态；重复/重试/多设备/重连/重启不重复建号、发奖、扣款、负余额或倒退终态。
5. 公共星系协议技术上最多 300 颗真实恒星，正式名单和正式视觉满场参考为 220 人；另有 420 颗固定、确定性、更小更暗的中性色装饰底星。低倾角构图以盘面离散星和连续未解析盘面光为主体，核球、短棒与宽而弱的密度波只作层次，不出现显式发光 S 形旋臂。底星、星雾与人数有界补偿只负责让 0～220 人都保持丰满，不对应身份、事件、快照或人数，也不重排真实星。正常模式仅环境盘面光以多周期低振幅变化形成呼吸，真实星不做同相脉冲；reduced-motion 固定为静态。每颗真实星以摄影式点扩散材质保持自己的服务端 `displayColor`，从抵达首帧起持续逆时针运动；实时首次公开时只播放一次从画外掠入、末段沿轨道切线被捕获并沉入真实星位的流星，快照、刷新、重连、隐藏与 reduced-motion 不补播。画面不显示当前/目标人数。集结→节目继续使用 D-051 的约 8.4 秒连续镜头：正常 Chrome 走预热的原生 WebGL2 超新星后处理，Canvas2D 受控回退；等待星流以稳定 30Hz 绘制，高速流星与转场以 60Hz 为目标。当前星流先产生中心引力预兆，真实星与底星以不同曲率和时序螺旋汇聚，压缩为高温小核心后只爆发一次非对称超新星，再让低饱和冲击折射、丝状喷流、电影曝光与整幅 Canvas 透明化连续重叠，从白场显露外部节目源；稀疏人数不得用假参与者补足。D-050 的手机背景在全部阶段使用同一低饱和 Orbital Signal 系统且保留逐星色彩。节目稳态完全透明且无网页节目板/常驻面板，只有实时新弹幕短时飘屏；抽奖无放回、可恢复，目录姓名只在受控后台可见，大屏抽奖只见公开星号；隐私字段零泄漏。
6. 手机首次镜头遵守 D-030 金标：稳定 `visible` 后开播、同一持久恒星贯穿、无跳过、中断即静态、reduced-motion 直接静态。
7. 正式生产只从仓库外最小权限目录以单个 loopback 后端启动；唯一 HTTPS origin、Secure Cookie、三项私密资产逐行一致性、在线备份 checksum、全新目录恢复和合成排练隔离必须 fail closed。

## 2. 原则

- 自动化、截图和公开证据只用固定合成数据；受保护正式库只做最小化导入、完整性验证与无身份输出的启动检查，真实信息与令牌/正文不进入证据、截图或报告。
- 写命令验证幂等；敏感命令验证 revision/epoch 门禁。
- 断线禁写、不排队；重连先取权威快照。
- WebSocket 只广播已提交事实；装饰动画可丢弃。
- 后台共用账号自提权是已接受风险，测试验证服务端角色检查而非个人审计。

## 3. 现行自动门（v2）

> CI（`.github/workflows/ci.yml`）在 push/PR 时执行 frozen install → 契约/类型/测试/构建 → 部署静态检查 + 正式生产 smoke + 合成排练首次启动 smoke → `docs:check` → chromium-ci 全量 E2E；本机收口仍用下表命令。D-030 的手机视觉数据保留为历史比较点；D-037/D-051 当前旅程与大屏动效不得直接借用旧截图或旧时长结论。

| 门 | 命令 | 证据口径 |
|---|---|---|
| 单元/集成/API | `pnpm test` | 覆盖锁色直接准入、旧命令拒绝、抽奖权限/无放回/恢复、schema 12→14 备份/回滚/既有参与者投影补偿，以及 `PROTECTED` 导入/认证/重置硬拒绝/NFC 隐私 |
| 类型与构建 | `pnpm typecheck`、`pnpm build` | 当前工作树必须全绿 |
| 三浏览器三端闭环 | `pnpm test:v2:e2e` | `chromium-ci`/Chrome/Edge 当前流程全部通过；节目大屏稳态无标题/礼物/常驻面板，实时新弹幕可飘屏且不暴露来源 |
| 300 人协议负载 | `pnpm test:v2:load` | 300 人当前旅程、p95 < 2s、不变量为 0，并实际通过重置/重启恢复段 |
| 渲染 soak | `pnpm test:v2:soak:smoke`，必要时 `pnpm test:v2:soak` | 0/40/80/120/160/220 人正式视觉梯度与 300 人技术压力档、逐人流星、三场景、8.4 秒转场和透明静态降级无异常；30 分钟旧结果只作基线 |
| 首次镜头自动门 | v2 journey 聚焦用例 | 锁色后直接衔接入轨；normal-motion、隐藏/中断、刷新与 reduced-motion 同构 |
| 正式部署包 | `pnpm deploy:check`、`pnpm test:formal:smoke` | Caddy/systemd/env/忽略规则、仓库外路径、loopback、HTTPS origin、NFC 对账、生产启动与 Secure Cookie |
| 协作排练首次启动 | `pnpm test:rehearsal:smoke` | 新 OS 临时目录自动生成固定 300 人合成 v2 技术目录并启动三端；不读取正式数据，视觉文案仍以 220 人为参考 |

不变量清单：重复奖励/扣减/幂等记录、负余额、旧 epoch 污染、协议错误、公开事件携带私密字段、横纵溢出、外部网络请求——全部必须为 0。

### 3.1 2026-09-02 D-037 本机收口证据

| 命令 | 结果 |
|---|---|
| `pnpm verify:g2` | `PASS`：Vitest 39 文件/363 项，类型检查、契约/后端/前端生产构建全绿 |
| `pnpm test:v2:e2e` | `PASS`：`chromium-ci` / Chrome / Edge 三个配置项退出码均为 0 |
| `pnpm test:v2:load` | `PASS`：300 人旅程、1200 次礼物全成功，最高 p95 `840.23ms`；301/301 连接在持久化重启后恢复，reset `6755.6ms / 30000ms`，协议/隐私/不变量错误为 0 |
| `pnpm test:v2:soak:smoke` | `PASS`：6 阶段、计划渲染 46s，实测 `46037.39ms`，无顶层失败 |
| `pnpm docs:check` + `V2_FIELD_PREVIEW_SMOKE=1 pnpm preview:v2:field` | `PASS`：38 份 Markdown、119 个相对链接、37 条决策顺序正确；现场预览临时栈通过 |

证据边界：本轮未重跑 30 分钟完整渲染 soak，而是在 D-036 历史基线上运行 D-037 当前 46 秒六阶段冒烟；真机/局域网/OBS 仍以 [`D037_FIELD_ACCEPTANCE.md`](./D037_FIELD_ACCEPTANCE.md) 的 `PENDING` 为准。上述命令均使用临时合成数据，没有执行实际 `.data` 的 schema 12→13 升级。

### 3.2 2026-09-02 D-038 首版大屏动画历史证据（已被 D-039/D-040 替换）

| 命令 / 检查 | 结果 |
|---|---|
| `pnpm verify:g2` | `PASS`：Vitest 39 文件/366 项，类型检查、契约/后端/前端生产构建全绿；前端仍为 80 个模块，未新增运行依赖 |
| `pnpm test:v2:e2e` | `PASS`：`chromium-ci` / Chrome / Edge 三个配置项退出码均为 0；节目大屏无节目标题/礼物视觉，透明弹幕面板可见 |
| `pnpm test:v2:soak:smoke` | 最终 `PASS`：6 阶段计划 46s、实测 `46027.56ms`；dense assembly `30.10 FPS`，节目透明稳态 Canvas `0 FPS`，各阶段 frame p95 约 `4.3ms`，reduced-motion 持续绘制为 0。首次运行因门内仍查找旧节目标题而按预期失败，更新为 D-038 单弹幕面板/全 Canvas 透明断言后重跑通过 |
| Playwright CLI，Chrome 152，1920×1080，300 颗合成星 | `PASS`：normal-motion 观测转场约 `7600ms`（含四次截图开销），终态背景三层透明、Canvas 抽样非透明像素 0、标题/场景文案/礼物/身份节点 0、弹幕面板 1、横纵溢出 0；reduced-motion 场景观察等待约 `11ms`，转场层 0 且直接得到同一透明终态 |
| `node --check scripts/v2-field-preview.mjs` + `V2_FIELD_PREVIEW_SMOKE=1 pnpm preview:v2:field` | `PASS`：现场检查单脚本语法正确，OS 临时合成预览栈成功启动并清理 |
| `pnpm docs:check` | `PASS`：38 份 Markdown、122 个相对链接、38 条决策严格倒序；人工 OBS/场馆主观观感仍保持 `PENDING` |

视觉截图位于被 Git 忽略的 `output/playwright/screen-motion/d038-*.png`；其中节目背景是浏览器内临时注入的 OBS 节目画面模拟层，用于证明网页 alpha 与叠加关系，不属于生产 DOM。此次自动证据不代签实际 OBS、场馆屏幕、主持口令或音乐灯光配合，也未重跑 30 分钟完整 soak。

### 3.3 2026-09-02 D-039 电影化转场与实时飘屏历史证据（视觉已被 D-040 替换）

| 命令 / 检查 | 结果 |
|---|---|
| `pnpm verify:g2` | `PASS`：39 个测试文件、368 项测试通过；契约/后端类型检查、前端生产构建和既有门均退出码 0，前端仍为 80 个模块且未增加依赖 |
| `pnpm test:v2:e2e` | `PASS`：`chromium-ci` / Chrome / Edge 三个配置项退出码均为 0；逐项等待约 7.2 秒转场，确认节目稳态无标题/礼物/常驻面板，实时新弹幕无底条/卡片/边框、离场销毁且不暴露参与者公开星号 |
| `pnpm test:v2:soak:smoke` | `PASS`：最终 6 阶段计划 46s、实测 `46045.53ms`；300 星密集集结 `27.46 FPS`、frame p95 `5.3ms`，节目透明稳态 Canvas `0 FPS`，reduced-motion 各阶段持续绘制为 0。前三轮 `empty-ready` 先后暴露 Canvas 哈希探针自身的 `getImageData()` 长任务污染，以及隔离探针后空场轨道仍持续重算的问题；将探针开销排除出应用观测窗口并缓存静态轨道、0 星停绘后第四轮通过，未放宽 2% 长任务门槛 |
| Playwright CLI + 连续 WebM，Chrome 152，1920×1080，300 颗合成星 | `PASS`：正常转场实测 `7166ms`；连续帧确认深空锁定、三臂同向旋聚、局部冷暖狭缝和双侧空间门按序揭开临时 OBS 模拟底图，全程无全屏白闪/重复同心圆。重复彩排时门体起点显式复位；稳态 `html/body/app` 透明、背景层 opacity 0，面板/stream/item 均为 0；新弹幕背景透明、无背景图/边框，约 10 秒离场后 stream/item 回到 0 |
| `pnpm docs:check` | `PASS`：38 份 Markdown、122 个相对链接、39 条决策严格倒序；实际 OBS/场馆屏幕与实体手机人工复验仍保持 `PENDING`（现行机型口径见 D-052） |

### 3.4 2026-09-03 D-040 星海材质与引力颗粒消隐历史证据（运动包络已被 D-041 替换）

| 命令 / 检查 | 结果 |
|---|---|
| `pnpm verify:g2` | `PASS`：39 个测试文件、369 项测试通过；契约/后端类型检查、三端生产构建和既有门均退出码 0；前端 81 个模块，本地暗星云 PNG 随构建打包，不产生运行时外部取图 |
| `pnpm test:v2:e2e` | `PASS`：`chromium-ci` / Chrome / Edge 三个配置项退出码均为 0；约 7.2 秒转场期间不存在旧 gate/horizon/core DOM，节目稳态无背景/标题/礼物/常驻面板，实时新弹幕仍无底条并离场销毁 |
| `pnpm test:v2:soak:smoke` | `PASS`：6 阶段计划 46s、实测 `46052.43ms`；300 星密集集结 `27.58 FPS`、frame p95 `4.3ms`，节目透明稳态 Canvas `0 FPS`，reduced-motion 各阶段持续绘制为 0，无顶层失败 |
| Playwright 连续 WebM，Chrome 152，1920×1080，300 颗合成星 | `PASS`（自动/AI 目检范围）：最新正常转场实测 `7144ms`；首帧确认本地无星点暗星云与 300 颗低饱和重尾亮度真实星，连续帧确认同向引力旋聚、偏心薄裂隙和噪声场烟尘消隐，未再出现 D-039 的彩珠、对称门框或规则分层开孔；末帧由临时 OBS 模拟底图完整接管。证据位于被 Git 忽略的 `output/playwright/d040-acceptance/`，实际 OBS/场馆主观签核仍为 `PENDING` |
| `pnpm docs:check` + `node --check scripts/v2-field-preview.mjs` + 独立端口 `V2_FIELD_PREVIEW_SMOKE=1 pnpm preview:v2:field` | `PASS`：38 份 Markdown、123 个相对链接、40 条决策严格倒序；现场检查单语法与临时合成预览栈通过；实际 `backend/.data/` 未参与 |

### 3.5 2026-09-03 D-041 持续星流与黑洞力场连续衔接证据

| 命令 / 检查 | 结果 |
|---|---|
| `pnpm verify:g2` | `PASS`：39 个测试文件、371 项测试通过；新增确定性持续星流、300 星边界、切场首帧位置/速度连续与重叠时间包络断言；契约/后端类型检查、三端生产构建全绿，前端仍为 81 个模块且未新增依赖 |
| `pnpm test:v2:e2e` | `PASS`：`chromium-ci` / Chrome / Edge 三个配置项退出码均为 0；从 0 星与 1 星状态确认集结无 `.v2-count` 和 `/ 300` 文案，约 7.2 秒转场及节目稳态/实时飘屏边界继续通过 |
| `pnpm test:v2:soak:smoke` | `PASS`：6 阶段计划 46s、实测 `46041.22ms`；24 星典型集结 `27.49 FPS`，300 星密集集结 `27.72 FPS`、frame p95 `4.3ms`，节目透明稳态 Canvas `0 FPS`，reduced-motion 各阶段持续绘制为 0，无顶层失败 |
| Playwright 连续 WebM + 双集结帧，Chrome 152，1920×1080，300 颗合成星 | `PASS`（自动/AI 目检范围）：14.76 秒录像包含约 3.8 秒切场前持续星流与实测 `7140ms` 转场；触发首帧无跳位，星流连续弯入低亮引力透镜/偏心事件视界，收束与噪声透明显影交叠；两张无损集结帧在星区裁剪内有 6283 个明显变化像素，其中 2522 个强变化像素；集结 count 节点 0、`/ 300` 文案 0、横纵溢出 0、控制台错误 0，节目终态场景文案/标题/面板/弹幕流均为 0。证据位于被 Git 忽略的 `output/playwright/d041-acceptance/`；实际 OBS/场馆主观顺滑度仍为 `PENDING` |
| `pnpm docs:check` + `node --check scripts/v2-field-preview.mjs` + 独立临时端口 `V2_FIELD_PREVIEW_SMOKE=1 pnpm preview:v2:field` | `PASS`：38 份 Markdown、124 个相对链接、41 条决策严格倒序；现场检查单语法和独立 OS 临时合成预览栈通过，实际 `backend/.data/` 未参与 |

### 3.6 2026-09-03 D-042 可见黑洞穿越、逐星星色与单次白光接管证据

| 命令 / 检查 | 结果 |
|---|---|
| `pnpm verify:g2` | `PASS`：39 个测试文件、372 项测试通过；新增逐星 `displayColor` 派生、可见黑洞→穿越→单次白光→透明终态的确定性包络断言；契约/后端类型检查与三端生产构建全绿。前端 82 个模块；新增的约 1.30 MB 本地黑洞吸积纹理随构建打包，无新 npm 运行时依赖或运行时联网取图 |
| `pnpm test:v2:e2e` | `PASS`：`chromium-ci` / Chrome / Edge 三个配置项退出码均为 0；约 7.2 秒转场继续以服务端事实即时切场，并确认 `data-program-transition-style=event-horizon-transit`、透明节目稳态与仅实时弹幕边界 |
| `pnpm test:v2:soak:smoke` | `PASS`：6 阶段计划 46s、实测 `46063.47ms`；24 星典型集结 `27.61 FPS`，300 星密集集结 `27.62 FPS`、frame p95 `4.3ms`，节目透明稳态 Canvas `0 FPS`，reduced-motion 各阶段持续绘制为 0，无顶层失败 |
| Playwright 连续 WebM + 终态 alpha 探针，Chrome 152，1920×1080，300 颗合成星 | `PASS`（自动/AI 目检范围）：双主臂/盘核只含 300 颗真实数据星且呈现多种服务端星色；同一星流连续卷入冷蓝/暖金非对称吸积细丝，纯黑事件视界从远景持续显形并加速贴近，穿越后只出现一次奇点线/平滑白光曝光，再显露临时外部 OBS 模拟底图。节目终态 2,073,600 个 Canvas 像素中非透明 alpha 像素为 0，`html/body/app/screen` 四层透明，转场层/场景文案/网页节目板/弹幕项均为 0，横纵溢出与控制台错误为 0；reduced-motion 直接得到同一透明终态。证据位于被 Git 忽略的 `output/playwright/d042-acceptance/`；模拟底图不是生产 DOM，实际 OBS/场馆主观签核仍为 `PENDING` |
| `pnpm docs:check` + `node --check scripts/v2-field-preview.mjs` + `V2_FIELD_PREVIEW_SMOKE=1 pnpm preview:v2:field` | `PASS`：38 份 Markdown、125 个相对链接、42 条决策严格倒序；D-042 现场检查单语法和 OS 临时合成预览栈通过，实际 `backend/.data/` 未参与 |

### 3.7 2026-09-03 D-043 实时引力透镜与透明接管证据

| 命令 / 检查 | 结果 |
|---|---|
| `pnpm verify:g2` | `PASS`：39 个测试文件、373 项测试通过；新增 GPU 渲染分辨率边界与 D-043 结构断言，契约/后端类型检查和三端生产构建全绿。前端仍为 82 个模块；约 1.30 MB 的 D-042 静态黑洞纹理已退出 import 和构建产物，无新 npm 运行时依赖或运行时网络素材 |
| `pnpm test:v2:e2e` | `PASS`：`chromium-ci` / Chrome / Edge 三个配置项退出码均为 0；约 7.2 秒转场继续由服务端事实即时切场，确认 `data-program-transition-style=realtime-gravitational-lens-transit`、`data-lensing-architecture=native-webgl2-with-canvas2d-fallback`、透明节目稳态及仅实时弹幕边界；GPU 不可用时允许受控回退 |
| `pnpm test:v2:soak:smoke` | 最终 `PASS`：首次运行准确暴露 GSAP DOM 时间线比 30 FPS Canvas 早约一个帧间隔进入 `idle`、OBS 可能采到上一幅不透明帧；在完成回调同步将渲染器钉到权威终态后重跑通过。6 阶段计划 46s、实测 `46036.95ms`；24 星典型集结 `27.66 FPS`，300 星密集集结 `27.71 FPS`、frame p95 `4.3ms`；节目稳态 Canvas `0 FPS`、`canvasMaxAlpha=0`、标题/面板/弹幕流/控制台与页面错误均为 0，reduced-motion 各阶段持续绘制为 0，实际仓库数据库未触碰 |
| Playwright CLI 关键帧 + 连续 WebM，Chrome 152，1920×1080，300 颗合成星 | `PASS`（自动/AI 目检范围）：正常 Chrome 明确回报 `data-lensing-engine=webgl2-postprocess` 且无 fallback reason；静态黑洞贴图退出运行路径，实时着色器让同一幅暗星云与逐星不同颜色的真实星像在视界外发生空间偏折、远侧复映、亚像素色散和断续焦散；非对称稀疏吸积流与远侧弯折月牙共同被镜头加速放大，随后一条略有曲率的奇点焦散进入单次白光。正常 GPU 路径终态 2,073,600 像素非零 alpha 为 0，五层根背景透明、标题/面板/转场节点/溢出/控制台错误均为 0；另以 init script 强制 `webgl2` 不可用，确认 `data-lensing-engine=canvas2d-fallback`、reason=`webgl2-unavailable`，同样以 2,073,600 像素非零 alpha 0 收敛。证据位于被 Git 忽略的 `output/playwright/d043-acceptance/`；桌面 AI 目检不代签实际 OBS/LED 屏主观震撼度 |
| `pnpm docs:check` + `node --check scripts/v2-field-preview.mjs` + `V2_FIELD_PREVIEW_SMOKE=1 pnpm preview:v2:field` | `PASS`：38 份 Markdown、126 个相对链接、43 条决策严格倒序；D-043 文档拓扑、现场脚本语法和 OS 临时合成预览栈通过，实际 `backend/.data/` 未参与 |

### 3.8 2026-09-03 D-044 曲率成形、内部隧道与缓动白光束证据

| 命令 / 检查 | 结果 |
|---|---|
| `pnpm verify:g2` | `PASS`：39 个测试文件、373 项测试通过；新增“曲率先于事件视界、穿越后存在内部隧道、中心预辉先于白光束、白光束先于曝光、最终透明”的确定性包络断言，契约/后端类型检查和三端生产构建全绿。前端仍为 82 个模块，无新增 npm 运行时依赖、媒体或运行时网络素材 |
| `pnpm test:v2:e2e` | `PASS`：`chromium-ci` / Chrome / Edge 三个配置项退出码均为 0；约 7.2 秒转场继续由服务端事实即时切场，三端确认 `data-program-transition-style=curvature-tunnel-white-beam-transit`、`data-lensing-architecture=native-webgl2-with-canvas2d-fallback`、透明节目稳态及仅实时弹幕边界 |
| `pnpm test:v2:soak:smoke` | `PASS`：6 阶段计划 46s、实测 `46047.03ms`；24 星典型集结 `27.65 FPS`，300 星密集集结 `27.59 FPS`、frame p95 `4.3ms`，节目透明稳态 Canvas `0 FPS`，reduced-motion 各阶段持续绘制为 0，无顶层失败，实际仓库数据库未触碰 |
| Playwright CLI 逐帧检查 + 连续 WebM，Chrome 152，1920×1080，300 颗合成星 | `PASS`（自动/AI 目检范围）：正常路径回报 `data-lensing-engine=webgl2-postprocess` 且无 fallback reason；逐帧确认暗星云和逐星不同颜色的真实星像先发生约 1 秒透明空间折弯，事件视界随后由小到大从曲率中凝结，镜头连续放大并穿过黑体后，同一星海被拉成带螺旋剪切、近远视差和中心消失点的暗隧道；出口先有中心微光，再依次形成细白光束与一次平滑曝光，无全幅白线突现或第二次闪烁。干净 9.7 秒验收录像和逐帧图位于被 Git 忽略的 `output/playwright/d044-acceptance/`。正常 GPU 终态 Canvas backing store 为 2400×1350，3,240,000 个像素非零 alpha 为 0，`html/body/app/screen` 四层透明、可见 Canvas 1、标题/面板/转场/弹幕节点/溢出/控制台错误均为 0；另以 init script 强制 `webgl2` 不可用，确认 `data-lensing-engine=canvas2d-fallback`、reason=`webgl2-unavailable`，1920×1080 的 2,073,600 个像素同样非零 alpha 0 且控制台错误 0。桌面 AI 目检不代签实际 OBS/LED 屏主观震撼度 |
| `pnpm docs:check` + `node --check scripts/v2-field-preview.mjs` + `V2_FIELD_PREVIEW_SMOKE=1 pnpm preview:v2:field` | `PASS`：38 份 Markdown、128 个相对链接、44 条决策严格倒序；D-044 文档拓扑、现场脚本语法和 OS 临时合成预览栈通过，实际 `backend/.data/` 未参与 |

### 3.9 2026-09-03 D-045 连续相机坠落、交叠穿越与空间光前沿证据

| 命令 / 检查 | 结果 |
|---|---|
| `pnpm verify:g2` | `PASS`：39 个测试文件、373 项测试通过；确定性包络新增 `cameraTravel` / `tunnelTravel` 严格单调、小步长、视界/隧道覆盖交叠及空间光前沿先于全幅曝光断言，契约/后端类型检查和三端生产构建全绿。前端仍为 82 个模块，无新增 npm 运行时依赖、媒体或运行时网络素材 |
| `pnpm test:v2:e2e` | `PASS`：`chromium-ci` / Chrome / Edge 三个配置项退出码均为 0；三端确认 `data-program-transition-style=continuous-infall-tunnel-lightfront-transit`、约 7.2 秒本地动画不驱动服务端切场、透明节目稳态及仅实时新弹幕边界 |
| `pnpm test:v2:soak:smoke` | 最终 `PASS`：6 阶段计划 46s、实测 `46043.35ms`；24 星典型集结 `27.82 FPS`，300 星密集集结 `27.58 FPS`、frame p95 `4.3ms`，节目透明稳态 Canvas `0 FPS`，reduced-motion 各阶段持续绘制为 0，无顶层失败。首轮准确暴露 smoke 的分步 locator 查询可能跨过 WebSocket 切场帧、把旧 `idle` 与新 DOM 拼成不存在的状态；改为同一浏览器帧原子读取，并同时要求节目态、转场层卸载和透明 Canvas 后重跑通过，未放宽透明门槛 |
| Playwright CLI 逐帧检查 + 连续 WebM，Chrome 152，1920×1080，300 颗合成星 | `PASS`（自动/AI 目检范围）：0.5 秒级关键帧确认双主臂真实星流从当前速度继续推进，曲率与事件视界沿同一镜头持续放大，视界越过全屏前内部径向光流已交叠显影；隧道纵深保持向前流动，出口从中心预辉扩张为椭圆光前沿，接近边缘后才进入低权重全幅曝光，没有分段速度归零或黑场停拍。正常路径为 `webgl2-postprocess`、fallback reason 为空，1920×1080 的 2,073,600 个 Canvas 像素非零 alpha 为 0，`html/body/app/screen` 四层透明、正文为空；另以 init script 强制 `webgl2` 不可用，确认 `canvas2d-fallback`、reason=`webgl2-unavailable`，同尺寸 Canvas 非零 alpha 同样为 0。证据位于被 Git 忽略的 `output/playwright/d045-acceptance/`；普通 WebM 会以白色合成完全透明的节目终态，alpha 结论以逐像素探针和 `omitBackground` PNG 为准；桌面 AI 目检不代签实际 OBS/LED 屏主观顺滑度 |
| `pnpm docs:check` + `node --check scripts/v2-field-preview.mjs` + `V2_FIELD_PREVIEW_SMOKE=1 pnpm preview:v2:field` | `PASS`：38 份 Markdown、129 个相对链接、45 条决策严格倒序；D-045 文档拓扑、现场脚本语法和 OS 临时合成预览栈通过，实际 `backend/.data/` 未参与 |

### 3.10 2026-09-03 D-046 棒旋银河、首帧逆时针星流与摄影式星点证据

| 命令 / 检查 | 结果 |
|---|---|
| `pnpm exec vitest run tests/unit/v2-galaxy-renderer.test.ts` | `PASS`：14/14；新增确定性分布、恒星棒几何、重尾半径、等待态首个 250ms 位移、300/300 逆时针手性及逐星保色点扩散断言，D-045 的首帧位置/速度连续性阈值继续通过 |
| `pnpm verify:g2` | `PASS`：39 个测试文件、375 项测试通过；契约/后端/前端类型检查和三端生产构建全绿，前端仍为 82 个模块，无新增 npm 运行时依赖、媒体或运行时网络素材 |
| `pnpm test:v2:e2e` | `PASS`：`chromium-ci` / Chrome / Edge 三个配置项退出码均为 0；新增真实首星公开后 `.v2-galaxy[data-assembly-motion=flowing]` 断言，并确认 `data-galaxy-structure=milky-way-barred-spiral`；D-045 的约 7.2 秒服务端即时切场、透明节目稳态与仅实时新弹幕边界继续通过 |
| `pnpm test:v2:soak:smoke` | `PASS`：6 阶段计划 46s、实测 `46055.29ms`；24 星典型等待 `27.77 FPS`、300 星密集集结 `27.83 FPS`，两者 frame p95 均为 `8.2ms`；节目透明稳态 Canvas `0 FPS`，reduced-motion 各阶段持续绘制为 0，无顶层失败 |
| Playwright CLI 逐帧/静态检查 + 连续 WebM，Chrome 152，1920×1080，300 颗合成星 | `PASS`（自动/AI 目检范围）：权威快照为 300 颗真实数据星；实际分布为核球 27、恒星棒 48、主臂 180、弱支臂 33、盘面离散星 12。等待态回报 `milky-way-barred-spiral` / `flowing`；650ms 内星点中位位移 `6.94px`、p90 `16.282px`，277/300 超过 1px，300/300 为画面逆时针且 0 颗反向。目检确认暗星云/破碎尘埃不含点源，近白亚像素核心与极薄冷暖光晕替代硬边彩珠，尺寸/亮度为重尾，短衍射芒稀少；截图及 7 秒等待态连续录像位于被 Git 忽略的 `output/playwright/d046-acceptance/`。模拟 `prefers-reduced-motion: reduce` 后回报 `reduced-static`，Canvas 在 700ms 内逐像素不变；恢复 normal-motion 后重新回到 `flowing`。另录制集结→节目镜头，终态仍为 `webgl2-postprocess`，1920×1080 的 2,073,600 个 Canvas 像素非零 alpha 为 0，`html/body/screen` 背景透明，标题/节目板/转场/弹幕节点为 0。桌面 AI 目检不代签实际 OBS/LED 屏主观质感 |
| `pnpm docs:check` + `node --check scripts/v2-field-preview.mjs` + `V2_FIELD_PREVIEW_SMOKE=1 pnpm preview:v2:field` | `PASS`：38 份 Markdown、131 个相对链接、46 条决策严格倒序；D-046 文档拓扑、现场脚本语法和 OS 临时合成预览栈通过，实际 `backend/.data/` 未参与 |

### 3.11 2026-09-03 D-047 零人流动底星、逐人流星与连续黑洞隧道证据

| 命令 / 检查 | 结果 |
|---|---|
| `pnpm exec vitest run tests/unit/v2-galaxy-renderer.test.ts` | `PASS`：16/16；320 颗装饰底星数量固定、确定性且保持棒旋结构，0 人等待态 250ms 内有可见位移；300 条流星轨迹均从画外开始、沿确定性曲线落到真实星位并在着陆后退场；约 8.4 秒转场的单调 `cameraTravel`、连续速度、视界/隧道交叠和光前沿时序通过 |
| `pnpm verify:g2` | `PASS`：39 个测试文件、377 项测试通过；契约/后端/前端类型检查和三端生产构建全绿，前端仍为 82 个模块；未新增 npm 运行时依赖、媒体或运行时网络素材 |
| `pnpm test:v2:e2e` | `PASS`：`chromium-ci` / Chrome / Edge 三个配置项退出码均为 0；三端确认 0 人首屏已有 `data-decorative-stars="320"` 与 `data-assembly-motion="flowing"`，实时首颗新星出现一次活动流星并在约 1.55 秒后归零，快照不补播；约 8.4 秒本地镜头不延迟服务端场景事实，节目稳态透明且无网页节目板/常驻弹幕面板 |
| `pnpm test:v2:soak:smoke` | `PASS`：6 阶段计划 46s、实测 `46047.48ms`；0 人、24 星、300 星、协同与终章 normal-motion 分别为 `27.75`、`27.63`、`27.60`、`27.66`、`27.73 FPS`，frame p95 为 `4.3～4.4ms`；0/24/300 星 Canvas 哈希均持续变化，节目透明稳态为 `0 FPS`，reduced-motion 各阶段持续绘制为 0，无顶层失败 |
| Playwright CLI 连续 WebM + 逐帧/alpha 检查，Chrome 152，1920×1080，300 颗合成真实星 | `PASS`（自动/AI 目检范围）：等待态回报 320 颗底星、`flowing`，棒旋结构及冷暖真实星在暗星云上可辨；连续帧确认标题先退场，银河从当前速度进入曲率拉伸，事件视界渐进形成且尚未铺满时弯曲纵深流已经交叠，随后现场纹理持续向画外掠过，中心预辉、细空间光前沿和一次曝光接管，没有固定辐条、分段重新起步或第二次闪白。正常路径为 `webgl2-postprocess`，控制台错误/警告为 0；节目终态 1920×1080 Canvas 非透明像素 0，标题、网页节目板、常驻弹幕面板和正文节点均为 0。等待态截图、原始录像、8.92 秒裁切录像及关键帧位于被 Git 忽略的 `output/playwright/d047-after/`；桌面目检不代签实际 OBS/LED 屏主观顺滑度 |
| `pnpm docs:check` + `node --check scripts/v2-field-preview.mjs` + `V2_FIELD_PREVIEW_SMOKE=1 pnpm preview:v2:field` | `PASS`：38 份 Markdown、133 个相对链接、47 条决策严格倒序；D-047 文档拓扑、现场检查单脚本语法和独立 OS 临时合成预览栈均通过，实际 `backend/.data/` 未参与 |

### 3.12 2026-09-03 D-048 60Hz 惯性光流、预热光学管线与柔和白光证据

| 命令 / 检查 | 结果 |
|---|---|
| `pnpm exec vitest run tests/unit/v2-galaxy-renderer.test.ts` | `PASS`：17/17；新增 60Hz 高速目标、等待/高速/透明稳态三档节拍、持续增速摄影机速度、首尾加速度归零和更新后的曲率/隧道/光前沿时序断言；D-047 的 320 底星、逐人流星和 300 星逆时针分布继续通过 |
| `pnpm verify:g2` | `PASS`：39 个测试文件、378 项测试通过；契约/后端/前端类型检查和三端生产构建全绿，前端仍为 82 个模块；未新增 npm 运行时依赖、媒体或运行时网络素材 |
| `pnpm test:v2:e2e` | `PASS`：`chromium-ci` / Chrome / Edge 三个配置项退出码均为 0；三端确认等待态目标 `30` / `ambient-30hz`、转场目标 `60` / `cinematic-vsync`、结束目标 `0` / `idle`，并确认 `data-program-transition-style=vsync-inertial-optical-flow-transit`、服务端场景即时生效、透明节目稳态及仅实时弹幕边界 |
| `pnpm test:v2:soak:smoke` | `PASS`：计划 `54.4s`、实测 `54576.82ms`；0/24/300 星等待态分别为 `29.94` / `30.14` / `29.96 FPS`；独立节目转场阶段实测 `8539.27ms`、`52.70 FPS`、帧间隔 p95 `20.9ms`，reduced-motion 转场只发生 1 次终态绘制；节目透明稳态 `0 FPS`，协同/终章分别为 `29.99` / `29.50 FPS`，无顶层失败 |
| 300 星独立无录屏性能测量，Chrome 152，1920×1080 | `PASS`：临时栈创建并启动 300 名合成参与者，正常路径为预热后的 `webgl2-postprocess`；转场实测 `8503ms`、452 次有效绘制、`53.73 FPS`，帧间隔 p50 `17.6ms`、p95 `23.4ms`、最大 `115.7ms`，控制台/页面错误为 0；终态立即回报 `0` / `idle`。D-047 同机等待/转场证据约为 `27.6～27.8 FPS`，本轮高速有效帧接近翻倍；报告位于被 Git 忽略的 `output/playwright/d048-acceptance/transition-performance-metrics.json` |
| Playwright 连续 WebM + 2 FPS 关键帧检查，Chrome 152，1920×1080，300 颗合成真实星 | `PASS`（自动/AI 目检范围）：13.68 秒录像确认标题先随原星海退场，星点与尘埃从当前运动进入透明曲率和偏心吸积流，纵深纹理逐步向画外掠过，出口由小尺度中心预辉展开为柔和空间光页和一次曝光；没有突然完整黑圆、独立静态贴图、第二次闪白或节目网页板。录屏编码使应用测得 `39.89 FPS`，故只作视觉顺序证据、不代替上项无录屏性能门；录像位于被 Git 忽略的 `output/playwright/d048-acceptance/transition-d048-final.webm`，实际 OBS/LED 屏主观顺滑度仍为 `PENDING` |
| `pnpm docs:check` + `node --check scripts/v2-field-preview.mjs` + `V2_FIELD_PREVIEW_SMOKE=1 pnpm preview:v2:field` | `PASS`：38 份 Markdown、135 个相对链接、48 条决策严格倒序；D-048 文档拓扑、现场检查单脚本语法和独立 OS 临时合成预览栈均通过，实际 `backend/.data/` 未参与 |

证据边界：自动门已经证明帧调度、连续参数、浏览器收敛与本机无录屏性能，不代表真实 OBS Browser Source、LED 处理链、现场刷新率、灯光和观看距离下的主观签核；D-037/D-048 现场门继续保持 `PENDING`。本轮合成栈与录像均使用独立临时数据，没有读写实际 `backend/.data/`。

### 3.13 2026-09-04 D-049/D-050 柔性边界与跨端背景统一证据

| 命令 / 检查 | 结果 |
|---|---|
| `pnpm exec vitest run tests/unit/personal-journey-renderer.test.ts tests/unit/v2-mobile-state.test.ts tests/unit/v2-galaxy-renderer.test.ts` | `PASS`：3 文件、44 项；大屏 Orbital Signal 色值、末段隧道/白光/透明节目源重叠、约 120Hz 采样下连续权重增量与终点精确归零通过；手机 Canvas 色谱、轻量纹理和 `data-background-system=orbital-signal-reset` 通过 |
| `pnpm verify:g2` | `PASS`：39 个测试文件、380 项测试通过；契约/后端/前端类型检查和三端生产构建全绿，前端 83 个模块；手机构建继续输出 `nebula-master` `32.27 kB`，大屏 `deep-space-dust-d040` `1,847.28 kB` 独立打包，未新增 npm 运行时依赖或网络素材 |
| `pnpm test:v2:e2e` + 同用例本地行式报告复核 | `PASS`：`chromium-ci` / Chrome / Edge 3/3，三端完整生命周期通过；确认 `/screen` 与 `/welcome` 共用 `orbital-signal-spectrum` 标记，节目转场约 8.4 秒后透明收敛且无网页节目板/常驻弹幕面板。脱敏 reporter 首轮退出 1 且未给详情；行式报告立即复跑 3/3 后，原始 `pnpm test:v2:e2e` 再跑退出码 0，故记为一次未复现运行异常而非静默忽略 |
| `pnpm exec playwright test tests/e2e/v2-journey-visual.spec.ts --project=chromium-ci` | `PASS`：手机寻星 800/2000/3500/5000ms 与选色静态阶段截图生成；桌面 AI 目检范围内，背景为低饱和午夜蓝/深空蓝与克制尘埃，阶段间无偏紫换底，本人暖星与控件继续清楚。截图位于被 Git 忽略的 `output/playwright/v2-journey-visual/chromium-ci/`，不代签 D-052 实体手机 |
| `pnpm test:v2:soak:smoke` | `PASS`：计划 `54.4s`、实测 `54500.81ms`；0/24/300 星等待态 `29.69` / `33.33` / `29.87 FPS`，节目转场 `8471.81ms`、`59.73 FPS`、帧采样 p95 `8.4ms`；透明节目稳态 `0 FPS`，reduced-motion 转场仅 1 次终态绘制，其余阶段持续绘制 0，无顶层失败；稳态 Canvas 最大 alpha 与页面透明检查继续通过 |
| 300 星独立无录屏性能测量，Chrome 152，1920×1080 | `PASS`：正常路径为预热 `webgl2-postprocess`；转场实测 `8498.23ms`、509 次有效绘制、`60.48 FPS`，帧间隔 p50 `16.7ms`、p95 `17.7ms`、最大 `56.5ms`；结束立即回报 `0` / `idle`，问题数组为空。报告位于被 Git 忽略的 `output/playwright/d049-acceptance-measure/transition-performance-metrics.json` |
| Playwright 连续 WebM + 13 个关键帧，Chrome 152，1920×1080，300 颗合成真实星 | `PASS`（自动/AI 目检范围）：录像采样回报 `59.91 FPS`、帧间隔 p95 `24.4ms`、WebGL2 且问题数组为空；关键帧确认原星海先产生曲率、事件视界渐进显出、弯曲纵深流连续接管，尾段由中心预辉扩展为薄核心和宽体积光页，没有独立黑洞贴片或硬边白线。录像与帧位于被 Git 忽略的 `output/playwright/d049-acceptance-frames/`；透明终点以 soak 的像素 alpha 门为准，普通 PNG 白底合成不得误读为残留白屏 |
| `git diff --check` + `pnpm docs:check` + `node --check scripts/v2-field-preview.mjs` + `V2_FIELD_PREVIEW_SMOKE=1 pnpm preview:v2:field` | `PASS`：无空白错误；38 份 Markdown、139 个相对链接、50 条决策严格倒序；D-050 文档拓扑、现场检查单脚本语法与独立 OS 临时合成预览栈通过，实际 `backend/.data/` 未参与 |

证据边界：自动门已经证明共享色值、尾段数学连续性、浏览器收敛、手机构建体积、透明像素终态与本机 300 星性能；D-052 实体手机的色彩/可读性/温升、OBS Browser Source 的透明合成、LED 处理链和场馆观看距离下的主观高级感仍须项目负责人按 [`D037_FIELD_ACCEPTANCE.md`](./D037_FIELD_ACCEPTANCE.md) 实测，保持 `PENDING`。实体手机不限定品牌、型号或操作系统，但桌面模拟不能代签。全部合成栈、截图与录像使用独立临时数据，没有读写实际 `backend/.data/`。

### 3.14 2026-09-04 D-051 恒星坍缩、超新星与白场节目接管证据

| 命令 / 检查 | 结果 |
|---|---|
| `pnpm exec vitest run tests/unit/v2-galaxy-renderer.test.ts` | `PASS`：20/20；约 8.4 秒重叠包络的端点与 120Hz 边界连续性、真实星触发首帧位置/速度连续、装饰底星精确继承当前流动位置、错峰曲率/到达时间、屏内汇聚、高温核心/爆发/曝光/透明接管顺序，以及最长边 1280px 的后处理边界通过 |
| `pnpm verify:g2` | `PASS`：39 个测试文件、382 项测试通过；契约/后端/前端类型检查和生产构建全绿，前端 83 个模块；没有新增 npm 运行时依赖、媒体或运行时网络素材 |
| `pnpm test:v2:e2e` | `PASS`：`chromium-ci` / Chrome / Edge 3/3；三端权威生命周期分别用时 `46123ms` / `39799ms` / `39412ms`，确认 `stellar-collapse-supernova-reveal`、原生 WebGL2 + Canvas2D 回退架构标记、服务端即时切场、约 8.4 秒后透明收敛，以及节目稳态无节目板/标题/星点/礼物/常驻弹幕面板 |
| `pnpm test:v2:soak:smoke` | 最终 `PASS`：计划 `54.4s`、实测 `54565.82ms`；0/24/300 星等待态 `29.99` / `31.11` / `29.99 FPS`，300 星节目转场 `8523.09ms`、`58.66 FPS`、绘制间隔 p95 `19.6ms`；透明节目稳态 `0 FPS`，协同点亮/终章约 `29.98` / `29.96 FPS`，reduced-motion 转场只绘制 1 次静态终态，无顶层失败。前两次诊断运行分别暴露协同点亮逐星附加光晕和高速段负载波动；把不承载身份的第二层大光晕限制为确定性亮星子集、移除超新星阶段重复光晕并修正底星触发首帧连续性后，本轮全链路通过 |
| 正式 Chrome 152，1920×1080，单大屏 300 星独立测量 + 强制 WebGL2 不可用 | `PASS`：GPU 路径为 `webgl2-supernova-postprocess`，490 次有效绘制、`58.21 FPS`，帧间隔 p50 `16.7ms`、p95 `23.1ms`，结束回报 `idle` / `0 FPS`；强制禁用 WebGL2 后回报 `canvas2d-supernova-fallback` / `webgl2-unavailable`，300 星终态 Canvas 最大 alpha 为 0，控制台/页面问题数组为空 |
| 正式 Chrome 152，1920×1080，24/300 星逐阶段关键帧与全画布 alpha 探针 | `PASS`（自动/AI 目检范围）：两种人数均使用同一爆发尺度；当前棒旋星流从触发首帧连续收束，真实星在深度压缩前保持冷暖差异，随后形成极小白热核心、一次低饱和非对称爆发和连续白场；高频水滴状噪点与均匀辐射线经复核后已降权/打散。24 人与 300 人的 8500ms 终点均为 `idle`、`0 FPS`、最大 alpha 0，无网页节目内容；关键帧与诊断位于被 Git 忽略的 `output/playwright/d051-supernova/` |
| `git diff --check` + `pnpm docs:check` + `node --check scripts/v2-field-preview.mjs` + `V2_FIELD_PREVIEW_SMOKE=1 pnpm preview:v2:field` | `PASS`：无空白错误；38 份 Markdown、141 个相对链接、51 条决策严格倒序；D-051 文档拓扑、现场检查单脚本语法与独立 OS 临时合成预览栈通过，实际 `backend/.data/` 未参与 |

证据边界：自动门已经证明数学连续性、24/300 星人数边界、Chrome 实际渲染节拍、WebGL2/Canvas2D 收敛、reduced-motion 和完全透明节目端点；关键帧静态目检不等于实际连续播放、OBS Browser Source、LED 处理链、现场灯光和观看距离下的主观“高级/震撼”签核。D-037/D-051 人工门继续保持 `PENDING`；全部证据只使用独立临时合成数据，没有读写实际 `backend/.data/`。

### 3.15 2026-09-04 D-052 取消指定手机型号门证据

| 命令 / 检查 | 结果 |
|---|---|
| 全仓 `vivo` / `X300` 口径审计 | `PASS`：未发现 UA、机型或系统运行时拦截；现行需求、协议、项目状态、测试计划、视觉规范、现场表、运行手册与预览提示均改为至少一台代表实际上线访问方式的实体智能手机。剩余 vivo 内容仅为 D-021/D-036 等历史证据、兼容脚本/输出目录名和本机字体回退名 |
| `pnpm docs:check` | `PASS`：38 份 Markdown、141 个相对链接、52 条决策严格倒序 |
| `node --check scripts/v2-field-preview.mjs` + `node --check scripts/vivo-field-automation.mjs` + `git diff --check` | `PASS`：两个现场脚本语法通过，工作树差异无空白错误 |
| `V2_FIELD_PREVIEW_SMOKE=1 pnpm preview:v2:field` | `PASS`：共享契约与后端构建通过，独立 OS 临时合成预览栈完成 smoke；实际 `backend/.data/` 未参与 |

证据边界：以上只证明 D-052 文档/脚本口径和临时预览入口可用，不构成实体手机、三端局域网、OBS 或正式上线签核。当前实体手机人工门仍为 `PENDING`，必须记录实际机型、系统、浏览器及版本、CSS 视口、DPR 与 `prefers-reduced-motion`。

### 3.16 2026-09-04 D-053 三端 Orbital Signal 视觉收口证据

| 命令 / 检查 | 结果 |
|---|---|
| `pnpm exec vitest run tests/unit/v2-visual-system.test.ts tests/unit/personal-journey-renderer.test.ts tests/unit/v2-mobile-state.test.ts` | `PASS`：3 个文件、37 项；共享本机字体/微角令牌、三端 Orbital Signal 语义、后台表面标记、`NONE → 无活动投影`、部署文案安全默认值，以及手机背景/旅程约束通过 |
| `pnpm verify:g2` | `PASS`：39 个测试文件、383 项测试通过；共享契约、后端/前端类型检查和生产构建全绿，前端 83 个模块；手机 `nebula-master` 仍为 `32.27 kB`，大屏尘埃图继续独立打包，未新增依赖或媒体 |
| `pnpm exec playwright test tests/e2e/v2-three-surfaces.spec.ts --project=chromium-ci --project=chrome --project=msedge --reporter=line` | `PASS`：Chromium CI、正式 Chrome、正式 Edge 3/3 权威三端生命周期通过；业务命令、实时状态、抽奖和透明节目稳态未因视觉收口回归 |
| Playwright CLI，390×844 `/welcome` | `PASS`（桌面浏览器范围）：无横向溢出；关键标签/状态选择器最小 `12px`；主操作 44px，使用信号蓝表面与独立青色内侧标记；初始化禁用态为独立文字 `rgb(113,129,158)`、表面 `rgba(92,111,145,.12)`、边界 `rgba(126,176,255,.18)` 且 `opacity=1`。选色和入场后流动星系截图位于被 Git 忽略的 `output/playwright/d053-ui-unification/welcome-390x844.png` |
| Playwright CLI，1366×768 与 390×844 `/admin` | `PASS`（桌面浏览器范围）：1366 首屏包含连接、完整运行事实和主要控制；390 无横向溢出，页头底部 `128px`、运行事实底部 `512px`，首屏按钮均为 48px；键盘焦点为独立 `3px` 柔蓝轮廓；禁用态 `opacity=1`；`NONE` 显示为“无活动投影”。环境线/节点只执行 0.9s/0.36s 单次落位，未发现无限环境动画。截图为 `admin-1366x768.png` 与 `admin-390x844.png` |
| Playwright CLI，1920×1080 `/screen` + reduced-motion | `PASS`（桌面浏览器范围）：页面仍为唯一可见 Canvas，无 `/ 300`、满员率或到场进度文字；标题、信号和数据分别使用共享 display/signal/data 字体角色；`prefers-reduced-motion: reduce` 下页面持续动画列表为空。截图为 `output/playwright/d053-ui-unification/screen-1920x1080.png` |
| `V2_FIELD_PREVIEW_SMOKE=1 pnpm preview:v2:field` | `PASS`：共享契约/后端构建和独立 OS 临时 `V2_ACTIVE` 合成预览栈通过；实际 `backend/.data/` 未参与，测试端口与临时库已清理 |
| `git diff --check` + `pnpm docs:check` | `PASS`：差异无空白错误；38 份 Markdown、144 个相对链接和 53 条决策严格倒序通过 |

浏览器控制台审计只观察到 `/admin` 与 `/welcome` 在尚未建立会话前的预期 `401 Unauthorized` 快照探测；登录/邀请建立后页面和三浏览器生命周期未出现新的运行错误。自动门与截图只证明桌面浏览器中的结构、样式和状态可辨性；实体手机的真实触控/软键盘/色彩、OBS alpha 合成、LED/场馆观看距离及连续动画主观观感继续 `PENDING`。

### 3.17 2026-09-04 D-054 受保护名单、匿名 NFC 与隔离测试账号证据

| 命令 / 检查 | 结果 |
|---|---|
| `artifact_tool` 只读解析授权源 + SHA-256 | `PASS`：`分班情况!A3:E222` 共 220 条；姓名/学号完整，学号均为 8 位且无重复，工作簿无公式；源 SHA-256 为 `d4332ce10b9cff2cb2d9c3780dc774cdec0708ec21a2e35faf5c8603f5f5f74b`。导入只取姓名和学号，未取性别/专业班级 |
| `pnpm test` | `PASS`：40 个测试文件、388 项；含 `PROTECTED` 新库导入、源证据、8 位人工恢复、正式重置硬拒绝、非 HTTPS 正式 origin 拒绝、schema 12→14 备份/回滚，以及既有已准入参与者迁移后的投影补偿与会话失效 |
| `pnpm typecheck` + `pnpm build` + `pnpm build:formal` | `PASS`：共享契约、后端类型检查、默认合成构建与 `PROTECTED` 正式构建均通过；正式包固化现场登录/受保护名单部署文案且不打包数据库、凭据或映射，前端仍为 83 个模块，未新增运行时依赖或远程素材 |
| `pnpm test:v2:e2e` | `PASS`：`chromium-ci` / Chrome / Edge 三个配置项退出码均为 0；参与者、后台、大屏权威闭环未因 8 位核验、正式 UI 分支和 schema 14 回归 |
| 实际合成库 `pnpm db:v2:upgrade` + `pnpm db:v2:verify` | `PASS`：停服并从已校验 schema-12 备份恢复后，用最终未改写迁移依次升级至 schema 14；固定 300 人、协议 2、`resetEpoch=9` 完整验证通过；最终 schema-12 回滚备份 SHA-256 为 `5c34e67e2ef173412d113557cee391130a58e627b2c21c940ce74700f447305a` |
| 正式库环境下 `pnpm db:v2:verify` | `PASS`：`V2_ACTIVE + PROTECTED + schema 14`、220 人、`resetEpoch=1`；正式运行凭据、数据库和 NFC 映射均位于 Git 忽略的 `backend/.private/` |
| 220 行私密映射逐条内存对账 + 5 个测试账号复核 | `PASS`：姓名/8 位学号摘要、内部身份、公开星号和邀请令牌逐条一致；220 个 URL 令牌均唯一，URL 中姓名/学号为 0，运行凭据中名单字段为 0；5 个测试账号逐条来自独立 300 人 `SYNTHETIC_DEMO`，未写入正式库 |
| `pnpm db:nfc:finalize` 临时 HTTPS 定稿演练 | `PASS`：220 条相对邀请地址全部转换为同一 HTTPS 模板下的 220 条完整地址，残留相对地址为 0；演练用假域名文件验证后已删除，正式源映射未改写 |
| `DEMO_SMOKE_EXIT_AFTER_READY=1 pnpm dev:formal` | `PASS`：正式启动器验证受保护目录后启动协议 v2 三端，不生成通用邀请二维码、不回退合成造数；`/welcome`、`/admin`、`/screen` 与同源协议能力检查通过后自动停服 |
| `git check-ignore` + 名单值泄漏扫描 + `pnpm docs:check` + `git diff --check` | `PASS`：4 项私密产物均命中 `backend/.private/` 忽略规则；249 个已跟踪或未忽略文件中姓名/学号/完整令牌命中为 0；38 份 Markdown、142 个相对链接、54 条倒序决策与差异空白检查通过 |

证据边界：本节没有在终端、报告或截图中输出任何姓名、学号、完整邀请令牌或后台密码。当前 NFC 映射仍是相对 URL，须等正式 HTTPS origin 确认后通过 `db:nfc:finalize` 生成新的完整地址文件；实体写卡、随机抽卡核对、真实手机访问、数据告知/保管/删除责任、OBS 与场馆链路仍为 `PENDING`。

### 3.18 2026-09-04 D-055 盘面银河、人数补偿与轨道入场证据

| 命令 / 检查 | 结果 |
|---|---|
| `pnpm exec vitest run tests/unit/v2-galaxy-renderer.test.ts` | `PASS`：21/21；220 人正式视觉参考与 300 人技术上限分离，0/40/80/120/160/220 人环境补偿单调收敛，reduced-motion 呼吸归一，420 颗底星确定性与持续逆时针流动、盘面主导分布、真实星色保留、逐人画外流星及末段轨道切向夹角门、D-051 超新星连续性和 1280px 后处理边界通过 |
| `pnpm verify:g2` + `pnpm build:formal` | `PASS`：40 个测试文件、389 项；共享契约、后端/前端类型检查、默认合成构建与 `PROTECTED` 正式构建全绿，前端仍为 83 个模块；没有新增 npm 运行时依赖、媒体或运行时网络素材 |
| `pnpm test:v2:e2e` | `PASS`：`chromium-ci` / Chrome / Edge 3/3，当前生命周期分别用时 `34572ms` / `32696ms` / `32151ms`；断言 220 正式参考、300 技术上限、420 底星、盘面银河、未解析盘面光、非同步环境呼吸和画外流星轨道捕获标记，同时确认节目稳态仍无网页节目板/标题/礼物/常驻弹幕面板，仅实时新弹幕短时飘屏 |
| `pnpm typecheck:soak` + `pnpm exec tsx tests/soak/run-v2-render-soak.ts --smoke --artifacts` | `PASS`：Chrome 152、1920×1080；计划 `54.4s`、实测 `54785.22ms`。0/40/80/120/160/220 人正式视觉梯度分别为 `29.90 / 29.61 / 29.63 / 29.93 / 29.93 / 29.98 FPS`，300 人技术压力档 `29.96 FPS`；节目转场 `8693.78ms`、`58.89 FPS`；透明节目稳态 `0 FPS`，normal/reduced 两路无顶层失败，reduced-motion 等待态持续绘制均为 0、转场仅 1 次静态终态绘制 |
| 1920×1080 normal/reduced 稳态梯度 + 单人流星两阶段截图目检 | `PASS`（自动/AI 目检范围）：0～220 人均读作连续低倾角盘面，不再出现旧版粗亮 S 形旋臂；220 颗真实星分布为盘面 141、核球 24、短棒 18、宽弱主密度波 29、次密度波 8，盘面数量超过两组波的三倍。420 颗中性底星中 241 颗直接铺在盘面，其余只提供核球/短棒/弱密度层；0/40 人仍有结构但未生成假参与者。单独稳定 39 人后加入第 40 人，截图确认只有一颗新星从画外掠入，reduced-motion 不播放；数学门确认末段与目标逆时针轨道切线对齐。证据位于被 Git 忽略的 `output/playwright/v2-10-render-soak/` |
| `git diff --check` + `node --check scripts/v2-field-preview.mjs` + `V2_FIELD_PREVIEW_SMOKE=1 pnpm preview:v2:field` + `pnpm docs:check` | `PASS`：差异无空白错误；现场预览脚本语法与独立 OS 临时合成预览栈通过；38 份 Markdown、144 个相对链接和 55 条倒序决策通过。实际 `backend/.data/` 与 `backend/.private/` 均未参与预览 |

证据边界：自动化已经证明人数梯度、确定性分布、流向/切向、渲染节拍、reduced-motion 与节目透明端点；静态截图只能证明关键时刻，不能替代实际 LED 屏连续播放、远距黑位/亮度、OBS alpha 合成、场馆网络和项目负责人的主观“高级感”签核。D-037/D-051/D-055 人工门继续保持 `PENDING`；全部浏览器证据使用独立临时合成数据，未读取或输出正式名单、NFC 映射、后台凭据或任何私密字段。

### 3.19 2026-09-05 D-056 正式部署、备份恢复与合成排练证据

| 命令 / 检查 | 结果 |
|---|---|
| `pnpm verify:g2` | `PASS`：43 个测试文件、404 项全部通过；部署静态检查、共享契约/后端类型检查、默认生产构建与 83 模块前端构建全绿 |
| `pnpm exec vitest run tests/integration/protected-roster.test.ts tests/integration/formal-backup.test.ts tests/unit/formal-runtime.test.ts tests/unit/session-cookie.test.ts tests/unit/config.test.ts` | `PASS`：5 个文件、24 项；覆盖正式 HTTPS/loopback/代理和 Secure Cookie 开关、路径越界/POSIX 宽权限错误拒绝、NFC 映射逐行数据库/凭据/origin 对账、SQLite 在线备份、无 WAL sidecar 的独立快照、SHA-256 篡改拒绝、显式确认和全新目录恢复 |
| `pnpm test:formal:smoke` | `PASS`：构建 `PROTECTED` 正式前端和编译后端，在 OS 临时仓库外目录生成 2 条纯合成受保护目录及完整 HTTPS NFC 映射；生产入口完成启动前 v2/映射验证，只监听 loopback，并实际登录确认会话 Cookie 含 `Secure`、`HttpOnly`、`SameSite=Lax`；临时资产与进程随后清理 |
| `pnpm test:rehearsal:smoke` | `PASS`：在 OS 全新临时目录创建 300 人固定合成技术目录，真实完成 v1 listen/clean shutdown 证据、一次性 v2 切换和 schema 14 验证，启动 `/welcome`、`/admin`、`/screen` 后干净停服；UI 明确 220 人正式视觉参考，未接触 `.data` 或 `.private` |
| `pnpm test:v2:e2e` | `PASS`：Chromium CI / Chrome 152 / Edge 152 三项目 3/3，耗时分别为 `34884ms` / `32001ms` / `31745ms`；生产配置与备份新增代码未改变三端权威生命周期 |
| 现有受保护目录环境下 `pnpm db:v2:verify`（仅设置本地私密路径，不设置公网 origin） | `PASS`：schema 14、protocol 2、participants 220、`resetEpoch=1`，新验证器已逐行确认现有相对 NFC 映射与数据库/运行凭据完全对应；没有输出姓名、学号、令牌或口令。该映射仍须在域名确定后生成新的完整 HTTPS 版本，生产启动会主动拒绝相对 URL |
| 部署/隐私人工代码审查 | `PASS`（仓库范围）：Git 不包含真实数据库/凭据/NFC/备份；生产数据必须位于 release 外，Caddy 只把 `/api`/`/ws` 代理到 `127.0.0.1:3000`，systemd 使用专用账号、`UMask=0077`、代码只读、状态目录可写和失败重启；当前架构明确拒绝多实例/网络共享 SQLite |
| `git diff --check` + `pnpm docs:check` | `PASS`：差异无空白错误；39 份 Markdown、157 个相对链接与 56 条决策严格倒序通过 |

证据边界：本节证明仓库提供的配置、启动器、合成生产 smoke、备份/恢复算法和协作排练入口在当前 Windows 工作树可用；没有连接真实服务器、Caddy、systemd、DNS 或证书服务，也没有读取/复制实际受保护名单内容。因此实际主机权限、防火墙、HTTPS/WSS、加密私密传输、恢复时长、实体 NFC/手机、OBS/LED/场馆和数据责任签核继续 `PENDING`，按 [`SERVER_DEPLOYMENT.md`](./SERVER_DEPLOYMENT.md) 上线检查单执行。

## 4. 视觉自动门（D-051 动画 + D-053 UI + D-055 银河现行，D-030～D-032 为手机基线）

- D-037 继承 D-030 的约 5.4s 寻星、约 1.0s 锁色确认与约 4.2s 入轨视觉语言，但锁色权威成功后直接衔接入轨，不再出现寄语输入或胶囊决定停留。
- D-032 的逐字大标题、字体回退栈、微角操作坞与动力/星光解释仍生效；本人档案不再显示时光胶囊。
- D-053 要求三端共用 Orbital Signal 语义表面/状态、本机字体角色与 `2/4/8/12px` 小圆角；手机关键标签、状态和操作说明不低于 12px，禁用态不可只靠透明度；后台必须是无持续氛围动画的克制深空运营控制台，并把内部枚举转换为可读文案。
- 静态同构：隐藏/中断/刷新/恢复/reduced-motion 直接呈现对应权威静态终态。
- 手机 normal-motion 以 390×844 的寻星、选色、入轨与主场景检查同一 Orbital Signal 背景系统：本地轻量星云只保留低饱和亮度结构，信号蓝/克制青气氛不得形成霓虹雾墙，阶段交接无换底闪断；本人星和其他真实星仍保留 `displayColor`，操作坞、标题、焦点、软键盘与短视口可读性不下降。生产包不得把大屏尘埃图加入手机入口的静态依赖。
- 大屏 normal-motion 以 1920×1080 和 0/40/80/120/160/220 颗合成公开星作正式视觉梯度，以 300 颗作技术压力档：暗星云不得自带点源；固定 420 颗更小更暗的中性色底星从 0 人首帧起持续逆时针流动，并与连续未解析盘面光共同显出低倾角恒星盘。核球、短棒与两组宽而弱的密度波只能提供层次，不得形成发光 S 形旋臂、粗线或霓虹轨道。底星与盘面光可在 0～220 人之间做有界连续曝光补偿，但不得携带身份/事件语义、计入人数、冒充参与者或重排真实星。正常模式只允许环境盘面光以非同步多周期低振幅呼吸，真实星不得同相缩放或闪烁；reduced-motion 必须静态。公共真实星数量必须与数据一致，每颗使用近白亚像素核心、极薄保色光晕和重尾尺寸/亮度，逐颗保留服务端冷暖星色，只有极少数最亮真实星允许短衍射芒；不得出现硬边彩珠或奶油光球。实时首次公开一颗新星时只播放一次画外流星，末段沿逆时针轨道切线自然捕获并准确落到其稳定星位；已有星更新、快照、刷新、重连、隐藏恢复和 reduced-motion 不补播。集结及离场 DOM 不得显示当前星数、目标数、`x / 220`、`x / 300`、满员率或到场进度。D-048 要求等待态稳定在约 20～35 次有效绘制/秒，高速流星和约 8.4 秒节目转场以约 50～70 次有效绘制/秒为门；正常 Chrome 应在切场前完成 `webgl2-supernova-postprocess` 预热，使用最长边 1280px 的有界缓冲和缓存星云。D-051 要求触发首帧继承当前星流，真实星与底星按不同曲率/时序螺旋汇聚，真实星在深度压缩前保留各自星色，随后形成极小高温核心和一次非对称超新星；低饱和冲击折射、丝状喷流、电影曝光与整幅 Canvas 透明化必须连续重叠，从白场显露外部 OBS 节目源。稀疏人数只允许无身份尘埃/等离子体提供尺度，不得伪造参与者。必须另验 WebGL2 初始化/上下文失败时的 Canvas2D 回退；不得出现首帧停顿/跳位、同速直线吸附、规整圆环、烟花粒子球、彩虹冲击波、霓虹描边、现成镜头光斑、纯白矩形硬盖、阶段停顿、末帧清空或重复频闪。节目稳态 DOM 不得保留网页节目板、背景、标题、星点、礼物或常驻弹幕面板，Canvas 最终必须透明并停止持续绘制；实时新弹幕短时飘屏后销毁，快照/刷新/重连/reduced-motion 不补播。

## 5. 现场人工验收（D-037/D-052/D-053/D-054/D-055 复验 `PENDING`）

[`V2_10_FIELD_ACCEPTANCE.md`](./V2_10_FIELD_ACCEPTANCE.md) 记录了项目负责人于 2026-08-15 对 D-036 基线的 `PASS`，不得改写。D-037/D-052/D-053/D-055 在 [`D037_FIELD_ACCEPTANCE.md`](./D037_FIELD_ACCEPTANCE.md) 另行记录：项目负责人选择至少一台代表实际上线访问方式的实体智能手机，不限定品牌、型号或操作系统，并记录机型、系统、浏览器及版本、CSS 视口、DPR 与 reduced-motion；用新鲜邀请检查锁色后直接入轨、真实触控与软键盘、手机全程同源低饱和背景、12px 以上关键文字、主操作/禁用态和本人星可读性；后台复验深空控制台的首屏密度、键盘焦点、连接/警告/危险状态及可读枚举，并完成抽奖操作。大屏按 0/40/80/120/160/220 人复验盘面密度、420 底星、克制环境呼吸、逐人流星轨道捕获与真实星色，300 人只作技术压力检查；同时继续复验约 8.4 秒超新星白场透明接管、Canvas2D 回退和节目透明弹幕边界。D-054 另须在 HTTPS 定稿后抽检实体 NFC 与受保护本人档案的一一对应，并确认正式后台姓名只在主控端可见。当前没有负责人新签核时一律保持 `PENDING`；桌面模拟、自动化截图与 AI 目检不能代签。

## 6. 缺陷分级

- **S0 阻断**：隐私泄露、错误扣款/奖励、负余额、重置污染、后台失控、三端无法闭环。
- **S1 严重**：入场或三场景关键路径失败、状态长期不一致、`PAUSED`/`COMPLETED` 写入成功、LIVE 非原子结束、排练预览误写 live `COMPLETED`、违规内容上屏。
- **S2 一般**：有绕行方式的兼容/可访问性/非核心恢复问题。
- **S3 轻微**：不影响流程的文案、视觉或低频问题。

每条证据记录用例编号、工作树标识、环境、设备、浏览器版本、视口、时间、步骤、预期、实际与恢复方式；没有实际命令输出时保持 `PENDING`。

## 7. 正式上线剩余验收

iPhone Safari、iOS/安卓微信等额外机型/浏览器组合属于建议性兼容扩展，不作为 D-052 当前实体手机签核的阻塞门，除非后续决策明确目标设备矩阵。真实名单导入和仓库内部署工具链已完成，但实际 Linux 主机、DNS/HTTPS/Caddy/systemd、防火墙、加密私密传输、备份恢复演练、实体 NFC 写入/抽检、数据告知与保管/删除责任、场馆网络与主备、AI 审核、学院 VI 仍按各自上线范围另行验收，不因本机自动门通过而自动关闭。
