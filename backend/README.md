# 后端（合成 Demo / 排练 + 受保护正式运行）

Demo v0 的本地技术方向已经由 D-007 冻结：同仓库 Node.js/TypeScript、Fastify 5、`better-sqlite3`/SQLite（WAL）、HTTP 接口、`@fastify/websocket` 事件流，以及前后端共享的 TypeScript/Zod 契约。D-056 在此基础上确定当前正式单机基线：单个 loopback Fastify 实例、Caddy HTTPS/WSS 与静态文件、代码目录外 SQLite 私有持久化、systemd 守护和一致性备份/恢复；实际主机、域名及上线证据仍待现场执行。

D-022 历史基线与后续 v2 当前实现包括：

- 有顺序、带校验和的 SQLite 迁移（当前顶端 `0014`），以及 WAL、外键和忙等待设置；
- 300 个虚构参与者、固定虚构节目和四档礼物的本地种子；
- 独立 `PROTECTED` 正式目录：只保存 220 名获授权成员的姓名与学号用途隔离摘要，NFC 使用随机匿名令牌，且正式库不可执行 Demo 重置；
- 生产启动前验证构建产物、三项私密文件、协议/schema/分类/人数、仓库外路径、权限、唯一 HTTPS origin、loopback 监听与 Secure Cookie；失败即不监听；
- SQLite 在线一致性备份连同运行凭据/NFC 映射生成 checksum bundle，恢复只物化到全新目录；生产继续严格单实例，不支持共享盘或横向写扩展；
- `pnpm dev:rehearsal` 给协作者创建隔离固定 300 人合成技术目录，正式视觉口径仍为 220 人，且不接触正式 `.private`；
- 随机邀请令牌、合成学号和后台口令只保存在被忽略的本地 manifest，数据库仅保存安全摘要；
- 参与者与后台相互独立的 `HttpOnly` 会话、严格的同源 `Origin`/`Host` 边界，以及按本地来源隔离的失败认证限频；
- 协议 v2 三场景运行状态机、锁色直接准入、节目中场无放回个人抽奖、星星启动、四档礼物、双值账本、弹幕规则与处置、协同点亮和个人档案；
- `/api/health`、`/api/ready`、参与者/后台/大屏权威快照及全部 G2 命令接口；
- 只广播已提交事实的 `/ws`，用缓冲衔接历史补发与实时事实，按 `resetEpoch` 与 `eventSeq` 恢复；参与者失效通知持久化并按主体隔离，其他连接在同一序号只接收匿名聚合别名；
- 面向 G4 的实时扇出保护：同一事件只序列化一次；预计发送后缓冲超过 1 MiB 的慢连接以 1013 关闭并终止，避免单个客户端无限积压；
- 保持种子稳定、清理完整业务运行态、轮换会话并增加 `resetEpoch` 的确定性重置；
- 根级初始化、验证、构建、测试和局域网启动命令。

D-023 的 G5-03～G5-05 曾在 v1 引入 Kelvin 星色、胶囊候选和合成学号摘要；该实现只作历史，见 [`../docs/archive/g5-mobile-baseline.md`](../docs/archive/g5-mobile-baseline.md)。D-037 通过迁移 `0013` 退役寄语/胶囊并建立中场个人抽奖；D-054 通过迁移 `0014` 增加受保护来源证据。已有 schema-12 `V2_ACTIVE` 合成库不得自动迁移，须按 [`../docs/RUNBOOK.md`](../docs/RUNBOOK.md) §7.2 停服、先备份再显式升级至 schema 14。

> 本文描述 v1/G2 基线与历史验收；协议 v2（`V2_ACTIVE` 后）的端点与迁移以 [`../docs/PROTOCOL_V2.md`](../docs/PROTOCOL_V2.md) 与共享契约为准，运行与维护见 [`../docs/RUNBOOK.md`](../docs/RUNBOOK.md)。

常用命令（从仓库根目录运行）：

```bash
pnpm db:setup
pnpm db:verify
pnpm db:reset
pnpm db:v2:upgrade -- --backup <新绝对路径.sqlite> --confirm SYNTHETIC_DEMO_DATA_IS_DISPOSABLE
pnpm db:v2:verify
pnpm db:roster:import -- --database <新正式库> --secret <新运行凭据> --nfc-map <新私密映射>
pnpm db:nfc:finalize -- --input <相对地址映射> --output <新定稿映射> --public-origin <HTTPS origin>
pnpm db:test-accounts:export -- --output <新测试账号 CSV> --count 5
pnpm db:formal:backup -- --database <sqlite> --secret <json> --nfc-map <csv> --output-dir <仓库外新目录> --confirm CREATE_VERIFIED_PROTECTED_BACKUP
pnpm db:formal:restore -- --bundle-dir <备份目录> --output-dir <仓库外新目录> --confirm MATERIALIZE_VERIFIED_PROTECTED_BACKUP
pnpm verify:g2
pnpm test:load
pnpm verify:g4
pnpm dev
pnpm dev:rehearsal
pnpm dev:formal
pnpm build:formal
pnpm deploy:check
pnpm test:formal:smoke
pnpm test:rehearsal:smoke
pnpm start:formal
```

G2 之后的验证状态与剩余范围：

- G3 桌面浏览器端到端与故障恢复自动化已通过，项目负责人也已在 vivo X300 默认浏览器完成人工核心旅程；
- G4 已在 Windows loopback 上用 300 个固定合成参与者、301 条 WebSocket 连接完成约 123 秒混合旅程；阶段、礼物、弹幕和协同点亮 p95 均小于 2 秒，协议/业务失败及账本不变量错误为 0，301 条连接在服务重启后全部恢复；
- D-021 记录的提交前工作树根级 `pnpm verify:g4` 以退出码 0、观察总耗时约 463.2 秒完成，Vitest 20 个文件/119 条、共享契约/后端/前端构建及三浏览器 Playwright 27/27 全部通过；`tests/reports/g4-load.json` 为被忽略的脱敏本地证据。该结果不绑定任何提交。G0～G4 冻结候选提交形成后，必须在该提交的干净工作树复验，并由 D-022 记录被验收提交的完整 SHA、命令结果与工作树状态；D-022 落地前只能称为冻结候选，不能称为可复现冻结版本。该结果也不是 30 分钟 soak、分布式局域网、场馆或正式上线验收；
- 最终视觉与动效现场复验、实体写卡、实际服务器/DNS/HTTPS、私密数据传输与正式数据治理责任落名。

合成运行数据库与本地凭据存放在被 Git 忽略的 `backend/.data/`；协作排练使用 `backend/.rehearsal/`；本机正式验证可使用被忽略的 `backend/.private/`。生产正式库、运行凭据和逐人 NFC 映射必须通过 `FORMAL_RUNTIME_DIR` 指向 release/Git 之外的持久化私密目录。如果数据库与凭据缺失、指纹不匹配或 v2 schema 未升级，服务会保持未就绪，不会静默生成另一套凭据或回退 v1。不得提交真实名单、运行数据库、备份包、口令、会话、完整邀请令牌、密钥或可识别个人的导出。完整部署与恢复见 [`../docs/SERVER_DEPLOYMENT.md`](../docs/SERVER_DEPLOYMENT.md)。
