# v1 运行手册（归档）

> 来源：`docs/RUNBOOK.md` 2026-08-13 版本。只用于理解 v1 六阶段运行时；现行运行手册见 [`../RUNBOOK.md`](../RUNBOOK.md)。

## 1. 启动与地址（v1）

- 根目录 `pnpm install --frozen-lockfile`，验证 `pnpm verify:g4`，日常 `pnpm dev`。
- 启动器输出 `WELCOME_URL`、`ADMIN_URL`、`SCREEN_URL`、`WELCOME_QR`（带固定合成令牌）、`DEMO_ADMIN` 提示。
- 客户端只用相对 `/api` 与同源 `/ws`；LAN 地址可用 `$env:DEMO_HOST` 指定；启动器不修改防火墙。

## 2. 运行状态与六阶段（v1）

- `mode=REHEARSAL|LIVE`、`status=READY|RUNNING|PAUSED|COMPLETED`、`stage=1..6`。
- 排练可跳阶段，现场只能开始、暂停、恢复、向前推进和完成；每次变更递增 `stageRevision`，重置递增 `resetEpoch`。
- 六阶段：身份激活 → 私密未来寄语 → 星星启动 → 节目应援与弹幕 → 协同点亮 → 星际档案。

## 3. 公共内容处置（v1）

- 弹幕经本地规则后即 `PUBLISHED`，无预审；后台可删除单条、屏蔽来源、暂停新内容、紧急清屏（需确认）。
- 下屏内容重连后不恢复；AI 审核仅预留接口。

## 4. 断线与恢复（v1）

- 手机断线：禁写 + 离线提示；重连先拉权威快照，不自动补交。
- 大屏断线：保留最后可信快照 + 断线状态；重连以完整快照校正。
- 后台断线：停止发送控制命令，重新登录并读取当前状态后再操作。
- 服务重启：数据库恢复、三端快照一致、`resetEpoch` 未意外变化。
- 动效失败：关闭装饰层，静态信息完整。

## 5. v1 确定性重置

- `pnpm db:reset` 或后台重置（`DEMO_ADMIN`/`ALL` + 确认）：`resetEpoch` 递增；激活、账本、寄语、礼物、弹幕、点亮、运行记录清除；旧会话失效；固定合成身份/节目/礼物/随机令牌恢复；旧二维码仍有效。

## 6. V2-02 维护门摘要（已被 v2 RUNBOOK 取代）

v1→v2 一次性切换与 v2 合成重置的原流程已并入现行 [`../RUNBOOK.md`](../RUNBOOK.md) 与 [`../PROTOCOL_V2.md`](../PROTOCOL_V2.md) 第 10 节，此处不再重复。
