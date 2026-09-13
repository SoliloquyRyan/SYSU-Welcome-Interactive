# 测试计划（v2 现行）

> D-099（2026-09-13，本地完成，未发布）：精修手机/主控/大屏共用面板与操作反馈，修复登录错误、弹幕确认焦点、谢幕全量回顾和撤下内容重现；独立合成场次已执行完整流程，495项测试及三浏览器各10项流程共30项全部通过；44张截图与关键录屏已整理。schema 21保持。见 [D-099](./D099_UI_AND_FULL_FLOW.md)。

> D-098（2026-09-13，本地完成，未发布）：手机节目超新星改为热核、云气喷流与碎光余辉；节目/主持/颁奖舞台加入学院标志与层叠银蓝光带。16份媒体已审查，建议 OBS 本地播放并叠加系统互动，节目对应差异待确认。schema 21及现有业务保持。见 [D-098](./D098_STAGE_CRAFT_AND_MEDIA.md)。

> D-097（2026-09-12，本地完成，未发布）：节目颁奖自动取有效动力值前三名，后台可调整节目动力值并保留原始礼物与调整记录；收紧独立环节间距，手机与大屏采用统一银蓝节目舞台，手机实时开场增加一次可跳过的超新星转场。代码目标 schema 21，线上仍以 D-095 / schema 19 为准。见 [D-097](./D097_PROGRAM_RANKING_AND_STAGE.md)。

> D-096（2026-09-12，本地完成）：新增节目颁奖、负责人讲话与校园图鉴颁奖；目录共 25 项，《光年之外》关闭礼物，主控支持黑金主持背景、草稿名单、确认揭晓和分页。代码目标 schema 20，线上仍为 D-095 / schema 19；未部署或复位线上场次。验证和操作见 [D-096](./D096_AWARDS_AND_STAGE.md)。

> D-090（2026-09-11，本地实现，未发布）：星舰材质及飞行动画专项包含实际送礼、双端关键帧、自然完成、减少动态和贴图失败回退，证据与结果见 [星舰重设计](./D090_STARSHIP_REDESIGN.md)。自动化浏览器不代替实体手机及场馆检查。

> D-089（2026-09-11，本地实现，未发布）：新增节目单、A/C 抢答、B 上台观众抽取与投票、批量礼物、个人星色、高级确认、大屏礼物统计、高级星舰与全场谢幕账目；schema 18→19 采用备份优先迁移。实现与最终验证见 [D-089](./D089_LIVE_INTERACTION_ACCEPTANCE.md)。

> D-088（2026-09-10，本地实现，未发布）：表演者按节目 ID 纳入后台目录，同步手机、报幕和片尾；片尾沿用 D-086 银河，字幕只播一轮后定格，静态名单可翻页。维护为 schema 17→18，保留场次和互动记录。实现与验收见 [演职员目录与银河片尾](./D088_CREDITS_ACCEPTANCE.md)。线上仍以 D-087 发布记录为准。

> D-087（2026-09-09）：全量 462 项通过；Chromium 首轮 8 项中 6 通过、2 失败，修正旧首礼预期并复验后两项通过，连抽另在 Chrome/Edge 通过。首轮波动、部署、线上只读与未验范围完整见 [发布与全流程审查](./D087_DEPLOYMENT_FLOW_REVIEW.md)，不把复验写成首轮全绿。

> D-086（2026-09-09，本地轻微尘动）：按负责人要求，四周薄尘以低强度缓慢游移散聚，保留 D-085 配色、层次和中央银河。两端复用原时钟，暂停及静态模式保持；未发布服务器。验证见 [D-086 记录](./D086_SUBTLE_DUST_MOTION.md)。

> D-085（2026-09-09，本地远景层次）：按负责人要求，在 D-084 柔和背景上补充细碎远星尘、小片星团及被近处暗尘遮挡的薄雾，维持既有配色与白边强度。无参与者或业务变化；未发布服务器。验证见 [D-085 记录](./D085_BACKGROUND_DEPTH.md)。

> D-084（2026-09-09，本地四周尘云）：负责人要求背景更深、增加银白轮廓，并延伸到四周。以气体云、暗尘埃和局部受光边缘呈现；按后续“喧宾夺主”反馈降低雾团与白边对比。横竖屏分别取景，中央动态银河保持。未发布服务器；验证见 [D-084 记录](./D084_SURROUNDING_DUST_CLOUDS.md)。

> D-083（2026-09-09，本地背景柔化）：按负责人要求，将 D-082 突兀的纯色色斑淡化，改为疏密不一、边缘不规则的薄雾远景。维持黑色主调及背景与银灰动态星云的分层。未发布服务器；验证见 [D-083 记录](./D083_SOFT_BACKGROUND_ART.md)。

> D-082（2026-09-09，本地纠正）：负责人澄清只要求背景显色，流动星云仍是独立主体。纠正 D-081 彩色远景与银河旋臂重叠的观感，将颜色移至外围深空并柔化纹理，主星云保持银灰、暖白与原有运动。未发布服务器；验证见 [D-082 记录](./D082_BACKGROUND_SEPARATION.md)。

> D-081（2026-09-09，本地显色调整）：负责人反馈 D-080 仍太浅，将局部紫色、冷青和暖金增强至清楚可见。保留 D-079 黑色底调与既有色彩分布；仅调整三处材质颜色，无业务变更。未发布服务器；验证见 [D-081 记录](./D081_VISIBLE_NEBULA_COLOR.md)。

> D-080（2026-09-09，本地微调）：按负责人批注，在 D-079 黑色底调上稍增强局部暗紫、冷青和暖金。仅校准共享背景材质三处色彩强度，保持原有分布、银河与星体。未发布服务器；验证见 [D-080 记录](./D080_ACCENT_COLOR_ACCEPTANCE.md)。

> D-079（本地黑色深空配色 / 审片）：负责人明确要求黑色为主体，局部点缀深空颜色。背景改为中性炭黑、墨黑与灰银云气，暗紫/冷青/暖金仅局部出现；主星云适度去蓝。覆盖 D-078 的大面积墨蓝配色，星色、尺度、人数与散聚动效保持。未发布服务器；实现与验证见 [D-079 记录](./D079_BLACK_SPACE_ACCEPTANCE.md)。

> D-078（2026-09-08，本地背景精修 / 审片）：保留 D-077 已认可银河、星色、手机尺度与云层聚散，增加低对比远景云气、细碎星尘和银蓝/暖金层次。两端与静态回退共用缓存程序材质，参与者星体和人数语义保持。本轮未发布服务器；实现与验证见 [D-078 记录](./D078_REFINED_SKY_ACCEPTANCE.md)。

> D-077（2026-09-08，本地精修 / 审片）：延续 D-076 已认可构图，强化大屏各人已选星色，手机轨道个人星缩小约 29%，星云沿原旋臂局部消散后重新凝聚，两端背景暗部抬亮。身份、人数、静态与 OBS 透明交接规则保持。本轮未发布服务器；实现与验证见 [D-077 记录](./D077_CLOUD_AND_STAR_ACCEPTANCE.md)。

> D-076（2026-09-08，本地实现 / 审片）：以原版倾斜盘面和留白为基础，统一手机与大屏的深墨蓝、银蓝及暖白光色。背景、五层流动星云与稳定星体使用共享路径和取景模型；大屏恢复左下标题，保留真实入场人数。替代本地 D-075 柔光图片美术，业务与 12 秒开场等现行时长保持。本轮未发布服务器；最近既有发布记录仍见 D-075。具体实现、审片与验证见 [D-076 记录](./D076_FLOWING_GALAXY_ACCEPTANCE.md)。

> D-075（既有发布记录；本地美术由 D-076 替代）：采用柔光星河，中央宽幅银蓝/珍珠暖光、边缘暗，背景降低细节反差以衬托动态星体。手机与大屏共享有界运镜、前后景视差和取景，集结标题位于左上暗部；覆盖 D-073 / D-074 具体美术，人数、身份、业务、12 秒开场、静态与 OBS 透明契约保持。实现与最终验证见 [D-075 验收](./D075_SOFT_STAR_RIVER_ACCEPTANCE.md)。

> D-072（2026-09-07）：当前美术以 [电影感修订与验收](./D072_CINEMATIC_ACCEPTANCE.md) 为准，覆盖下文旧 8.4 秒开场和 D-071 星舰美术。开场现为 12 秒；星舰手机 5.8 秒、公屏 7.2 秒；普通节目背景使用持续流动的正式银河，只有 `media=overlay` 保持透明并停止绘制。手机内容页去整面模糊，档案收紧布局。修复同一连接中快照先于礼物消息导致的漏播，状态与计数不回退。schema 17、四档礼物、身份、审核和抽奖规则保持。

> D-071（已部署）：礼物档位、无减免扣费、当前节目数量、个人礼物/弹幕档案、手机透明上移聊天、双端星舰实时动画与 schema 16→17 保留升级均已自动覆盖；服务器状态和历史记录保持。最终范围见本页 D-071 节与 [验收记录](./D071_GIFT_EXPERIENCE_ACCEPTANCE.md)。
>
> D-068（已部署）：手机节目互动区改为上下滚动聊天列表，保留当前页面最近 100 条已收到的匿名消息，不再横向飘过或定时消失。上翻时保持阅读位置，提供新消息提示与回到最新。大屏显示方式不变。

> D-067（2026-09-07，已部署；453/453，浏览器及 OBS 验证范围见记录）：本次用户要求覆盖早期“无手机音乐、手机不显示公共弹幕、节目态只能透明”的限制。新版默认节目星海底图，OBS 表演视频用 `/screen?media=overlay`；节目切换显示标题及节目单表演者后 8.5 秒淡出。手机匿名实时弹幕与大屏共用服务端审核，五种单色免费、三种渐变各 10 动力本场解锁一次。余额仍为 100；每个表演首礼减免最多 10 动力，不可重复领取、不跨节目积攒减免。开场音乐是原创 Web Audio 轻钢琴音色，点按开启、切节目淡出；未打包或下载《星际穿越》原声。字体保留已认可方案 C。数据库新增 schema 16，升级保留业务状态，必须先停本项目服务并建立验证备份。最终验收见 [本轮记录](./D067_OVERNIGHT_ACCEPTANCE.md)。

> 最新记录：D-063 / D-064 已完成生产银河接入与 `https://sysuzgxytj.top/welcomeparty/` 独立合成内测部署，2026-09-06 实际服务器三端浏览器流程通过，交付 READY / REHEARSAL + 21 项节目单；详见 §3.26。以下旧决策数值均保留各自时点范围，实体手机、OBS/场馆和正式数据上线仍另计。

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

### 3.20 2026-09-06 D-057 抽奖、协同反馈与验收记录修复

基于 `feature/screen-six-stage-experience` 的 `6bc38222a15b8b9f7d1eb3745729eed5ad582c0c` 工作树修复；未创建提交。修改前已将本轮涉及的公开源码/文档备份到被忽略的 `output/repair-20260906/backup/`，未备份或操作真实名单、凭据、令牌映射或运行数据库。

- 抽奖：持久结果按顺序排队揭晓，后续抽取不覆盖当前展示，未揭晓者不进入可见历史；恢复/隐藏/reduced-motion 取消计时器并直接静态展示，恢复时也不触发 CSS 揭晓动画。大屏防止过期 HTTP 快照回滚已收到的公共事件；若公共序列已被新聚合超越，仅合并仍较新的投影版本，避免丢失该次结果。
- 协同：传入公开聚合的完成数/准入数，呈现计数、进度和集体光场；正常新事件最多一段 1.2 秒柔光，静态恢复不重放，不从 `started` 推断个人协同事实。
- 验收：显式 P/F/B/S；空白、非法输入、EOF/中断保留 PENDING，补齐 F25，记录起止源码指纹、设备、执行人与证据；缺项或非全 P 退出 2，退出 0 仍不代签。
- 操作/说明：已知就绪警告合并至一次推进/结束确认；取消不写入。正式恢复文案及公共星号约定区分 PROTECTED 与合成目录。未更改服务端候选、随机算法、奖励、身份和权限规则。

| 验证 | 结果与范围 |
|---|---|
| 根级快速门 | `PASS`：45 个 Vitest 文件、421 条测试，契约/后端类型检查和前端生产构建通过 |
| 新增针对性回归 | `PASS`：抽奖排队/合并快照/去重/静态恢复/清空/卸载，过期快照，协同比例，验收空白/非法/EOF/中断/元数据及源码变化，共 17 条单元回归 |
| 三端专项第一轮 | 新增浏览器回归在 Chromium、Chrome、Edge 全部通过；原有完整生命周期 Chrome 首次加载未出现集结标题、等待超时，同一用例不修改代码单独复跑通过；完整门继续复验，不将首轮记为全通过 |
| `pnpm verify:g3` 完整门 | `FAIL`：42 项中 37 通过、2 按原配置跳过、3 失败。失败全部属于未修改的 v1 `three-surfaces.spec.ts` 六阶段用例，检查点分别为 Chromium `stage-3`、Chrome `stage-2`、Edge `stage-4-pause-and-resume`；当前 v2 两个三端场景在三个浏览器均通过。完整报告保留于 `output/repair-20260906/g3-full.json`，不记为全绿 |
| 修改前基线对照 | 在独立 detached worktree `output/repair-20260906/baseline-v1/` 检出原 HEAD，以相同未修改后端产物和依赖运行 Chrome 的旧六阶段用例，仍在 `stage-3` 失败。已确认后端、共享契约、v1 三端源码和共享样式相对 HEAD 无变化；这个既有 v1 回归问题未在本轮修复范围内处理 |
| PROTECTED 前端构建 | `PASS`：以 `VITE_DATA_PROFILE=PROTECTED` 构建，产物包含正式姓名/8 位学号恢复说明且不含错误的“当前排练仅识别分配的测试姓名”；不访问正式数据库，不能扩张为正式身份链路验收 |
| 最终 `pnpm test:v2:e2e` | `PASS`：2 个三端场景 × Chromium/Chrome/Edge 共 6/6 通过，包含快速连抽、未揭晓历史隐藏、滚动中刷新不重播 CSS/计时器、协同静态像素改变且保持稳定、恢复计数、结束取消与一次确认。最终报告 `tests/reports/g3-browser.json` 仅对应此专项；完整门失败另存前述 `g3-full.json` |
| Chrome 1920×1080 / 220 人实看 | `PASS`：隔离合成栈实走抽奖滚动与揭晓，滚动时历史条目为 0；协同 0→1 的正常柔光可见，reduced-motion 像素确实改变且随后稳定；0/1/110/220 计数、进度和集体亮度收敛。只有 1 人 START_STAR，220 人协同完成后仍为 RUNNING，未把 started 当协同，也未自动结束。页面脚本/静态资源错误 0，横向/纵向溢出 0；截图与脱敏聚合记录在 `output/playwright/repair-20260906/` |
| 实体手机、局域网多人、OBS/LED、30 分钟 soak、正式部署 | `PENDING`：本轮自动回归不代签；真实名单/凭据/数据库未操作 |

### 3.21 2026-09-06 D-058 手机视觉实现稿

基于 D-057 未提交工作树继续修改，原文件备份于 `output/mobile-20260906/backup/`。手机重新整理标题/操作区层级、色温光谱和面向新生的提示，完成页新增只消费本人已确认事实的 `PersonalMemento`；恒星材质轻量调整但相位、坐标、时长及业务不变。无新增运行时依赖、字体、远程素材或正式数据访问。

| 验证 | 结果与范围 |
|---|---|
| 单元与构建 | 原阶段记录为 45 文件 / 421 条单元测试通过，末轮手机组件与渲染器相关 26 条复验、E2E 类型检查和前端生产构建通过。D-060 全量复验发现 D-058 最终工作树已使用 `displayTitle` 换行，但唯一标题测试仍要求旧表达式，因此不得把原 421 条记录视为 D-058 最终源码的全量通过；差异与补验见 §3.23。D-058 未新增依赖或更改后端、共享契约、共享样式 |
| 新增手机用例首轮 | `FAIL`：测试把辅助图标 `?` 当作档案“动力”按钮的可访问名称，定位超时；实际图标为 `aria-hidden`。改用既有可访问名称后，同一 Chrome 用例通过。首轮脱敏记录保留于 `output/playwright/mobile-20260906/layout-first-run.json`，不将首轮写成通过 |
| 最终三浏览器专项 | `PASS`：`v2-three-surfaces.spec.ts` 与 `v2-mobile-layout.spec.ts` 在 Chromium 151、Chrome 152、Edge 152 共 9/9 通过。覆盖色温 Home/End/方向键、320×568/375×667/667×375 布局、390×420 键盘压缩视口、125%/200% 网页根字号、主要控件的尺寸/视口/点击命中、无页面溢出、档案帮助、纪念页入口与小屏/横屏/200% 字号，以及完成后重载和 reduced-motion Canvas 像素稳定。只入场者仅显示抵达，未锁色者显示未确认且无回忆项；完整参与者显示全部五项。原抽奖排队/静态恢复、协同反馈和结束确认专项同时通过。报告 `output/playwright/mobile-20260906/three-browser-9-pass.json` |
| 正常首次入场动画与静态终章截图 | `PASS`：Chromium 上正常首次入场（约 5.4 秒参考窗口、控件交接、CLS 门）及完整三端生命周期共 2/2 通过；终章截图等待普通成功提示正常收回后保存。报告 `output/playwright/mobile-20260906/normal-journey-and-finale-pass.json`，正常关键帧保存在既有 `output/playwright/v2-journey-visual/chromium-ci/` |
| 视觉实看 | Chrome 390×844 选色、暖/冷星色、集结、节目、档案、协同和结束页已检查；操作区较短时内部滚动，导航不随之裁切。正常完成主动关闭连接不再显示为黄色故障警告，完成事实由纪念页持续呈现。图片对照为 `output/playwright/mobile-20260906/index.html`；此前节目页未选择节目、此稿已选择合成节目，对照页明确说明状态差别 |
| 现场与全仓门 | 本轮未重新运行完整 `verify:g3`；D-057 §3.20 已复现的旧 v1 三处失败记录仍保留，不能据手机专项称全仓通过。负责人审美反馈、实体手机字体/触控/软键盘、OBS/LED、公网正式部署和 30 分钟实机运行仍为 `PENDING` |

所有新增浏览器用例使用 OS 临时合成目录并在退出时关闭浏览器和服务、清除本次临时栈；正式数据未使用。桌面根字号缩放与高度模拟不等于实际手机系统字号和软键盘签核。

### 3.22 2026-09-06 D-059 节目单转录与字体组合样稿

本轮仅修改治理文档、增加本场节目结构化转录，并在隔离浏览器注入字体样稿 CSS；应用源码、依赖与运行数据库没有本轮新增变更。既有未提交改动保留，文档备份位于 `output/programme-font-20260906/backup/`。

- 节目单通过只读 Word XML 提取，原件 SHA-256 与转录来源绑定。校验原序号连续 1～21，18 个表演 / 3 个串场；带开闭场的名义时间合计 6703～7003 秒。演员个人信息未转录；第 20 项竞拍按负责人指令延期。结构化目录状态为 `source_transcription_not_imported`，不能宣称已导入运行库。
- 本机 `officecli view ... text` 因缺少 `System.Private.Xml` 运行库失败；使用 skill 允许的只读 XML 检查完成提取，没有修改 Word 或修复全局工具配置。首次终端提取出现编码显示问题，显式 UTF-8 重读后按原字转录。
- Chrome `152.0.7977.76` 的临时合成 v2 流程完成选色→入场→启动→节目→协同→结束。对 3 组字体 × 3 页面，在 390×844 / reduced-motion 下检查根页面横纵溢出均为 0，目标标题位于视口内，浏览器错误为 0。A/B 使用浏览器实际字体信息确认 `Fusion Pixel 12px Prop zh_hans` 负责中文标题；C 是本机清晰黑体排版试样，不声称是已定制的科幻字体。证据见 `output/playwright/font-20260906/evidence.json`。检查脚本曾选中选色页隐藏的寻星标题，已改为实际可见 `.selection-copy h2` 并重新采集；最终记录使用可见标题。
- 最新 `typography.html` 对照页的 9 张图片、3 场景鼠标切换、键盘 Enter 切换、375px 对照页无横向溢出检查通过；见 `typography-check.json`。仅对照页测了 375px，本轮没有把该数字扩大为手机应用全视口验证。
- 原始字体包来自 Fusion Pixel 官方 `2026.09.01` 发布，使用未修改的简体中文 WOFF2（661212 bytes），保留 OFL 及上游组件许可；均位于被忽略的评审目录，没有加入应用资源包。正式集成仍需确定字体组合并评估传输体积、缺字回退和真实手机观感。
- 文档检查与 `git diff --check` 通过。本轮没有运行全仓 G3、负载或 soak，也没有将 D-057/D-058 的历史门扩张为字体定稿或现场通过。首版像素观感负责人认为一般，B/C 组合仍待选择；字体自动检查不代表审美合格。

### 3.23 2026-09-06 D-060 手机 C 组合与本地中文字体

负责人选择 D-059 对照稿 C，并允许优化具体字体。基于既有未提交工作树，将手机标题、正文、按钮和数值统一为 Noto Sans SC 2.004 的本地 UI 子集 `Welcome Sans SC`，只调整手机字体和层级，不修改业务、动画时序或全局三端字体令牌。修改前文件与旧图备份位于 `output/typography-20260906/backup/`；正式名单、运行库、凭据和 NFC 映射未参与生成或验证。

| 验证 | 结果与范围 |
|---|---|
| 字体来源与资源 | `PASS`：固定官方 Noto CJK commit，源字体和许可 SHA-256 校验；重命名子集保留版权及 OFL。固定公开源码与公开节目标题覆盖 509 个码位，400–700 可变字重，150224 bytes，10 个数字具有相同 advance。`python scripts/build-mobile-font.py --check --license …` 校验当前文案覆盖、产物摘要、许可及 200 KiB 上限通过；不要求日常构建安装 Python/fontTools |
| 首轮全量 G3 | `FAIL`：45 文件 / 419 条通过、2 条失败，停在单元门，未运行该轮 E2E。一条断言仍强制旧手机字体栈，与本轮选型冲突；另一条仍要求 `:text="viewCopy.title"`，但本轮修改前备份已包含 D-058 的 `displayTitle ?? title` 与完整可访问名称。前者按 D-060 更新字体规则，后者修正旧断言并同时要求完整 `accessible-label`，没有移除唯一标题、回退或动画检查。保留日志 `output/typography-20260906/verify-g3.log` |
| 更新后的单元与构建 | `PASS`：视觉契约专项 11/11；完整 45 文件 / 421 条单元测试、部署静态检查、共享契约/后端/E2E 类型检查、后端和前端生产构建通过。WOFF2 由构建生成同源摘要文件，许可复制到 `/licenses/welcome-sans-sc-OFL.txt`。package.json、pnpm-lock.yaml 与共享 tokens.css 摘要和本轮前一致 |
| 三浏览器完整门 | `PASS`：最终 `pnpm verify:g3` 退出 0；2026-09-06 14:18:59～14:29:01（Asia/Shanghai）的浏览器部分共 48 项，46 通过、2 跳过、0 失败。Chromium 151.0.7922.34 为 16/16；Chrome 152.0.7977.76 与 Edge 152.0.4191.66 各 15 通过/1 跳过，跳过的是既有仅在 Chromium CI 执行的首次旅程视觉用例。D-057 记录的 3 条旧 v1 失败此次没有复现，本轮没有修改 v1 业务，不能据此宣称已定位并修复其历史失败原因。脱敏报告固定保存为 `output/typography-20260906/g3-browser-final.json`，全命令日志为 `verify-g3-after-contract-update.log` |
| 手机布局、字体失败与流程 | `PASS`：三个浏览器均通过手机布局和新字体用例，覆盖 320×568/375×667/667×375、390×420 模拟键盘、125%/200% 网页根字号、点击命中和控件可达性、纪念页事实与静态恢复。新用例确认后台/大屏无字体请求，手机同源加载且可读取 OFL；主动阻断字体请求后仍能显示完整标题、确认星色入场并打开档案。v2 三端生命周期、抽奖连续揭晓、协同反馈、一次结束确认与 Chromium 正常首次旅程同时通过 |
| 实际字体与截图 | `PASS`：Chrome 152.0.7977.76 的临时合成流程完成选色→入场→启动→节目→协同→结束；实际源码加载，无 CSS 样稿注入。5 次采集包括 390×844 的选色/节目/结束，以及 320×568 和 200% 网页根字号的选色；CDP 确认各可见中文标题使用自定义 `Welcome Sans SC`，字体同源请求 200，标题均位于视口内且高于操作坞，根页面横纵溢出与脚本/静态资源错误均为 0。证据 `output/playwright/typography-20260906/visual-evidence.json` |
| 新旧对照页 | `PASS`：`output/playwright/typography-20260906/index.html` 的 2 版本 × 3 页面共 6 张图、鼠标与键盘 Enter 切换、375px 对照页无横向溢出、浏览器错误 0。新图是本轮实际应用，旧 C 是 D-059 排版注入稿；页面注明合成节目状态和未导入目录，不能当作正式节目截图 |
| 现场与后续 | `PENDING`：负责人对最终字形的视觉评审、实体手机系统字号/触控/真实软键盘、OBS/LED、30 分钟实机运行和正式部署。字体断流浏览器用例与桌面尺寸/根字号模拟不代签真实设备 |

生产 WOFF2 的 SHA-256 为 `d76743eb3ab4d43f7a989fa31d0ebaa7f3a95b9748f0623436b5b0c2e319d949`。完整中文字库未随包提供，姓名、输入和未来文案中的其他字符按系统回退，不能宣称所有任意汉字都已统一。测试只创建 OS 临时合成栈；自动流程结束时关闭其浏览器和服务，不触碰正式运行实例。最终文档链接检查与 `git diff --check` 通过；本轮源文件与证据摘要见 `output/typography-20260906/source-evidence.json`。

### 3.24 2026-09-06 D-061 本场节目目录、串场与保留数据的升级

负责人在 D-060 字体落地后要求“下一步”，本轮按 D-059 的顺序接入本场目录。沿用既有未提交工作树；修改前备份与失败日志位于 `output/program-catalog-20260906/`。只创建 OS 临时合成环境，包含明确使用虚构两人记录的 PROTECTED 分类案例；没有访问或升级实际 `.data`、`.rehearsal`、`.private`、服务器运行目录或原 Word。

| 验证 | 结果与范围 |
|---|---|
| 首轮失败与修正 | 首轮旧单元集 395 通过、26 失败，主要是升级到 schema 15 后仍断言 14 或绕过初始化直接构造旧节目表；更新历史 fixture、版本断言与手机允许送礼的视觉断言，未增加生产旧表回退。浏览器专项先因测试仍等待送礼成功后已关闭的对话框而失败，修正为检查操作入口的余额和对话框关闭。原失败日志保留 |
| 独立目录与权限 | `PASS`：本场 21 项、18 表演、2 游戏串场、1 延期占位与原文 42s；浏览器和服务器输入校验一致、角色/epoch/revision/幂等、双主控旧预览、部分 SQL 失败回滚、稳定 ID 调序/移出保留、重开数据库，以及名单种子/凭据摘要不变 |
| 串场礼物 | `PASS`：第 7/14/20 项的当前投影无礼物目录，能力移除 SEND_GIFT；发送上一节目或串场 ID 均由服务器拒绝，动力/首次礼物奖励/上一节目热度不变，POST_BARRAGE 保持原规则；切回第 21 项恢复送礼。临时浏览器走过正常表演送礼再切串场 |
| 14→15 与合成重置 | `PASS`：有入场/锁色/礼物/奖励/热度的临时 PROTECTED schema-14 库，暂停后先备份再升级，身份/凭据摘要、epoch、当前项、礼物与奖励逐行保留；备份可读且为 schema 14，失败回滚、RUNNING 拒绝、缺确认/重复备份拒绝。该案例暴露旧受保护名单指纹包含可变热度，已按导入时零热度规范化，schema-15 热度改由礼物账本独立校验。合成重置进入新 epoch 并清互动，同时保留 21 项目录、ID 与 catalog revision。节目目录/数据库/受保护名单专项 3 文件 43/43 |
| 全仓快速门 | `PASS`：46 文件 429 条 Vitest、部署静态门、共享契约/后端/E2E 类型检查、后端和前端生产构建；无新增 npm 依赖或锁文件变化 |
| 三浏览器完整回归 | `PASS`：`pnpm verify:g3` 退出 0，总耗时 756285 ms；浏览器 15:22:39–15:34:34（Asia/Shanghai），51 项中 49 通过/2 既定跳过。Chromium CI 17/17、Chrome 与 Edge 各 16 通过/1 跳过，跳过的仍是仅在 CI Chromium 执行的正常首次旅程视觉用例。完整日志 `verify-g3-first.log`，脱敏报告固定为 `g3-browser-full.json` |
| 最终呈现复验 | 实看后只调整两处呈现：移出项使用克制的文字按钮，串场礼物说明去重。视觉契约 11/11；两处收敛后的最终生产构建通过，节目目录与三端用例在 Chromium CI/Chrome/Edge 共 9/9。最终专项报告单独保存为 `g3-browser-final-focused.json`，不覆盖全量报告；最终九张页面截图已重新采集 |
| 300 人协议负载 | `PASS`：先完成默认目录基础负载，再将脚本改为通过真实 HTTP 导入本场 21 项目录，覆盖更大的参与者快照后重跑通过。最终 300 人/301 连接，耗时 169455.25 ms，p95：场景 60.46 ms、礼物 1407.99 ms、弹幕 586.26 ms、协同 700.06 ms；所有被测操作 p95 < 2000 ms、失败 0，1200 次礼物、300 次弹幕/协同成功。301 连接在服务重启后全部恢复，协议/隐私错误 0，账本/幂等/旧 epoch 检查及临时目录清理通过。默认目录记录为 `v2-load-default-catalog.json`，本场最终报告为 `v2-load-final.json`；只证明 Windows loopback 协议表现，不是 30 分钟渲染 soak 或场馆性能 |
| 字体与实际截图 | `PASS`：D-060 同源中文字体补入本轮固定文案，520 码位、152876 bytes、400–700，生成器 `--check` 通过。Chrome 152.0.7977.76 实际 Vue 页面共 9 张截图：手机 390×844/320×568、后台 1366/768px，横向溢出与 pageerror 为 0。产物 `output/playwright/program-catalog-20260906/visual-evidence.json`；纯查看页 `index.html` 的 9 图、鼠标/键盘切换、390px 布局均通过，见同目录 `gallery-evidence.json` |
| 现场与数据应用 | `PENDING`：已有合成/正式运行库的 schema 14→15 维护、READY 状态下应用本场节目、真实手机与 OBS 联排；本轮没有改变实际运行数据。游戏/竞拍玩法、抽奖轮次、具体 Cue 和电影银河/片尾仍待后续明确与实现 |

D-061 当时代码要求 schema 15，因此既有 schema-14 服务不能直接使用该版本启动。14→15 专用维护入口及明确目标配置、停服、备份与整体回退步骤见 RUNBOOK §7.6，演出操作见 §5.1。备份文件仍继承原数据的保护等级；该轮未把任何真实备份作为测试材料。缺少明确目标的维护 CLI 实测退出 1 且不打开数据库；最终文档门、`git diff --check` 通过，源文件及报告 SHA-256 见 `output/program-catalog-20260906/source-evidence.json`。这些是 D-061 历史证据；当前 schema 17 见 D-071 节。

### 3.25 2026-09-06 D-062 独立银河连续镜头样片

在 `feature/screen-six-stage-experience`、HEAD `6bc38222a15b8b9f7d1eb3745729eed5ad582c0c` 的既有未提交工作树上，新增 `frontend/preview/galaxy-shot/` 和内存打包脚本。既有修改保留，本轮没有修改生产路由/渲染器、手机、节目业务、数据库或依赖。治理文档修改前备份到 `backups/d062-galaxy-shot-20260906/*.bak`。观看与重建见 [`GALAXY_SHOT_PREVIEW.md`](./GALAXY_SHOT_PREVIEW.md)。

| 验证 | 实际结果与范围 |
|---|---|
| 样片生成 | `node scripts/build-galaxy-shot-preview.mjs` 通过，生成约 240 KiB 的自包含 HTML；复用既有本地中文字体并内嵌其许可证，不发起远程资源请求。产物和源文件哈希见 `output/playwright/galaxy-shot-20260906/source-manifest.json` |
| 生产隔离与现有专项 | 前端生产构建通过，产物未出现样片入口/诊断 API/新 shader 标识；既有 `tests/unit/v2-galaxy-renderer.test.ts` 的 21 条测试通过。本轮没有修改 `/screen`，未重跑完整 G3，不把这 21 条作为样片视觉通过的证据 |
| Chrome 152.0.7977.76 浏览器验证 | 最终脚本 16/16 通过：实际点击播放/暂停、键盘时间轴、0/40/220/300 合成档位、420 颗装饰星独立计数、已有星位不随人数重排、390px 页面无横向溢出、1920×1080 全画布透明终态、运行中减少动态、减少动态刷新不分配 GPU、隐藏分支、上下文丢失、销毁停帧、零运行错误与无远程请求；原始结果为 `verification.json` |
| 连续性与初始化失败补验 | 2/2 通过：触发前后各 1 ms 的 8 个合成星位样本，最大步长约 0.0337 px、前后步长差约 0.00000117 px；首次加载屏蔽 WebGL2 时停止在静态终态、全画布透明且标题隐藏。结果为 `continuity-and-initial-fallback.json`，只证明这些样本及分支 |
| 视觉实看 | Chrome 1440px 评审页、390×844 窄页及 1920×1080 镜头关键帧；检查 0/6/9/11.4/13.5/14.5/15.3/16/16.7/17.4 秒。初稿的珠状光晕和规整光圈被收紧/替换；最终预演使用连续不规则喷流。录像为 `galaxy-continuous-shot.webm`，前后含录制操作造成的静态停留；它是浏览器实际录屏，不是预渲染替代运行路径 |
| 无录屏短时性能 | 同机 Chrome、可见画布 1920×1080、离屏缓冲 1280×720，逐次完整播放：220 星等待段约 30.00 FPS、转场约 54.86 FPS、转场帧间隔 p95 33.5 ms；300 星约 30.00/59.04 FPS、转场 p95 29.1 ms。CPU 绘制 p95 分别约 7.2/4.2 ms。证据为 `performance-220.json`、`performance-300.json`；这是短样片的时间窗口测量，不是稳定 60 FPS 或长时间运行结论 |
| 优化过程与录制影响 | 初次 220 星转场约 51.30 FPS；剔除画外/不可见计算后约 53.19 FPS；保留帧截止时刻、避免逐次计时舍入后本次测得约 54.86 FPS。首轮指标另存 `performance-220-first.json` 和 `performance-220-before-deadline.json`。录屏运行转场约 44.62 FPS，独立记录于 `recording-run.json`，不拿录制过程数据冒充无录屏性能 |
| 透明与恢复范围 | 17.4 秒读取全部 2,073,600 像素，非零 alpha 数为 0。减少动态/上下文丢失分支停止 JS 循环且清空画布。隐藏测试通过属性与事件注入，只证明控制器分支，不代替实际手机后台挂起或 OBS 中断验收。普通刷新是独立评审页回到开头并暂停，不承担正式场景快照恢复 |
| 未执行 | 正式 `/screen` 集成、真实到场事件/抽奖中断联动、三浏览器全门、30 分钟渲染 soak、实体手机、实际 OBS/LED/场馆观看距离均 `PENDING`。最终主观电影感由负责人观看连续样片评审，不以自动检查代签 |

首轮辅助验收脚本因 CLI 执行环境没有全局 `URL` 而在请求统计处报错，改为仅比较本地地址前缀后重跑通过；这不是应用运行异常。CLI 禁止 `file:` 导航，因此自动检查采用只监听 `127.0.0.1:8946`、只提供本样片 HTML 的临时服务器；不启动项目后端，不访问 `.data/.rehearsal/.private`。

### 3.26 D-063 银河接入与 D-064 服务器内测（2026-09-06）

工作树为 `feature/screen-six-stage-experience`，基础 HEAD `6bc38222a15b8b9f7d1eb3745729eed5ad582c0c`，包含未提交改动。实际 release `20260906-0a57083c6dbc` 的 379 个文件由 `RELEASE.json` 逐文件标识，包 SHA-256 为 `cd66d9a37a88dd601579227b3bc6a3b9a207913c120cc697121b3b884a6cd173`。关键源码/配置修改前已保留不含凭据的回滚副本，没有提交或推送。

D-062 样片与正式大屏现共用 `cinematic-galaxy-scene.js` 核心；生产星位来自公开快照，固定 420 颗底星不算参与者，锁定星色与一次到场流星保留。实际运行相机有界运动，任意晚到的切场口令连续接管，避免长时间等待后穿过星系；沿用原唯一绘制循环、30/60Hz 调度和减少动态/失败回退。节目透明稳态提前返回，不初始化或绘制不可见 GPU。子路径只影响浏览器 URL、构建与代理，后端业务路由保持原有协议。

| 验证 | 结果与范围 |
|---|---|
| 初次完整 `pnpm verify:g3` | 单元 47 文件 / 434 项通过，构建与类型检查通过；浏览器 51 项中 47 通过、2 失败、2 既定跳过。Chromium 连抽计时受隐藏 GPU 初始化影响，Chrome 旧 v1 六阶段在 stage 4 超时；本轮未把初次结果记作全绿。日志 `output/d063-g3.log`，原报告 `output/d063-g3-browser-initial.json` |
| 修复后的三浏览器定向复验 | Chromium / Chrome / Edge 的连续抽奖、v2 三端权威生命周期和前述 v1 完整流程共 9/9 通过。证据 `output/d063-final-browser-recheck.log`、`output/d063-final-browser-evidence.json`；未重跑整套 G3，因此仅对此范围作通过结论 |
| 最终核心与路径单元检查 | `v2-galaxy-renderer`、`v2-cinematic-galaxy`、`application-path` 三文件 27/27 通过：既有绘制边界、8 小时有界相机、晚触发连续性、稳定星位/颜色、底星与 300 技术上限、流星投影对齐、根路径/子路径构造 |
| 发布构建与静态门 | `/welcomeparty/`、REHEARSAL 页面标识的前端构建通过；`pnpm deploy:check` 通过。Linux 原生 SQLite 依赖在新 release 独立安装并校验，v2 启动前校验通过，使用全新 schema 15 合成库 |
| 正确域名与其他项目 | 正常 DNS 的 `https://sysuzgxytj.top/welcomeparty/api/health`、协议能力和公开快照为 200，v2 ACTIVE，最终快照 READY；新服务、旧迎新、Nginx、PM2 均 active，两域名根站为 200。仅正确域名的 `/welcomeparty/` 引用新片段；错误域名旧代理已恢复。没有修改 DNS、根站、旧项目数据或真实名单库 |
| 实际服务器 Chrome 三端流程 | 10 组检查全部通过：Secure/HttpOnly/SameSite Cookie 按子路径隔离；21 项目录；3 个独立邀请准入并启星；8.4 秒转场后整幅 Canvas alpha 为 0；送礼正确扣值及新弹幕实时显示；连续抽奖与刷新恢复；串场禁礼物；3 人协同完成并结束锁定；清除冒烟数据后恢复 READY + 21 项；所有请求/WSS 留在子路径。无页面脚本错误，8 条 WSS 连接均为 `/welcomeparty/ws/v2` |

服务器浏览器证据为 `output/server-verification/public-check.json`（检查于北京时间 18:05 完成），附 `server-assembly.png`、`server-phone.png`、`server-raffle.png`、`server-complete.png`、`server-admin-ready.png`。该次 Chrome 152 浏览器使用进程内域名映射直达目标 IP，要求有效公共 TLS，不改系统 hosts；正常 DNS HTTPS 另行检查通过。早期脚本使用了排练模式不存在的推进按钮、错误的 READY 中文标签和未考虑 NFKC 的标点匹配，修正检查脚本后完整复跑通过；这些脚本失败记录仍保留，不冒充产品修复。

交付已恢复 `READY / REHEARSAL` 并保留 21 项节目单，20 个测试邀请及后台凭据单独放在仓库外受控文件中。服务器上只使用全新合成数据。自动截图中的手机为桌面模拟，不能代签实际微信/手机键盘、OBS alpha 合成、LED 观感、场馆网络或持续负载；现行版本的这些人工项仍为 `PENDING`。操作顺序见 [`INTERNAL_TEST_20260906.md`](./INTERNAL_TEST_20260906.md)，运维范围见 [`INTERNAL_SERVER_HANDOFF.md`](./INTERNAL_SERVER_HANDOFF.md)。

### 3.27 D-065 姓氏首字母与学号后四位统一星号（2026-09-06）

负责人明确修改正式与合成星号规则，六字符形态仍为 `A-0000`。正式导入改用固定版本 `pinyin-pro@3.29.3` 的姓氏模式；按首字母而非双字母声母生成，复姓仍只取一字母，英文登记名取开头字母，允许导入时显式校正 `surnameInitial`。重复结果在迁移/导入写入前拒绝，只报告行号。实现依据为[拼音与姓氏模式官方说明](https://pinyin-pro.cn/use/pinyin.html)；单于的首音处理参考[教育部字典](https://dict.revised.moe.edu.tw/dictView.jsp?ID=122830&la=0&powerMode=0)，不依赖运行时网络查询。

| 验证 | 结果与范围 |
|---|---|
| 针对性初轮 | 21 项中 20 通过；复姓“单于”被库的 head 模式按“单”识别为 S，已加明确复姓处理。类型检查同时发现 strict optional 的 `undefined` 不兼容，已修正；不把初轮记作通过 |
| 最终相关回归 | 7 文件 / 59 项全部通过：星号生成、正式改号、正式导入、正式备份/恢复、节目目录、参与者入场与三端快照。`pnpm typecheck` 通过。没有因显示编号规则改动重跑不相关的动画全门 |
| 姓氏与碰撞 | 覆盖张/曾/单/单于/欧阳/仇/区、繁体張、英文登记名、人工校正、前导零、非法输入；不同姓氏首字母相同且后四位相同会拒绝，新导入不留下身份或凭据产物 |
| 维护事务 | 覆盖默认只读预览、两个既有编号互换、身份/邀请/密码/星位保持、NFC 替换失败时数据库与文件恢复、文件替换后提交前中断的 journal 回退；激活后的名单拒绝改号。journal 断言不含姓名、完整学号、密码、pepper 或 NFC URL |
| 本机现有正式库 | 只读预览 220 人 / 220 项改号 / schema 14，完整目录无重号；已确认 READY、无参与者/会话/运行记录、SQLite integrity 为 ok，未发现本机正式服务进程。随后显式应用 220 项成功，再次预览 `changedCount: 0`，完整 v2 foundation 与 NFC 逐行对账通过。保留身份、邀请、密码、星位及 schema 14，没有升级节目表或上传正式名单 |
| 服务器合成库只读核验 | 300 个账号全部符合规则且唯一，清单/数据库/预分配星位星号一致；新迎新、旧迎新、Nginx、PM2 都 active。本次不重启、不重置、不写服务器库，原邀请继续有效 |

维护入口为 `pnpm db:roster:star-ids`，用法见 [`RUNBOOK.md`](./RUNBOOK.md) §7.7。已有正式数据只改 `synthetic_identities.public_star_id`、`v2_identity_slots.public_star_id`、目录指纹及私密映射的星号列；无凭据恢复记录为 Git 忽略的 `backend/.private/d065-star-id-journal.json`。服务器核验脚本保存在 `output/server-star-id-audit.sh`，只打印统计结果。源代码修改前的公开文件备份在 `output/backups/d065-star-id/`，不含名单或凭据。本次未提交/推送；服务器 release 仍为 D-064 版本，其合成星号规则原本已经一致。正式名单启用、schema 15 升级与实体 NFC/手机/OBS 验收仍独立安排。

### 3.28 D-066 大屏动效策略与弹幕回退（2026-09-06）

内测弹幕缺失的本机诊断：Windows 关闭客户端区域动画；清除 Playwright 默认媒体模拟后，独立 Edge 实际报告 `prefers-reduced-motion: reduce`、页面可见且实时连接正常。旧代码在该条件下隐藏整层弹幕。公开服务器已有 8 条发布记录，人数少不是触发条件。该诊断没有操作服务器运行状态，也不等于对 OBS 内嵌浏览器做了媒体偏好实测。

D-066 修改专用 v2 大屏的默认策略，并保留显式系统/静态选择；手机和后台仍跟随系统。范围包括 CSS 不被系统意外压缩、静态正文有界到期清理、GSAP 加载失败的飘屏回退、转场超时收束、暂停/隐藏/断线后的动画清理、排练终章预览入场、真实结束刷新不补播。原始文件备份在 `output/screen-motion-20260906/backup/`，测试只使用临时合成栈。

最终验证：contracts/backend 和带 `/welcomeparty/` 前缀的前端构建通过，E2E/soak 类型检查通过；4 文件 / 23 项相关单元验证通过，文档检查与本轮差异空白检查通过。2026-09-06 23:18～23:25 的 Chromium、Chrome、Edge 共 12/12 通过。覆盖系统减少动态下默认完整银河/到场/约 8.4 秒转场/实际弹幕位移、抽奖连续揭晓、协同反馈、真实结束与刷新；显式静态弹幕固定可读并到期销毁、GSAP 请求失败后的 CSS 实际位移、策略切换和 URL 保持、退出大屏恢复全局减少动态；转场中暂停、排练终章入场及模拟隐藏恢复。Chrome 首轮新增静态用例曾因脚本未切现场模式而等待不存在的推进按钮超时，修正后专项和最终全矩阵均通过；保留初次失败记录，不覆盖历史结果。

最终报告为 `output/screen-motion-20260906/final-three-browser-report.json`，截图在 `output/playwright/screen-motion-20260906/`；已目检实际转场帧、静态正文和完整结束稳态。静态截图中的白底是独立浏览器对透明画布的显示，节目背景仍由 OBS 下层媒体提供。主控设置仅在指定 query 下出现，正式合成时应隐藏。

服务器补丁为 `20260906-d066-7c39c3c94e93`，包 SHA-256 为 `93ce0c7ac0257ce503712b232eca43f0963374d6c7a4b0b068cfbc0dec3eb791`，11 个公开前端文件；沿用旧后端和依赖，保留旧资源与旧 release，383 项 release 清单逐项校验。切换后公网 HTML/JS 与构建哈希一致，v2 ACTIVE，后台 PID `3417867` 未变；`LIVE / COMPLETED / COOPERATIVE_LIGHT`、runRevision 5、resetEpoch 7、publicSeq 86 和 presentation NONE 全部保持。本轮未重启后端、改 Nginx、重置或写入数据库。首次发布检查曾因 `hiwebsun.top` 公网连接失败而自动回退；核实该域名解析至其他主机 `43.155.238.184` 后，改为对本机原站点按 Host/SNI 验证，两域名本机根站均 200，第二次切换成功。正确内测域名 `sysuzgxytj.top` 仍解析到 `1.12.62.182`。

线上只读浏览器核验通过：实际 HTTPS 大屏在模拟系统 `reduce` 时返回 `policy=full`、`state=full`、`systemReduced=true`，原结束标题可见且 opacity=1；选择跟随系统后为 static，切回 full 并隐藏设置成功，未发送业务命令。证据为 `output/screen-motion-20260906/live-browser-probe.txt` 与 `output/playwright/screen-motion-20260906/live-final.png`。

2026-09-06 23:58 本机实际 OBS 补验：用户报告银河完全静止。OBS 32.2.1 / obs-browser 2.26.9 / CEF 127.0.6533.120，1920×1080 浏览器源可见、BrowserHWAccel=true，未直播或录制；当时公开状态为 epoch 8、publicSeq 5、REHEARSAL / RUNNING / ASSEMBLY、0 颗真实星。对 OBS 自身窗口采样确认先前仍为旧静态构图，通过该来源的“刷新”按钮重新加载后出现新银河流动。23:58:00 与 23:58:02.9 的实际预览帧，仅比较排除控件、音量条、标题和加载提示的银河区域，21,528 个采样像素中 13,384 个变化（约 62.2%），与截图中银河形态变化相符。最终来源仍为原 `/welcomeparty/screen`，没有保留诊断面板；运行状态/epoch/游标未变，没有发送后台命令或重启 OBS。证据在 `output/obs-motion-20260906/`：`before-refresh.png`、`obs-galaxy-frame-a.png`、`obs-galaxy-frame-b.png`、`actual-obs-motion-evidence.json`、`obs-restored-final.png`。

此轮仅将本机 OBS 的 0 人银河连续动效记为实际观察通过；OBS 真实切场、弹幕与媒体合成、场馆、长时间 soak 和手机真机仍 `PENDING`。浏览器隐藏用例若由测试派发 visibility 事件，只证明处理器收束，不代替真实 OBS 停用来源或操作系统休眠验收。

## 4. 视觉自动门（D-063 银河 + D-053 UI + D-060 手机字体，D-030～D-032 为手机动效基线）

D-066 大屏默认完整动效；本节减少动态相关大屏检查需要显式使用 `motion=system` 或 `motion=reduced`，且新弹幕保留静态正文。手机检查仍直接启用系统减少动态。

D-063 接入同源连续镜头核心后，正常模式引擎为 `webgl2-cinematic-depth-field`，失败/减少动态保留既有 Canvas2D 静态边界；以下历史 D-048～D-055 的人数、星色、恢复和透明规则继续有效，具体镜头形态及相机以 D-063 为准。历史样片性能数字不等于生产长时间负载通过。

- D-037 继承 D-030 的约 5.4s 寻星、约 1.0s 锁色确认与约 4.2s 入轨视觉语言，但锁色权威成功后直接衔接入轨，不再出现寄语输入或胶囊决定停留。
- D-032 的逐字大标题、微角操作坞与动力/星光解释仍生效；本人档案不再显示时光胶囊。D-060 的 v2 手机使用本地中文 UI 子集，同源加载失败或缺字时保留系统回退；标题允许显式换行，但辅助技术仍获得完整语义。必须检查小屏、键盘压缩、字号放大及首次连续旅程，字体就绪不能成为业务条件。
- D-053 要求三端共用 Orbital Signal 语义表面/状态与 `2/4/8/12px` 小圆角；全局本机字体角色保持，D-060 仅覆盖 v2 手机用字。手机关键标签、状态和操作说明不低于 12px，禁用态不可只靠透明度；后台必须是无持续氛围动画的克制深空运营控制台，并把内部枚举转换为可读文案。
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


## D-068 手机聊天列表专项（2026-09-07）

Chrome 手机布局专项最终 2/2 通过（29.0 秒），证据 `output/mobile-chat-20260907/layout-release.log`；实际节目页截图已核对聊天区、输入框、匿名同意与礼物入口。独立浏览器真实滚动验证自动跟底、上翻保持阅读位置、新消息提示和回到最新；21 条消息超过 9.5 秒仍保留，删除一条后 20 条，清屏后 0 条。证据 `output/mobile-chat-20260907/probe.log` 和 `scroll-review.png`。生产子路径构建通过；线上 D-068 HTML/主 JS 与发布包匹配，后台进程及现场状态保持。此轮未重新声称全套测试或实体手机输入法验收通过。


## D-069 星号聊天专项（2026-09-07）

手机取消匿名勾选，手机与后台按服务端 publicStarId 显示发送者。新增断言覆盖公开事件星号、后台快照星号和手机/后台实际正文关联。原有姓名、完整学号、邀请令牌与内部身份 ID 不公开的断言保留。453/453 单元与集成测试通过，前后端构建及浏览器类型检查通过。浏览器初次 4/6 通过，两项由于旧输入定位同时匹配选色组失败；修正为精确定位后，完整三端流程通过，但渐变首次付费暴露快照游标先行导致实时聊天遗漏，已增加当前连接独立聊天投递游标，避免快照抢先吞掉消息且不倒退权威游标。最终复验结果另附。

最终复验：完整三端流程及静态/渐变弹幕 2/2 通过（`output/star-chat-20260907/browser-race-fixed.log`），结合初次其余四项通过覆盖本次 6 项。最终既有 453 项通过，另增快照先行/重复消息/清屏回归测试，与既有断连测试共 2/2 通过（`race-unit.log`）。截图 `output/overnight-20260907/mobile-gradient.png` 已人工检查星号和渐变正文。发布 `20260907-d069-4a7752c8a77b`，包 SHA-256 `4a7752c8a77bf48c15a6ebd50891d96bef7a8d415c8a34c716b5de7d4e8f806a`；停止本项目后 SQLite 一致性备份完整性通过，未迁移 schema，切换代码重启并确认现有运行状态/星位/节目/抽奖保留，其他服务 PID 保持、根站与线上静态文件哈希验证通过。


## D-070 手机页面整理（2026-09-07）

基于 22 个旧版审查画面实施键盘、礼物、聊天、节目单、档案、抽奖提示、协同与纪念页调整。以独立合成账号和本场 21 项公开节目目录逐页实拍，证据 `output/mobile-pages-20260907/index.html`。在 390×420 键盘空间模拟中，输入框从 top 402.69 / bottom 448.69 且受正文 360px 底部裁剪，改为 top 320 / bottom 366，正文可视底部 413；点击命中验证确保输入框上下缘不被容器和导航遮挡。输入文字后仍可见；实体手机输入法另计。

目录更新时发现旧手机事件验证拒绝合法 currentProgram:null，已按现行协议接受 null，并补缺失字段仍拒绝的回归用例；无后端或 schema 修改。最终 455/455 Vitest 通过，构建和 E2E 类型检查通过。先前 1 条旧等待标题、2 条旧节目/档案结构断言及旧标题定位已按 D-070 更新，未修改业务断言。浏览器最终结果与发布状态补于下文。

最终 Chrome 7/7 通过（1.7 分钟），日志 `output/mobile-pages-20260907/browser-final.log`；455/455 日志 `tests-final.log`。本轮非全套三浏览器重跑。D-070 前端发布包 SHA-256 `8477b22394a7faab8934daf5bcafdf26c555b712a6b503ce4559defd22a80b93`，release `20260907-d070-8477b22394a7`；线上 HTML/主 JS 与发布文件哈希匹配，协议 v2 ACTIVE，后台 PID 3651641 不变。发布前后 epoch 8、publicSeq 37、RUNNING/REHEARSAL/PROGRAM_SUPPORT、runRevision 15、presentation NONE 保持，其他服务 active、根站正常。


## D-071 礼物、聊天与个人档案（2026-09-07）

本轮覆盖活动礼物 1/5/10/20 完整扣费、取消节目减免、当前节目礼物数量、本人按节目/礼物汇总的送礼历史、本人弹幕历史、手机透明上移聊天以及 20 动力星舰在在线手机与公屏的实时动画。历史交易、旧减免审计与 schema 16→17 跨版本保留另设数据库门。

| 验证 | 最终结果与边界 |
|---|---|
| Vitest 全套 | `PASS`：50 个文件、456 项全部通过；覆盖契约、旧 50 面值事件解析兼容、目录严格新档、扣费/余额/热度/数量、档案归属、隐私、实时去重、断连和迁移 |
| 类型检查与构建 | `pnpm typecheck`、`pnpm typecheck:e2e`、`VITE_BASE_PATH=/welcomeparty/` 生产构建均通过；生产资源为 `index-BWZ1y2Lm.js` 与 `index-3J3tkcrj.css` |
| Chromium 三端 | 主文件 4/4 通过；滚动稳定性修改后完整主生命周期另跑 1/1 通过。验证当前节目数量、20 动力扣费、手机/公屏星舰、透明聊天、星号、档案、恢复、减少动态和终章；未用桌面自动化代签实体手机/OBS |
| 视觉证据 | 已检查 `output/overnight-20260907/mobile-program.png`、`mobile-chat-transparent.png`、`mobile-archive-history.png`、`screen-program.png`；手机聊天保留银河可见，公屏星舰在 1920×1080 形成跨屏长拖尾 |
| schema 16→17 | 专用维护回归保留身份、运行 tuple、余额/星光、历史礼物实际面值、节目热度、弹幕、奖励、旧减免与抽奖。首次预检因旧 `program.changed` 中 50 面值被保护门拒绝并自动回退；加入历史事件兼容与真实回归后通过，活动目录仍严格为 1/5/10/20 |
| 服务器发布 | release `/opt/sysu-welcome-internal/releases/20260907-d071-6238ab6abe8d`，包 SHA-256 `6238ab6abe8d3e17af4f183773c506d34f88d9e1fc7fa84438e20615e1503d38`，清单 417 项。备份 `/var/lib/sysu-welcome-internal/backups/d071-r2-before-20260907.sqlite` 完整性通过、权限 0600 |
| 线上保留核验 | schema 17 / 协议 v2 ACTIVE；升级前后 epoch 8、RUNNING/REHEARSAL/PROGRAM_SUPPORT、runRevision 15、当前节目、参与者/动力/星光、3 条礼物、9 条弹幕、4 条奖励、1 条旧减免、24 项节目/热度、1 颗星和抽奖事实一致。只重启本项目，其他服务与 Nginx PID 保持 |
| 线上只读浏览器 | `PASS`：Chromium 打开 `/welcome`、`/screen`、`/admin` 均为 200，Vue 根节点完成渲染，无 page error 或失败请求；手机/后台各一次未登录会话 401 属预期认证门。报告 `output/gift-experience-20260907/live-readonly-smoke.json` |

完整行为、回滚和人工待验范围见 [`D071_GIFT_EXPERIENCE_ACCEPTANCE.md`](./D071_GIFT_EXPERIENCE_ACCEPTANCE.md)。实体手机触摸/软键盘、OBS 刷新后的透明合成、LED 屏亮度与现场多人观感仍需负责人实际签核。


### D-072 2026-09-07 当前验证补充

457/457 全量测试通过。最终 Chromium / Chrome / Edge 三端闭环 3/3 通过，覆盖 12 秒转场、普通银河/OBS 透明切换、送礼星舰、余额数量与记录、弹幕、抽奖、协同和结束。Chrome/Edge 其他 10 项浏览器检查已通过；首轮两项星舰漏播失败及根因修复保留在 [D-072 验收](./D072_CINEMATIC_ACCEPTANCE.md)。E2E/soak 类型、前端构建和 docs:check 通过。新版仅前端部署，线上只读三端验证通过。实体手机/OBS/长时 soak 仍 PENDING。
