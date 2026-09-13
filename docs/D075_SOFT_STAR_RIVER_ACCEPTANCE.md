# D-075 柔光星河与完整构图

2026-09-07。负责人授权执行新的星河构图，并在制作中明确要求“柔一点，中间亮一点，边缘暗一点”，适合晚会且不抢真实星体。工作树 `feature/screen-six-stage-experience` / HEAD `6bc38222a15b8b9f7d1eb3745729eed5ad582c0c`；保留此前未提交修改，范围备份在 `output/backups/d075-before`。

## 实现

- 背景采用原创柔光环境素材：宽幅斜向银蓝星河、珍珠暖光中央与深蓝暗角。减少硬朗云脊、碎亮点与大星芒，环境以约 70% 强度合成；动态星体保留更亮的核心和锁定星色。强纹理首稿及旧 D-073 / D-074 留作历史，不作为最终美术。
- 手机与大屏共享取景、裁切、曝光和有界运镜。星河不再整体旋转，近景星体移动幅度大于远景；大屏星位继续由 formationSlot 确定，入场流星与稳态使用同一投影，重排快照不改星位。素材内部装饰不代表人数或身份。
- 大屏集结标题移到左上暗部；入场人数仍使用服务器 aggregate.admittedCount。手机个人星体移出强高光并提升亮核与星芒可见度，保持标题/表演者、透明独立聊天气泡、节目礼物数量及操作可达性。
- 手机继续 Canvas2D、DPR 上限 2；大屏 WebGL2 只在需要时工作，材质上传一次，细节长边上限 1600。图片失败保留程序化柔光场，WebGL2 失败使用 Canvas 投影；异步素材就绪可重绘静态帧，不新开动画循环，销毁时解除监听。
- 修复转场取样越过图片边缘时被拉成长条的问题：压缩区域在纹理有效边界内羽化，外部回到深空色。12 秒开场和既有星舰时长保持；手机减少动态是真静态，屏幕默认完整动效、`motion=reduced` 静态，OBS `media=overlay` 节目稳态透明且不绘制。
- 没有新增运行依赖，没有改身份、奖励、聊天审核、抽奖、节目目录、数据库或后台指令。

## 验证记录

45 项相关单测与 E2E 类型检查已通过。新增八小时、320/390/横屏/1920/超宽屏运镜边界检查，确保视野不会露出素材边缘。两轮 Chromium 六项三端与布局回归通过，强纹理阶段报告单独保留在 `output/galaxy-d075/browser-first-pass.json` 和 `browser-projection-pass.json`；这些历史轮次不代替最终柔光素材复验。

最终柔光版 Chromium 6 项三端与布局回归通过，报告 `output/galaxy-d075/browser-soft-chromium.json`，实际截图在 `soft-actual`、`soft-mobile`。覆盖 320/375/390、横屏、键盘空间、字体失败、聊天/礼物、节目与协同、入场计数、抽奖队列、片尾和 OBS 透明稳态。最终纹理边缘羽化单独检查 46% 收束帧；构建重新生成，避免漏入最后的修订。浏览器专项验证正常手机帧变化、减少动态帧一致、图片失败程序化回退、禁用 WebGL2 后 Canvas2D 可见及静态停止，记录 `visual-checks.json`。`soft-preview/source-manifest.json` 绑定正式渲染组件及 80,798 字节 WebP；离线预览 553,287 字节，未访问数据库。1672×941 原图和完整两轮编辑提示保存在 `frontend/src/assets/mobile/star-river-soft-d075.md` 附近。前端 `/welcomeparty/` 构建、文档检查和差异空白检查通过；未新增运行依赖。

实体手机、OBS、投影亮度/黑位与长时温升仍需现场确认。自动检查与截图不代替负责人审美签核。

## 发布（2026-09-08）

前端 10 文件补丁已无停服切换到 `/opt/sysu-welcome-internal/releases/20260908-d075-bae0599aaf81`，归档 SHA-256 `bae0599aaf81e527f1846b384f55ca8d2672405d692c5a95d560e2dea3e1aafd`，压缩包 478,471 字节，合并清单 428 项。原版本与补丁逐文件校验通过，公网页面和 `index-CP9w1hrC.js` 哈希与构建一致。

后端 PID 3697176、其他站点 PID 1387993、Nginx PID 1286 保持，Nginx 配置哈希不变，根站 200。epoch 8 / publicSeq 37 / REHEARSAL / RUNNING / PROGRAM_SUPPORT / runRevision 15 / presentation NONE 原样保留，无数据库迁移或服务重启。旧版 `/opt/sysu-welcome-internal/releases/20260907-d074-c59863c4026a` 保留，回退仅原子切换 current，不恢复数据库。

发布后三个公网入口均 200，Vue 正常挂载，无页面异常或失败请求；未登录手机/后台各一次预期 401。公屏 `cinematic-depth-field`、目标 30Hz、中心 alpha 255，900ms 间隔的 Canvas 像素摘要变化，确认线上普通节目背景确实运动。报告 `output/galaxy-d075/live-readonly-smoke.json`，只读检查未改变线上场景。原图和手机/公屏效果入口 `output/galaxy-d075/review.html`。
