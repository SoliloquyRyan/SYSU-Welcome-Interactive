# 运行手册（v2 现行）

> 状态：本手册覆盖协议 v2 的本地开发、自动验证、现场预览与维护操作。v1 六阶段手册已归档至 [`archive/v1-runbook.md`](./archive/v1-runbook.md)。协议细节以 [`PROTOCOL_V2.md`](./PROTOCOL_V2.md) 为准。

## 1. 适用范围

- 参与者端 `/welcome`、共用后台 `/admin`、展示端 `/screen`；
- 本地服务、SQLite 持久化、HTTP 命令与 WebSocket 事件；
- 固定合成 Demo 与 D-054 受保护正式名单；二者必须使用不同数据库、凭据和启动入口；
- 正式名单已经本地导入，HTTPS origin、实体 NFC 写卡、印刷与数据治理签核仍是上线门。

## 2. 快速开始

```bash
pnpm install --frozen-lockfile   # 首次
pnpm dev                         # 合成 Demo：检查数据基础 + 后端 + 三端
pnpm dev:formal                  # 正式名单：只接受已存在且验证通过的 backend/.private 配置
pnpm build:formal                # 正式前端生产构建：固化 PROTECTED UI，不打包私密数据库/凭据
```

启动器输出三端同源地址（手机入口、`/admin`、`/screen`）。客户端只用相对 `/api` 与同源 `/ws`，不得硬编码 `localhost`。`dev:formal` 从私密运行凭据读取人数，使用正式部署文案，并在后台隐藏合成重置入口；它不会打印名单、学号、令牌或管理员密码。

启动器为协议感知：只有完整验证通过的 `V2_ACTIVE + SYNTHETIC_DEMO|PROTECTED` 库才启动 v2 三端；只有普通 `pnpm dev` 面对明确空库或 `V1_ACTIVE` 库时才可走原 Demo 初始化。`dev:formal` 对缺失、损坏、人数不一致或误分类配置一律停止，绝不自动迁移、清空、造数或回退 v1。合成 `.data` 已按 §7.2 备份优先升级至 schema 14；正式 `.private` 从新库直接初始化为 schema 14。

## 3. 开发与自动验证门

| 命令 | 作用 | 说明 |
|---|---|---|
| `pnpm test` | Vitest 单元/集成/API 回归 | 快速反馈 |
| `pnpm typecheck` | 契约 + 后端类型检查 | |
| `pnpm build` | 契约/后端/前端生产构建 | |
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
- 后端延迟 metrics：`pnpm dev` 已默认开启（`DEMO_METRICS=1`），每 60 秒向日志输出一次路由级 p50/p95/max 直方图（仅路径模式，无查询串与正文），用于现场排障。
- 真机预检脚手架：见 [`FIELD_AUTOMATION.md`](./FIELD_AUTOMATION.md)（adb + Chrome DevTools 自动采集视口/reduced-motion 实际值与阶段截图；只读不写入，不代签）。
- 按 [`D037_FIELD_ACCEPTANCE.md`](./D037_FIELD_ACCEPTANCE.md) 在至少一台代表实际上线访问方式的实体智能手机上逐项签核当前新鲜邀请、三端局域网抽奖与 OBS 合成；品牌、型号和操作系统不作阻塞限制，当前保持 `PENDING`。[`V2_10_FIELD_ACCEPTANCE.md`](./V2_10_FIELD_ACCEPTANCE.md) 的 D-036 `PASS` 只是变更前历史基线。

## 5. 现场流程速查

1. **就绪**：后台 `SET_MODE` 选择 `REHEARSAL`（排练，可跳场景）或 `LIVE`（现场，只向前）。
2. **开场**：`START` 进入 `RUNNING + ASSEMBLY`。参与者完成入场后点 `START_STAR`。
3. **节目**：`ADVANCE` → `PROGRAM_SUPPORT`；后台 `SET_PROGRAM` 选当前节目；参与者送礼/发弹幕；大屏切 OBS 透明源。中场需要抽奖时依次执行“开启抽奖大屏 → 抽取一位（可重复）→ 关闭抽奖大屏”。
4. **点亮**：`ADVANCE` → `COOPERATIVE_LIGHT`；参与者各点一次。
5. **结束**：仅 `LIVE` 在 `COOPERATIVE_LIGHT` 出现 `COMPLETE`，一次确认后服务端原子写入终态。`REHEARSAL` 只能 `PREVIEW_FINALE` 预览终章。
6. **随时**：`PAUSE`/`RESUME`（暂停时参与者只读）；弹幕处置（暂停/撤下/屏蔽来源/清屏）。暂停、换场或完成会自动关闭抽奖大屏但保留中奖记录；排练模式可由 Demo 管理员清空结果。
7. **推进警告**：`ADVANCE`/`COMPLETE` 出现就绪警告时在同一确认中明确 override；权限/旧 revision/非法组合不可 override。

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

### 7.2 D-037/D-054 schema 12→14 升级（✅ 已对实际合成 `.data` 执行）

这是一次显式维护操作，不是 `pnpm dev` 的自动步骤。先停止所有 Demo 后端并人工核验端口、PID 与数据库文件句柄，再选择一个**父目录已存在、目标文件尚不存在、且与活动库不同**的绝对备份路径：

```powershell
pnpm db:v2:upgrade -- --backup 'D:\path\to\demo-before-schema-14.sqlite' --confirm SYNTHETIC_DEMO_DATA_IS_DISPOSABLE
pnpm db:v2:verify
```

升级入口只接受：`V2_ACTIVE + SYNTHETIC_DEMO`、固定 300 身份种子、完整性通过、无未知表或 v1 可变事实、schema 与迁移 `0001`～`0012` 精确一致、仓库待应用迁移恰为 `0013`/`0014`。它先创建并校验 schema-12 SQLite 备份与 SHA-256，再取得写锁，在同一事务内应用两项迁移并执行完整 v2 验证；任一步失败都回滚活动库并保留备份。禁止对真实、受保护、不可重建或有保留价值的数据执行。本次成功备份 SHA-256 见 D-054。

升级完成后记录：活动数据库绝对路径、备份绝对路径与 SHA-256、升级前后 schema 版本、`resetEpoch`、验证命令结果。恢复备份时同样遵守 §7.1 的 WAL 卫生，且必须配套恢复 schema-12 代码；不得把 schema-12 备份交给 schema-14 服务继续写入。

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
  --public-origin 'https://正式域名/可选基础路径'
```

写卡前随机抽检“学号→卡片→本人私有档案”映射；标签和二维码只写完整 HTTPS URL，不写姓名、学号。丢卡/补卡必须撤销旧令牌并重新发卡；当前撤销操作流程仍待负责人现场定稿。正式库没有重置入口，恢复只允许使用同代完整数据库+运行凭据备份，不得借 `RESET_DEMO` 清场。

## 8. 安全红线

- 真实名单只在已授权的私密导入通道和正式运行库中处理；禁止在测试、截图、日志、Issue、提交或聊天回显中展示姓名、学号、令牌、口令或映射行。
- 日志不记录完整令牌、学号、Cookie、密码、抽奖身份映射或弹幕正文。
- 测试、预览与截图使用 OS 临时库或 `backend/.data/` 合成 Demo；`backend/.private/` 只由正式导入、验证、备份和 `pnpm dev:formal` 接触。
- 局域网 HTTP 不提供传输机密性；正式公网必须 HTTPS + `Secure` Cookie。
- 未授权不提交、不推送。
