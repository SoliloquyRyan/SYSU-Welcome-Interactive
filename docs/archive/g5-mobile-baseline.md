# G5 手机端基线（归档）

> 来源：`docs/G5_MOBILE_BASELINE.md`（2026-08-14 版）。其中个人入场状态机、胶囊决定、星系与反馈规则已并入协议 v2 与现行 `VISUAL_GUIDE.md`；2.8 秒/1.2 秒镜头方案已被 D-030 金标覆盖（参考约 5.4s / 1.0s / 4.2s）。保留本文仅为追溯 D-023/D-024/G5 的 v1 起点。

## 保留要点

- 个人入场状态机：未核验 → `NEEDS_COLOR`（激活，发 100 动力 + 20 星光）→ `NEEDS_CAPSULE_DECISION`（锁色入公开星系）→ `ADMITTED`（提交或跳过胶囊）。
- 胶囊：≤80 可见字符；提交前确认"可能经筛选后以星号和星色上屏"；`SUBMITTED`/`SKIPPED` 均准入；首次提交 +20 星光；跳过可后补且只奖励一次。
- 星系：最多 300 颗真实恒星、稳定槽位、幂等 upsert；本人星突出并标注星号。
- 页面：单一液态玻璃操作坞、无六阶段线、无"实时同步"、触控 ≥44×44px、reduced-motion 静态降级。
- 动效：D-027/D-028 约 2.8 秒寻星 + 约 1.2 秒拉远方案（**已被 D-030 金标替代**，历史自动证据 `2783ms`/`2717ms`、F6→F7 `0px`、CLS `0` 仅保留原范围）。
- v1 字段映射：`demoCode→studentNumber`、`futureMessage*→capsuleMessage*`、`publicStarId`、`visualSeed`、`displayName`、`starTemperatureKelvin` 等。
