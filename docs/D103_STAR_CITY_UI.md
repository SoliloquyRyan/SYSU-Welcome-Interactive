# D-103 三端星城 UI 与 OBS 音量动效

状态：本地实现与工程验证完成，OBS 实际运行数据已记录；微信真机与现场联排待确认；未发布。

## 基线与恢复

- 基线：`feature/screen-six-stage-experience` / `fb45d4c49c07cc19924ce72ce677a63fe4cc4aae`，保留 D-102 工作区清理和历史归档。
- 改造前源码、根 package.json 与受影响文档备份：`D:\Ruan\Documents\SYSU\WHCX\output\d103-ui-20260915\before-ui.zip`。压缩包中的 `src/` 对应 `frontend/src/`；文档按原文件名保存。`git-before.txt` 与 `build-before.json` 记录改造前差异和生产文件 SHA256。
- 恢复须先保存改造后的新增文件，再按备份映射恢复本轮文件；禁止对整个工作区 reset/clean，避免覆盖 D-102。

### 恢复索引的使用

1. 查看外部证据目录 `current-file-index.json` 与 `git-before.txt`，先区分 D-102 已有改动和本轮新增文件。
2. `before-ui.zip` 的 `src/` 映射到 `frontend/src/`；`package.json` 映射到根目录；其余根层 Markdown 均映射到 `docs/`（其中 `README.md` 是文档入口）。仅恢复本轮涉及的文件。
3. 本轮已有 E2E 文件的修改可与 `fb45d4c` 对照恢复；D-102 已修改的 `tests/unit/v2-mobile-state.test.ts` 不属于 UI 回退范围。新增主题、组件、CSS、桥接和专项测试先存档后再决定是否移出。
4. OBS 非秘密设置备份在 `obs/settings-before-redacted.json`。回退音量接入只需停桥接、按该文件恢复 `server_enabled`；原密码保持。原场景与配置名称有单独记录。
5. 不执行整仓 `reset`、`clean` 或覆盖历史归档；如果后续有新的本地工作，先核对差异再按文件恢复。

## 已确认的实现边界

实施中负责人进一步明确：首张城市图细节过多、分散注意力；最终采用赛博朋克加微复古，简化建筑、扩大安静留白，使用紫灰、少量青粉霓虹和轻微模拟颗粒。首稿退出运行资源，生成原件保留在 Codex 本机输出中。

- 后台：OBS 深灰蓝分区控台，公共状态预览，模式与开始、抽取结束与投票开放、已完成互动与下一节目可串行执行；发布/揭晓/终章仍明确确认，部分失败停止并显示实际进度。
- 观众侧：星河 → 雾紫星城 → 星河。主持雾蓝、节目雾紫、互动青紫、颁奖暖金紫；手机以已锁定星色个性化。视频节目使用透明边缘星光，完整城市用于伴奏节目。
- 新增本机 `pnpm obs:audio`：OBS 鉴权、当前播出媒体过滤、至多 20Hz 的 `sysu:audio-envelope` 控制事件；事件仅含版本、强度和可用状态。500ms 无新数据后用 800ms 退回环境动效。
- 业务 API、schema 21、真实人数、身份私密边界、礼物账目及发布语义沿用现有实现。
- 动效不阻塞操作；隐藏、暂停、静态、刷新、断线时收敛至当前状态。大屏 12 秒开场与手机 2.4 秒开场保持。

## 实现索引

| 内容 | 主要入口 |
| --- | --- |
| 城市主题与轻量背景 | `frontend/src/rendering/star-city-theme.js`、`components/ProgramStageBackground.vue` |
| 星点、浮尘与音频平滑 | `components/StarCityAtmosphere.vue`、`rendering/audio-envelope.js` |
| OBS 分区控台 | `pages/admin/V2AdminConsole.vue`、`PublicStagePreview.vue`、`obs-console.css` |
| 组合操作 | `pages/admin/admin-workflow.js`，沿用各独立命令，失败停止并保留已确认步骤 |
| 大屏与手机 | `pages/screen/star-city-screen.css`、`pages/student/star-city-mobile.css`，继续复用既有场景和业务组件 |
| 本机桥接 | `scripts/obs-audio.mjs`、`scripts/obs/obs-client.mjs`、`scripts/obs/audio-sources.mjs` |
| 图像来源 | [星城资产记录](../frontend/src/assets/star-city/README.md) |
| 操作 | [新版主控操作单](./LIVE_OPERATOR_GUIDE.md) |

所有前端路径均相对于 `frontend/src/`。新背景没有加入字体、运行库、视频、WebGL 引擎或外部图片请求；Vue、Canvas 与现有 GSAP 保持。

## 交互与渲染约定

- 共用主题按真实节目、舞台模式与互动状态计算：节目雾紫、主持雾蓝、互动青紫、颁奖暖金紫。星河入场、协同点亮与终章继续沿用既有轨道与真实参与者星色。
- 完整大屏使用 68 个独立装饰点；手机使用其中 19 个，降低设备像素比。透明节目叠加仅保留外缘星点，中心完全透明，舞台学院标志由节目素材与原有舞台模式管理。
- 音量控制只在 OBS Browser Source、在线、PROGRAM_SUPPORT、RUNNING、完整动效、非转场时启用。文字、卡片、票数与身份不受音量影响。窗口隐藏、暂停或退出时释放 RAF、监听器并丢弃旧音量。
- 后台预览独立加载公共 `/screen?motion=reduced&audio=off`，保持只读与静态。浏览节目仅准备选择，执行按钮才发命令。
- 模式与开始、抽取转投票、收起互动到下一项逐步读取最新快照与版本；每步的会话、代际、节目和前置状态不符即停止。不把部分成功当成事务回滚。
- 开放投票前核对 2～12 位候选与题目；投票揭晓、名单揭晓及终章仍明确确认。错误、加载和暂停保留静态星星标识。

## 本机 OBS 接入与恢复

- 实测软件：OBS 32.2.1 / obs-websocket 5.7.4；仅连接 `127.0.0.1`。
- 已启用当前 Windows 账号 OBS WebSocket 服务器，保留原有鉴权密码与端口 4455。备份只记录非秘密设置和原场景／配置名称，不复制密码。
- 使用独立 `D103 UI QA 20260916` 配置与场景，只加入合成波形媒体和本地公共大屏；未启动推流、录制或麦克风采集。验收后已关闭本轮启动的 OBS，恢复“未命名”配置和“迎新晚会·最新版”场景集合的选择。测试配置逐文件校验 SHA256 后移入外部证据目录 `obs/qa-config-archive/`，原场景和媒体保留；恢复记录为 `obs/restored.json`。WebSocket 保持启用及原有身份验证，供新版桥接使用。
- 桥接通过当前播出场景和节目素材映射过滤音源：检查嵌套场景启用状态、本地文件路径、静音、指定输出轨及仅监听路由；使用 OBS 提供的推子后 RMS，避免把峰值或未混出的音源当作音乐。
- OBS 事件接口依据 [InputVolumeMeters 协议](https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md#inputvolumemeters) 与 [obs-browser 自定义事件](https://github.com/obsproject/obs-browser#register-for-event-callbacks)。读取音量后，使用 `CallVendorRequest / obs-browser / emit_event` 发送 `sysu:audio-envelope`。
- 事件内容只含 `version`、`level`、`available`，不携带采样音频、来源路径、身份或鉴权。音乐桥接不改业务快照、API 或数据库。

## 工程验证

2026-09-16 已执行：

| 检查 | 结果 |
| --- | --- |
| `pnpm build` | PASS，143 个前端模块 |
| `pnpm typecheck` | PASS，contracts 与 backend |
| `pnpm typecheck:e2e` / `pnpm typecheck:soak` | PASS |
| `pnpm test` | PASS，55 个文件、505 项测试 |
| `pnpm deploy:check` / `pnpm docs:check` | PASS |
| `pnpm obs:audio --check --mapping <合成映射>` | PASS，鉴权、媒体匹配与浏览器 vendor request |
| Chromium 首轮专项 | 新三端与组合操作 PASS；12 项综合回归中 11 项 PASS、1 项静态弹幕测试失败；该项单独复验 PASS。后续以停止 UI 改动后的完整回归为准 |
| 三浏览器最终回归 | 按项目与用例合并最新实测：40 项 PASS、2 项按原配置跳过。新增三端／组合操作及颁奖／静态异常专项三浏览器 9 项全部 PASS；底部回执排版后 Chromium 再验 1 项 PASS |
| OBS 30 分钟连续运行 | 已完成 1,801.573 秒；平均采样渲染耗时 0.242ms，20 帧渲染丢弃（约 0.0185%）；详细范围与对照见下表，不视为零丢帧验收 |

新增单元覆盖主题优先级、音量非法值／500ms 超时／800ms 退回、串行最新版本、部分失败、代际与会话变化、重复调用、嵌套音源／路径／静音／音轨过滤。浏览器专项实际通过一次确认的双命令开始、浏览目录不切台、抽取收起后开放投票被拒时停止、单项恢复、投票揭晓确认与收起结果后进入下一项。

三浏览器综合首轮为 33 项通过、2 项跳过、1 项失败。失败发生在短暂退场期间，通用定位器同时选中原主持背景和新节目背景；已改为定位当前节目层，并等待主持层移除。随后三浏览器专项通过，原始失败与复验均保留。2 个跳过项是同一开场视觉基准按仓库既有规则仅在 Chromium 执行，Chrome 与 Edge 不重复拍摄该基准。最终摘要在外部证据目录 `browser-final-summary.json`，按测试标题和浏览器合并最近一次结果；未将首轮报告改写为全部通过。

### OBS 实际画面与性能

本机 OBS 32.2.1 / obs-websocket 5.7.4，画布、浏览器源均为 1920×1080，目标 60fps。独立合成数据库预置 300 个席位，本项未激活观众；保持节目场景、合成起伏音源。三端完整互动负载由浏览器回归另行覆盖。测量使用本地 Vite 开发服务与 QA 专用采样代理，采样脚本不进入生产前端。

| 采样 | D-102 旧版 | D-103 新版 |
| --- | ---: | ---: |
| 实际时长 | 120.092 秒 | 1,801.573 秒 |
| OBS 渲染总帧数增量 | 7,206 | 108,092 |
| 渲染丢弃帧数增量 | 0 | 20（0.0185%） |
| 渲染耗时采样均值 | 0.195ms | 0.242ms |
| 渲染耗时采样 P95 | 0.228ms | 0.354ms |
| OBS 报告的最低活动帧率 | 60fps | 60fps |
| OBS 进程内存起止 | 156.25 → 156.05 MiB | 182.19 → 154.90 MiB |

每 10 秒读取一次 OBS `GetStats`；P95 为这些平均渲染耗时采样值的分位数，不是逐帧延迟分位数。新版采样期间存在浏览器回归与构建工作，20 帧集中在 4 个采样区间，其中 16 帧发生于 00:39:06～00:39:16；没有足够证据把瞬时丢帧归因于某个组件。旧版 2 分钟对照在浏览器回归结束后执行，时长和系统负载并不等同，因此不计算性能提升／退化比例。现场需在实际媒体混音和独占演出负载下复验。

- 真实媒体 → OBS 高频音量事件 → Browser Source 自定义事件 → Canvas 调制：PASS；未用普通网页模拟对象替代本项验证。
- 静音后退回环境：观测约 978ms；停止桥接后的退回：观测约 1,421ms，含 100ms 遥测间隔及轮询开销。500ms 无新事件加 800ms 退回契约另有确定性单元测试。
- 全场暂停立即停止调制，恢复后处理新数据：PASS；连续测试遥测未记录页面脚本错误。
- 单机事件时间戳探测仅有毫秒级时钟精度，不能当作音频到 LED 画面的端到端延迟，现场该项仍待测。
- 原始记录：`obs/acceptance.json`、`obs/baseline-verified.json`。旧版对照采用已确认完成首帧渲染的 `before-program-steady.png`，新版采用 `after-30-minutes.png`。

### 产物体积

| 项目 | D-102 改造前 | D-103 |
| --- | ---: | ---: |
| `frontend/dist` 全目录 | 975,490 B | 1,044,903 B |
| 变化 | — | +69,413 B（约 67.8 KiB，+7.12%） |
| 新城市素材 | — | 大屏 22,888 B + 手机 8,980 B |

根依赖和锁文件未增加。图片仅 31,868 B；其余增长来自三端样式、控台组合逻辑及 Canvas 音量处理。体积依据外部证据目录的 `build-before.json` 与 `build-after.json`，包含静态与压缩前 JS/CSS，不等同于网络传输量。D-102 的约 326 MB 清理和重要素材归档保留。

### 证据与未完成的现场确认

- 截图审阅入口：`output/playwright/d103-star-city/index.html`，包含控台、节目／投票／颁奖、手机聊天／礼物／档案及可拖动的改造前后对照。小屏与组合操作中途失败截图同目录保存。全部使用独立合成场次。
- 改造前后 OBS 截图与采样：`D:\Ruan\Documents\SYSU\WHCX\output\d103-ui-20260915\obs\`。
- iOS／Android 微信真机、实际场馆 LED 亮度、正式节目音量混音、现场网络与主持口令仍为 **PENDING**。本机和自动化浏览器不能代签真实设备。
- 本阶段没有发布、推送、切换服务器或复位正式数据。发布需在本地版本验收之后独立执行。
