# 运行手册（v2 现行）

> 状态：本手册覆盖协议 v2 的本地开发、自动验证、现场预览与维护操作。v1 六阶段手册已归档至 [`archive/v1-runbook.md`](./archive/v1-runbook.md)。协议细节以 [`PROTOCOL_V2.md`](./PROTOCOL_V2.md) 为准。

## 1. 适用范围

- 参与者端 `/welcome`、共用后台 `/admin`、展示端 `/screen`；
- 本地服务、SQLite 持久化、HTTP 命令与 WebSocket 事件；
- 只使用固定合成数据；实体 NFC、印刷、公网、真实名单属于正式版延期事项。

## 2. 快速开始

```bash
pnpm install --frozen-lockfile   # 首次
pnpm dev                         # 一条命令：迁移 + 种子 + 后端 + 三端，输出 URL/二维码/后台提示
```

启动器输出三端同源地址（手机入口含二维码、`/admin`、`/screen`）与共用 Demo 账号提示。客户端只用相对 `/api` 与同源 `/ws`，不得硬编码 `localhost`。

启动器为协议感知：`V2_ACTIVE` 合成库直接启动 v2 三端（迁移由一次性切换完成）；v1 库走原 `db:setup` 路径。`.data` 已于 2026-08-15 切换为 v2（D-034）。

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

## 4. 现场预览（V2-10 人工验收用）

```powershell
$env:DEMO_HOST = '本机可信局域网 IPv4'   # 只接受显式私网 IPv4，不接受泛绑定
pnpm preview:v2:field
```

- 建立隔离临时 v2 栈（后端留回环、统一 Vite 入口供三端/OBS），自动打开后台、大屏与手机验收二维码页；`Ctrl+C` 或关闭预览浏览器后临时库与端口清理，`backend/.data/` 不变。
- 手机扫码后地址栏 token 立即清除；任何界面不显示令牌文本、姓名、学号或后台密码。
- **终端检查单模式**：`$env:DEMO_FIELD_CHECKLIST='1'` 后运行同一命令，按 V2-10 验收表逐项交互作答（P/F/B/S），生成被忽略的 `output/field-check/` 记录文件；最终签核仍以 [`V2_10_FIELD_ACCEPTANCE.md`](./V2_10_FIELD_ACCEPTANCE.md) 为准。
- 后端延迟 metrics：`pnpm dev` 已默认开启（`DEMO_METRICS=1`），每 60 秒向日志输出一次路由级 p50/p95/max 直方图（仅路径模式，无查询串与正文），用于现场排障。
- 真机预检脚手架：见 [`FIELD_AUTOMATION.md`](./FIELD_AUTOMATION.md)（adb + Chrome DevTools 自动采集视口/reduced-motion 实际值与阶段截图；只读不写入，不代签）。
- 按 [`V2_10_FIELD_ACCEPTANCE.md`](./V2_10_FIELD_ACCEPTANCE.md) 逐项签核（vivo X300 新鲜邀请、三端局域网、OBS 合成）。**该人工门已于 2026-08-15 由项目负责人签核关闭（D-036）**；后续复验（代码/设备变化后）仍按本表口径执行。

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
pnpm exec tsx backend/src/cli/v2-verify.ts
```

检查单（全部满足才执行；权威细节见 PROTOCOL_V2 §10.2）：

- [ ] `.data` 是可丢弃的固定 300 身份合成 Demo 干净基线（无真实/有价值数据）。
- [ ] 停旧服务 → 应用 `0008` → 用当前代码成功启动一次 v1 服务并真实 `listen` → 同代服务干净关闭 → 再次核验无进程占用。
- [ ] 备份父目录已存在、备份目标不存在；切换后记录备份绝对路径与 SHA-256。
- [ ] 失败时整体恢复 v1 备份 + 同版 v1 代码，禁止手工拼表、禁止 v1/v2 混跑。

**回滚 WAL 卫生（2026-08-15 演练教训）**：SQLite 以 WAL 模式运行，服务被强杀后会留下 `demo.sqlite-wal/-shm`。恢复备份前必须：停干净所有后端进程 → **删除 `backend/.data/demo.sqlite-wal` 与 `-shm`** → 再覆盖主文件，最后 `pnpm db:verify` 复核；否则残留 WAL 可能与备份同盐而被重放，把旧 v2 事务并进恢复后的 v1 库。2026-08-15 已实际演练"恢复 v1 → v1 验证 → 再次切换 v2"并成功（D-034/D-035）。

### 7.2 v2 维护级合成重置（仅 `V2_ACTIVE` 库）

```bash
pnpm exec tsx backend/src/cli/v2-reset.ts --confirm SYNTHETIC_DEMO_DATA_IS_DISPOSABLE
pnpm exec tsx backend/src/cli/v2-verify.ts
```

这是维护 CLI，不是现场操作；现场重置用后台 `RESET_DEMO`（`DEMO_ADMIN`/`ALL` + 确认 + 合成数据硬门）。

## 8. 安全红线

- 只在可信本地网络运行合成 Demo；不输入/导入/截图真实姓名、学号、令牌、口令或活动数据。
- 日志不记录完整令牌、学号、Cookie、密码、胶囊或弹幕正文。
- 测试、预览与截图只用 OS 临时库；`backend/.data/` 只由 `pnpm dev` 与显式维护命令接触。
- 局域网 HTTP 不提供传输机密性；正式公网必须 HTTPS + `Secure` Cookie。
- 未授权不提交、不推送。
