# 运行手册（v2 现行）

> 当前现场操作请从 [D-086 主控操作单](./LIVE_OPERATOR_GUIDE.md) 开始。2026-09-09 已发布 D-086 前端，后端 schema 17 保持；直接 `/screen` 有银河底图，OBS 表演叠加用 `?media=overlay`，开场交接 12 秒，礼物全部完整扣费。服务器当前状态须读取后台，不依赖旧验收时点。发布及后续问题见 [D-087](./D087_DEPLOYMENT_FLOW_REVIEW.md)。

> D-071（2026-09-07，已部署）：服务器合成库已由 schema 16 保留升级至 17，活动礼物档位为 1/5/10/20，取消新礼物的节目减免，并加入档案历史、当前节目礼物数量及双端星舰实时动画。操作与跨 schema 回滚见 §7.8；线上结果见 [D-071 验收](./D071_GIFT_EXPERIENCE_ACCEPTANCE.md)。
>
> D-067（2026-09-07，已部署；453/453，浏览器及 OBS 验证范围见记录）：本次用户要求覆盖早期“无手机音乐、手机不显示公共弹幕、节目态只能透明”的限制。新版默认节目星海底图，OBS 表演视频用 `/screen?media=overlay`；节目切换显示标题及节目单表演者后 8.5 秒淡出。手机匿名实时弹幕与大屏共用服务端审核，五种单色免费、三种渐变各 10 动力本场解锁一次。余额仍为 100；每个表演首礼减免最多 10 动力，不可重复领取、不跨节目积攒减免。开场音乐是原创 Web Audio 轻钢琴音色，点按开启、切节目淡出；未打包或下载《星际穿越》原声。字体保留已认可方案 C。数据库新增 schema 16，升级保留业务状态，必须先停本项目服务并建立验证备份。最终验收见 [本轮记录](./D067_OVERNIGHT_ACCEPTANCE.md)。

> 服务器内测入口为 `https://sysuzgxytj.top/welcomeparty/`，独立合成库已应用 21 项节目单并升级至 schema 17。主持/导播按 [`INTERNAL_TEST_20260906.md`](./INTERNAL_TEST_20260906.md) 操作，但开始前必须读取后台当前 mode/status/scene，不假设仍是“待开始”；Nginx、systemd 和回退范围见 [`INTERNAL_SERVER_HANDOFF.md`](./INTERNAL_SERVER_HANDOFF.md)。现有本机正式库仍未升级。

> D-061 本场节目接入（2026-09-06，历史实施时点）：21 项目录与串场限制在当时以 schema 15 实现，14→15 维护仍见 §7.6。当前代码目标是 schema 17，16→17 礼物升级见 §7.8；不能对旧库直接启动新代码或运行通用迁移。竞拍继续占位，线上游戏未实现。

> 状态：本手册覆盖协议 v2 的本地开发、合成排练、自动验证、现场预览与维护操作；D-056 正式服务器安装、更新、回滚及上线检查详见 [`SERVER_DEPLOYMENT.md`](./SERVER_DEPLOYMENT.md)。v1 六阶段手册已归档至 [`archive/v1-runbook.md`](./archive/v1-runbook.md)。协议细节以 [`PROTOCOL_V2.md`](./PROTOCOL_V2.md) 为准。

## 1. 适用范围

- 参与者端 `/welcome`、共用后台 `/admin`、展示端 `/screen`；
- 本地服务、SQLite 持久化、HTTP 命令与 WebSocket 事件；
- 固定合成 Demo、可共享合成排练与 D-054 受保护正式名单；三者必须使用不同数据库、凭据和启动入口；
- 正式名单已经本地导入；D-056 已提供单机生产启动、Caddy/systemd、持久化与备份/恢复工具，但实际服务器、HTTPS origin、实体 NFC 写卡、印刷与数据治理签核仍是上线门。

## 2. 快速开始

```bash
pnpm install --frozen-lockfile   # 首次
pnpm dev                         # 合成 Demo：检查数据基础 + 后端 + 三端
pnpm dev:rehearsal               # 协作者排练：隔离合成目录，首次自动建成 v2
pnpm dev:formal                  # 正式名单：只接受已存在且验证通过的 backend/.private 配置
pnpm build:formal                # 正式前端生产构建：固化 PROTECTED UI，不打包私密数据库/凭据
pnpm test:formal:smoke           # 临时合成 PROTECTED 生产启动与 Secure Cookie smoke
pnpm test:rehearsal:smoke        # 全新临时目录验证合成排练首次初始化/启动/清理
```

启动器输出三端同源地址（手机入口、`/admin`、`/screen`）。客户端只用相对 `/api` 与同源 `/ws`，不得硬编码 `localhost`。`dev:rehearsal` 默认使用被忽略的 `backend/.rehearsal/`，首次创建固定 300 人合成技术目录并经过真实 v1 listen/clean shutdown 与一次性 v2 切换；页面明确标示纯合成排练，正式视觉参考仍为 220 人。它不读取 `.private`，已有但不完整的排练目录会安全停止而不覆盖，可用新的绝对 `REHEARSAL_RUNTIME_DIR` 重建。

`dev:formal` 从私密运行凭据读取人数，使用正式部署文案，并在后台隐藏合成重置入口；它不会打印名单、学号、令牌或管理员密码。本机默认读 `backend/.private/`，也可通过 `FORMAL_RUNTIME_DIR` 以及可选的 `FORMAL_DATABASE_PATH`、`FORMAL_RUNTIME_SECRET_PATH`、`FORMAL_NFC_MAP_PATH` 指向别处。生产服务器必须使用代码仓库外的绝对 `FORMAL_RUNTIME_DIR`，经 `pnpm start:formal` 启动；不要用开发服务器承载公网流量。

启动器为协议感知：只有完整验证通过的 `V2_ACTIVE + SYNTHETIC_DEMO|PROTECTED` 库才启动 v2 三端；只有普通 `pnpm dev` 面对明确空库或 `V1_ACTIVE` 库时才可走原 Demo 初始化。`dev:formal` 对缺失、损坏、人数不一致或误分类配置一律停止，绝不自动迁移、清空、造数或回退 v1。D-054 曾将合成 `.data` 与正式 `.private` 建立到 schema 14；这条历史记录不表示它们已升级至 D-061 要求的 schema 15。已有 v2 库由 §7.6 显式维护，新建隔离环境则直接使用 schema 15。

## 3. 开发与自动验证门

| 命令 | 作用 | 说明 |
|---|---|---|
| `pnpm test` | Vitest 单元/集成/API 回归 | 快速反馈 |
| `pnpm typecheck` | 契约 + 后端类型检查 | |
| `pnpm build` | 契约/后端/前端生产构建 | |
| `pnpm deploy:check` | 部署模板、生产/排练脚本与忽略规则静态检查 | G1/G2 已包含 |
| `pnpm test:formal:smoke` | 生产 fail-closed、loopback API 与 Secure Cookie | 仅使用 OS 临时合成 PROTECTED 数据 |
| `pnpm test:rehearsal:smoke` | 合成排练首次初始化、v2 切换与三端启动 | 仅使用 OS 临时固定合成数据 |
| `pnpm docs:check` | 文档链接完整性 + DECISIONS 倒序检查 | 文档改动后必跑 |
| `pnpm test:v2:e2e` | 三浏览器 v2 三端闭环（3/3） | 使用 OS 临时 v2 库，不碰 `.data` |
| `pnpm test:e2e:all` | 全部浏览器场景 × 3 项目 | 收口用（含 v2-journey-visual 视觉门） |
| `pnpm test:v2:load` | 300 人协议负载 | p95 < 2s 硬指标 |
| `pnpm test:v2:soak:smoke` / `pnpm test:v2:soak` | 30 分钟渲染 soak | 先 smoke 再正式 |
| `pnpm verify:v2-09` | 全量自动门 | 收口用 |

所有 v2 测试与负载只使用 OS 临时合成库，退出即清理；脱敏报告在 Git 忽略的 `tests/reports/`。

## 4. 现场预览（D-037 人工复验用）

```powershell
$env:DEMO_HOST = '本机可信局域网 IPv4'   # 只接受显式私网 IPv4，不接受泛绑定
pnpm preview:v2:field
```

- 建立隔离临时 v2 栈（后端留回环、统一 Vite 入口供三端/OBS），自动打开后台、大屏与手机验收二维码页；`Ctrl+C` 或关闭预览浏览器后临时库与端口清理，`backend/.data/` 不变。
- 手机扫码后地址栏 token 立即清除；任何界面不显示令牌文本、姓名、学号或后台密码。
- **终端检查单模式**：`$env:DEMO_FIELD_CHECKLIST='1'` 后运行同一命令，按 D-037 验收表逐项交互作答（P/F/B/S），生成被忽略的 `output/field-check/` 记录文件；最终签核仍以 [`D037_FIELD_ACCEPTANCE.md`](./D037_FIELD_ACCEPTANCE.md) 为准。

  D-057 起空白、无效输入、EOF 和中断均记为 `PENDING`，不会自动通过。开始前填写 `$env:V2_FIELD_OPERATOR`（执行人）、`$env:V2_FIELD_DEVICE`（电脑/手机系统、浏览器、OBS 版本与实际访问方式）、`$env:V2_FIELD_EVIDENCE`（脱敏证据位置）；不得在这些字段填入口令牌、口令或身份映射。报告自动记录起止时间、Git HEAD、工作树状态及源码 SHA-256。缺元数据、源码在验收中变化，或存在 F/B/S/PENDING 时退出码为 2；全部显式 P 且证据完整时退出 0，仍须负责人签核。流水线不能把“脚本退出 0”当作现场已批准。
- 后端延迟 metrics：`pnpm dev` 已默认开启（`DEMO_METRICS=1`），每 60 秒向日志输出一次路由级 p50/p95/max 直方图（仅路径模式，无查询串与正文），用于现场排障。
- 真机预检脚手架：见 [`FIELD_AUTOMATION.md`](./FIELD_AUTOMATION.md)（adb + Chrome DevTools 自动采集视口/reduced-motion 实际值与阶段截图；只读不写入，不代签）。
- 按 [`D037_FIELD_ACCEPTANCE.md`](./D037_FIELD_ACCEPTANCE.md) 在至少一台代表实际上线访问方式的实体智能手机上逐项签核当前新鲜邀请、三端局域网抽奖与 OBS 合成；品牌、型号和操作系统不作阻塞限制，当前保持 `PENDING`。[`V2_10_FIELD_ACCEPTANCE.md`](./V2_10_FIELD_ACCEPTANCE.md) 的 D-036 `PASS` 只是变更前历史基线。

## 5. 现场流程速查

本场的 21 项节目/串场、开闭场及接入建议见 [`EVENT_PROGRAM_2026.md`](./EVENT_PROGRAM_2026.md)。D-061 已提供应用预设，现场使用须按 §5.1 在本场运行库确认应用；第 20 项竞拍只保留占位，不由现有抽奖按钮执行。正式开演前应先确认后台显示的是本场已验证目录。

1. **就绪**：后台 `SET_MODE` 选择 `REHEARSAL`（排练，可跳场景）或 `LIVE`（现场，只向前）。
2. **开场**：`START` 进入 `RUNNING + ASSEMBLY`。参与者完成入场后点 `START_STAR`。
3. **节目**：`ADVANCE` → `PROGRAM_SUPPORT`；后台 `SET_PROGRAM` 选当前节目；参与者送礼/发弹幕；大屏切 OBS 透明源。中场需要抽奖时依次执行“开启抽奖大屏 → 抽取一位（可重复）→ 关闭抽奖大屏”。
4. **点亮**：`ADVANCE` → `COOPERATIVE_LIGHT`；参与者各点一次。
5. **结束**：仅 `LIVE` 在 `COOPERATIVE_LIGHT` 出现 `COMPLETE`，一次确认后服务端原子写入终态。`REHEARSAL` 只能 `PREVIEW_FINALE` 预览终章。
6. **随时**：`PAUSE`/`RESUME`（暂停时参与者只读）；弹幕处置（暂停/撤下/屏蔽来源/清屏）。暂停、换场或完成会自动关闭抽奖大屏但保留中奖记录；排练模式可由 Demo 管理员清空结果。
7. **推进警告**：`ADVANCE`/`COMPLETE` 出现就绪警告时在同一确认中明确 override；权限/旧 revision/非法组合不可 override。

D-057 操作补充：

- **抽奖**：正常大屏每位滚动约 1.8 秒，揭晓后至少停留约 1.4 秒；连续抽取会排队，后台名单可能先于舞台揭晓。等最后一位完整展示后再关闭；紧急收屏仍立即生效。刷新/重连/隐藏/reduced-motion 直接恢复持久结果，不重抽、不补播；同一 epoch 内关闭再开启仍沿用无放回记录。
- **协同点亮**：大屏显示“已点亮 / 已入场”，实时点击会更新进度和集体亮度；减少动态模式也有静态进度。晚到者进入后分母可能增加；人数全部点亮后仍由主控按现场指令结束。
- **结束确认**：同一个确认框展示不可逆说明与当前未完成项。取消不会结束；服务端另行返回未展示的新警告时才再次询问。结束后立即关闭业务写入。
- **节目切换**：第一次从集结推进到节目后，立即用“设为当前节目”启用应援；后续节目继续用该按钮换节目。每个节目结束时不要点“推进下一场景”，那会直接进入协同点亮。网页不自动播放 OBS 媒体，`PAUSE` 也不会暂停 OBS 的视频或音频。

### 5.1 本场节目单怎么用（D-061）

1. **开演前准备**：确认使用正确的合成排练/正式入口，后台为“就绪”，已取得阶段控制或全部权限。若启动时报 schema 不匹配，先按 §7.6 维护；不要删除数据库或重新导入名单。
2. **预览本场目录**：在“节目单与礼物”点击“载入本场节目单”。核对 21 项、18 表演、2 游戏串场、1 延期占位；`lovesik girls`、`群丁`、`消散对白`、`Worth it` 的 42s 保留原稿，需节目负责人确认。可在预览内改名、上下移动、添加或移出；未点击“确认应用 21 项”不会改变现场。自定义 JSON 同样只进入预览，格式为 `{label, items:[{id, order, title, kind, formatLabel, durationLabel}]}`，类型取 `PERFORMANCE/INTERLUDE/DEFERRED`，顺序从 1 连续；稳定 `id` 不随排序更换。
3. **确认应用**：检查变更数量后应用。两个主控同时编辑时，旧预览会被禁用，重新打开最新目录后再调整。开始活动后目录不可改；“暂停”也不会重新开放编辑。
4. **进入节目应援**：完成开场/集结后，推进到节目应援，点击“开始首个节目”。每个节目结束后点“切换到下一项”，或从下拉框选指定项并“设为当前节目”。手机节目单会标出当前和接下来。
5. **串场**：第 7、14、20 项必须照常切为当前项。切入后礼物关闭、上一节目热度停止增长，弹幕仍按原开关/审核规则工作；主持人组织线下互动。竞拍和线上猜歌/答题没有实现，不能用抽奖代替竞拍。切到下一表演时礼物恢复。
6. **抽奖**：仍是独立的“开启抽奖大屏 → 抽取 → 等揭晓 → 关闭”。本场 Word 没有明确轮次与名额，必须按现场确定的 Cue 执行；关闭后检查当前节目是否正确。
7. **最后节目之后**：确认第 21 项《光年之外》实际结束，才点“推进下一场景”进入协同点亮。该按钮会离开整段节目应援；现场模式无法返回。后台确认会提醒尚有下一项，但允许主控按实际演出提前结束，不能把此提醒当作自动完成判定。
8. **结束**：主持人带观众点亮，确认可以收束后进行结束语（原稿约 2 分钟），再由主控“结束并锁定终章”。先结束会立即关闭手机写入。电影片尾仍待细化，网页不控制 OBS 声音或媒体。

合成排练重置会清本轮互动并进入新 epoch，但保留已经维护的节目目录与稳定 ID；正式库没有重置入口。演出时长只作提示，不自动切节目或场景。

### 5.2 大屏动效和弹幕排查（D-066）

1. OBS 浏览器源使用 `https://sysuzgxytj.top/welcomeparty/screen`，默认就是完整动效，也可显式追加 `?motion=full`。宽高设为 1920×1080、帧率 60，并保持来源可见、电脑不休眠。节目阶段网页变透明，由下方节目视频/背景源提供画面。
   **每次发布新前端后，在 OBS 选中“浏览器”来源，点击预览下方的“刷新”；也可打开来源“设置”，点“刷新当前页面缓存”。** 已经打开的 OBS 浏览器源会继续运行旧页面，刷新后台或手机不会替它加载新版本。2026-09-06 本机曾出现服务器已更新、OBS 仍显示旧版静态银河的情况；直接刷新该来源后恢复，未重启 OBS 或清场。
2. 需要确认模式时，临时打开 `/welcomeparty/screen?settings=1`，应显示“完整动效”和“大屏实时已连接”。设置可选完整、跟随系统或静态，选择保留在当前 URL；检查后点“隐藏设置”，避免面板投到舞台。Windows 关闭系统动画不会再禁用默认大屏，手机仍尊重各自系统设置。
3. 检查弹幕时，后台必须为“运行中 + 02 节目应援”，抽奖和终章预览已收起，银河转场已结束。用手机重新发送一条合规消息并确认后台收到。弹幕不依赖人数门槛；大屏刷新不会重播已发送内容，其他场景也不会积攒后补播。
4. 完整模式应看到正文从右向左移出。主动选“静态显示”时，正文在固定区域显示约 10～12 秒，最多同时 3 条；这不代表弹幕投递失败。优先检查页面连接和模式，不要为排查弹幕重置整场。
5. 切出页面、刷新、重连、暂停或紧急收屏会收束临时动效，恢复时显示当前权威状态。已完成后的刷新保留结束画面，已抽结果保留，过期镜头不补演；需要验证完整转场时由主控安排下一次真实切场。断网、休眠、OBS 停用来源和 GPU 故障不属于可保证完整播放的条件。

## 6. 故障与处置

| 状况 | 动作 |
|---|---|
| 手机断线 | 客户端禁写 + 离线提示；重连先拉权威快照，不自动补交 |
| 大屏断线 | 保留最后可信快照 + 断线状态；重连以完整快照校正 |
| 后台断线 | 停止控制命令，重新登录读取当前状态后再操作 |
| 服务重启 | 三端快照一致、`resetEpoch` 未意外变化 |
| 内容失控 | 暂停新弹幕 / 紧急清屏；已删内容重连不恢复 |
| 动效失败 | 关闭装饰层；静态标题/状态/数值完整 |

## 7. 维护门（破坏性操作，仅维护窗口）

### 7.1 v1→v2 一次性切换（✅ 已于 2026-08-15 对实际 `.data` 执行，见 D-034）

一次性、不可逆；先把所有旧版后端进程停干净（PID/端口/文件句柄人工核验），再按顺序：

```bash
pnpm exec tsx backend/src/cli/v2-switch.ts --backup <尚不存在的绝对路径.sqlite> --confirm SYNTHETIC_DEMO_DATA_IS_DISPOSABLE
pnpm db:v2:verify
```

检查单（全部满足才执行；权威细节见 PROTOCOL_V2 §10.2）：

- [ ] `.data` 是可丢弃的固定 300 身份合成 Demo 干净基线（无真实/有价值数据）。
- [ ] 停旧服务 → 应用 `0008` → 用当前代码成功启动一次 v1 服务并真实 `listen` → 同代服务干净关闭 → 再次核验无进程占用。
- [ ] 备份父目录已存在、备份目标不存在；切换后记录备份绝对路径与 SHA-256。
- [ ] 失败时整体恢复 v1 备份 + 同版 v1 代码，禁止手工拼表、禁止 v1/v2 混跑。

**回滚 WAL 卫生（2026-08-15 演练教训）**：SQLite 以 WAL 模式运行，服务被强杀后会留下 `demo.sqlite-wal/-shm`。恢复备份前必须：停干净所有后端进程 → **删除 `backend/.data/demo.sqlite-wal` 与 `-shm`** → 再覆盖主文件，最后 `pnpm db:verify` 复核；否则残留 WAL 可能与备份同盐而被重放，把旧 v2 事务并进恢复后的 v1 库。2026-08-15 已实际演练"恢复 v1 → v1 验证 → 再次切换 v2"并成功（D-034/D-035）。

### 7.2 合成 schema 12 显式升级（D-054 历史为 12→14，D-061 当前入口为 12→15）

这是一次显式维护操作，不是 `pnpm dev` 的自动步骤。先停止所有 Demo 后端并人工核验端口、PID 与数据库文件句柄，再选择一个**父目录已存在、目标文件尚不存在、且与活动库不同**的绝对备份路径：

```powershell
pnpm db:v2:upgrade -- --backup 'D:\path\to\demo-before-schema-15.sqlite' --confirm SYNTHETIC_DEMO_DATA_IS_DISPOSABLE
pnpm db:v2:verify
```

升级入口只接受：`V2_ACTIVE + SYNTHETIC_DEMO`、固定 300 身份种子、完整性通过、无未知表或 v1 可变事实、schema 与迁移 `0001`～`0012` 精确一致、仓库待应用迁移恰为 `0013`/`0014`/`0015`。它先创建并校验 schema-12 SQLite 备份与 SHA-256，再取得写锁，在同一事务内应用三项迁移并执行完整 schema-15 v2 验证；任一步失败都回滚活动库并保留备份。禁止对真实、受保护、不可重建或有保留价值的数据执行。本次成功备份 SHA-256 见 D-054。

升级完成后记录：活动数据库绝对路径、备份绝对路径与 SHA-256、升级前后 schema 版本、`resetEpoch`、验证命令结果。恢复备份时同样遵守 §7.1 的 WAL 卫生，且必须配套恢复 schema-12 代码；不得把 schema-12 备份交给 schema-15 服务继续写入。D-054 记录的实际 12→14 操作保持历史性质；本轮没有再次操作实际 `.data`。

### 7.3 v2 维护级合成重置（仅验证通过的 `V2_ACTIVE` 库）

```bash
pnpm exec tsx backend/src/cli/v2-reset.ts --confirm SYNTHETIC_DEMO_DATA_IS_DISPOSABLE
pnpm db:v2:verify
```

这是维护 CLI，不是现场操作；现场重置用后台 `RESET_DEMO`（`DEMO_ADMIN`/`ALL` + 确认 + 合成数据硬门）。

### 7.4 受保护名单导入、验证与 NFC 定稿

正式导入只允许写入三个**尚不存在**且位于 Git 忽略目录的目标：SQLite、运行凭据 JSON、NFC 映射 CSV。导入器从 stdin 接受 `schemaVersion=1`、源文件 SHA-256 和最多 300 组 `displayName/studentNumber`；当前 220 人目录已经完成，无需重复导入。任何重跑都必须使用全新的隔离目标，禁止覆盖现存正式库：

```powershell
Get-Content -LiteralPath '<私密 roster-input.json>' -Raw |
  pnpm db:roster:import -- --database 'backend/.private/2026-roster.sqlite' `
    --secret 'backend/.private/2026-runtime-secret.json' `
    --nfc-map 'backend/.private/2026-nfc-map.csv'

$env:DEMO_DATABASE_PATH = '.private/2026-roster.sqlite'
$env:DEMO_SEED_MANIFEST_PATH = '.private/2026-runtime-secret.json'
$env:DEMO_SEED_PARTICIPANT_COUNT = '220'
pnpm db:v2:verify
```

导入输入和映射均含个人信息，只能在本地私密目录短期保管；源适配阶段只能抽取姓名、学号，不得带入性别/班级。当前映射先保留相对 `/welcome?token=…`。正式 HTTPS origin 确认后生成**新的**定稿文件，原映射不覆盖：

```powershell
pnpm db:nfc:finalize -- --input 'backend/.private/2026-nfc-map.csv' `
  --output 'backend/.private/2026-nfc-map-final.csv' `
  --public-origin 'https://正式域名'
```

当前生产路由只接受无路径 origin；定稿文件中的每一行会在正式启动前与数据库中的序号、姓名、学号 HMAC、随机令牌摘要和公开星号自动对账，且 URL origin 必须与 `FORMAL_PUBLIC_ORIGIN` 精确一致。写卡前仍须随机抽检“学号→卡片→本人私有档案”映射；标签和二维码只写完整 HTTPS URL，不写姓名、学号。丢卡/补卡必须撤销旧令牌并重新发卡；当前撤销操作流程仍待负责人现场定稿。正式库没有重置入口，恢复只允许使用同代完整数据库+运行凭据+NFC 映射备份，不得借 `RESET_DEMO` 清场。

### 7.5 正式一致性备份与全新目录恢复

正式备份不是把正在运行的 `.sqlite` 直接复制到 Git 或共享目录。它必须同时保存数据库、同代运行凭据和 NFC 映射，并生成逐文件 SHA-256 manifest：

```powershell
pnpm db:formal:backup -- --database '<正式 sqlite>' `
  --secret '<正式运行凭据 json>' `
  --nfc-map '<正式 NFC 映射 csv>' `
  --output-dir '<仓库外、尚不存在的绝对备份目录>' `
  --confirm CREATE_VERIFIED_PROTECTED_BACKUP
```

备份器先验证源库为完整 `V2_ACTIVE + PROTECTED`，逐行核对 NFC 映射与数据库/运行凭据，使用 SQLite 在线 backup 生成一致快照，把输出数据库规范化为无 `-wal/-shm` 依赖的单文件，再复验协议、schema、人数和完整性。输出目录存在、位于仓库内或确认串错误时拒绝。备份包仍含姓名/学号摘要、令牌与口令材料，只能最小权限、加密、离机保管，不得上传 GitHub 或普通协作盘。

恢复只写到全新的仓库外目录，不覆盖活动库：

```powershell
pnpm db:formal:restore -- --bundle-dir '<已验证备份目录>' `
  --output-dir '<仓库外、尚不存在的恢复目录>' `
  --confirm MATERIALIZE_VERIFIED_PROTECTED_BACKUP
```

恢复器会在创建目标前核验 manifest、长度、SHA-256、SQLite 完整性与 `PROTECTED` v2 基础，复制后再次全量验证。真正切换时先停服务，确认没有第二个写者，把 `FORMAL_RUNTIME_DIR` 改为新目录，再启动并复核；旧目录保留到人工签核。生产服务器应运行编译后的 `node backend/dist/cli/formal-backup.js` / `formal-restore.js`，完整步骤见 [`SERVER_DEPLOYMENT.md`](./SERVER_DEPLOYMENT.md) §3.3 与 §6。

### 7.6 D-061 已有 v2 schema 14→15 节目目录升级

本入口同时接受完整验证通过的 `SYNTHETIC_DEMO` 或 `PROTECTED` schema 14，保持身份、令牌、epoch、动力、奖励、礼物和中奖记录。它不运行名单导入/重置，不直接导入本场节目；升级后在 READY 中按 §5.1 应用目录。处于 RUNNING 的活动会被拒绝；已有演出须先暂停，再停服务。PAUSED/COMPLETED 可保留历史完成 schema 升级，但不会开放目录编辑。

1. 停止所有访问目标库的服务，核对进程/端口/文件占用；命令中的停服确认是维护人的承诺，程序不能证明外部服务已经停止。
2. 为本次维护明确设置数据库、同代种子/运行凭据路径和准确人数。正式路径沿用已配置的私有运行目录，不能套用合成 Demo 默认值。备份父目录先按该数据等级设好访问权限；备份文件必须尚不存在，且与活动库不同。

```powershell
$env:DEMO_DATABASE_PATH = 'D:\实际私有运行目录\目标.sqlite'
$env:DEMO_SEED_MANIFEST_PATH = 'D:\实际私有运行目录\对应运行凭据或合成manifest.json'
$env:DEMO_SEED_PARTICIPANT_COUNT = '220' # 以目标库实际人数为准；固定合成排练为 300
pnpm db:v2:catalog-upgrade -- --backup 'D:\实际私有备份目录\before-catalog-15.sqlite' --confirm V2_SERVICES_STOPPED
pnpm db:v2:verify
```

3. 升级先创建一致性 SQLite 备份，检查协议/完整性、SHA-256 和并发写入，再在单事务中应用 `0015` 与全量复验。失败回滚并保留备份；旧备份不会覆盖。POSIX 备份文件权限设为 `0600`；Windows 依赖私有父目录 ACL。凭据/NFC 文件不变，仍按 §7.5 同代保管，单库备份不得当作完整正式备份包。
4. 记录目标路径、备份路径/SHA-256、schema、epoch 和验证结果，再启动新代码。回滚先停服，把备份恢复至全新私有目录并配套 schema-14 代码和原同代凭据/NFC；不要热覆盖主库或复用活动 WAL。演出中已有记录不得靠重置转回 READY。

schema 15 将旧节目定义和热度复制到 `v2_program_catalog`，并保留礼物关联；名单种子目录继续独立。旧受保护身份指纹按导入时的零热度计算，热度变化不再误判身份目录损坏；schema-15 热度另与礼物账本核对。本轮工具和案例只在临时合成库执行；实际合成/正式库维护仍未执行。

### 7.7 D-065 统一正式星号（未启用名单，保持原 schema）

规则为“姓氏首字母大写 + `-` + 学号后四位”，例如 `Z-0123`；数字前导零保留。姓氏解析使用固定版本 `pinyin-pro` 的[姓氏模式](https://pinyin-pro.cn/use/pinyin.html)，复姓取一个首字母；`单于` 的首音另作明确处理。英文登记名默认取开头字母，新导入可提供 `surnameInitial` 指定。重复编号会报告源名单行号并拒绝写入，不静默更换规则。

已有名单更新只接受 `PROTECTED + READY + 无场景 + 无参与者/会话/运行记录` 的离线数据库。先停止对应正式服务，保留原始邀请和账户，不重建名单；默认命令只预览：

```bash
pnpm db:roster:star-ids --database backend/.private/2026-roster.sqlite --secret backend/.private/2026-runtime-secret.json --nfc-map backend/.private/2026-nfc-map.csv --journal backend/.private/d065-star-id-journal.json
```

确认完整目录无重号后，追加 `--apply` 应用；同一组路径追加 `--rollback` 可按改号记录回退。应用所用 journal 必须是未存在的新路径，重试已经完成的当前规则先用只读预览核对 `changedCount: 0`。命令只打印人数、变更数量、schema 和状态，不打印姓名、学号或令牌。

更新在 SQLite 事务中同步身份目录和预分配星位的星号，并刷新目录指纹；私密文件通过同目录原子替换更新，NFC 表只改变星号列，运行凭据只改变一致性指纹。journal 记录旧/新星号、内部 ID、源指纹与不可逆校验值，不含姓名、完整学号、密码或邀请 URL；不要把私有 journal 放入 Git。常规写入失败恢复原文件并回滚数据库；若进程在文件替换与提交之间中断，保持停服并执行上述 `--rollback`，它会核对原有文件内容守卫后恢复一致版本。不得在已有参与或运行记录后强制改号。

2026-09-06 已对本机 220 人正式库完成更新，复核 `changedCount: 0`，schema 仍为 14，未做节目目录升级或把正式名单上传服务器。以后启用正式运行仍按 §7.6 升级 schema 15。今晚服务器的 300 人合成账号已符合本规则，继续使用原邀请。

### 7.8 D-071 schema 16→17 礼物体验保留升级

本入口同时接受完整验证通过的 `V2_ACTIVE + SYNTHETIC_DEMO|PROTECTED` 精确 schema 16，并保留身份、会话、epoch、运行 tuple、动力、星光、节目热度、礼物、弹幕、抽奖和审核事实。升级不要求把活动改回 `READY`，但必须先停止所有访问目标库的服务并确认没有第二个写者；命令本身的 `V2_SERVICES_STOPPED` 只记录维护人的确认，不能代替进程和文件占用核验。

```powershell
$env:DEMO_DATABASE_PATH = 'D:\实际私有运行目录\目标.sqlite'
$env:DEMO_SEED_MANIFEST_PATH = 'D:\实际私有运行目录\对应运行凭据或合成manifest.json'
$env:DEMO_SEED_PARTICIPANT_COUNT = '300' # 以目标库实际人数为准
pnpm db:v2:gift-upgrade -- --backup 'D:\实际私有备份目录\before-gift-17.sqlite' --confirm V2_SERVICES_STOPPED
pnpm db:v2:verify
```

升级器要求目标、manifest、人数和全新备份路径显式配置；先创建一致性 SQLite 备份并核验完整性/SHA-256，再取得写锁、二次检查并在单事务中应用 `0017_v2_gift_experience.sql`。迁移暂存并逐行恢复旧礼物目录与 v1/v2 礼物交易，因此旧交易按发生时的实际面值保留，不重算余额、节目热度或奖励。失败回滚数据库事务并保留备份；POSIX 备份权限为 `0600`。

schema 17 的活动礼物目录严格为 1/5/10/20，每次完整扣除。schema 16 的 `PROGRAM_ALLOWANCE` 行只保留审计，新代码不读取、不新增；首次有效送礼的星光成长奖励仍独立发放，不抵扣动力。旧持久化 `program.changed` 事件可能含 50 面值，协议只为读取这些历史事件保留兼容，不能据此恢复旧活动目录。

跨 schema 回退必须停服，先单独保留升级后 schema 17 库，再把升级前备份恢复到全新或已核验的私有运行路径，并配套切回 schema 16 代码与同代 manifest/NFC。升级后新增的互动事实不得静默丢弃；需要保留时先制定数据处理方案，不能只切换 release 链接。

## 8. 安全红线

- 真实名单只在已授权的私密导入通道和正式运行库中处理；禁止在测试、截图、日志、Issue、提交或聊天回显中展示姓名、学号、令牌、口令或映射行。
- 日志不记录完整令牌、学号、Cookie、密码、抽奖身份映射或弹幕正文。
- 测试、预览与截图使用 OS 临时库或 `backend/.data/` 合成 Demo；`backend/.private/` 只由正式导入、验证、备份和 `pnpm dev:formal` 接触。
- 协作者优先使用 `pnpm dev:rehearsal`；不得为了“拿到同样效果”复制真实 `.private`、备份包或正式 NFC 映射。
- 局域网 HTTP 不提供传输机密性；正式公网必须由 Caddy 或经审查的等价反向代理提供 HTTPS/WSS，后端只监听 loopback，会话使用 `Secure + HttpOnly + SameSite=Lax` Cookie。
- 正式数据位于代码目录之外；release 更新不得覆盖持久目录。当前 SQLite 仅允许单后端实例，不得放网络共享盘或横向扩容写实例。
- 未授权不提交、不推送。

## D-096 / D-097 颁奖舞台与动力榜维护（schema 19 / 20→21）

此操作独立于本地开发。线上仍保留 D-095 场次；先停止本项目服务，使用明确的外部数据库、配套凭据路径与全新数据库备份路径，执行 `pnpm db:v2:awards-upgrade --backup <全新备份路径> --confirm V2_SERVICES_STOPPED`。入口校验精确 schema 19、源库和 SHA-256 备份，连续应用 20、21，升级失败回滚事务。新增奖项表、舞台状态与动力调整审计，保留身份、历史礼物、原目录、活动 epoch；将既有《光年之外》的礼物开关关闭，旧手填节目奖收起后改用有效动力值前三名。新 25 项目录只在 READY 状态由主控载入，不能借升级覆盖正在运行的目录。

已有 D-096 本地 schema 20 的库使用 `pnpm db:v2:ranking-upgrade --backup <全新备份路径> --confirm V2_SERVICES_STOPPED`，只完成 20→21，采用同样的显式目标、源库校验和独立备份要求。节目调分不修改原始送礼或参与者余额；新epoch按原始当前账目重新开始计分，旧调整保留审计。

合成排练复位保留校园奖配置与名单，收起已揭晓内容并开始新的舞台 epoch；正式数据不走 Demo 复位。详见 [动力榜与舞台操作](./D097_PROGRAM_RANKING_AND_STAGE.md)。
