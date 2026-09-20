# D-116 现场控制与 OBS 更新

日期：2026-09-19

## 已实施

- `scripts/obs-audio.mjs`：检测到服务端 `ARMED` 后，桥接只对同一个 `armId` 执行一次 `TriggerMediaInputAction(RESTART)`；OBS 播放开始事件仍由服务端接收并打开 10 秒倒数。重连看到 `TRIGGERED` 时不会重播。
- `backend/src/services/v2-audio-bridge-state.ts` 与 `V2AdminConsole.vue`：答案索引只通过受保护的后台音频状态接口返回。当前索引来自附件 `RECODER音频/答案.txt`，其 SHA-256 为 `B4486DDE666487351475A41551678596818BCC33BC55991F091BEE8461B32BCB`；三组 mix/answer 音频二进制与附件一致，修正的是旧索引文本。
- 控台互动一显示当前曲目答案，按钮文案改为自动播放；新增“打开节目大屏”和“打开观众网页”分窗入口。
- 手机弹幕输入增加 40 字上限、发送键盘提示、明确的连接状态文案和窄屏两列布局；保留服务端合规校验与确认流程。
- OBS 当前集合为 `迎新晚会·最新版`，当前节目场景未改变。只读复核结果：29 个场景均有 `黑色背景（本地）`，19 个场景有 `最新节目背景（网页）`，旧学院源与旧系统完整舞台均为 0 个活动场景引用/输入；最新版网页背景 URL 带 `20260919-d116` 参数。活动集合由 OBS API 写入，经正常关闭与重启后重新读取，原生配置和随附 JSON 均已清除失效旧场景项，SHA-256 一致；回滚文件保存在 `OBS-迎新晚会-20260913/backup/20260919-d116/` 与 `20260919-d116-partial/`。
- 通过正式 `/api/v2/admin/commands` 逐项上传附件榜单并重新读取快照确认：积分前 20 名 20 人，路线 3/2/1 条分别 15/5/10 人，创意奖 3 人，摄影奖 3 人；上传后奖项摘要 SHA-256 为 `fd723a5095de7f3b178967177e668fdcebe3a21e47a32b4c19c638ec9204818b`。上传前后快照保存在项目外 `backups/awards-d116/`。
- 附件《节目单(7)(2).docx》SHA-256 为 `D23123B472FA4294848035367075E7F774C27DCEF989B2B1128C5F984B0E29F6`；节目目录已按该文件核对为 25 项（19 个表演节目、6 个非表演环节），线上后台逐项顺序复核通过：互动标题带完整副标题，尾段为“节目颁奖 → 光年之外 → 负责人讲话 → 校园图鉴颁奖”。

## 发布结果

- 生产包：`20260919-d116-979da6b0d6d2`，1075 个文件，40,411,229 字节，SHA-256 `c29c7b3bb90dc50b1c42c73eb610fedf439ef00283a97a67e0d86e63df7aab51`。
- 服务器 `/opt/sysu-welcome-internal/current` 已原子切换到上述 release；暂存阶段逐文件校验、生产子路径校验和部署静态检查通过。切换前后 `resetEpoch=4`、`RUNNING`、`PROGRAM_SUPPORT`、互动一 `BUZZER_OPEN` 均保持，Nginx、晚会服务和原站点服务均为 active。
- 发布后 Chromium 复核：`/welcome`、`/screen`、`/admin` 均可加载；大屏和后台无非预期脚本错误；后台答案 API 返回 B2/R2/R3 三组答案，六类校园奖确认人数为 20/15/5/10/3/3；分窗按钮分别打开 `/screen?motion=full&media=background&audio=off` 与 `/welcome`。
- 隔离合成运行库 390×844 复核弹幕：输入框为 `maxlength=40`、`enterkeyhint=send`、`aria-describedby=barrage-composer-help`，发送按钮宽 112px、高 46px，窄屏无溢出；用合成账号发送一条测试弹幕，确认提示出现、草稿清空且消息可见。

## 验证

- `pnpm obs:audio --check`：继续通过，三组 `mix` 输入可识别。
- `tests/unit/interaction-audio.test.ts`：新增媒体自动重播动作与非法状态测试。
- `tests/integration/v2-runtime-flow.test.ts`：确认答案只存在后台桥接状态，不进入大屏快照。
- `pnpm typecheck`、正式子路径 `pnpm build:formal`、定向 41 项测试、完整 `pnpm test`（545 项）、`pnpm deploy:check`、`pnpm obs:audio --check` 与 `pnpm docs:check` 均通过；发布后远端页面已重新加载并完成浏览器控制台复核。

## 未完成的现场项

真实手机输入法、OBS 投影窗口、场馆 LED、调音台监听、微信转发和长时间连续运行仍需在现场记录。自动播放依赖本机 `obs-audio` 桥接进程在线；桥接不可用时后台按钮保持禁用并显示原因。
