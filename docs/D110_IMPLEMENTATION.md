# D-110：统一手机背景、取消爆发转场与互动一自动抢答

2026-09-18，本地实现与自动化验收记录。基线为已发布的 D-109 行为；本轮没有重置正式场次、清空数据库或发布服务器。

## 范围与数据边界

- D-109 的正式名单、工作人员账号、游客规则、节目目录和恢复点继续保留。
- 数据库迁移为 schema 23 → 24，只增加互动音频布置、服务器倒计时和抢答结果字段；旧交易、互动和轮次事实保持可读。
- `pnpm db:v2:audio-upgrade` 仅用于停止服务后的受保护数据库副本，要求显式数据库路径、迁移路径、`--backup` 和 `--confirm V2_SERVICES_STOPPED`，先创建校验备份。它不会自动执行，也不会重置当前正式轮次。
- OBS 桥接令牌、OBS 密码、音频本机路径和正式名单不进入仓库。网页只看到稳定 `trackId`、桥接状态和服务器生成的倒计时。

## 已实施行为

### 手机与公共大屏

- `/welcome` 的入场、等待、节目、节目单、档案和结束页共用 `phone-mist-city.svg` 竖版底层；不再按节目替换城市底图。
- 首次成功入场只播放个人流星：从边缘进入屏幕中央，汇成已锁定星色后淡出。刷新、重连、页面隐藏、跳过和减少动态效果直接呈现静态个人星色。
- 手机平时不绘制全场观众星。服务器仍保留真实星位，礼物确认时只让对应隐藏星短暂闪光。
- 大屏收到服务器场景状态后直接显示主题或节目背景，已移除爆发、超新星、星海坍缩和 12 秒显影转场。`COMPLETED` 公共画面只保留“感谢你的参与”，不叠加按钮、礼物、弹幕或互动卡片；完整片尾仍只供主持预览和后台排练使用。

### 互动一与 OBS

现场顺序固定为：

**布置题目 → OBS 播放 `mix` → 检测开始 → 服务器倒数 10 秒 → 抢答开放 → 首次抢到自动暂停 → 答错续播并继续抢 → 答对或主控关闭。**

- 可选音频只有 `b2-eason`、`r2-jj`、`r3-gem` 三个 `mix`。`hint`、`answer`、普通节目音乐和 R5 缺失素材不会触发抢答。
- 布置命令绑定当前轮次、互动 A、`trackId` 和 OBS `inputUuid`。桥接事件还必须带一次性 `armId`、`eventId`、轮次和输入 UUID；旧轮次、重复事件、未布置或输入不匹配均拒绝。
- 开始事件由服务器生成 `opensAt = startedAt + 10s`。倒计时期间 `BUZZ_IN` 被拒绝，达到时间后第一位有效响应锁定并产生 PAUSE 动作。
- 主控判错后产生 RESUME 动作，保留同一音频轮次并立即开放下一次抢答；同一身份可以再次响应。自然播放结束只把音频状态标为 `ENDED`，不会替主控关闭互动。
- 桥接断开或音源不可用时，后台显示“自动触发不可用”，不会伪造开放状态。音频层不驱动普通节目光尘。

## 文件索引

- 合约与迁移：`packages/contracts/src/protocol-v2.ts`、`backend/migrations/0024_audio_buzzer_and_mobile_visuals.sql`。
- 服务端状态与命令：`backend/src/services/v2-runtime-commands.ts`、`backend/src/services/v2-audio-bridge-state.ts`、`backend/src/app.ts`。
- OBS 桥接：`scripts/obs-audio.mjs`、`scripts/obs/interaction-audio.mjs`；启动入口为 `pnpm obs:audio`，只读检查为 `pnpm obs:audio --check`。
- 手机与大屏：`frontend/src/assets/star-city/phone-mist-city.svg`、`frontend/src/components/ProgramStageBackground.vue`、`frontend/src/components/PersonalEntryMeteor.vue`、`frontend/src/pages/student/V2WelcomeExperience.vue`、`frontend/src/pages/screen/V2ScreenExperience.vue`。
- 主持材料源：`docs/HOST_CUE_GUIDE.md`、`scripts/build-host-cues.mjs`。既有 D-109 录像仍是历史素材，不冒充本轮真实 OBS 音频演练。

## 已验证与待现场验证

已验证：

- 61 个测试文件、543 项单元／集成测试通过；覆盖 schema 24、音频布置、10 秒服务器倒计时、答错续播、同人再次抢答、自然结束不关题、手机统一背景和完成页文案。
- 合约、后端和前端构建及类型检查通过；`node --check scripts/obs-audio.mjs` 通过。
- `pnpm obs:audio --check` 已连接本机 OBS 32.2.1／WebSocket 5.7.4，确认鉴权、媒体状态与动作接口可用；当前 OBS 场景尚未配置三组 `mix` 输入，因此输出 `interactionTracks: []`。这项检查没有播放、暂停、切场或修改 OBS。

待现场验证：

- 在受保护 OBS 素材目录配置三组 `mix`，实际演练开始、重播、停止、暂停、续播和普通节目误触发检查。
- 微信真机软键盘、安全区域与减少动态效果，调音台输入以及场馆 LED 的延迟和观看距离。
- 1920×1080 大屏与 390×844 手机截图／录屏以及正式 30 分钟 OBS 运行对照。

## 恢复索引

保留 D-109 恢复索引和 schema 23 数据。若本地验收失败，停止使用新桥接入口，按 D-109 恢复文档切回配套代码与排练配置；不要让旧程序直接读取 schema 24 正式库。