# D-072 电影感银河与页面视觉修订

2026-09-07。当前 checkout `feature/screen-six-stage-experience`，HEAD `6bc38222a15b8b9f7d1eb3745729eed5ad582c0c`，包含既有未提交工作。D-072 是前端修订，schema 17 和后端业务规则不变；以实际构建清单核对版本。

## 视觉审查与落地

D-071 的礼物、档案与聊天的信息安排基本合理，但电影质感未达本轮目标：星舰像放大的平面图标，舰艏和运动方向相反；手机银河亮核模糊、尘带不清楚；节目阶段只剩 CSS 光雾，与集结星系断开。实拍又发现档案隐藏的说明预留了 62px 空白，整面模糊背板损失了银河细节。

- 手机：共享确定性尘埃噪声，640px 光度纹理只生成一次；三层倾斜盘面、暖白核心、蓝灰外盘、暗尘与稀疏近景星形成纵深，缓慢漂移，保留本人的恒星与星号。
- 公屏：原生 WebGL2 七层盘面，低倾角相机、轻微滚转与有界运镜。普通节目模式沿用真实银河，环境目标 30Hz；开场目标 60Hz。`media=overlay` 节目稳态仍为全透明并停止绘制。
- 星舰：原创金属舰体 SVG，推进器位于后方，朝前由远及近穿越，层叠长尾迹。手机 5.8 秒、公屏 7.2 秒；节点额外保留 200ms 后清理。手机没有遮挡聊天的附加字幕，公屏字幕位于上方。静态模式只展示 2.8 秒静态结果。
- 开场：12 秒引力预兆、汇聚、压缩、单次爆发、曝光退去。普通模式最后约两秒把同一时刻的节目银河合成在曝光下，避免末帧黑屏或重置；只复用一个 WebGL context，临时合成缓冲用后释放。OBS 则平顺露出外部视频。
- 页面：保留已认可的 C 字体、透明上移聊天与四档礼物；内容页取消整面模糊，档案三项指标改为同一行，隐藏说明不再占位，让礼物/弹幕记录更靠前。关键操作即时响应，首次入场仍是 5.4s / 1.0s / 4.2s，不为延长观感拖慢操作。

## 兼容问题

Chrome / Edge 的送礼回归复现了 HTTP 快照先于 WebSocket 礼物事件的竞争：快照推进 publicSeq 后，旧代码会丢弃同一连接中尚未呈现的星舰。已扩展该连接的瞬时视觉投递，礼物事件按游标及事件 ID 只显示一次，旧消息不回退 interactionRevision 或礼物计数。重连采用新的快照基线，不从历史补播。新增确定性回归覆盖 HTTP 先到与重复 WebSocket 消息。

## 验证与证据

- 首轮 Vitest：50 文件、456 项通过。修正礼物竞争后全量复验为 50 文件、457 项全部通过；E2E 与 soak 类型检查、前端生产构建及文档检查通过。
- 首轮 Chromium：6 项页面/流程通过；Chrome / Edge 共 12 项中 10 项通过、2 项在发送者星舰缺失处失败，已保留失败记录并针对根因修复，不能把首轮声称为全通过。修复后单独复验 Chromium / Chrome / Edge 三端完整生命周期，3/3 通过；报告 `output/cinema-20260907/browser-final-three.json`。之前通过的 Chrome/Edge 移动布局、字体失败、静态弹幕、缺少 GSAP、转场中断与抽奖队列等 10 项保留为对应范围证据。
- `/screen` 正常节目态实测 Canvas alpha 255、环境 30Hz；切换 `media=overlay` alpha 0、渲染 0Hz；切回普通背景恢复。
- 实拍：`output/playwright/d072-cinema/actual` 为隔离合成三端流程；`mobile` 含 320/375/390、横屏、模拟键盘空间、字体失败、减少动态和结束页的浏览器检查。
- 镜头审片：`output/playwright/d072-cinema/index.html`，离线单文件，真实渲染组件与合成内容。`galaxy-screen.png`、`cue-46.png`、`cue-90.png`、`cue-100.png` 展示中间帧与终点，星舰截图单列。构建入口 `node scripts/build-cinema-preview.mjs`。
- 本机 1920×990 审片采样 600 帧，CPU 绘制提交 p50 1.0ms / p95 1.8ms / max 2.2ms，离屏 WebGL 1280×660、无渲染失败。这不是 GPU 完整耗时、真实手机帧率或场馆性能承诺。
- 实体 iOS / Android、OBS 浏览器源、投影亮度/黑位、长时热稳定与 30 分钟渲染 soak：PENDING。旧轮证据不能替代新美术的现场验收。

## 发布与回滚

最终前端 11 文件补丁已部署到 `/opt/sysu-welcome-internal/releases/20260907-d072-cb81af533532`，包 SHA-256 `cb81af533532b1df9bf88ec55d8a33aae070e509c27ee75569bbbffb2c025c03`，合并 release 清单 420 项。只读三端入口均 200、Vue 渲染成功、无页面异常或请求失败；未登录手机/后台各有一次预期 401。线上公屏引擎为 cinematic-depth-field，目标 30Hz、中心 alpha 255。报告 `output/cinema-20260907/live-readonly-smoke.json`。

后台 PID 3697176 保持，epoch 8 / publicSeq 37 / REHEARSAL / RUNNING / PROGRAM_SUPPORT / runRevision 15 / presentation NONE 完全一致；其他站点和 Nginx PID 保持、根站 200。不更新数据库、不重启后台、不修改 Nginx 或其他站点。原 D-071 release 保留，D-072 的回滚只需把 current 原子切回 D-071；不得恢复旧 schema 16 数据库。


首个候选 `20260907-d072-927e1a285187` 只上传并暂存，从未切换为 current；最终包包括礼物竞争修复。旧 release 与候选均保留，未清理用户数据。
