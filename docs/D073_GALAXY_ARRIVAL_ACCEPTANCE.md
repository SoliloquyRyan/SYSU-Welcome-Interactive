# D-073 星点可见性、入场人数与手机银河

2026-09-07。当前 checkout `feature/screen-six-stage-experience`，HEAD `6bc38222a15b8b9f7d1eb3745729eed5ad582c0c`，保留既有未提交修改。修改前的本轮文件备份在 `output/backups/d073-before`，不含凭据。D-073 是前端修订，后端、数据库 schema 17 与活动状态不变。

## 设计判断与实现

- 旧手机云雾框与程序化盘面叠加，形体模糊且像两层壁纸，退役其主背景用途。保留银河背景的叙事作用，改用 imagegen 原创的暖白核心、银蓝外盘与细密暗尘素材，作为唯一主盘面；星点、本人星号、轻微运镜和阶段动作独立绘制。原图 1536 × 1024，运行 WebP 169,312 bytes；原图、旧文件及 [生成提示词与来源](../frontend/src/assets/mobile/galaxy-cinematic-d073.md) 保留。
- 新素材约 700ms 渐入，加载失败采用原程序化银河；减少动态直接显示静态图，不依赖动效完成入场。聊天、节目单、档案继续使用已认可的透明布局和 C 字体。
- 大屏原来大多数真实星体是亚像素点。现在为真实星增强亮核、适度光晕与少量细星芒，拉开与 420 颗装饰底星的对比。星体位置、锁定星色、到场事件与真实数量仍来自原权威输入；Canvas 兼容路径同步提高可见性。
- 集结页右上角显示“已入场 ×× 人”，绑定 `snapshot.aggregate.admittedCount`。这是完成入场的身份数量，既不是连接数，也不包含装饰底星。初始 0 人照实显示，刷新不重复计数；节目/抽奖/结束时退出，不占用表演媒体。
- 保留 D-072 的 12 秒开场、手机 5.8 秒/公屏 7.2 秒星舰、OBS `media=overlay` 透明节目背景，以及静态、隐藏、中断和恢复规则。

## 验证范围

- 33 项相关单元测试通过，覆盖确定性星位、装饰背景边界、电影镜头和个人旅程。首次测试发现旧断言强制“大多数真实星小于 0.6px”，按本次清晰度要求更新为可见且有上限的亮核约束后通过；没有修改星位或身份计数规则。
- Chromium 6 项浏览器回归全部通过：三端完整生命周期、静态弹幕、缺少 GSAP、转场中断/抽奖队列、手机布局和字体加载失败。新增入场人数 0→1、刷新仍为 1、进入节目隐藏的断言。
- E2E 类型检查与 `/welcomeparty/` 前端生产构建通过。新图仅加载 WebP，PNG 原稿不进入生产包。
- 浏览器实拍位于 `output/galaxy-d073/actual`、`mobile`；报告 `output/galaxy-d073/browser-chromium.json`。320/375/390、横屏、模拟键盘空间、档案和结束页的可达性与溢出检查属于浏览器模拟，不能替代实体手机。
- 独立离线审片 `output/galaxy-d073/preview/index.html`，使用正式组件与合成视觉数据，不连接活动数据库。0/40/220/300 人画面单独检查；装饰底星不会推高人数。
- 手机 388 × 842 Canvas 的两帧间隔 800ms，有 47,187 像素变化；减少动态时两帧完全一致。人为阻断 WebP 请求后仍正常显示程序化银河，产生的一次请求失败属于故障注入预期。离线预览源文件哈希与当前组件一致，报告 `output/galaxy-d073/visual-checks.json`。
- 实体 iOS/Android、OBS 浏览器源和场馆投影的清晰度及性能待现场确认。本轮没有重复宣称旧版本的 Chrome/Edge 测试是新美术证据。

## 发布与回滚

前端 11 文件补丁已部署到 `/opt/sysu-welcome-internal/releases/20260907-d073-23adf3214539`，包 SHA-256 `23adf3214539b44e6594822084095f5050038483cec7b449361d8382cfd3e307`，合并清单 423 项。服务器原始 release 与补丁逐项哈希通过，线上 HTML 与 JS 哈希一致。后台 PID 3697176、其他站点 PID 1387993、Nginx PID 1286 均保持；epoch 8 / publicSeq 37 / REHEARSAL / RUNNING / PROGRAM_SUPPORT / runRevision 15 / presentation NONE 保持，根站 200。未更新数据库、重启后台或更改 Nginx。

发布后公网手机、公屏和后台三个入口均为 200，Vue 正常渲染，无页面异常或请求失败；未登录手机/后台各一次预期 401。公屏为 cinematic-depth-field，环境目标 30Hz、中心 alpha 255。新 WebP 公网下载哈希与构建素材一致。报告 `output/galaxy-d073/live-readonly-smoke.json`、`live-image-check.json`。线上处于节目应援，未为人数检查切换生产场景；人数行为以隔离三端测试为证据。

D-072 release `/opt/sysu-welcome-internal/releases/20260907-d072-cb81af533532` 完整保留；回退 D-073 只把 current 原子切回该 release，不恢复数据库。
