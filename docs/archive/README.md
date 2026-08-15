# 归档文档（v1 历史）

> 本目录保存协议 v1（六阶段）与早期视觉迭代的历史需求、测试证据、接口参考与验收记录，仅作追溯用。
> 现行规则一律以 `docs/` 根目录的当前文档为准：入口见 [`../README.md`](../README.md)。
> 更完整的历史版本与逐次修改记录以 Git 历史为准（冻结基线提交 `63e3d5094c49a5635f4ebf7ccbd0c9da07b7d58a`，见 D-022）。

| 文件 | 内容 | 归档原因 |
|---|---|---|
| `v1-requirements.md` | v1 六阶段需求（REQ-FLOW/REQ-VALUE/REQ-MOD/REQ-ADMIN/REQ-SCREEN/REQ-NFR）与 G3 场景 | 已被协议 v2（D-025）取代 |
| `v1-test-plan.md` | v1 G0～G4 验收与负载证据（27/27、p95、G4 报告） | 已被 v2 测试计划取代 |
| `v1-runbook.md` | v1 运行手册（六阶段操作、v1 重置） | 已被 v2 RUNBOOK 取代 |
| `v1-api.md` | v1 完整接口参考（`stage=1..6`、旧路径、会话与实时边界） | 现行 API.md 只保留 v2 端点 |
| `acceptance-g0-g4.md` | G0～G4 验收记录原文（2026-08-10，含分支/HEAD 与逐项证据） | v1 历史基线 |
| `acceptance-g0-g4-d022.md` | G0～G4 提交绑定验收原文（D-022，含被验收提交 SHA 与 tree） | v1 历史基线 |
| `g5-mobile-baseline.md` | G5 手机端基线（含已被 D-030 覆盖的 2.8 秒镜头方案） | 时长与视觉已被 D-030 金标覆盖 |
| `animation-handoff.md` | 2026-08-14 手机/大屏动画协作交接 | 已被 D-030～D-032 与 `VISUAL_GUIDE.md` 覆盖 |

`docs/` 根目录仍保留 `ACCEPTANCE_G0_G4.md`、`ACCEPTANCE_G0_G4_D022.md` 两个指路桩，以兼容旧链接（DECISIONS 等历史记录中引用的路径）；原文即本目录中的 `acceptance-g0-g4.md`、`acceptance-g0-g4-d022.md`。

**历史数字使用规则**：v1 的历史通过数字（如 Playwright 27/27、G4 p95、2.8 秒等）只允许在解释 v1 实现时引用，不得当作协议 v2 或 D-030 之后视觉方案的现行证据。
